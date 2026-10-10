"""The always-on AI analysis queue.

Every few seconds: take the oldest calls with a recording and no analysis,
analyse them a few at a time, and go again. Unlike the 5-minute pg_cron tick
inside a serverless function, nothing here has a time limit, so a backlog of
thousands of calls simply keeps draining.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

from app.config import Settings
from app.models import AnalyzeStatus, PendingCall, QueueStats
from app.services.analyzer import Analyzer
from app.services.repository import CallRepository

log = logging.getLogger("ai-worker.queue")


class QueueRunner:
    def __init__(self, settings: Settings, repo: CallRepository, analyzer: Analyzer) -> None:
        self._s = settings
        self._repo = repo
        self._analyzer = analyzer
        self._sem = asyncio.Semaphore(settings.concurrency)
        self._blocked_until: dict[str, float] = {}
        self._busy_until = 0.0
        self._paused = not settings.queue_enabled
        self._wake = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.stats = QueueStats(running=False, paused=self._paused)

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        if self._task is None:
            self.stats.running = True
            self.stats.started_at = datetime.now(timezone.utc)
            self._task = asyncio.create_task(self._loop(), name="ai-queue")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.stats.running = False

    def pause(self) -> None:
        self._paused = True
        self.stats.paused = True

    def resume(self) -> None:
        self._paused = False
        self.stats.paused = False
        self._wake.set()

    # -- work --------------------------------------------------------------

    def blocked_orgs(self) -> list[str]:
        now = time.monotonic()
        self._blocked_until = {o: t for o, t in self._blocked_until.items() if t > now}
        return sorted(self._blocked_until)

    async def run_once(self) -> int:
        """One round: fetch a batch and analyse it. Returns how many calls it took."""
        self.stats.last_poll_at = datetime.now(timezone.utc)
        calls = await self._repo.fetch_pending(
            self._s.batch_size, self._s.max_attempts, self.blocked_orgs()
        )
        if calls:
            await asyncio.gather(*(self._process(c) for c in calls))
        self.stats.blocked_orgs = self.blocked_orgs()
        return len(calls)

    async def _process(self, call: PendingCall) -> None:
        if call.organization_id in self._blocked_until:
            return
        async with self._sem:
            await self._wait_if_ai_busy()
            result = await self._analyzer.analyze(call.id)
        self.stats.processed += 1
        if result.status is AnalyzeStatus.DONE:
            self.stats.done += 1
        elif result.status is AnalyzeStatus.SKIPPED:
            self.stats.skipped += 1
        elif result.status is AnalyzeStatus.ORG_BLOCKED:
            self._blocked_until[call.organization_id] = (
                time.monotonic() + self._s.org_block_minutes * 60
            )
            log.info("org %s blocked for AI analysis: %s", call.organization_id, result.error)
        elif result.status is AnalyzeStatus.AI_BUSY:
            self.stats.ai_busy += 1
            self._busy_until = time.monotonic() + self._s.ai_busy_backoff_seconds
            log.warning("AI busy, backing off: %s", result.error)
        else:
            self.stats.failed += 1
            log.warning("call %s failed: %s", call.id, result.error)

    async def _wait_if_ai_busy(self) -> None:
        delay = self._busy_until - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)

    async def _loop(self) -> None:
        while True:
            took = 0
            if not self._paused:
                try:
                    took = await self.run_once()
                except asyncio.CancelledError:
                    raise
                except Exception:  # noqa: BLE001 - keep the loop alive
                    log.exception("queue round failed")
            # A full batch means there is more waiting: go again right away.
            if took >= self._s.batch_size and not self._paused:
                continue
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=self._s.poll_interval_seconds)
            except TimeoutError:
                pass
