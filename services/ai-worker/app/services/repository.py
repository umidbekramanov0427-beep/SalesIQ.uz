"""Reads the analysis backlog from Supabase (amocrm_calls).

Only reads: every write (results, attempts, the claim) is done by the app's
/audio-analytics/analyze-one endpoint, so this service can never leave a
call half-updated.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Protocol

from supabase import AsyncClient, acreate_client

from app.config import Settings
from app.models import PendingCall

CLAIM_TTL = timedelta(minutes=10)


class CallRepository(Protocol):
    async def fetch_pending(
        self, limit: int, max_attempts: int, exclude_orgs: Sequence[str]
    ) -> list[PendingCall]: ...

    async def page_calls(
        self, offset: int, limit: int, organization_id: str | None, only_failed: bool
    ) -> list[PendingCall]: ...


class SupabaseCallRepository:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        # Until 20261107000000_ai_worker.sql runs there is no claim column;
        # the query then simply doesn't filter on it.
        self._has_claim_column = True

    @classmethod
    async def create(cls, settings: Settings) -> "SupabaseCallRepository":
        client = await acreate_client(settings.supabase_url, settings.supabase_service_role_key)
        return cls(client)

    async def fetch_pending(
        self, limit: int, max_attempts: int, exclude_orgs: Sequence[str]
    ) -> list[PendingCall]:
        def build(with_claim: bool):  # noqa: ANN202 - supabase builder type
            q = (
                self._db.table("amocrm_calls")
                .select("id, organization_id")
                .not_.is_("recording_url", "null")
                .is_("analyzed_at", "null")
                .lt("analysis_attempts", max_attempts)
            )
            if exclude_orgs:
                q = q.not_.in_("organization_id", list(exclude_orgs))
            if with_claim:
                stale = (datetime.now(timezone.utc) - CLAIM_TTL).isoformat()
                q = q.or_(f"analysis_started_at.is.null,analysis_started_at.lt.{stale}")
            return q.order("occurred_at").limit(limit)

        if self._has_claim_column:
            try:
                res = await build(True).execute()
                return [_row(r) for r in res.data or []]
            except Exception as exc:  # noqa: BLE001 - postgrest raises APIError
                if "analysis_started_at" not in str(exc):
                    raise
                self._has_claim_column = False
        res = await build(False).execute()
        return [_row(r) for r in res.data or []]

    async def page_calls(
        self, offset: int, limit: int, organization_id: str | None, only_failed: bool
    ) -> list[PendingCall]:
        q = (
            self._db.table("amocrm_calls")
            .select("id, organization_id")
            .not_.is_("recording_url", "null")
        )
        if organization_id:
            q = q.eq("organization_id", organization_id)
        if only_failed:
            q = q.not_.is_("analysis_error", "null")
        res = await q.order("occurred_at").order("id").range(offset, offset + limit - 1).execute()
        return [_row(r) for r in res.data or []]


def _row(r: dict) -> PendingCall:
    return PendingCall(id=str(r["id"]), organization_id=str(r["organization_id"]))
