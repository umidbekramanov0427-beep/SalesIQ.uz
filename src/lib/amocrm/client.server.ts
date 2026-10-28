// Server-only. One-way sync: AmoCRM -> SalesIQ leads, contacts,
// companies and pipeline stages. Never import this from a route file or
// component that ships to the client — it touches AMOCRM_CLIENT_SECRET and
// the Supabase service-role key.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isIntegrationPaused } from "@/lib/integration-pauses.server";

type AmoConnection = {
  organization_id: string;
  subdomain: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  connected_by: string | null;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  // null means "sync everything" (unrestricted, the original behavior) —
  // set once an admin picks a subset on the AmoCRM import-settings page.
  enabled_pipeline_ids: number[] | null;
  enabled_user_ids: number[] | null;
  sync_in_progress: boolean;
  sync_started_at: string | null;
  // How many pages of the *initial* full historical leads backfill (i.e.
  // while last_synced_at is still null) have been completed so far. Set
  // when a run exhausts its time budget mid-backfill; cleared once the
  // backfill actually reaches the end of the account's leads.
  initial_sync_page: number | null;
  // Whether call-recording playback should be trimmed to start at the first
  // answer instead of the dial tone -- see "Operatsiyalar" tab.
  recording_trim_before_answer: boolean;
  // If true (default), an amocrm_id no longer found among AmoCRM's active
  // leads is treated as "moved on legitimately" (won/lost/deleted upstream)
  // and left alone by checkActiveFunnel; if false it's surfaced as a real
  // discrepancy for an admin to investigate.
  active_funnel_ignore_missing: boolean;
  // Summary jsonb of the last checkActiveFunnel() run -- see ActiveFunnelCheckResult.
  active_funnel_last_check: unknown;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Environment o'zgaruvchisi topilmadi: ${name}. Uni Vercel loyihasi -> Settings -> Environment Variables bo'limiga qo'shing.`,
    );
  return value;
}

export function getAmoRedirectUri(): string {
  return requireEnv("AMOCRM_REDIRECT_URI");
}

// AmoCRM private integrations are created inside one specific account and
// can't be installed from a different one, so each company that registers
// its own integration needs its own client_id/client_secret. Most orgs never
// set these (integration_settings.config stays {}), so they fall back to the
// single platform-wide AMOCRM_CLIENT_ID/AMOCRM_CLIENT_SECRET env vars --
// the fallback is only evaluated when actually needed, so a deployment with
// no global default configured still works for orgs that set their own.
async function getAmoAppCredentials(
  organizationId: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("key", "amocrm")
    .maybeSingle();
  if (error) throw error;
  const config = (data?.config as { client_id?: string; client_secret?: string } | null) ?? {};
  return {
    clientId: config.client_id?.trim() || requireEnv("AMOCRM_CLIENT_ID"),
    clientSecret: config.client_secret?.trim() || requireEnv("AMOCRM_CLIENT_SECRET"),
  };
}

/**
 * Diagnostic readout of exactly which client_id source /amocrm/connect
 * resolved for an org, without performing the OAuth redirect. Temporary
 * debugging aid for the per-org credentials rollout — safe to remove once
 * that's confirmed stable everywhere.
 */
export async function debugAmoAppCredentials(organizationId: string): Promise<{
  organizationId: string;
  rowFound: boolean;
  configClientIdPreview: string | null;
  resolvedSource: "organization" | "env-fallback";
  resolvedClientIdPreview: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("key", "amocrm")
    .maybeSingle();
  if (error) throw error;
  const config = (data?.config as { client_id?: string } | null) ?? {};
  const orgClientId = config.client_id?.trim();
  const preview = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id);
  const resolvedClientId = orgClientId || requireEnv("AMOCRM_CLIENT_ID");
  return {
    organizationId,
    rowFound: !!data,
    configClientIdPreview: orgClientId ? preview(orgClientId) : null,
    resolvedSource: orgClientId ? "organization" : "env-fallback",
    resolvedClientIdPreview: preview(resolvedClientId),
  };
}

/**
 * Diagnoses "0 calls synced" for an org: hits AmoCRM directly for (a) any
 * notes at all and (b) call_in/call_out notes specifically, so it's
 * possible to tell apart "the notes API itself is inaccessible" (a
 * permission/scope problem) from "notes exist but none are call-type" (this
 * AmoCRM account's telephony isn't posting classic call notes at all) from
 * "genuinely no notes yet". Temporary debugging aid — safe to remove once
 * the calls-not-syncing case for a given org is root-caused.
 */
export async function debugAmoCallNotes(organizationId: string): Promise<{
  organizationId: string;
  connected: boolean;
  subdomain?: string;
  anyNotesCount?: number;
  anyNotesSample?: unknown;
  callNotesCount?: number;
  callNotesSample?: unknown;
  storedAmocrmCallsCount?: number;
  error?: string;
}> {
  const conn = await getConnection(organizationId);
  if (!conn) return { organizationId, connected: false };

  const { count: storedAmocrmCallsCount } = await supabaseAdmin
    .from("amocrm_calls")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  try {
    const validConn = await ensureValidToken(conn);
    const [anyNotesRaw, callNotesRaw] = await Promise.all([
      amoFetch(validConn, "/api/v4/leads/notes?limit=5&order[created_at]=desc"),
      amoFetch(
        validConn,
        "/api/v4/leads/notes?filter[note_type][]=call_in&filter[note_type][]=call_out&limit=5&order[created_at]=desc",
      ),
    ]);
    const anyList =
      (anyNotesRaw as { _embedded?: { notes?: unknown[] } } | null)?._embedded?.notes ?? [];
    const callList =
      (callNotesRaw as { _embedded?: { notes?: unknown[] } } | null)?._embedded?.notes ?? [];
    return {
      organizationId,
      connected: true,
      subdomain: conn.subdomain,
      anyNotesCount: anyList.length,
      anyNotesSample: anyList.slice(0, 2),
      callNotesCount: callList.length,
      callNotesSample: callList.slice(0, 2),
      storedAmocrmCallsCount: storedAmocrmCallsCount ?? 0,
    };
  } catch (err) {
    return {
      organizationId,
      connected: true,
      subdomain: conn.subdomain,
      storedAmocrmCallsCount: storedAmocrmCallsCount ?? 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Writes an org's client_id/client_secret with the service role, bypassing
 * RLS and any client-side code path entirely. Temporary debugging aid
 * alongside debugAmoAppCredentials — safe to remove once the per-org
 * credentials save (useSetAmoCrmCredentials) is confirmed working from the
 * browser everywhere.
 */
export async function setAmoAppCredentialsDirect(
  organizationId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("key", "amocrm")
    .maybeSingle();
  if (fetchError) throw fetchError;
  const currentConfig = (existing?.config as Record<string, unknown> | null) ?? {};
  const { error } = await supabaseAdmin.from("integration_settings").upsert(
    {
      organization_id: organizationId,
      key: "amocrm",
      config: {
        ...currentConfig,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      },
    },
    { onConflict: "organization_id,key" },
  );
  if (error) throw error;
}

/**
 * The URL an admin is sent to in order to grant SalesIQ access to their
 * AmoCRM account. If this doesn't land correctly, use the "link for setting
 * up the integration" shown on the integration's page in AmoCRM instead —
 * it encodes the same client_id/redirect_uri and is guaranteed correct for
 * your account's region (amocrm.ru vs amocrm.com vs kommo.com).
 */
export async function buildAuthorizeUrl(state: string, organizationId: string): Promise<string> {
  const { clientId } = await getAmoAppCredentials(organizationId);
  const params = new URLSearchParams({ client_id: clientId, state });
  return `https://www.amocrm.ru/oauth?${params.toString()}`;
}

async function tokenRequest(subdomain: string, body: Record<string, string>) {
  // Same "fetch() has no default timeout" bug as amoFetch/amoWriteFetch,
  // just on the OAuth token endpoint instead of a data endpoint -- an
  // access-token refresh that ensureValidToken triggers on every catalog
  // fetch (fetchAmoCatalog) had no bound at all, so a hung/unreachable
  // AmoCRM token endpoint reproduced the exact same "stuck on
  // Yuklanmoqda... forever" symptom the per-page fixes above were meant to
  // close, just one call earlier in the chain.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`https://${subdomain}/oauth2/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`AmoCRM token so'rovi javob bermadi (timeout): ${subdomain}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AmoCRM token request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

/** Exchanges the one-time authorization code AmoCRM sends to the callback for real tokens. */
export async function exchangeCodeForTokens(
  code: string,
  subdomain: string,
  organizationId: string,
) {
  const { clientId, clientSecret } = await getAmoAppCredentials(organizationId);
  const tokens = await tokenRequest(subdomain, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: getAmoRedirectUri(),
  });
  return tokens;
}

// Mutates `conn` in place (in addition to returning it) so that every other
// reference to the same connection object already in flight elsewhere in a
// sync — syncPipelineStages, syncUserMapping, parallel amoFetch calls — picks
// up the refreshed access_token too, without needing every call site to be
// re-threaded through a new object each time a refresh happens.
async function refreshTokens(conn: AmoConnection) {
  const { clientId, clientSecret } = await getAmoAppCredentials(conn.organization_id);
  const tokens = await tokenRequest(conn.subdomain, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
    redirect_uri: getAmoRedirectUri(),
  });
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("amocrm_connection")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    })
    .eq("organization_id", conn.organization_id);
  if (error) throw error;
  conn.access_token = tokens.access_token;
  conn.refresh_token = tokens.refresh_token;
  conn.token_expires_at = expiresAt;
  // Tokens refresh roughly once a day -- piggyback the webhook (re)
  // subscription here so an org connected before this feature shipped gets
  // covered without needing to disconnect/reconnect. Fire-and-forget: never
  // let a webhook API hiccup delay or fail the token refresh itself.
  subscribeAmoWebhooksInternal(conn).catch((err: unknown) => {
    console.error("AmoCRM webhook subscribe failed", err);
  });
  return conn;
}

export async function getConnection(organizationId: string): Promise<AmoConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("amocrm_connection")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Bearer token for downloading a call recording stored on the company's own
 * amoCRM / Kommo account (those links answer 401 without it). Null when the
 * link is on another host -- a telephony provider's public link needs none.
 */
export async function amoAuthForRecording(
  organizationId: string,
  recordingUrl: string,
): Promise<string | null> {
  let host: string;
  try {
    host = new URL(recordingUrl).host.toLowerCase();
  } catch {
    return null;
  }
  const conn0 = await getConnection(organizationId).catch(() => null);
  if (!conn0) return null;
  const own = conn0.subdomain.toLowerCase();
  if (host !== own && !host.endsWith(".amocrm.ru") && !host.endsWith(".kommo.com")) return null;
  const conn = await ensureValidToken(conn0);
  return conn.access_token;
}

async function ensureValidToken(conn: AmoConnection): Promise<AmoConnection> {
  const expiresInMs = new Date(conn.token_expires_at).getTime() - Date.now();
  if (expiresInMs > 60_000) return conn;
  return refreshTokens(conn);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Supabase client errors (PostgrestError) carry a `.message` string but are
// plain objects, not `instanceof Error` — a bare `err instanceof Error`
// check silently drops the real reason (missing column, RLS denial, broken
// upsert conflict target, ...) and reports "Unknown sync error" instead.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Unknown sync error";
}

// A single upsert() call that contains two rows with the same onConflict-key
// value makes Postgres reject the whole statement with "ON CONFLICT DO
// UPDATE command cannot affect row a second time" — and since every sync
// write happens in one batch, that aborts the entire sync, not just the
// offending row. leads/contacts/companies are each already deduped
// upstream by construction, but pipeline_stages never was (nothing stops
// AmoCRM's own API from listing the same status twice inside one
// pipeline), and staying defensive here for all of them is cheap insurance
// against the whole sync ever going dark on this error again. Keeps the
// last occurrence, same as every other last-write-wins dedup in this file.
function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((r) => [keyFn(r), r])).values());
}

// AmoCRM enforces a per-integration rate limit (undocumented exact number,
// commonly reported around 7 req/s) — fetching several list endpoints
// concurrently (see fetchAllPaged below) can burst past it and get 429s
// back. Retrying with backoff instead of failing the whole sync handles
// that regardless of the exact limit, rather than trying to guess a
// concurrency level that's always safe.
const RATE_LIMIT_MAX_RETRIES = 6;

// 5xx (including Cloudflare's 522 "connection timed out", seen in practice
// in front of AmoCRM) are transient upstream blips, not something wrong on
// our end — without a retry here, one flaky response anywhere in a sync
// aborted the whole run and threw away everything already fetched in that
// request. A shorter retry budget than the 429 case since these aren't
// "back off, you're going too fast" signals — just try again shortly.
const SERVER_ERROR_MAX_RETRIES = 3;

// AmoCRM occasionally serializes a note's text (call transcripts, comments
// typed with a literal Enter key) with a raw, unescaped control character
// sitting inside a JSON string instead of the required \n/\r/\t escape --
// invalid per the JSON spec, so the platform's native JSON.parse (what
// res.json() uses internally) rejects the whole response with "Unterminated
// string in JSON at position N" and the entire sync aborts over one bad
// note. Stripping stray control characters out of the raw text before
// parsing is a no-op for well-formed responses and recovers from this
// specific upstream quirk; a small amount of note-text formatting is an
// acceptable loss compared to the whole sync failing.
async function parseAmoResponse(res: Response, path: string): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    try {
      let cleaned = "";
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        cleaned += code <= 31 ? " " : text[i];
      }
      return JSON.parse(cleaned);
    } catch {
      throw new Error(
        `AmoCRM returned invalid JSON on ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function amoFetch(
  conn: AmoConnection,
  path: string,
  attempt = 1,
  triedRefresh = false,
): Promise<unknown> {
  let res: Response;
  try {
    // fetch() has no default timeout -- a stalled connection to AmoCRM
    // (seen in practice: a page like the import-settings catalog just sits
    // on its loading spinner forever, no error, nothing to retry) used to
    // hang this request indefinitely. 20s is generous for any single
    // AmoCRM endpoint; a genuine stall now surfaces as a real, retryable
    // error instead of an invisible hang.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      res = await fetch(`https://${conn.subdomain}${path}`, {
        headers: { authorization: `Bearer ${conn.access_token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // fetch() itself throwing (not just returning a bad status) means the
    // connection to AmoCRM failed at the network level — DNS, TLS, refused,
    // timed out, etc. Neither the 429 nor the 5xx handling below ever runs
    // in that case since there's no Response to inspect, so this needs its
    // own retry or a single network blip fails the entire sync outright
    // with an opaque "fetch failed" and no chance to recover.
    if (attempt <= SERVER_ERROR_MAX_RETRIES) {
      await sleep(attempt * 1000);
      return amoFetch(conn, path, attempt + 1, triedRefresh);
    }
    throw err;
  }
  if (res.status === 429 && attempt <= RATE_LIMIT_MAX_RETRIES) {
    const retryAfterHeader = Number(res.headers.get("retry-after"));
    const delayMs = (retryAfterHeader > 0 ? retryAfterHeader : attempt) * 1000;
    await sleep(delayMs);
    return amoFetch(conn, path, attempt + 1, triedRefresh);
  }
  if (res.status >= 500 && attempt <= SERVER_ERROR_MAX_RETRIES) {
    await sleep(attempt * 1000);
    return amoFetch(conn, path, attempt + 1, triedRefresh);
  }
  // A 401 here means AmoCRM considers our access_token invalid even though
  // our own stored token_expires_at said it still had time left — the token
  // can be invalidated early (revoked, superseded by another sign-in) with
  // no warning. Force one refresh-and-retry before giving up, so a sync
  // doesn't stay permanently broken on stale expiry bookkeeping alone; if
  // the refresh_token itself is also dead, refreshTokens() throws its own
  // clear error instead of masking it as this 401.
  if (res.status === 401 && !triedRefresh) {
    await refreshTokens(conn);
    return amoFetch(conn, path, attempt, true);
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AmoCRM API error (${res.status}) on ${path}: ${text}`);
  }
  try {
    return await parseAmoResponse(res, path);
  } catch (err) {
    // A 200 response whose body is truncated mid-stream (a dropped
    // connection, a proxy cutting off a large page of notes) parses as
    // invalid JSON even after parseAmoResponse's control-character cleanup
    // -- that's a genuinely incomplete body, not a bad character, and no
    // amount of re-parsing the same text fixes it. Retry the request itself
    // like the network-error/5xx paths above; a fresh response is very
    // likely to come back complete. Safe to retry here (unlike
    // amoWriteFetch) since this is always a read.
    if (attempt <= SERVER_ERROR_MAX_RETRIES) {
      await sleep(attempt * 1000);
      return amoFetch(conn, path, attempt + 1, triedRefresh);
    }
    throw err;
  }
}

// AmoCRM's list endpoints don't return a total count, so pagination has to
// keep requesting pages until one comes back empty. Doing that one page at
// a time was the dominant cost of a sync for any account with more than a
// few hundred records — each page is its own network round-trip to
// AmoCRM. Requesting a small batch of pages concurrently cuts that wall-
// clock time roughly by the batch size. Kept modest (rather than higher)
// because syncLeadsFromAmo also runs several of these paginated fetches
// (leads, contacts, companies, users) at the same time via Promise.all —
// amoFetch's 429 retry above is the real safety net, this just keeps
// bursts smaller to begin with.
const PAGE_FETCH_CONCURRENCY = 3;

// How many consecutive fully-failed batches (every page in the batch threw,
// after its own retries) end the sweep early instead of continuing on
// toward maxPages. A single bad page mixed in with otherwise-succeeding
// ones still doesn't stop anything (the counter resets the moment any page
// in a batch succeeds) -- this only catches a connection that is
// *completely* broken (dead token, wrong subdomain, DNS failure), which
// otherwise silently retried and 20s-timed-out its way through every one
// of up to 800 pages before ever returning: observed in practice as an
// admin.amocrm-import page stuck on "Yuklanmoqda…" for hours with no error,
// since fetchAmoCatalog's whole request only resolves once fetchAllPaged
// does. Failing fast here surfaces a real error within a couple of
// batches (well under a minute) instead.
const CONSECUTIVE_FAILED_BATCHES_LIMIT = 3;

async function fetchAllPaged<T>(
  conn: AmoConnection,
  pathForPage: (page: number) => string,
  extractItems: (data: unknown) => T[],
  maxPages = 800, // default safety cap: ~200k records at limit=250
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let done = false;
  let consecutiveFailedBatches = 0;
  while (!done) {
    const pages = Array.from({ length: PAGE_FETCH_CONCURRENCY }, (_, i) => page + i);
    // Promise.all rejects the instant any ONE page's amoFetch throws (after
    // its own retries are exhausted), which used to discard every page
    // already accumulated in `all` across every earlier batch too -- one
    // permanently bad/oversized page anywhere in the sweep meant this
    // returned nothing at all for that run. In practice this is exactly
    // why the calls list stayed frozen on very old data for a long time:
    // a single page failing (e.g. the truncated-JSON case) nuked the whole
    // notes fetch, every 5 minutes, indefinitely. A failed page after
    // retries is now just skipped -- it doesn't mean "no more pages" (only
    // a genuinely empty page does), so pagination keeps going past it
    // instead of stopping early or losing everything already fetched.
    const results = await Promise.all(
      pages.map((p) =>
        amoFetch(conn, pathForPage(p))
          .then(extractItems)
          .catch((err) => {
            console.error(`[amoCRM] giving up on page ${p} of ${pathForPage(p)}:`, err);
            return null;
          }),
      ),
    );
    const batchHadAnySuccess = results.some((items) => items !== null);
    consecutiveFailedBatches = batchHadAnySuccess ? 0 : consecutiveFailedBatches + 1;
    for (const items of results) {
      if (items === null) continue;
      all.push(...items);
      if (items.length === 0) done = true;
    }
    if (!batchHadAnySuccess && consecutiveFailedBatches >= CONSECUTIVE_FAILED_BATCHES_LIMIT) {
      throw new Error(
        `AmoCRM bilan bog'lanib bo'lmadi -- ${pathForPage(page)} manziliga bir necha marta ketma-ket murojaat muvaffaqiyatsiz tugadi. Ulanish (token yoki subdomen) haqiqiy ekanini tekshiring.`,
      );
    }
    page += PAGE_FETCH_CONCURRENCY;
    if (page > maxPages) break;
  }
  return all;
}

async function amoWriteFetch(
  conn: AmoConnection,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`https://${conn.subdomain}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${conn.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AmoCRM API error (${res.status}) on ${path}: ${text}`);
  }
  return await parseAmoResponse(res, path);
}

// Confirmed against AmoCRM's own webhooks-api reference (POST /api/v4/
// webhooks "settings" values). Scoped to what this platform actually acts
// on: leads (incl. their notes -- calls sync as call-type notes -- and
// status/owner changes) and tasks. Contacts/companies/customers/talks/
// messages are intentionally left out -- nothing here parses those events,
// and lead sync already pulls a lead's linked contact/company data as part
// of syncing the lead itself.
const AMO_WEBHOOK_SETTINGS = [
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
];

// Shared by subscribeAmoWebhooks (fresh connect) and refreshTokens (so
// already-connected orgs, whose tokens refresh roughly once a day, get
// subscribed too without needing to reconnect). Takes an already-valid
// connection so callers already holding one don't force a second DB
// round-trip through getConnection/ensureValidToken.
async function subscribeAmoWebhooksInternal(conn: AmoConnection): Promise<void> {
  const destination = `${new URL(getAmoRedirectUri()).origin}/integrations/amocrm/webhook?org=${conn.organization_id}`;
  await amoWriteFetch(conn, "/api/v4/webhooks", "POST", {
    destination,
    settings: AMO_WEBHOOK_SETTINGS,
  });
}

/**
 * Registers our webhook endpoint with AmoCRM's subscription API (POST
 * /api/v4/webhooks) so lead/note/task changes push to us in near real time
 * instead of only being caught by the periodic sync. If a webhook already
 * exists for this exact destination, AmoCRM just updates its settings --
 * safe to call again on every (re)connect. Requires admin rights on the
 * AmoCRM account; best-effort by design (see callers) since the periodic
 * sync still works without this.
 */
export async function subscribeAmoWebhooks(organizationId: string): Promise<void> {
  const conn = await getConnection(organizationId);
  if (!conn) return;
  const validConn = await ensureValidToken(conn);
  await subscribeAmoWebhooksInternal(validConn);
}

/**
 * Creates a task on an AmoCRM lead — used to hand a call's AI-suggested next
 * step to the responsible manager as a reminder inside AmoCRM itself, right
 * after a call recording is analyzed.
 */
export async function createAmoTask(
  organizationId: string,
  leadAmoId: number,
  text: string,
  completeTill: number,
  responsibleAmoUserId: number | null,
): Promise<number | null> {
  const conn = await getConnection(organizationId);
  if (!conn) throw new Error("AmoCRM ulanmagan.");
  const validConn = await ensureValidToken(conn);
  // A task without responsible_user_id lands on the account the
  // integration is connected with (usually the admin). When the lead's
  // manager has no linked SalesIQ profile, ask amoCRM whose lead it is.
  let responsible = responsibleAmoUserId;
  if (responsible == null) {
    try {
      const lead = (await amoFetch(validConn, `/api/v4/leads/${leadAmoId}`)) as {
        responsible_user_id?: number | null;
      } | null;
      responsible = lead?.responsible_user_id ?? null;
    } catch {
      responsible = null;
    }
  }
  const payload = [
    {
      text,
      complete_till: completeTill,
      entity_id: leadAmoId,
      entity_type: "leads",
      ...(responsible != null ? { responsible_user_id: responsible } : {}),
    },
  ];
  const json = (await amoWriteFetch(validConn, "/api/v4/tasks", "POST", payload)) as {
    _embedded?: { tasks?: { id: number }[] };
  };
  return json._embedded?.tasks?.[0]?.id ?? null;
}

/**
 * Adds a plain text note to an AmoCRM lead — used to log the AI's summary
 * of a call directly on the lead when the rep didn't already write one up
 * themselves (see hasHumanNoteSince).
 */
export async function createAmoNote(
  organizationId: string,
  leadAmoId: number,
  text: string,
): Promise<number | null> {
  const conn = await getConnection(organizationId);
  if (!conn) throw new Error("AmoCRM ulanmagan.");
  const validConn = await ensureValidToken(conn);
  const payload = [{ note_type: "common", params: { text } }];
  const json = (await amoWriteFetch(
    validConn,
    `/api/v4/leads/${leadAmoId}/notes`,
    "POST",
    payload,
  )) as { _embedded?: { notes?: { id: number }[] } };
  return json._embedded?.notes?.[0]?.id ?? null;
}

/**
 * Whether a lead already has a manually-written ("common") note created
 * after the given moment — used to decide whether the AI should still log
 * its own summary, or the rep already did that themselves during/after the
 * call. Any fetch failure is treated as "no human note found" (fails open
 * toward the AI writing its own note, never silently skipping it).
 */
export async function hasHumanNoteSince(
  organizationId: string,
  leadAmoId: number,
  sinceUnixSeconds: number,
): Promise<boolean> {
  const conn = await getConnection(organizationId);
  if (!conn) return false;
  try {
    const validConn = await ensureValidToken(conn);
    const json = (await amoFetch(
      validConn,
      `/api/v4/leads/${leadAmoId}/notes?filter[note_type][]=common&order[created_at]=desc&limit=10`,
    )) as { _embedded?: { notes?: { created_at: number }[] } };
    const notes = json._embedded?.notes ?? [];
    return notes.some((n) => n.created_at >= sinceUnixSeconds);
  } catch {
    return false;
  }
}

type AmoLead = {
  id: number;
  name: string | null;
  price: number | null;
  status_id: number;
  pipeline_id: number;
  responsible_user_id: number | null;
  created_at: number;
  updated_at?: number;
  loss_reason_id?: number | null;
  _embedded?: {
    tags?: { id: number; name: string }[];
    contacts?: { id: number; is_main?: boolean }[];
    companies?: { id: number }[];
  };
};

/** AmoCRM's account-wide loss-reasons catalog (Sozlamalar → Yo'qotish sabablari) -- fetched once per sync and looked up by id when building lead rows. */
async function fetchLossReasons(conn: AmoConnection): Promise<Map<number, string>> {
  const data = (await amoFetch(conn, "/api/v4/leads/loss_reasons?limit=250")) as {
    _embedded?: { loss_reasons?: { id: number; name: string }[] };
  } | null;
  return new Map((data?._embedded?.loss_reasons ?? []).map((r) => [r.id, r.name]));
}

function amoTagNames(lead: AmoLead): string[] {
  return (lead._embedded?.tags ?? []).map((t) => t.name).filter(Boolean);
}

/** First linked contact (preferring the one marked main), if any. */
function amoMainContactId(lead: AmoLead): number | null {
  const contacts = lead._embedded?.contacts ?? [];
  return contacts.find((c) => c.is_main)?.id ?? contacts[0]?.id ?? null;
}

function amoMainCompanyId(lead: AmoLead): number | null {
  return lead._embedded?.companies?.[0]?.id ?? null;
}

// Leads are fetched and upserted one page at a time by syncLeadsFromAmo
// below (not via fetchAllPaged) so peak memory stays bounded to a single
// page regardless of account size — see the comment on that loop.

type AmoCustomFieldValue = { field_code: string | null; values?: { value?: string }[] };
type AmoContact = {
  id: number;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  custom_fields_values?: AmoCustomFieldValue[] | null;
};
type AmoCompany = { id: number; name: string | null };

function customField(entity: AmoContact, code: string): string | null {
  const field = (entity.custom_fields_values ?? []).find((f) => f.field_code === code);
  return field?.values?.[0]?.value ?? null;
}

// Fetching every contact/company in the account (fetchAllContacts/
// fetchAllCompanies used to page through the whole address book,
// unbounded) was the same class of bug as the call-notes hang fixed
// above — an account with tens of thousands of contacts made this the
// dominant cost of a sync, even though only the handful referenced by
// this run's leads is ever used. Fetch exactly those ids instead.
const ENTITY_ID_CHUNK = 100;

async function fetchEntitiesByIds<T extends { id: number }>(
  conn: AmoConnection,
  entity: "contacts" | "companies",
  ids: number[],
): Promise<Map<number, T>> {
  const map = new Map<number, T>();
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += ENTITY_ID_CHUNK) {
    chunks.push(ids.slice(i, i + ENTITY_ID_CHUNK));
  }
  // Chunks used to be fetched one at a time — fine when this only ever ran
  // for a handful of chunks, but an org with thousands of leads (each
  // referencing its own contact/company) can need dozens of chunks, and
  // doing them serially was slow enough on its own to push the whole sync
  // past the platform's request execution limit — the same "killed with no
  // response" failure mode as the original unbounded-fetch bug, just from a
  // new source now that fetch is bounded. Batch them the same way
  // fetchAllPaged already does for pagination.
  for (let i = 0; i < chunks.length; i += PAGE_FETCH_CONCURRENCY) {
    const batch = chunks.slice(i, i + PAGE_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const idParams = chunk.map((id) => `filter[id][]=${id}`).join("&");
        const data = (await amoFetch(conn, `/api/v4/${entity}?limit=250&${idParams}`)) as {
          _embedded?: Record<string, T[]>;
        } | null;
        return data?._embedded?.[entity] ?? [];
      }),
    );
    for (const items of results) {
      for (const item of items) map.set(item.id, item);
    }
  }
  return map;
}

type AmoUser = { id: number; email: string | null; name?: string | null };

async function fetchAllUsers(conn: AmoConnection): Promise<AmoUser[]> {
  return fetchAllPaged(
    conn,
    (page) => `/api/v4/users?limit=250&page=${page}`,
    (data) => (data as { _embedded?: { users?: AmoUser[] } } | null)?._embedded?.users ?? [],
  );
}

type AmoStatus = {
  id: number;
  name: string;
  sort: number;
  pipeline_id: number;
  color?: string | null;
};
type AmoPipeline = {
  id: number;
  name: string;
  is_main?: boolean;
  _embedded?: { statuses?: AmoStatus[] };
};

async function fetchPipelines(conn: AmoConnection): Promise<AmoPipeline[]> {
  const data = (await amoFetch(conn, "/api/v4/leads/pipelines?with=statuses")) as {
    _embedded?: { pipelines?: AmoPipeline[] };
  } | null;
  return data?._embedded?.pipelines ?? [];
}

// AmoCRM reserves these two status ids for "won"/"lost" in every pipeline —
// a fixed, documented convention, not something specific to any account.
const AMO_WON_STATUS_ID = 142;
const AMO_LOST_STATUS_ID = 143;
const STAGE_COLOR_ROTATION = ["bg-primary", "bg-info", "bg-warning", "bg-mint-border"] as const;

/** Builds the lookup key used to disambiguate a status id across pipelines — see syncPipelineStages. */
function pipelineStatusKey(pipelineId: number, statusId: number): string {
  return `${pipelineId}:${statusId}`;
}

type PipelineStageSync = {
  stageByStatusId: Map<string, string>;
  // AmoCRM's own pipeline name (e.g. "Продажи", "Retail") — leads.funnel
  // used to be left at its column default ('Direct Sales') for every
  // AmoCRM-synced lead because nothing set it, which collapsed every real
  // pipeline into one funnel in the UI. Keyed by amocrm_pipeline_id so
  // syncLeadsFromAmo can stamp each lead with its real funnel name.
  pipelineNameById: Map<number, string>;
};

/**
 * Mirrors AmoCRM's real pipeline/status structure into pipeline_stages, one
 * row per (organization, amocrm_pipeline_id, amocrm_status_id) — additive,
 * so stages created by hand in Settings (which have no amocrm_status_id)
 * are left untouched. Returns a "pipelineId:statusId" -> our stage_id
 * lookup for lead upserts — status ids alone aren't unique across
 * pipelines (won/lost are id 142/143 in every pipeline), so a lookup keyed
 * on status id alone would collapse every pipeline's "Won" stage into
 * whichever one was upserted last — plus each pipeline's own name.
 */
async function syncPipelineStages(
  organizationId: string,
  conn: AmoConnection,
): Promise<PipelineStageSync> {
  const allPipelines = await fetchPipelines(conn);
  // An admin can narrow which AmoCRM pipelines actually get synced (see the
  // amocrm-import-settings page) — null means unrestricted, the original
  // behavior.
  const pipelines = conn.enabled_pipeline_ids
    ? allPipelines.filter((p) => conn.enabled_pipeline_ids!.includes(p.id))
    : allPipelines;
  const pipelineNameById = new Map<number, string>(
    pipelines.map((p) => [p.id, p.name?.trim() || "Direct Sales"]),
  );
  const rows: {
    organization_id: string;
    amocrm_pipeline_id: number;
    amocrm_status_id: number;
    key: string;
    name: string;
    pipeline_name: string;
    position: number;
    color: string;
    probability: number;
    is_won: boolean;
    is_lost: boolean;
  }[] = [];

  let index = 0;
  for (const pipeline of pipelines) {
    for (const status of pipeline._embedded?.statuses ?? []) {
      const isWon = status.id === AMO_WON_STATUS_ID;
      const isLost = status.id === AMO_LOST_STATUS_ID;
      rows.push({
        organization_id: organizationId,
        amocrm_pipeline_id: pipeline.id,
        amocrm_status_id: status.id,
        // AmoCRM reuses status ids 142 (won) and 143 (lost) in *every*
        // pipeline — they aren't globally unique. The key must be scoped
        // per pipeline too, or two pipelines' won/lost stages collide on
        // this org's (organization_id, key) uniqueness.
        key: `amo-${pipeline.id}-${status.id}`,
        name: status.name,
        pipeline_name: pipelineNameById.get(pipeline.id) ?? "Direct Sales",
        position: status.sort ?? index,
        // Mirror AmoCRM's own status color exactly (hex, e.g. "#fffeb2") so
        // stage badges match what the org sees inside AmoCRM itself. Some
        // custom statuses come back with no color set -- fall back to the
        // old round-robin Tailwind palette for those (and for won/lost,
        // whose AmoCRM color already reads as green/red in practice).
        color:
          status.color ||
          (isWon
            ? "bg-success"
            : isLost
              ? "bg-destructive"
              : STAGE_COLOR_ROTATION[index % STAGE_COLOR_ROTATION.length]!),
        probability: isWon ? 100 : isLost ? 0 : Math.min(90, 20 + index * 15),
        is_won: isWon,
        is_lost: isLost,
      });
      index += 1;
    }
  }
  if (rows.length === 0) return { stageByStatusId: new Map(), pipelineNameById };

  // This used to be one upsert() call for every pipeline/status combination
  // at once -- fine for a handful of pipelines, but an account with dozens
  // of pipelines (each with its own audit-trail write) pushed a single
  // statement past the database's statement_timeout, failing the sync
  // before it ever got to a single lead. Chunk it the same way every other
  // bulk write in this file already is. Even a 200-row chunk still hit the
  // same statement_timeout on an account with hundreds of stages (see
  // 20260822000000_service_role_statement_timeout.sql for the real fix --
  // this smaller chunk is just a second, cheap layer of defense).
  const STAGE_UPSERT_CHUNK = 100;
  const dedupedRows = dedupeByKey(rows, (r) => `${r.amocrm_pipeline_id}:${r.amocrm_status_id}`);
  const stageByStatusId = new Map<string, string>();
  for (let i = 0; i < dedupedRows.length; i += STAGE_UPSERT_CHUNK) {
    const chunk = dedupedRows.slice(i, i + STAGE_UPSERT_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .upsert(chunk, { onConflict: "organization_id,amocrm_pipeline_id,amocrm_status_id" })
      .select("id, amocrm_pipeline_id, amocrm_status_id");
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.amocrm_pipeline_id != null && row.amocrm_status_id != null) {
        stageByStatusId.set(
          pipelineStatusKey(row.amocrm_pipeline_id, row.amocrm_status_id),
          row.id,
        );
      }
    }
  }
  return { stageByStatusId, pipelineNameById };
}

/**
 * Matches AmoCRM users to existing profiles by email, returns amoUserId ->
 * our profile id. Deliberately lets a failure here propagate (the caller
 * already wraps this call in its own .catch to add context and abort the
 * sync) rather than swallowing it and returning a partial/empty map --
 * every lead's owner_id falls back to null when its amoUserId isn't in
 * this map, so an empty map from a transient error used to silently null
 * out every rep's lead ownership org-wide on that sync run instead of
 * failing loudly and leaving the previous (correct) data alone.
 */
// Shared login password for every auto-provisioned sales rep account. Reps
// log in with their AmoCRM email as username; nobody picks this password
// individually, so it's a fixed, known value by design (per product spec).
const SOTUV_MENEJERI_DEFAULT_PASSWORD = "12345678";

async function syncUserMapping(
  organizationId: string,
  conn: AmoConnection,
): Promise<{ map: Map<number, string>; newlyMapped: number }> {
  const map = new Map<number, string>();
  let newlyMapped = 0;
  {
    const [users, { data: profiles, error }] = await Promise.all([
      fetchAllUsers(conn),
      supabaseAdmin
        .from("profiles")
        .select("id, email, amocrm_user_id")
        .eq("organization_id", organizationId),
    ]);
    if (error) throw error;
    const profileByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p]));

    // This used to await createUser + a profile update one AmoCRM user at a
    // time — fine for a handful of reps, but an account with dozens of
    // users turned this into a long serial chain of network round-trips,
    // the same "slow enough by itself to blow the platform's execution
    // limit" failure as the contacts/companies fetch above. Batch it the
    // same way.
    // An admin can narrow which AmoCRM operators actually get an account
    // and get treated as a lead owner (see the amocrm-import-settings
    // page) — null means unrestricted, the original behavior.
    const usableUsers = users
      .filter((u): u is AmoUser & { email: string } => !!u.email)
      .filter((u) => !conn.enabled_user_ids || conn.enabled_user_ids.includes(u.id));
    for (let i = 0; i < usableUsers.length; i += PAGE_FETCH_CONCURRENCY) {
      const batch = usableUsers.slice(i, i + PAGE_FETCH_CONCURRENCY);
      await Promise.all(
        batch.map(async (amoUser) => {
          const email = amoUser.email.toLowerCase();
          let profile = profileByEmail.get(email);
          if (!profile) {
            // No CRM account for this AmoCRM user yet — auto-provision a
            // sales rep account so they can log in with their AmoCRM email
            // and the shared rep password, instead of silently staying
            // unmapped.
            const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser(
              {
                email: amoUser.email,
                password: SOTUV_MENEJERI_DEFAULT_PASSWORD,
                email_confirm: true,
                user_metadata: {
                  full_name: amoUser.name?.trim() || amoUser.email,
                  role: "sotuv_menejeri",
                  organization_id: organizationId,
                },
              },
            );
            if (createError || !created.user) {
              // Most likely an email collision with an existing auth user
              // in a different organization — report it distinctly and
              // keep going, don't let one failed provisioning attempt
              // abort the whole sync.
              console.error(
                `[amocrm sync] Could not auto-provision rep account for ${amoUser.email}: ${createError?.message ?? "unknown error"}`,
              );
              return;
            }
            profile = { id: created.user.id, email: amoUser.email, amocrm_user_id: null };
            profileByEmail.set(email, profile);
          }
          map.set(amoUser.id, profile.id);
          // Skip the write when the mapping is already correct — on every
          // sync after the first, this avoids a DB round-trip per AmoCRM
          // user.
          if (profile.amocrm_user_id !== amoUser.id) {
            newlyMapped += 1;
            await supabaseAdmin
              .from("profiles")
              .update({ amocrm_user_id: amoUser.id })
              .eq("id", profile.id);
          }
        }),
      );
    }
  }
  return { map, newlyMapped };
}

async function defaultStageId(organizationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", "new")
    .maybeSingle();
  return data?.id ?? null;
}

type AmoCallNote = {
  id: number;
  entity_id: number;
  note_type: "call_in" | "call_out";
  created_at: number;
  params?: {
    duration?: number;
    phone?: string;
    link?: string;
  };
};

// Bounds one notes request sweep (memory and time): ~5k notes at limit=250.
const CALL_NOTES_MAX_PAGES = 20;

async function fetchCallNotes(conn: AmoConnection): Promise<AmoCallNote[]> {
  // Calls changed in the last two days (since the last sync, with a margin).
  // amoCRM's notes list filters and sorts by updated_at only -- the
  // filter[created_at]/order[created_at] this used to send were ignored, so
  // every run got the account's OLDEST notes. Older history comes per lead
  // from syncCallHistory below.
  const fromMs = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : Date.now();
  const sinceUnix = Math.floor(fromMs / 1000) - 2 * 86400;
  const notes = await fetchAllPaged(
    conn,
    (page) =>
      `/api/v4/leads/notes?filter[note_type][]=call_in&filter[note_type][]=call_out&filter[updated_at][from]=${sinceUnix}&order[updated_at]=desc&limit=250&page=${page}`,
    (data) => (data as { _embedded?: { notes?: AmoCallNote[] } } | null)?._embedded?.notes ?? [],
    CALL_NOTES_MAX_PAGES,
  );
  // AmoCRM's page-based pagination isn't a stable snapshot — a note can
  // shift across the page boundary between two concurrent page requests
  // (see PAGE_FETCH_CONCURRENCY) and come back on both pages, which would
  // otherwise hit the upsert below twice in the same batch (see
  // dedupeByKey for why that's also defended independently there).
  return Array.from(new Map(notes.map((n) => [n.id, n])).values());
}

export type SyncResult = {
  synced: number;
  callsSynced?: number;
  tasksSynced?: number;
  error?: string;
  // A previous sync for this org was still running (or crashed without
  // clearing its lock, within the staleness window) -- this run did
  // nothing rather than run concurrently with it. Not an error.
  skipped?: boolean;
  // Ran out of time and saved where it got to; the next run continues.
  partial?: boolean;
};

// Called by the route handlers (never syncLeadsFromAmo itself, to avoid
// touching that function's already-carefully-ordered error handling) right
// after they get a SyncResult back, so the Integrations page can show real
// sync history instead of only the single latest last_sync_error/
// last_synced_at columns amocrm_connection carries. Best-effort: a logging
// failure must never surface as a sync failure to the caller.
export async function logAmoSyncRun(
  organizationId: string,
  trigger: "manual" | "cron",
  startedAt: string,
  result: SyncResult,
): Promise<void> {
  try {
    await supabaseAdmin.from("amocrm_sync_log").insert({
      organization_id: organizationId,
      trigger,
      started_at: startedAt,
      synced_count: result.synced,
      calls_synced: result.callsSynced ?? null,
      tasks_synced: result.tasksSynced ?? null,
      error: result.error ?? null,
      skipped: result.skipped ?? false,
    });
    // Keep the log bounded -- this org's own history only, oldest first,
    // past the most recent 30 runs. Cheap: at most a handful of rows per
    // org even at the 5-minute cron cadence's steady state.
    const { data: old } = await supabaseAdmin
      .from("amocrm_sync_log")
      .select("id")
      .eq("organization_id", organizationId)
      .order("finished_at", { ascending: false })
      .range(30, 1000);
    if (old && old.length > 0) {
      await supabaseAdmin
        .from("amocrm_sync_log")
        .delete()
        .in(
          "id",
          old.map((r) => r.id),
        );
    }
  } catch {
    // Logging is diagnostic only -- never let it affect the sync result.
  }
}

/* ------------------------------------------------------------------ */
/* Sync-driven notifications -- surfaces AmoCRM changes (stage moves,   */
/* new leads, reassignments, new calls) in the in-app bell instead of   */
/* the sync being silently invisible between the "Oxirgi sinxronlash"   */
/* timestamp and whatever the user notices changed on a page reload.    */
/* Visibility mirrors every other role-scoped view in the app: the      */
/* lead's own owner, that owner's rop (manager_id), and every           */
/* super_admin/platform_owner in the org all get a row -- resolved once */
/* per sync call so a page of 250 leads doesn't re-query profiles per   */
/* lead.                                                                */
/* ------------------------------------------------------------------ */

type NotificationRecipients = {
  superAdminIds: string[];
  managerIdByProfileId: Map<string, string | null>;
  nameByProfileId: Map<string, string>;
};

async function loadNotificationRecipients(organizationId: string): Promise<NotificationRecipients> {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, role, manager_id, full_name")
    .eq("organization_id", organizationId);
  const superAdminIds: string[] = [];
  const managerIdByProfileId = new Map<string, string | null>();
  const nameByProfileId = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.role === "super_admin" || p.role === "platform_owner") superAdminIds.push(p.id);
    managerIdByProfileId.set(p.id, p.manager_id ?? null);
    nameByProfileId.set(p.id, p.full_name);
  }
  return { superAdminIds, managerIdByProfileId, nameByProfileId };
}

function recipientsForOwner(recipients: NotificationRecipients, ownerId: string | null): string[] {
  const set = new Set<string>(recipients.superAdminIds);
  if (ownerId) {
    set.add(ownerId);
    const managerId = recipients.managerIdByProfileId.get(ownerId);
    if (managerId) set.add(managerId);
  }
  return Array.from(set);
}

type NotificationDraft = {
  ownerId: string | null;
  type: string;
  title: string;
  body: string;
  link: string;
};

// Best-effort by design: a bug here should never take down the actual lead
// sync that already succeeded above it. Failures are swallowed by the
// caller, same posture as the calls-sync warning a few lines up.
async function insertAmoNotifications(
  organizationId: string,
  recipients: NotificationRecipients,
  drafts: NotificationDraft[],
): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.flatMap((d) =>
    recipientsForOwner(recipients, d.ownerId).map((userId) => ({
      organization_id: organizationId,
      user_id: userId,
      type: d.type,
      title: d.title,
      body: d.body,
      link: d.link,
    })),
  );
  const NOTIF_CHUNK = 200;
  for (let i = 0; i < rows.length; i += NOTIF_CHUNK) {
    const chunk = rows.slice(i, i + NOTIF_CHUNK);
    const { error } = await supabaseAdmin.from("notifications").insert(chunk);
    if (error) throw new Error(`[notifications ${i}-${i + chunk.length}] ${describeError(error)}`);
  }
}

type StageMeta = { name: string; isWon: boolean; isLost: boolean };

async function loadStageMeta(organizationId: string): Promise<Map<string, StageMeta>> {
  const { data } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, is_won, is_lost")
    .eq("organization_id", organizationId);
  return new Map(
    (data ?? []).map((s) => [s.id, { name: s.name, isWon: s.is_won, isLost: s.is_lost }]),
  );
}

// How long a sync is allowed to hold the lock before a later run is allowed
// to treat it as abandoned (a crashed/killed worker never clears the flag
// otherwise, which would permanently wedge every future sync for that org).
// Generous relative to how long one full sync realistically takes with the
// page-streaming approach below.
// A sync can't outlive its Vercel function (120 s, vite.config.ts), so a
// lock older than this belongs to a run that was killed, not one still going.
const SYNC_LOCK_STALE_MS = 3 * 60 * 1000;

// Vercel stops a function at 120 s. A sync stops starting new work this long
// before its deadline, so it always gets to save where it got to: a page
// takes a few seconds, the calls and tasks phases up to ~30 s.
export const SYNC_TIME_BUDGET_MS = 95_000;
const PAGE_RESERVE_MS = 15_000;
const PHASE_RESERVE_MS = 35_000;

/**
 * Refreshes AmoCRM manager -> SalesIQ employee mapping on its own, without
 * running a full lead sync -- for the "Refresh managers" button an admin
 * uses right after adding a new operator in AmoCRM and wanting it to show
 * up immediately, instead of waiting for the next scheduled sync.
 */
export async function refreshAmoManagerMapping(organizationId: string): Promise<number> {
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("AmoCRM is not connected yet.");
  const conn = await ensureValidToken(conn0);
  const { map } = await syncUserMapping(organizationId, conn);
  return map.size;
}

/**
 * "Ulanishni tekshirish" -- a lightweight, read-only ping used by the
 * Operatsiyalar tab to confirm the stored token still works against
 * AmoCRM's own API, without running (or waiting on) a full lead sync.
 */
export async function testAmoConnection(
  organizationId: string,
): Promise<{ ok: true; subdomain: string; accountName: string | null }> {
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("AmoCRM is not connected yet.");
  const conn = await ensureValidToken(conn0);
  const data = (await amoFetch(conn, "/api/v4/account")) as { name?: string } | null;
  return { ok: true, subdomain: conn.subdomain, accountName: data?.name ?? null };
}

/** Toggles whether call recordings play back starting at the first answer -- see "Operatsiyalar" tab. */
export async function setRecordingTrimBeforeAnswer(
  organizationId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("amocrm_connection")
    .update({ recording_trim_before_answer: enabled })
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** Toggles whether checkActiveFunnel treats a vanished local lead as expected (won/lost/deleted upstream) or a real discrepancy to flag -- see "CRMda yo'q kartalarni sanamaslik". */
export async function setActiveFunnelIgnoreMissing(
  organizationId: string,
  ignore: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("amocrm_connection")
    .update({ active_funnel_ignore_missing: ignore })
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export type ActiveFunnelCheckResult = {
  checkedAt: string;
  // Number of non-final (not won/lost) pipeline stages this check compared against.
  checkedStages: number;
  // Local leads tagged with an amocrm_id that were sitting on an active
  // stage but AmoCRM no longer lists as active (won/lost/deleted upstream,
  // or genuinely missing) -- self-healed to their real current stage where
  // AmoCRM still has the lead at all.
  movedOrChanged: number;
  // AmoCRM leads that are currently active but had no local row at all --
  // pulled in via upsertSingleAmoLead so the funnel view isn't missing them.
  backfilled: number;
  // Local leads whose amocrm_id AmoCRM no longer recognizes (404) at all --
  // genuinely gone upstream. Only ever surfaced, never deleted locally.
  missingInCrm: number;
  ignoreMissing: boolean;
};

// Reconciling every active lead one-by-one against AmoCRM's own record can
// mean dozens of individual GETs on top of the paginated active-leads pull
// -- capped so a single manual "Tekshirish" click can't run long enough to
// hit a request timeout on an account with thousands of open leads. A
// partial pass still self-heals the leads it did look at; a repeat click
// picks up more.
const ACTIVE_FUNNEL_RECONCILE_CAP = 150;

/**
 * "Aktiv voronka solishtiruvi" -- compares which leads AmoCRM currently
 * considers open (not won/lost) against what SalesIQ has locally, so a lead
 * that silently drifted out of sync (a status change AmoCRM's webhook
 * missed, or a lead that was never picked up by the historical backfill)
 * gets caught and repaired instead of just sitting wrong forever.
 */
export async function checkActiveFunnel(organizationId: string): Promise<ActiveFunnelCheckResult> {
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("AmoCRM is not connected yet.");
  const conn = await ensureValidToken(conn0);

  const { data: stages, error: stagesError } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, amocrm_pipeline_id, amocrm_status_id, is_won, is_lost")
    .eq("organization_id", organizationId)
    .not("amocrm_pipeline_id", "is", null);
  if (stagesError) throw stagesError;

  const activeStageIds = (stages ?? [])
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => s.id as string);

  // AmoCRM's own list endpoint has no "not won/lost" filter -- pull every
  // lead in the org's enabled pipelines and filter client-side using the
  // same fixed won/lost status ids the rest of this file relies on.
  const allLeads = await fetchAllPaged<AmoLead>(
    conn,
    (page) => `/api/v4/leads?limit=250&page=${page}`,
    (data) => (data as { _embedded?: { leads?: AmoLead[] } } | null)?._embedded?.leads ?? [],
    200,
  );
  const scopedLeads = conn.enabled_pipeline_ids
    ? allLeads.filter((l) => conn.enabled_pipeline_ids!.includes(l.pipeline_id))
    : allLeads;
  const amoActiveLeads = scopedLeads.filter(
    (l) => l.status_id !== AMO_WON_STATUS_ID && l.status_id !== AMO_LOST_STATUS_ID,
  );
  const amoActiveById = new Map(amoActiveLeads.map((l) => [l.id, l]));

  const { data: localActiveLeads, error: localError } = activeStageIds.length
    ? await supabaseAdmin
        .from("leads")
        .select("id, amocrm_id, stage_id")
        .eq("organization_id", organizationId)
        .not("amocrm_id", "is", null)
        .in("stage_id", activeStageIds)
    : { data: [], error: null };
  if (localError) throw localError;

  let movedOrChanged = 0;
  let missingInCrm = 0;
  const reconcileCandidates = (localActiveLeads ?? []).filter(
    (l) => l.amocrm_id != null && !amoActiveById.has(l.amocrm_id),
  );
  for (const lead of reconcileCandidates.slice(0, ACTIVE_FUNNEL_RECONCILE_CAP)) {
    try {
      const remote = (await amoFetch(conn, `/api/v4/leads/${lead.amocrm_id}`)) as AmoLead | null;
      if (!remote) {
        missingInCrm += 1;
        continue;
      }
      const stageId = await resolveStageId(organizationId, remote.status_id, remote.pipeline_id);
      if (stageId && stageId !== lead.stage_id) {
        await supabaseAdmin.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
        movedOrChanged += 1;
      }
    } catch {
      // A 404 (and some transient errors) surface as a thrown error from
      // amoFetch rather than a null body -- either way this lead's status
      // couldn't be confirmed, so count it as missing rather than losing
      // the whole check over one bad lookup.
      missingInCrm += 1;
    }
  }

  const backfillCandidates = amoActiveLeads.filter((l) => {
    const amoId = l.id;
    return !(localActiveLeads ?? []).some((row) => row.amocrm_id === amoId);
  });
  let backfilled = 0;
  for (const lead of backfillCandidates.slice(0, ACTIVE_FUNNEL_RECONCILE_CAP)) {
    try {
      await upsertSingleAmoLead(
        organizationId,
        lead.id,
        lead.name,
        lead.price,
        lead.status_id,
        lead.responsible_user_id,
        lead.pipeline_id,
      );
      backfilled += 1;
    } catch (err) {
      console.error(`[amoCRM] active-funnel backfill failed for lead ${lead.id}:`, err);
    }
  }

  const result: ActiveFunnelCheckResult = {
    checkedAt: new Date().toISOString(),
    checkedStages: activeStageIds.length,
    movedOrChanged,
    backfilled,
    missingInCrm: conn.active_funnel_ignore_missing ? 0 : missingInCrm,
    ignoreMissing: conn.active_funnel_ignore_missing,
  };

  await supabaseAdmin
    .from("amocrm_connection")
    .update({ active_funnel_last_check: result })
    .eq("organization_id", organizationId);

  return result;
}

/** Pulls every lead from AmoCRM and upserts it into public.leads, keyed by (organization_id, amocrm_id). */
export async function syncLeadsFromAmo(
  organizationId: string,
  opts: { deadline?: number } = {},
): Promise<SyncResult> {
  // When this run has to stop (see SYNC_TIME_BUDGET_MS); sync-all passes one
  // shared deadline for every company it syncs in one request.
  const deadline = opts.deadline ?? Date.now() + SYNC_TIME_BUDGET_MS;
  if (await isIntegrationPaused(organizationId, "amocrm")) return { synced: 0, skipped: true };
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("AmoCRM is not connected yet.");

  // The 5-minute cron (see amocrm-auto-sync-5min) has no built-in overlap
  // protection: if one run takes longer than 5 minutes (large call-note
  // backlog, AmoCRM rate-limiting), the next tick starts a second full sync
  // for the same org on top of the still-running one. These stack --
  // concurrent syncs compete for the same Postgres connections and lock
  // rows other pages (Reyting, Dashboard, Funnels...) are trying to read at
  // the same time, which is the most likely explanation for "everything on
  // the platform is slow" reports. Skip instead of piling on.
  if (
    conn0.sync_in_progress &&
    conn0.sync_started_at &&
    Date.now() - new Date(conn0.sync_started_at).getTime() < SYNC_LOCK_STALE_MS
  ) {
    return { synced: 0, skipped: true };
  }

  const conn = await ensureValidToken(conn0);
  await supabaseAdmin
    .from("amocrm_connection")
    .update({ sync_in_progress: true, sync_started_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  try {
    // Each phase is labeled on failure -- a bare "canceling statement due to
    // statement timeout" (or any other DB/network error) previously landed
    // in last_sync_error with no way to tell which of these three calls,
    // let alone which one of dozens of leads pages, actually caused it.
    const [
      { stageByStatusId, pipelineNameById },
      { map: ownerByAmoUserId, newlyMapped },
      fallbackStageId,
      lossReasonById,
      notifRecipients,
      stageMetaById,
    ] = await Promise.all([
      syncPipelineStages(organizationId, conn).catch((e) => {
        throw new Error(`[pipeline stages] ${describeError(e)}`);
      }),
      syncUserMapping(organizationId, conn).catch((e) => {
        throw new Error(`[user mapping] ${describeError(e)}`);
      }),
      defaultStageId(organizationId).catch((e) => {
        throw new Error(`[default stage] ${describeError(e)}`);
      }),
      // Best-effort: a lead's own loss_reason_id is still written even when
      // this fails, just unresolved to a name until a later sync succeeds
      // -- but silently swallowing it with no trace made every lost lead's
      // reason look permanently unresolved with no way to tell why.
      fetchLossReasons(conn).catch((e) => {
        console.error(`[amoCRM] [loss reasons] ${describeError(e)}`);
        return new Map<number, string>();
      }),
      loadNotificationRecipients(organizationId).catch((e) => {
        throw new Error(`[notification recipients] ${describeError(e)}`);
      }),
      loadStageMeta(organizationId).catch((e) => {
        throw new Error(`[stage meta] ${describeError(e)}`);
      }),
    ]);

    if (newlyMapped > 0 && conn.last_synced_at) {
      // A manager got an account after their leads were synced (e.g. the
      // first accounts failed to be created): an incremental run never
      // reads those leads again, so they would stay without an owner.
      // Start a full pass over the chosen pipelines from the next run.
      await supabaseAdmin
        .from("amocrm_connection")
        .update({ last_synced_at: null, initial_sync_page: 0 })
        .eq("organization_id", organizationId);
      return { synced: 0, partial: true };
    }

    // Leads used to be fetched into one array for the whole account (up to
    // thousands of objects, each carrying embedded tags/contacts/companies
    // JSON via `with=...`) before any of it was written. Lovable's own
    // Worker logs showed that alone was enough to exceed the platform's
    // memory limit and kill the request with a 502 ("Worker exceeded
    // memory limit") — a different failure than the execution-time limit
    // the earlier concurrency fixes addressed. Stream one page at a time
    // instead: fetch, resolve just that page's own referenced
    // contacts/companies, upsert, then let it be garbage collected before
    // fetching the next page — peak memory stays bounded to a single page
    // no matter how many leads the account has.
    // Every earlier version of this loop walked the *entire* account on
    // every single sync, forever. That's fine once, but for an account with
    // several thousand leads it means dozens of AmoCRM pages (each with its
    // own follow-up contacts/companies calls) — comfortably long enough to
    // blow past both pg_net's cron timeout and the hosting platform's own
    // request-time limit, so the scheduled 5-minute sync never actually
    // finished (confirmed via net._http_response: every cron-triggered call
    // timed out, last_synced_at never advanced). After the first full sync,
    // only ask AmoCRM for leads updated since the last successful sync, with
    // a 10-minute overlap so a slightly-late or skipped run can't drop a
    // lead that changed in the gap.
    const SYNC_OVERLAP_SECONDS = 600;
    // Oldest change first, so a run that runs out of time can move
    // last_synced_at up to the newest lead it did write and the next run
    // carries on from there (see outOfTime below).
    const sinceFilter = conn.last_synced_at
      ? `&filter[updated_at][from]=${Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - SYNC_OVERLAP_SECONDS}&order[updated_at]=asc`
      : "";

    // The initial backfill (last_synced_at still null) has no since-filter,
    // so for an account with thousands of leads it can't finish in one run.
    // The loop stops at the shared deadline -- Vercel stops the whole
    // function at 120 s -- and the backfill saves its page after every page
    // (initial_sync_page), so the next 5-minute run carries on from there;
    // a killed run used to start again at page 1 every time. An incremental
    // run with a big backlog stops the same way (see outOfTime below).
    let outOfTime = false;
    let newestUpdatedAt = 0;
    // Ask amoCRM for the chosen pipelines only: a big account's other
    // pipelines used to be paged through (81k leads for 8k imported), so
    // every run ran out of time before calls, tasks and managers.
    const pipelineFilter = (conn.enabled_pipeline_ids ?? [])
      .map((id) => `&filter[pipeline_id][]=${id}`)
      .join("");

    let totalSynced = 0;
    let page = conn.last_synced_at ? 1 : (conn.initial_sync_page ?? 0) + 1;
    for (;;) {
      if (Date.now() > deadline - PAGE_RESERVE_MS) {
        outOfTime = true;
        break;
      }
      const pageData = (await amoFetch(
        conn,
        `/api/v4/leads?limit=250&page=${page}&with=tags,contacts,companies${pipelineFilter}${sinceFilter}`,
      ).catch((e) => {
        throw new Error(`[page ${page} leads-fetch] ${describeError(e)}`);
      })) as { _embedded?: { leads?: AmoLead[] } } | null;
      const pageLeads = dedupeByKey(pageData?._embedded?.leads ?? [], (l) => String(l.id));
      if (pageLeads.length === 0) break;

      // Filtered AFTER the pagination-continuation checks below (which key
      // off the raw fetched page size) — a page made entirely of leads in
      // an excluded pipeline must not be mistaken for "last page reached".
      const syncableLeads = conn.enabled_pipeline_ids
        ? pageLeads.filter((l) => conn.enabled_pipeline_ids!.includes(l.pipeline_id))
        : pageLeads;

      // Only fetch the contacts/companies this page's leads actually
      // reference, not the whole account's address book (see
      // fetchEntitiesByIds above).
      const referencedContactIds = new Set<number>();
      const referencedCompanyIds = new Set<number>();
      for (const l of syncableLeads) {
        const cId = amoMainContactId(l);
        const coId = amoMainCompanyId(l);
        if (cId) referencedContactIds.add(cId);
        if (coId) referencedCompanyIds.add(coId);
      }

      const [contactsById, companiesById] = await Promise.all([
        fetchEntitiesByIds<AmoContact>(conn, "contacts", Array.from(referencedContactIds)),
        fetchEntitiesByIds<AmoCompany>(conn, "companies", Array.from(referencedCompanyIds)),
      ]);

      const contactIdMap = new Map<number, string>();
      if (referencedContactIds.size > 0) {
        const contactRows = Array.from(referencedContactIds)
          .map((id) => contactsById.get(id))
          .filter((c): c is AmoContact => !!c)
          .map((c) => ({
            organization_id: organizationId,
            amocrm_id: c.id,
            full_name: c.name?.trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
            phone: customField(c, "PHONE"),
            email: customField(c, "EMAIL"),
          }));
        if (contactRows.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("contacts")
            .upsert(
              dedupeByKey(contactRows, (r) => String(r.amocrm_id)),
              { onConflict: "organization_id,amocrm_id" },
            )
            .select("id, amocrm_id");
          if (error) throw new Error(`[page ${page} contacts] ${describeError(error)}`);
          for (const row of data ?? []) {
            if (row.amocrm_id != null) contactIdMap.set(row.amocrm_id, row.id);
          }
        }
      }

      const companyIdMap = new Map<number, string>();
      if (referencedCompanyIds.size > 0) {
        const companyRows = Array.from(referencedCompanyIds)
          .map((id) => companiesById.get(id))
          .filter((c): c is AmoCompany => !!c)
          .map((c) => ({
            organization_id: organizationId,
            amocrm_id: c.id,
            name: c.name?.trim() || `AmoCRM company #${c.id}`,
          }));
        if (companyRows.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("companies")
            .upsert(
              dedupeByKey(companyRows, (r) => String(r.amocrm_id)),
              { onConflict: "organization_id,amocrm_id" },
            )
            .select("id, amocrm_id");
          if (error) throw new Error(`[page ${page} companies] ${describeError(error)}`);
          for (const row of data ?? []) {
            if (row.amocrm_id != null) companyIdMap.set(row.amocrm_id, row.id);
          }
        }
      }

      const rows = syncableLeads.map((l) => {
        const contactAmoId = amoMainContactId(l);
        const companyAmoId = amoMainCompanyId(l);
        const company = companyAmoId ? companiesById.get(companyAmoId) : undefined;
        return {
          organization_id: organizationId,
          amocrm_id: l.id,
          name: l.name?.trim() || `AmoCRM lead #${l.id}`,
          company_name: company?.name?.trim() || "",
          company_id: companyAmoId ? (companyIdMap.get(companyAmoId) ?? null) : null,
          contact_id: contactAmoId ? (contactIdMap.get(contactAmoId) ?? null) : null,
          source: "AmoCRM",
          // Was never set here before, so every leads.created_at defaulted
          // to whenever this row was first synced (the column default is
          // now()), not when the lead actually appeared in AmoCRM -- every
          // date-scoped metric across the platform (Reyting, Dashboard,
          // Kunlik hisobot, Lid tahlili's p_since filters) was measuring
          // sync time instead of reality, and a historical backfill made
          // thousands of old leads look like they were all created today.
          // Every sync re-touches every lead already, so writing the real
          // value here on every run self-heals existing rows too, no
          // separate backfill migration needed.
          created_at: new Date(l.created_at * 1000).toISOString(),
          expected_revenue: l.price ?? 0,
          budget: l.price ?? 0,
          // Was never set here before, so every AmoCRM-synced lead sat at
          // leads.funnel's column default ('Direct Sales') regardless of
          // which real AmoCRM pipeline it came from — collapsing every
          // pipeline into one funnel everywhere the app groups/filters by
          // funnel (Voronkalar, the pipeline board, Reyting's funnel
          // filter, ...).
          funnel: pipelineNameById.get(l.pipeline_id) ?? "Direct Sales",
          stage_id:
            stageByStatusId.get(pipelineStatusKey(l.pipeline_id, l.status_id)) ?? fallbackStageId,
          owner_id: l.responsible_user_id
            ? (ownerByAmoUserId.get(l.responsible_user_id) ?? null)
            : null,
          loss_reason:
            l.loss_reason_id != null ? (lossReasonById.get(l.loss_reason_id) ?? null) : null,
          priority: "Normal" as const,
          tags: amoTagNames(l),
        };
      });
      const dedupedLeadRows = dedupeByKey(rows, (r) => String(r.amocrm_id));

      // Snapshot each of this page's leads as they stood *before* this
      // upsert, so a stage/owner change can be detected by diffing against
      // it below -- the upsert itself only ever returns the *new* row, an
      // unconditional overwrite gives no signal about what actually moved.
      // Also used to skip writing rows that are byte-for-byte unchanged --
      // AmoCRM re-sends every lead on every sync tick regardless of whether
      // it actually changed, and an unconditional upsert used to write (and
      // trigger a full audit_logs snapshot for) every single one of them,
      // every 5 minutes, which is how that table reached 5.8M rows.
      const { data: existingLeadRows } = await supabaseAdmin
        .from("leads")
        .select(
          "id, amocrm_id, name, company_name, company_id, contact_id, expected_revenue, budget, funnel, stage_id, owner_id, loss_reason, tags",
        )
        .eq("organization_id", organizationId)
        .in(
          "amocrm_id",
          dedupedLeadRows.map((r) => r.amocrm_id),
        );
      const existingByAmoId = new Map((existingLeadRows ?? []).map((r) => [r.amocrm_id, r]));

      function leadRowUnchanged(
        existing: NonNullable<typeof existingLeadRows>[number],
        candidate: (typeof dedupedLeadRows)[number],
      ): boolean {
        return (
          existing.name === candidate.name &&
          existing.company_name === candidate.company_name &&
          existing.company_id === candidate.company_id &&
          existing.contact_id === candidate.contact_id &&
          existing.expected_revenue === candidate.expected_revenue &&
          existing.budget === candidate.budget &&
          existing.funnel === candidate.funnel &&
          existing.stage_id === candidate.stage_id &&
          existing.owner_id === candidate.owner_id &&
          existing.loss_reason === candidate.loss_reason &&
          JSON.stringify(existing.tags ?? []) === JSON.stringify(candidate.tags ?? [])
        );
      }

      const notifDrafts: NotificationDraft[] = [];
      for (const r of dedupedLeadRows) {
        const existing = existingByAmoId.get(r.amocrm_id);
        if (!existing) continue; // new leads are notified after the upsert below, once their id exists
        if (existing.stage_id !== r.stage_id) {
          const oldStage = existing.stage_id ? stageMetaById.get(existing.stage_id) : undefined;
          const newStage = r.stage_id ? stageMetaById.get(r.stage_id) : undefined;
          notifDrafts.push({
            ownerId: r.owner_id,
            type: newStage?.isWon ? "LeadWon" : newStage?.isLost ? "LeadLost" : "LeadStage",
            title: newStage?.isWon
              ? "Lid yutildi"
              : newStage?.isLost
                ? "Lid yo'qotildi"
                : "Lid bosqichi o'zgartirildi",
            body: `${r.name} · ${oldStage?.name ?? "?"} → ${newStage?.name ?? "?"}`,
            link: `/crm/leads/${existing.id}`,
          });
        }
        if (existing.owner_id !== r.owner_id) {
          const oldOwnerName = existing.owner_id
            ? (notifRecipients.nameByProfileId.get(existing.owner_id) ?? "—")
            : "—";
          const newOwnerName = r.owner_id
            ? (notifRecipients.nameByProfileId.get(r.owner_id) ?? "—")
            : "—";
          notifDrafts.push({
            ownerId: r.owner_id,
            type: "LeadOwner",
            title: "Lid boshqa menejerga o'tkazildi",
            body: `${r.name} · ${oldOwnerName} → ${newOwnerName}`,
            link: `/crm/leads/${existing.id}`,
          });
        }
      }

      const rowsToUpsert = dedupedLeadRows.filter((r) => {
        const existing = existingByAmoId.get(r.amocrm_id);
        return !existing || !leadRowUnchanged(existing, r);
      });

      // Each AmoCRM page already caps at 250 leads, but that turned out to
      // be close enough to the same per-statement audit-trail overhead that
      // forced pipeline_stages down to 200-row chunks (see above) that a
      // single heavy account can still time out here. Chunk it the same way
      // rather than wait for a second report of the same failure mode.
      const LEADS_UPSERT_CHUNK = 100;
      const upsertedIdByAmoId = new Map<number, string>();
      for (let i = 0; i < rowsToUpsert.length; i += LEADS_UPSERT_CHUNK) {
        const chunk = rowsToUpsert.slice(i, i + LEADS_UPSERT_CHUNK);
        if (chunk.length === 0) continue;
        const { data: upserted, error } = await supabaseAdmin
          .from("leads")
          .upsert(chunk, { onConflict: "organization_id,amocrm_id" })
          .select("id, amocrm_id");
        if (error)
          throw new Error(`[page ${page} leads ${i}-${i + chunk.length}] ${describeError(error)}`);
        for (const row of upserted ?? []) {
          if (row.amocrm_id != null) upsertedIdByAmoId.set(row.amocrm_id, row.id);
        }
      }

      for (const r of dedupedLeadRows) {
        if (existingByAmoId.has(r.amocrm_id)) continue;
        const id = upsertedIdByAmoId.get(r.amocrm_id);
        if (!id) continue;
        notifDrafts.push({
          ownerId: r.owner_id,
          type: "LeadNew",
          title: "Yangi lid qo'shildi",
          body: r.company_name ? `${r.name} · ${r.company_name}` : r.name,
          link: `/crm/leads/${id}`,
        });
      }

      try {
        // The first sync brings in the account's whole history -- a bell
        // entry per old lead (times every admin) is noise, not news.
        if (conn.last_synced_at) {
          await insertAmoNotifications(organizationId, notifRecipients, notifDrafts);
        }
      } catch {
        // Best-effort -- see insertAmoNotifications' comment. The lead sync
        // above already succeeded and must not be reported as failed over
        // a notifications-only problem.
      }

      totalSynced += syncableLeads.length;
      for (const l of pageLeads) {
        if (l.updated_at && l.updated_at > newestUpdatedAt) newestUpdatedAt = l.updated_at;
      }
      if (!conn.last_synced_at) {
        // Backfill checkpoint: a run killed after this still resumes here.
        await supabaseAdmin
          .from("amocrm_connection")
          .update({ initial_sync_page: page })
          .eq("organization_id", organizationId);
      }
      if (pageLeads.length < 250) break; // short page — this was the last one
      page += 1;
    }

    if (outOfTime && conn.last_synced_at) {
      // Incremental run with more changes than fit in one run: everything up
      // to newestUpdatedAt is written (oldest first), so continue from there.
      // Calls and tasks wait for the next run.
      const cursor = newestUpdatedAt
        ? new Date(newestUpdatedAt * 1000).toISOString()
        : conn.last_synced_at;
      if (cursor > conn.last_synced_at) {
        await supabaseAdmin
          .from("amocrm_connection")
          .update({ last_synced_at: cursor, last_sync_error: null })
          .eq("organization_id", organizationId);
      }
      return { synced: totalSynced, partial: true };
    }

    if (outOfTime) {
      // Out of time budget mid-backfill, not a failure -- persist the
      // resume page and stop here for this invocation. last_synced_at
      // must NOT be set yet (that would make the next run use the
      // since-filtered incremental path and permanently skip every lead
      // this run never reached), and calls sync is skipped this round to
      // leave the next tick's whole time budget for finishing the backfill.
      await supabaseAdmin
        .from("amocrm_connection")
        .update({ initial_sync_page: page - 1, last_sync_error: null })
        .eq("organization_id", organizationId);
      return { synced: totalSynced, partial: true };
    }

    // Leads are done; calls and tasks only start if they can finish before
    // the function is stopped -- otherwise the next run (5 minutes later,
    // incremental and quick) does them.
    const timeForPhases = Date.now() < deadline - PHASE_RESERVE_MS;
    if (!timeForPhases && !conn.last_synced_at) {
      // The backfill's last page just landed but calls and tasks don't fit.
      // last_synced_at stays null, so the next run finds no more lead pages
      // (initial_sync_page is the last one) and does them first thing.
      return { synced: totalSynced, partial: true };
    }

    let callsSynced = 0;
    // Call sync is best-effort -- a failure here shouldn't fail the whole
    // sync, since leads/contacts/companies are the primary purpose and just
    // proved they synced fine. But silently swallowing the reason (as this
    // used to) meant a real, ongoing call-sync bug (wrong API scope, wrong
    // note_type, an account with no telephony integration at all) looked
    // identical to "everything's fine" on the Integrations page forever.
    // Surface it in last_sync_error instead so it's visible without ever
    // marking the overall sync (leads) as failed.
    let callsSyncWarning: string | null = null;
    try {
      if (timeForPhases) callsSynced = await syncCallsFromAmo(conn, notifRecipients, deadline);
    } catch (err) {
      callsSyncWarning = `Calls: ${describeError(err)}`;
    }

    // Same best-effort reasoning as calls above -- Lid zadachalari/Important
    // Tasks being stale for a run shouldn't fail the whole sync.
    let tasksSynced = 0;
    let tasksSyncWarning: string | null = null;
    try {
      if (timeForPhases && Date.now() < deadline - PAGE_RESERVE_MS) {
        tasksSynced = await syncTasksFromAmo(conn, ownerByAmoUserId);
      }
    } catch (err) {
      tasksSyncWarning = `Tasks: ${describeError(err)}`;
    }
    const syncWarning = [callsSyncWarning, tasksSyncWarning].filter(Boolean).join("; ") || null;

    await supabaseAdmin
      .from("amocrm_connection")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: syncWarning,
        initial_sync_page: null,
      })
      .eq("organization_id", organizationId);
    // Read-modify-write: config also carries this org's own AmoCRM
    // client_id/client_secret (per-org credentials) -- a blind
    // `.update({ config: {...} })` here would wipe them out on every sync
    // cycle (this ran every 5 minutes via the sync cron).
    const { data: existingSyncSettings } = await supabaseAdmin
      .from("integration_settings")
      .select("config")
      .eq("organization_id", organizationId)
      .eq("key", "amocrm")
      .maybeSingle();
    const currentSyncConfig =
      (existingSyncSettings?.config as Record<string, unknown> | null) ?? {};
    await supabaseAdmin
      .from("integration_settings")
      .update({
        config: {
          ...currentSyncConfig,
          subdomain: conn.subdomain,
          last_synced_at: new Date().toISOString(),
          lead_count: totalSynced,
        },
      })
      .eq("organization_id", organizationId)
      .eq("key", "amocrm");

    return { synced: totalSynced, callsSynced, tasksSynced };
  } catch (err) {
    const message = describeError(err);
    await supabaseAdmin
      .from("amocrm_connection")
      .update({ last_sync_error: message })
      .eq("organization_id", organizationId);
    return { synced: 0, error: message };
  } finally {
    await supabaseAdmin
      .from("amocrm_connection")
      .update({ sync_in_progress: false })
      .eq("organization_id", organizationId);
  }
}

/** Pulls call-type notes from AmoCRM and upserts them into public.amocrm_calls. Returns count synced. */
async function syncCallsFromAmo(
  conn: AmoConnection,
  notifRecipients: NotificationRecipients,
  deadline: number,
): Promise<number> {
  const recent = await fetchCallNotes(conn);
  let written = await writeCallNotes(conn, recent, notifRecipients, !!conn.last_synced_at);
  written += await syncCallHistory(conn, deadline);
  await backfillOrphanedCallLeads(conn.organization_id);
  return written;
}

// The call history is fetched per lead (filter[entity_id]), newest leads
// first, a few hundred leads per request round, until the run's time is
// up; where it got to is kept in integration_settings.config.call_history
// so the next run carries on. This only ever asks for the calls of leads
// this company actually imported -- the account-wide notes list also holds
// every other pipeline's calls (seen in practice: 95% of them). Choosing
// other pipelines starts it over.
const CALL_HISTORY_LEADS_PER_REQUEST = 100;
const CALL_HISTORY_RESERVE_MS = 30_000;
type CallHistoryState = { key: string; offset: number; done: boolean };

async function syncCallHistory(conn: AmoConnection, deadline: number): Promise<number> {
  const orgId = conn.organization_id;
  const key = conn.enabled_pipeline_ids
    ? [...conn.enabled_pipeline_ids].sort((a, b) => a - b).join(",")
    : "all";
  const { data: settings } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", orgId)
    .eq("key", "amocrm")
    .maybeSingle();
  const saved = (settings?.config as { call_history?: CallHistoryState } | null)?.call_history;
  if (saved?.key === key && saved.done) return 0;
  let offset = saved?.key === key ? saved.offset : 0;
  let done = false;
  let written = 0;

  while (Date.now() < deadline - CALL_HISTORY_RESERVE_MS) {
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("amocrm_id")
      .eq("organization_id", orgId)
      .not("amocrm_id", "is", null)
      .order("amocrm_id", { ascending: false })
      .range(offset, offset + CALL_HISTORY_LEADS_PER_REQUEST - 1);
    if (error) throw error;
    const ids = (leads ?? []).map((l) => l.amocrm_id!);
    if (ids.length > 0) {
      const idParams = ids.map((id) => `filter[entity_id][]=${id}`).join("&");
      const notes = await fetchAllPaged(
        conn,
        (page) =>
          `/api/v4/leads/notes?filter[note_type][]=call_in&filter[note_type][]=call_out&${idParams}&limit=250&page=${page}`,
        (data) =>
          (data as { _embedded?: { notes?: AmoCallNote[] } } | null)?._embedded?.notes ?? [],
        CALL_NOTES_MAX_PAGES,
      );
      written += await writeCallNotes(
        conn,
        Array.from(new Map(notes.map((n) => [n.id, n])).values()),
        null,
        false,
      );
    }
    offset += ids.length;
    if (ids.length < CALL_HISTORY_LEADS_PER_REQUEST) {
      done = true;
      break;
    }
  }

  // Read-modify-write: config also holds the company's own amoCRM app keys.
  // No row yet (connected before settings existed): create it, or the
  // history would start over on every run.
  const { data: latest } = await supabaseAdmin
    .from("integration_settings")
    .select("config")
    .eq("organization_id", orgId)
    .eq("key", "amocrm")
    .maybeSingle();
  const state: CallHistoryState = { key, offset, done };
  const config = {
    ...((latest?.config as Record<string, unknown> | null) ?? {}),
    call_history: state,
  };
  const { error: saveError } = latest
    ? await supabaseAdmin
        .from("integration_settings")
        .update({ config })
        .eq("organization_id", orgId)
        .eq("key", "amocrm")
    : await supabaseAdmin
        .from("integration_settings")
        .insert({ organization_id: orgId, key: "amocrm", enabled: true, config });
  if (saveError) console.error("[amoCRM] call history state:", saveError.message);
  return written;
}

/** Upserts call notes into amocrm_calls; returns how many were written. */
async function writeCallNotes(
  conn: AmoConnection,
  notes: AmoCallNote[],
  notifRecipients: NotificationRecipients | null,
  notify: boolean,
): Promise<number> {
  if (notes.length === 0) return 0;

  const amoLeadIds = Array.from(new Set(notes.map((n) => n.entity_id)));
  const { data: leadRows, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select("id, amocrm_id, name, owner_id")
    .eq("organization_id", conn.organization_id)
    .in("amocrm_id", amoLeadIds);
  if (leadsError) throw leadsError;
  const leadByAmoId = new Map((leadRows ?? []).map((l) => [l.amocrm_id, l]));

  const rows = notes.map((n) => {
    const duration = n.params?.duration ?? 0;
    return {
      organization_id: conn.organization_id,
      amocrm_note_id: n.id,
      lead_id: leadByAmoId.get(n.entity_id)?.id ?? null,
      // Kept even when lead_id resolves to null (the lead wasn't synced
      // yet -- excluded pipeline, or hasn't landed this run) so a later
      // sync can go back and fix this row once the lead does exist,
      // instead of leaving it permanently unlinked. See
      // backfillOrphanedCallLeads below.
      amocrm_lead_entity_id: n.entity_id,
      direction: n.note_type === "call_in" ? "in" : "out",
      phone: n.params?.phone ?? null,
      duration_seconds: duration,
      connected: duration > 0,
      // amoCRM sends "" for a call with no recording.
      recording_url: n.params?.link || null,
      occurred_at: new Date(n.created_at * 1000).toISOString(),
    };
  });
  // With only some pipelines imported, a call of a lead from another
  // pipeline is not this company's analytics -- and it would cost AI
  // analysis. Without a choice every call is kept (and linked later by
  // backfillOrphanedCallLeads once its lead arrives).
  const dedupedCallRows = dedupeByKey(
    conn.enabled_pipeline_ids ? rows.filter((r) => r.lead_id) : rows,
    (r) => String(r.amocrm_note_id),
  );
  if (dedupedCallRows.length === 0) return 0;

  // Notes re-sync on every run (the last two days, upserted
  // idempotently) -- diff against what already existed before this
  // upsert so a re-synced call from yesterday doesn't fire a fresh
  // notification every 5 minutes.
  // Looked up in chunks: one .in() with thousands of ids overflows the
  // request URL, and the failed (ignored) lookup made every re-synced call
  // look new -- 5M "Call" notifications filled the database. If any chunk
  // still fails, nothing is notified this run.
  const existingNoteIds = new Set<number | null>();
  let existingLookupFailed = false;
  const NOTE_LOOKUP_CHUNK = 200;
  for (let i = 0; i < dedupedCallRows.length; i += NOTE_LOOKUP_CHUNK) {
    const ids = dedupedCallRows.slice(i, i + NOTE_LOOKUP_CHUNK).map((r) => r.amocrm_note_id);
    const { data, error } = await supabaseAdmin
      .from("amocrm_calls")
      .select("amocrm_note_id")
      .eq("organization_id", conn.organization_id)
      .in("amocrm_note_id", ids);
    if (error) {
      existingLookupFailed = true;
      break;
    }
    for (const r of data ?? []) existingNoteIds.add(r.amocrm_note_id);
  }
  const newCallRows = existingLookupFailed
    ? []
    : dedupedCallRows.filter((r) => !existingNoteIds.has(r.amocrm_note_id));

  // Unlike the leads loop, this was still one upsert for the whole (capped
  // but still up to ~5k-row) batch -- the same shape of statement that
  // forced pipeline_stages and the leads loop down to chunked upserts.
  // Chunk it too instead of waiting for this to be the next timeout report.
  const CALLS_UPSERT_CHUNK = 200;
  for (let i = 0; i < dedupedCallRows.length; i += CALLS_UPSERT_CHUNK) {
    const chunk = dedupedCallRows.slice(i, i + CALLS_UPSERT_CHUNK);
    const { error } = await supabaseAdmin
      .from("amocrm_calls")
      .upsert(chunk, { onConflict: "organization_id,amocrm_note_id" });
    if (error) throw new Error(`[calls ${i}-${i + chunk.length}] ${describeError(error)}`);
  }

  // Same as the leads: no bell entries for the call history.
  const notifyCalls = notify && notifRecipients ? newCallRows : [];
  try {
    const leadById = new Map(Array.from(leadByAmoId.values()).map((l) => [l.id, l]));
    const notifDrafts: NotificationDraft[] = notifyCalls
      .filter((r) => r.lead_id)
      .map((r) => {
        const lead = leadById.get(r.lead_id!);
        return {
          ownerId: lead?.owner_id ?? null,
          type: "Call",
          title: "Yangi qo'ng'iroq yozuvi",
          body: `${lead?.name ?? "—"} · ${r.direction === "in" ? "Kiruvchi" : "Chiquvchi"} qo'ng'iroq${r.connected ? ` (${r.duration_seconds}s)` : " (javobsiz)"}`,
          link: `/crm/leads/${r.lead_id}`,
        };
      });
    if (notifRecipients) {
      await insertAmoNotifications(conn.organization_id, notifRecipients, notifDrafts);
    }
  } catch {
    // Best-effort -- see insertAmoNotifications' comment.
  }

  // "Oxirgi aloqa" of these leads (Lid tahlili's direction and churn risk).
  // Before 20261202000000_lead_last_contact.sql the function is missing and
  // this does nothing.
  const talkedLeadIds = Array.from(
    new Set(dedupedCallRows.filter((r) => r.connected && r.lead_id).map((r) => r.lead_id!)),
  );
  if (talkedLeadIds.length > 0) {
    const { error: lastContactError } = await supabaseAdmin.rpc("refresh_lead_last_contact", {
      p_org: conn.organization_id,
      p_lead_ids: talkedLeadIds,
    });
    if (lastContactError) console.error("[amoCRM] last contact:", lastContactError.message);
  }

  return dedupedCallRows.length;
}

// Repairs calls that were inserted with lead_id null because their AmoCRM
// lead hadn't been synced yet at the time (excluded pipeline, or simply not
// reached yet) -- runs on every sync, so as soon as the lead in question
// does show up in public.leads (e.g. an admin enables its pipeline in
// "Import qilinadigan voronkalar"), the call gets linked to it retroactively
// instead of staying orphaned forever. Cheap when there's nothing to fix
// (the common case): one indexed lookup, no-op if it comes back empty.
async function backfillOrphanedCallLeads(organizationId: string): Promise<void> {
  const { data: orphaned } = await supabaseAdmin
    .from("amocrm_calls")
    .select("id, amocrm_lead_entity_id")
    .eq("organization_id", organizationId)
    .is("lead_id", null)
    .not("amocrm_lead_entity_id", "is", null)
    .limit(2000);
  if (!orphaned || orphaned.length === 0) return;

  const entityIds = Array.from(
    new Set(orphaned.map((r) => r.amocrm_lead_entity_id).filter((id): id is number => id != null)),
  );
  const { data: leadRows } = await supabaseAdmin
    .from("leads")
    .select("id, amocrm_id")
    .eq("organization_id", organizationId)
    .in("amocrm_id", entityIds);
  const leadIdByAmoId = new Map((leadRows ?? []).map((l) => [l.amocrm_id, l.id]));
  if (leadIdByAmoId.size === 0) return;

  // Grouped by the lead each batch resolves to, so this is one UPDATE per
  // distinct lead instead of one per call row -- there can be thousands of
  // orphaned rows the first time this runs against an account whose
  // pipeline scope just got widened.
  const idsByLeadId = new Map<string, string[]>();
  for (const r of orphaned) {
    if (r.amocrm_lead_entity_id == null) continue;
    const leadId = leadIdByAmoId.get(r.amocrm_lead_entity_id);
    if (!leadId) continue;
    const ids = idsByLeadId.get(leadId) ?? [];
    ids.push(r.id);
    idsByLeadId.set(leadId, ids);
  }
  for (const [leadId, ids] of idsByLeadId) {
    await supabaseAdmin.from("amocrm_calls").update({ lead_id: leadId }).in("id", ids);
  }
}

type AmoTask = {
  id: number;
  entity_id: number;
  entity_type: string;
  complete_till: number;
  is_completed: boolean;
  text: string | null;
  responsible_user_id: number | null;
};

export type AmoTaskStats = { dueToday: number; overdue: number };

// Same "don't pull a whole account's history into one request" concern as
// fetchCallNotes -- caps the pull so a huge open-task backlog can't push a
// Dashboard load over the platform's memory/time limits.
const TASKS_MAX_PAGES = 20; // ~5k open tasks at limit=250

/**
 * Counts this org's open amoCRM tasks into "due later today" vs. "already
 * overdue", optionally scoped to a funnel and/or a set of owners through
 * the task's lead (amoCRM tasks carry no pipeline of their own).
 *
 * Read from public.tasks, which syncTasksFromAmo keeps up to date every 5
 * minutes. It used to page through amoCRM on every Dashboard load: 10-17 s
 * for a real account, and it also counted other pipelines' tasks.
 *
 * ownerIds: null/undefined = unrestricted (super_admin/platform_owner).
 */
export async function fetchOpenTaskStats(
  organizationId: string,
  funnel?: string | null,
  ownerIds?: string[] | null,
): Promise<AmoTaskStats> {
  const now = Date.now();
  // End of today in Tashkent (UTC+5, no daylight saving).
  const TZ_MS = 5 * 3_600_000;
  const endOfToday = Math.floor((now + TZ_MS) / 86_400_000) * 86_400_000 + 86_400_000 - TZ_MS;
  const open = () => {
    let q = supabaseAdmin
      .from("tasks")
      .select("id, lead:leads!inner(funnel, owner_id)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("amocrm_task_id", "is", null)
      .neq("status", "Done");
    if (funnel) q = q.eq("lead.funnel", funnel);
    if (ownerIds) q = q.in("lead.owner_id", ownerIds);
    return q;
  };
  const nowIso = new Date(now).toISOString();
  const [overdue, dueToday] = await Promise.all([
    open().lt("due_date", nowIso),
    open().gte("due_date", nowIso).lt("due_date", new Date(endOfToday).toISOString()),
  ]);
  if (overdue.error) throw overdue.error;
  if (dueToday.error) throw dueToday.error;
  return { dueToday: dueToday.count ?? 0, overdue: overdue.count ?? 0 };
}

/**
 * Pulls every AmoCRM task tied to a lead (open and completed) and upserts
 * them into public.tasks -- "Lid zadachalari" and Important Tasks previously
 * only ever showed locally-created tasks (see quick-create.tsx), since
 * AmoCRM's own tasks were never synced anywhere, so the platform's task
 * lists never matched AmoCRM at all. Returns count synced.
 */
async function syncTasksFromAmo(
  conn: AmoConnection,
  ownerByAmoUserId: Map<number, string>,
): Promise<number> {
  const allTasks = await fetchAllPaged<AmoTask>(
    conn,
    // After the first sync only tasks changed in the last two days. Newest
    // first, so the page cap keeps the current tasks of a big account
    // rather than its oldest ones.
    (page) =>
      `/api/v4/tasks?limit=250&page=${page}&order[id]=desc${
        conn.last_synced_at
          ? `&filter[updated_at][from]=${Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - 2 * 86400}`
          : ""
      }`,
    (data) => (data as { _embedded?: { tasks?: AmoTask[] } } | null)?._embedded?.tasks ?? [],
    TASKS_MAX_PAGES,
  );
  // Only lead-tied tasks have anywhere in this app to attach to -- a task on
  // a contact/company (entity_type !== "leads") has no local counterpart.
  const leadTasks = allTasks.filter((t) => t.entity_type === "leads");
  if (leadTasks.length === 0) return 0;

  const amoLeadIds = Array.from(new Set(leadTasks.map((t) => t.entity_id)));
  const { data: leadRows, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select("id, amocrm_id")
    .eq("organization_id", conn.organization_id)
    .in("amocrm_id", amoLeadIds);
  if (leadsError) throw leadsError;
  const leadIdByAmoId = new Map((leadRows ?? []).map((l) => [l.amocrm_id, l.id]));

  const rows = leadTasks.map((t) => ({
    organization_id: conn.organization_id,
    amocrm_task_id: t.id,
    // Kept even when the lead hasn't synced yet (null) -- same reasoning as
    // amocrm_lead_entity_id on calls -- rather than dropping the task.
    lead_id: leadIdByAmoId.get(t.entity_id) ?? null,
    title: t.text?.trim() || `AmoCRM task #${t.id}`,
    // AmoCRM only has is_completed (no richer status) -- can't distinguish
    // "In progress"/"Review" from "Todo", so every open task lands there.
    status: t.is_completed ? ("Done" as const) : ("Todo" as const),
    assignee_id: t.responsible_user_id
      ? (ownerByAmoUserId.get(t.responsible_user_id) ?? null)
      : null,
    due_date: t.complete_till ? new Date(t.complete_till * 1000).toISOString() : null,
  }));
  const dedupedTaskRows = dedupeByKey(rows, (r) => String(r.amocrm_task_id));

  const TASKS_UPSERT_CHUNK = 200;
  for (let i = 0; i < dedupedTaskRows.length; i += TASKS_UPSERT_CHUNK) {
    const chunk = dedupedTaskRows.slice(i, i + TASKS_UPSERT_CHUNK);
    const { error } = await supabaseAdmin
      .from("tasks")
      .upsert(chunk, { onConflict: "organization_id,amocrm_task_id" });
    if (error) throw new Error(`[tasks ${i}-${i + chunk.length}] ${describeError(error)}`);
  }

  return dedupedTaskRows.length;
}

/**
 * Resolves a stage_id for a single AmoCRM status_id, falling back to the
 * org's "new" stage. Status ids alone aren't unique across pipelines
 * (won/lost are id 142/143 in every pipeline) — pass pipelineId when known
 * so this can disambiguate; without it, `.limit(1)` just takes whichever
 * pipeline's matching stage comes first, same as this always did before
 * pipeline-scoped stages existed, rather than erroring on multiple rows.
 */
export async function resolveStageId(
  organizationId: string,
  statusId: number | null,
  pipelineId: number | null = null,
): Promise<string | null> {
  if (statusId != null) {
    let query = supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("amocrm_status_id", statusId);
    if (pipelineId != null) query = query.eq("amocrm_pipeline_id", pipelineId);
    const { data } = await query.limit(1);
    if (data?.[0]?.id) return data[0].id;
  }
  return defaultStageId(organizationId);
}

/** Resolves an owner profile id for a single AmoCRM responsible_user_id, if that user was matched by email. */
export async function resolveOwnerId(
  organizationId: string,
  amoUserId: number | null,
): Promise<string | null> {
  if (amoUserId == null) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("amocrm_user_id", amoUserId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Upserts a single lead — used by the webhook handler for near-real-time updates. */
export async function upsertSingleAmoLead(
  organizationId: string,
  amoLeadId: number,
  name: string | null,
  price: number | null,
  statusId: number | null,
  responsibleUserId: number | null,
  pipelineId: number | null = null,
) {
  if (await isIntegrationPaused(organizationId, "amocrm")) return;
  const [stageId, ownerId] = await Promise.all([
    resolveStageId(organizationId, statusId, pipelineId),
    resolveOwnerId(organizationId, responsibleUserId),
  ]);
  const { error } = await supabaseAdmin.from("leads").upsert(
    {
      organization_id: organizationId,
      amocrm_id: amoLeadId,
      name: name?.trim() || `AmoCRM lead #${amoLeadId}`,
      company_name: "",
      source: "AmoCRM",
      expected_revenue: price ?? 0,
      budget: price ?? 0,
      stage_id: stageId,
      owner_id: ownerId,
      priority: "Normal" as const,
    },
    { onConflict: "organization_id,amocrm_id" },
  );
  if (error) throw error;
}

export type AmoCatalogPipeline = { id: number; name: string; is_main: boolean };
export type AmoCatalogOperator = {
  id: number;
  name: string;
  email: string | null;
  existingProfileEmail: string | null;
};
export type AmoCatalog = {
  subdomain: string;
  pipelines: AmoCatalogPipeline[];
  operators: AmoCatalogOperator[];
  enabledPipelineIds: number[] | null;
  enabledUserIds: number[] | null;
};

/** Live list of every AmoCRM pipeline/operator for the amocrm-import-settings admin page, plus the org's current selection. */
export async function fetchAmoCatalog(organizationId: string): Promise<AmoCatalog> {
  const conn0 = await getConnection(organizationId);
  if (!conn0) throw new Error("AmoCRM is not connected yet.");
  const conn = await ensureValidToken(conn0);

  const [pipelines, users, { data: profiles, error }] = await Promise.all([
    fetchPipelines(conn),
    fetchAllUsers(conn),
    supabaseAdmin.from("profiles").select("email").eq("organization_id", organizationId),
  ]);
  if (error) throw error;

  const existingEmails = new Set((profiles ?? []).map((p) => p.email.toLowerCase()));

  return {
    subdomain: conn.subdomain,
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, is_main: !!p.is_main })),
    operators: users.map((u) => ({
      id: u.id,
      name: u.name?.trim() || u.email || `AmoCRM user #${u.id}`,
      email: u.email,
      existingProfileEmail: u.email && existingEmails.has(u.email.toLowerCase()) ? u.email : null,
    })),
    enabledPipelineIds: conn.enabled_pipeline_ids,
    enabledUserIds: conn.enabled_user_ids,
  };
}

/** Saves which AmoCRM pipelines/operators syncLeadsFromAmo should actually pull — see amocrm-import-settings. */
export async function saveAmoImportSettings(
  organizationId: string,
  enabledPipelineIds: number[],
  enabledUserIds: number[],
): Promise<void> {
  // syncLeadsFromAmo only ever asks AmoCRM for leads *updated* since
  // last_synced_at (a full historical pull only happens once, the very
  // first time a connection ever syncs) -- so widening the pipeline/user
  // scope here used to do nothing for any lead in the newly-enabled scope
  // that hadn't been touched recently: it would never be fetched at all,
  // since the "since" filter excludes it at the AmoCRM API call itself,
  // before the pipeline filter even runs. Only a lead someone happened to
  // edit today would show up. Resetting last_synced_at to null makes the
  // next sync a full pull again, covering the scope that just changed
  // instead of silently missing everything in it except brand-new activity.
  const { error } = await supabaseAdmin
    .from("amocrm_connection")
    .update({
      enabled_pipeline_ids: enabledPipelineIds,
      enabled_user_ids: enabledUserIds,
      last_synced_at: null,
    })
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** Removes the org's AmoCRM connection (and its access/refresh tokens) and flips integration_settings back off — see amocrm-import-settings' "Disconnect". */
export async function disconnectAmoCrm(organizationId: string): Promise<void> {
  const { error: connError } = await supabaseAdmin
    .from("amocrm_connection")
    .delete()
    .eq("organization_id", organizationId);
  if (connError) throw connError;

  const { error: settingsError } = await supabaseAdmin
    .from("integration_settings")
    .update({ enabled: false })
    .eq("organization_id", organizationId)
    .eq("key", "amocrm");
  if (settingsError) throw settingsError;
}
