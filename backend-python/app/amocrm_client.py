"""Port of src/lib/amocrm/client.server.ts's "client core": OAuth token
lifecycle, per-org credential resolution, the low-level amoFetch/
amoWriteFetch HTTP layer (with AmoCRM's rate-limit/5xx retry handling),
webhook subscription, the debug/diagnostic helpers used by
integrations.amocrm.connect.ts, and createAmoTask/createAmoNote/
hasHumanNoteSince (needed by audio-analytics.analyze.ts).

The bidirectional sync engine (syncLeadsFromAmo and everything it calls)
is a separate module, app/amocrm_sync.py, built on top of the functions
here -- see that module's docstring. Originally this file covered only
what audio-analytics needed (a handful of functions were private,
underscore-prefixed); they're now public since amocrm_sync.py needs the
same HTTP layer, retry logic, and credential resolution.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.db import get_supabase_admin

# AmoCRM confirmed webhook settings this platform acts on -- leads (incl.
# notes/status/owner changes) and tasks. See the original file's own
# comment: contacts/companies/customers/talks/messages are intentionally
# left out, nothing here parses those events.
AMO_WEBHOOK_SETTINGS = [
    "add_lead",
    "update_lead",
    "delete_lead",
    "restore_lead",
    "status_lead",
    "responsible_lead",
    "note_lead",
    "add_task",
    "update_task",
    "delete_task",
    "responsible_task",
]

# Same retry budgets as the original's amoFetch (RATE_LIMIT_MAX_RETRIES /
# SERVER_ERROR_MAX_RETRIES) -- AmoCRM enforces an undocumented per-
# integration rate limit (commonly ~7 req/s); 5xx (incl. Cloudflare 522s
# seen in front of AmoCRM) are transient upstream blips.
RATE_LIMIT_MAX_RETRIES = 6
SERVER_ERROR_MAX_RETRIES = 3

# AmoCRM reserves these two status ids for "won"/"lost" in every pipeline
# -- a fixed, documented convention, not something specific to any account.
AMO_WON_STATUS_ID = 142
AMO_LOST_STATUS_ID = 143

# AmoCRM's list endpoints return no total count, so pagination keeps
# requesting pages until one comes back empty. A small concurrent batch
# (rather than one page at a time) cuts wall-clock sync time roughly by
# the batch size, kept modest since several paginated fetches often run
# at once (leads, contacts, companies, users).
PAGE_FETCH_CONCURRENCY = 3


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}. Add it in Settings -> Secrets.")
    return value


def get_amo_redirect_uri() -> str:
    return require_env("AMOCRM_REDIRECT_URI")


def describe_error(err: Exception) -> str:
    """supabase-py's PostgrestError carries a `.message` attr but str(err)
    on it is not always as useful -- mirrors the original's describeError,
    which existed because JS's plain objects aren't `instanceof Error`."""
    message = getattr(err, "message", None)
    if isinstance(message, str) and message:
        return message
    return str(err) or "Unknown sync error"


def dedupe_by_key(rows: list[dict[str, Any]], key_fn: Any) -> list[dict[str, Any]]:
    """A single upsert() call containing two rows with the same
    on_conflict-key value makes Postgres reject the whole statement --
    dedupe defensively before every upsert, keeping the last occurrence
    (same as every dedup in the original)."""
    by_key: dict[str, dict[str, Any]] = {}
    for r in rows:
        by_key[key_fn(r)] = r
    return list(by_key.values())


async def get_amo_app_credentials(organization_id: str) -> tuple[str, str]:
    """Per-org client_id/client_secret (integration_settings.config),
    falling back to the platform-wide AMOCRM_CLIENT_ID/AMOCRM_CLIENT_SECRET
    env vars -- same fallback rule as the original, only evaluated when
    actually needed."""
    admin = get_supabase_admin()
    row = (
        admin.table("integration_settings")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("key", "amocrm")
        .maybe_single()
        .execute()
        .data
    )
    config = (row or {}).get("config") or {}
    client_id = (config.get("client_id") or "").strip() or require_env("AMOCRM_CLIENT_ID")
    client_secret = (config.get("client_secret") or "").strip() or require_env("AMOCRM_CLIENT_SECRET")
    return client_id, client_secret


async def debug_amo_app_credentials(organization_id: str) -> dict[str, Any]:
    """Diagnostic readout of exactly which client_id source
    /amocrm/connect resolved for an org, without performing the OAuth
    redirect."""
    admin = get_supabase_admin()
    row = (
        admin.table("integration_settings")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("key", "amocrm")
        .maybe_single()
        .execute()
        .data
    )
    config = (row or {}).get("config") or {}
    org_client_id = (config.get("client_id") or "").strip()

    def preview(cid: str) -> str:
        return f"{cid[:8]}...{cid[-4:]}" if len(cid) > 12 else cid

    resolved_client_id = org_client_id or require_env("AMOCRM_CLIENT_ID")
    return {
        "organizationId": organization_id,
        "rowFound": bool(row),
        "configClientIdPreview": preview(org_client_id) if org_client_id else None,
        "resolvedSource": "organization" if org_client_id else "env-fallback",
        "resolvedClientIdPreview": preview(resolved_client_id),
    }


async def set_amo_app_credentials_direct(organization_id: str, client_id: str, client_secret: str) -> None:
    """Writes an org's client_id/client_secret with the service role,
    bypassing RLS and any client-side code path entirely."""
    admin = get_supabase_admin()
    existing = (
        admin.table("integration_settings")
        .select("config")
        .eq("organization_id", organization_id)
        .eq("key", "amocrm")
        .maybe_single()
        .execute()
        .data
    )
    current_config = (existing or {}).get("config") or {}
    admin.table("integration_settings").upsert(
        {
            "organization_id": organization_id,
            "key": "amocrm",
            "config": {**current_config, "client_id": client_id.strip(), "client_secret": client_secret.strip()},
        },
        on_conflict="organization_id,key",
    ).execute()


async def build_authorize_url(state: str, organization_id: str) -> str:
    """The URL an admin is sent to in order to grant SalesIQ access to
    their AmoCRM account."""
    client_id, _ = await get_amo_app_credentials(organization_id)
    from urllib.parse import urlencode

    return f"https://www.amocrm.ru/oauth?{urlencode({'client_id': client_id, 'state': state})}"


class AmoConnection:
    def __init__(self, row: dict[str, Any]):
        self.organization_id: str = row["organization_id"]
        self.subdomain: str = row["subdomain"]
        self.access_token: str = row["access_token"]
        self.refresh_token: str = row["refresh_token"]
        self.token_expires_at: str = row["token_expires_at"]
        self.connected_by: str | None = row.get("connected_by")
        self.connected_at: str | None = row.get("connected_at")
        self.last_synced_at: str | None = row.get("last_synced_at")
        self.last_sync_error: str | None = row.get("last_sync_error")
        # None = "sync everything" (unrestricted, the original behavior) --
        # set once an admin picks a subset on the AmoCRM import-settings page.
        self.enabled_pipeline_ids: list[int] | None = row.get("enabled_pipeline_ids")
        self.enabled_user_ids: list[int] | None = row.get("enabled_user_ids")
        self.sync_in_progress: bool = bool(row.get("sync_in_progress"))
        self.sync_started_at: str | None = row.get("sync_started_at")
        # How many pages of the *initial* full historical leads backfill
        # (last_synced_at still None) have completed so far.
        self.initial_sync_page: int | None = row.get("initial_sync_page")


async def get_connection(organization_id: str) -> AmoConnection | None:
    admin = get_supabase_admin()
    row = (
        admin.table("amocrm_connection")
        .select("*")
        .eq("organization_id", organization_id)
        .maybe_single()
        .execute()
        .data
    )
    return AmoConnection(row) if row else None


async def token_request(subdomain: str, body: dict[str, str]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(f"https://{subdomain}/oauth2/access_token", json=body)
    if res.status_code >= 400:
        raise RuntimeError(f"AmoCRM token request failed ({res.status_code}): {res.text}")
    return res.json()


async def exchange_code_for_tokens(code: str, subdomain: str, organization_id: str) -> dict[str, Any]:
    """Exchanges the one-time authorization code AmoCRM sends to the
    callback for real tokens."""
    client_id, client_secret = await get_amo_app_credentials(organization_id)
    return await token_request(
        subdomain,
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": get_amo_redirect_uri(),
        },
    )


async def refresh_tokens(conn: AmoConnection) -> AmoConnection:
    """Mutates conn in place, same as the original -- any other in-flight
    reference to this connection object picks up the refreshed token too."""
    client_id, client_secret = await get_amo_app_credentials(conn.organization_id)
    tokens = await token_request(
        conn.subdomain,
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": conn.refresh_token,
            "redirect_uri": get_amo_redirect_uri(),
        },
    )
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])).isoformat()
    admin = get_supabase_admin()
    admin.table("amocrm_connection").update(
        {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_expires_at": expires_at,
        }
    ).eq("organization_id", conn.organization_id).execute()
    conn.access_token = tokens["access_token"]
    conn.refresh_token = tokens["refresh_token"]
    conn.token_expires_at = expires_at

    # Tokens refresh roughly once a day -- piggyback the webhook
    # (re)subscription here so an already-connected org stays subscribed
    # without needing to reconnect. Fire-and-forget: never let a webhook
    # API hiccup delay or fail the token refresh itself.
    async def _resubscribe() -> None:
        try:
            await subscribe_amo_webhooks_internal(conn)
        except Exception as err:
            print(f"AmoCRM webhook subscribe failed: {err}")

    asyncio.create_task(_resubscribe())
    return conn


async def ensure_valid_token(conn: AmoConnection) -> AmoConnection:
    expires_at = datetime.fromisoformat(conn.token_expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    expires_in = (expires_at - datetime.now(timezone.utc)).total_seconds()
    if expires_in > 60:
        return conn
    return await refresh_tokens(conn)


def parse_amo_response(text: str, path: str) -> Any:
    """AmoCRM occasionally serializes note text with raw, unescaped control
    characters -- invalid JSON. Strip control chars and retry once, same
    recovery as the original's parseAmoResponse."""
    import json

    try:
        return json.loads(text)
    except json.JSONDecodeError as err:
        try:
            cleaned = "".join(" " if ord(c) <= 31 else c for c in text)
            return json.loads(cleaned)
        except json.JSONDecodeError:
            raise RuntimeError(f"AmoCRM returned invalid JSON on {path}: {err}") from err


async def amo_fetch(conn: AmoConnection, path: str, attempt: int = 1, tried_refresh: bool = False) -> Any:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(
                f"https://{conn.subdomain}{path}",
                headers={"authorization": f"Bearer {conn.access_token}"},
            )
    except httpx.HTTPError:
        if attempt <= SERVER_ERROR_MAX_RETRIES:
            await asyncio.sleep(attempt)
            return await amo_fetch(conn, path, attempt + 1, tried_refresh)
        raise

    if res.status_code == 429 and attempt <= RATE_LIMIT_MAX_RETRIES:
        retry_after = res.headers.get("retry-after")
        delay = float(retry_after) if retry_after and retry_after.isdigit() else attempt
        await asyncio.sleep(delay)
        return await amo_fetch(conn, path, attempt + 1, tried_refresh)
    if res.status_code >= 500 and attempt <= SERVER_ERROR_MAX_RETRIES:
        await asyncio.sleep(attempt)
        return await amo_fetch(conn, path, attempt + 1, tried_refresh)
    # A 401 here means AmoCRM considers our access_token invalid even
    # though our own stored token_expires_at said it still had time left
    # -- force one refresh-and-retry before giving up.
    if res.status_code == 401 and not tried_refresh:
        await refresh_tokens(conn)
        return await amo_fetch(conn, path, attempt, True)
    if res.status_code == 204:
        return None
    if res.status_code >= 400:
        raise RuntimeError(f"AmoCRM API error ({res.status_code}) on {path}: {res.text}")
    try:
        return parse_amo_response(res.text, path)
    except RuntimeError:
        if attempt <= SERVER_ERROR_MAX_RETRIES:
            await asyncio.sleep(attempt)
            return await amo_fetch(conn, path, attempt + 1, tried_refresh)
        raise


async def amo_write_fetch(conn: AmoConnection, path: str, method: str, body: Any) -> Any:
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.request(
            method,
            f"https://{conn.subdomain}{path}",
            headers={"authorization": f"Bearer {conn.access_token}"},
            json=body,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"AmoCRM API error ({res.status_code}) on {path}: {res.text}")
    return parse_amo_response(res.text, path)


async def fetch_all_paged(
    conn: AmoConnection,
    path_for_page: Any,
    extract_items: Any,
    max_pages: int = 800,
) -> list[Any]:
    """Fetches a small batch of pages concurrently at a time, stopping once
    any page in a batch comes back empty. A failed page (after its own
    retries) is skipped rather than treated as "no more pages" or aborting
    everything already fetched -- see the original's own comment on why."""
    all_items: list[Any] = []
    page = 1
    done = False
    while not done:
        pages = [page + i for i in range(PAGE_FETCH_CONCURRENCY)]

        async def _fetch_one(p: int) -> list[Any] | None:
            try:
                data = await amo_fetch(conn, path_for_page(p))
                return extract_items(data)
            except Exception as err:
                print(f"[amoCRM] giving up on page {p} of {path_for_page(p)}: {err}")
                return None

        results = await asyncio.gather(*(_fetch_one(p) for p in pages))
        for items in results:
            if items is None:
                continue
            all_items.extend(items)
            if len(items) == 0:
                done = True
        page += PAGE_FETCH_CONCURRENCY
        if page > max_pages:
            break
    return all_items


async def fetch_pipelines(conn: AmoConnection) -> list[dict[str, Any]]:
    data = await amo_fetch(conn, "/api/v4/leads/pipelines?with=statuses")
    return ((data or {}).get("_embedded") or {}).get("pipelines") or []


async def fetch_all_users(conn: AmoConnection) -> list[dict[str, Any]]:
    return await fetch_all_paged(
        conn,
        lambda page: f"/api/v4/users?limit=250&page={page}",
        lambda data: ((data or {}).get("_embedded") or {}).get("users") or [],
    )


async def debug_amo_call_notes(organization_id: str) -> dict[str, Any]:
    """Diagnoses "0 calls synced" for an org: hits AmoCRM directly for any
    notes at all vs. call_in/call_out notes specifically, so it's possible
    to tell "notes API inaccessible" apart from "no call-type notes" apart
    from "genuinely no notes yet"."""
    conn = await get_connection(organization_id)
    if not conn:
        return {"organizationId": organization_id, "connected": False}

    admin = get_supabase_admin()
    stored_calls_count = (
        admin.table("amocrm_calls")
        .select("id", count="exact", head=True)
        .eq("organization_id", organization_id)
        .execute()
        .count
        or 0
    )

    try:
        valid_conn = await ensure_valid_token(conn)
        any_notes_raw, call_notes_raw = await asyncio.gather(
            amo_fetch(valid_conn, "/api/v4/leads/notes?limit=5&order[created_at]=desc"),
            amo_fetch(
                valid_conn,
                "/api/v4/leads/notes?filter[note_type][]=call_in&filter[note_type][]=call_out&limit=5&order[created_at]=desc",
            ),
        )
        any_list = ((any_notes_raw or {}).get("_embedded") or {}).get("notes") or []
        call_list = ((call_notes_raw or {}).get("_embedded") or {}).get("notes") or []
        return {
            "organizationId": organization_id,
            "connected": True,
            "subdomain": conn.subdomain,
            "anyNotesCount": len(any_list),
            "anyNotesSample": any_list[:2],
            "callNotesCount": len(call_list),
            "callNotesSample": call_list[:2],
            "storedAmocrmCallsCount": stored_calls_count,
        }
    except Exception as err:
        return {
            "organizationId": organization_id,
            "connected": True,
            "subdomain": conn.subdomain,
            "storedAmocrmCallsCount": stored_calls_count,
            "error": str(err),
        }


async def subscribe_amo_webhooks_internal(conn: AmoConnection) -> None:
    parsed = urlsplit(get_amo_redirect_uri())
    origin = f"{parsed.scheme}://{parsed.netloc}"
    destination = f"{origin}/integrations/amocrm/webhook?org={conn.organization_id}"
    await amo_write_fetch(
        conn, "/api/v4/webhooks", "POST", {"destination": destination, "settings": AMO_WEBHOOK_SETTINGS}
    )


async def subscribe_amo_webhooks(organization_id: str) -> None:
    conn = await get_connection(organization_id)
    if not conn:
        return
    valid_conn = await ensure_valid_token(conn)
    await subscribe_amo_webhooks_internal(valid_conn)


async def create_amo_task(
    organization_id: str,
    lead_amo_id: int,
    text: str,
    complete_till: int,
    responsible_amo_user_id: int | None,
) -> int | None:
    """Creates a task on an AmoCRM lead -- used to hand a call's AI-suggested
    next step to the responsible manager as a reminder inside AmoCRM."""
    conn = await get_connection(organization_id)
    if not conn:
        raise RuntimeError("AmoCRM ulanmagan.")
    valid_conn = await ensure_valid_token(conn)
    payload_item: dict[str, Any] = {
        "text": text,
        "complete_till": complete_till,
        "entity_id": lead_amo_id,
        "entity_type": "leads",
    }
    if responsible_amo_user_id is not None:
        payload_item["responsible_user_id"] = responsible_amo_user_id
    json_res = await amo_write_fetch(valid_conn, "/api/v4/tasks", "POST", [payload_item])
    tasks = ((json_res or {}).get("_embedded") or {}).get("tasks") or []
    return tasks[0]["id"] if tasks else None


async def create_amo_note(organization_id: str, lead_amo_id: int, text: str) -> int | None:
    """Adds a plain text note to an AmoCRM lead -- used to log the AI's
    summary of a call when the rep didn't already write one up themselves
    (see has_human_note_since)."""
    conn = await get_connection(organization_id)
    if not conn:
        raise RuntimeError("AmoCRM ulanmagan.")
    valid_conn = await ensure_valid_token(conn)
    payload = [{"note_type": "common", "params": {"text": text}}]
    json_res = await amo_write_fetch(valid_conn, f"/api/v4/leads/{lead_amo_id}/notes", "POST", payload)
    notes = ((json_res or {}).get("_embedded") or {}).get("notes") or []
    return notes[0]["id"] if notes else None


async def has_human_note_since(organization_id: str, lead_amo_id: int, since_unix_seconds: int) -> bool:
    """Whether a lead already has a manually-written ("common") note created
    after the given moment. Any fetch failure is treated as "no human note
    found" (fails open toward the AI writing its own note)."""
    conn = await get_connection(organization_id)
    if not conn:
        return False
    try:
        valid_conn = await ensure_valid_token(conn)
        json_res = await amo_fetch(
            valid_conn,
            f"/api/v4/leads/{lead_amo_id}/notes?filter[note_type][]=common&order[created_at]=desc&limit=10",
        )
        notes = ((json_res or {}).get("_embedded") or {}).get("notes") or []
        return any(n.get("created_at", 0) >= since_unix_seconds for n in notes)
    except Exception:
        return False
