import asyncio

import pytest

from app.config import Settings
from app.models import AnalyzeStatus, PendingCall, ReanalyzeRequest
from app.services.jobs import JobManager
from app.services.queue import QueueRunner
from tests.fakes import FakeAnalyzer, FakeRepo


def settings(**kw) -> Settings:  # noqa: ANN003
    base = dict(
        supabase_url="https://x.supabase.co",
        supabase_service_role_key="k",
        worker_secret="s",
        worker_api_key="a",
        batch_size=10,
        concurrency=2,
        ai_busy_backoff_seconds=1,
    )
    base.update(kw)
    return Settings(**base)  # type: ignore[arg-type]


def calls(n: int, org: str = "org-a") -> list[PendingCall]:
    return [PendingCall(id=f"{org}-{i}", organization_id=org) for i in range(n)]


@pytest.mark.asyncio
async def test_run_once_analyses_a_batch_and_counts() -> None:
    repo = FakeRepo(calls(3))
    analyzer = FakeAnalyzer(repo, {"org-a-1": AnalyzeStatus.FAILED})
    q = QueueRunner(settings(), repo, analyzer)
    took = await q.run_once()
    assert took == 3
    assert q.stats.done == 2 and q.stats.failed == 1 and q.stats.processed == 3


@pytest.mark.asyncio
async def test_blocked_org_is_excluded_from_next_round() -> None:
    repo = FakeRepo(calls(2, "org-a") + calls(2, "org-b"))
    analyzer = FakeAnalyzer(repo, {"org-a-0": AnalyzeStatus.ORG_BLOCKED})
    q = QueueRunner(settings(concurrency=1), repo, analyzer)
    await q.run_once()
    assert "org-a" in q.blocked_orgs()
    analyzer.calls.clear()
    await q.run_once()
    assert repo.last_exclude == ["org-a"]
    assert all(not cid.startswith("org-a") for cid, _ in analyzer.calls)


@pytest.mark.asyncio
async def test_ai_busy_sets_a_backoff() -> None:
    repo = FakeRepo(calls(1))
    analyzer = FakeAnalyzer(repo, {"org-a-0": AnalyzeStatus.AI_BUSY})
    q = QueueRunner(settings(), repo, analyzer)
    await q.run_once()
    assert q.stats.ai_busy == 1
    assert q._busy_until > 0  # noqa: SLF001


@pytest.mark.asyncio
async def test_concurrency_is_respected() -> None:
    repo = FakeRepo(calls(6))
    active = 0
    peak = 0

    class SlowAnalyzer(FakeAnalyzer):
        async def analyze(self, call_id: str, force: bool = False):  # noqa: ANN201
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.01)
            active -= 1
            return await super().analyze(call_id, force)

    q = QueueRunner(settings(concurrency=2), repo, SlowAnalyzer(repo))
    await q.run_once()
    assert peak == 2


@pytest.mark.asyncio
async def test_reanalyze_job_forces_every_call_of_one_org() -> None:
    repo = FakeRepo(calls(3, "org-a") + calls(2, "org-b"))
    analyzer = FakeAnalyzer(repo)
    jobs = JobManager(settings(), repo, analyzer)
    job = jobs.start_reanalyze(ReanalyzeRequest(organization_id="org-b"))
    with pytest.raises(RuntimeError):
        jobs.start_reanalyze(ReanalyzeRequest())
    await asyncio.sleep(0.05)
    assert job.state == "finished"
    assert job.total_seen == 2 and job.done == 2
    assert all(force for _, force in analyzer.calls)
    assert {cid for cid, _ in analyzer.calls} == {"org-b-0", "org-b-1"}
