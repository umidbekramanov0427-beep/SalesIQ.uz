"""One-off background jobs: re-analysing calls that already have an analysis
(after the scoring criteria or the AI instructions changed), for one
organization or all of them. Replaces paging through
/admin/reanalyze-all-calls by hand, which timed out at more than a few calls
per request.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.config import Settings
from app.models import AnalyzeStatus, JobInfo, ReanalyzeRequest
from app.services.analyzer import Analyzer
from app.services.repository import CallRepository

log = logging.getLogger("ai-worker.jobs")

PAGE = 50


class JobManager:
    def __init__(self, settings: Settings, repo: CallRepository, analyzer: Analyzer) -> None:
        self._s = settings
        self._repo = repo
        self._analyzer = analyzer
        self._jobs: dict[str, JobInfo] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def list(self) -> list[JobInfo]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def get(self, job_id: str) -> JobInfo | None:
        return self._jobs.get(job_id)

    def start_reanalyze(self, req: ReanalyzeRequest) -> JobInfo:
        running = [j for j in self._jobs.values() if j.state == "running"]
        if running:
            raise RuntimeError(f"job {running[0].id} is still running")
        job = JobInfo(
            id=uuid.uuid4().hex[:12],
            state="running",
            organization_id=req.organization_id,
            only_failed=req.only_failed,
            created_at=datetime.now(timezone.utc),
        )
        self._jobs[job.id] = job
        self._tasks[job.id] = asyncio.create_task(self._run(job), name=f"job-{job.id}")
        return job

    def cancel(self, job_id: str) -> bool:
        task = self._tasks.get(job_id)
        if task is None or task.done():
            return False
        task.cancel()
        return True

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    async def _run(self, job: JobInfo) -> None:
        sem = asyncio.Semaphore(self._s.concurrency)

        async def one(call_id: str) -> None:
            async with sem:
                result = await self._analyzer.analyze(call_id, force=True)
                if result.status is AnalyzeStatus.AI_BUSY:
                    await asyncio.sleep(self._s.ai_busy_backoff_seconds)
                    result = await self._analyzer.analyze(call_id, force=True)
            if result.status is AnalyzeStatus.DONE:
                job.done += 1
            elif result.status is AnalyzeStatus.SKIPPED:
                job.skipped += 1
            else:
                job.failed += 1

        try:
            # Snapshot the call list first: re-analysing changes the very
            # rows a filter like only_failed selects on, so paging while
            # working would skip or repeat calls.
            ids: list[str] = []
            offset = 0
            while True:
                page = await self._repo.page_calls(
                    offset, PAGE, job.organization_id, job.only_failed
                )
                ids.extend(c.id for c in page)
                offset += PAGE
                if len(page) < PAGE:
                    break
            job.total_seen = len(ids)
            for start in range(0, len(ids), PAGE):
                await asyncio.gather(*(one(i) for i in ids[start : start + PAGE]))
            job.state = "finished"
        except asyncio.CancelledError:
            job.state = "cancelled"
        except Exception as exc:  # noqa: BLE001
            log.exception("job %s failed", job.id)
            job.state = "error"
            job.error = str(exc)
        finally:
            job.finished_at = datetime.now(timezone.utc)
