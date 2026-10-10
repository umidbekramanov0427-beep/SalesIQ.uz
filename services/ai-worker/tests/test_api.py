from fastapi.testclient import TestClient

from app.config import get_settings
from app.routers import health, jobs, queue
from app.services.jobs import JobManager
from app.services.queue import QueueRunner
from tests.fakes import FakeAnalyzer, FakeRepo


def make_client() -> TestClient:
    # The real app's lifespan connects to Supabase; build the same routers
    # on a bare app with fakes instead.
    from fastapi import FastAPI

    s = get_settings()
    repo = FakeRepo([])
    app = FastAPI()
    app.state.queue = QueueRunner(s, repo, FakeAnalyzer(repo))
    app.state.jobs = JobManager(s, repo, FakeAnalyzer(repo))
    app.include_router(health.router)
    app.include_router(queue.router)
    app.include_router(jobs.router)
    return TestClient(app)


def test_health_needs_no_key() -> None:
    assert make_client().get("/health").json() == {"status": "ok"}


def test_v1_requires_the_api_key() -> None:
    c = make_client()
    assert c.get("/v1/queue").status_code == 401
    assert c.get("/v1/queue", headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = c.get("/v1/queue", headers={"Authorization": "Bearer test-api-key"})
    assert ok.status_code == 200 and ok.json()["paused"] is False


def test_pause_and_resume() -> None:
    c = make_client()
    h = {"Authorization": "Bearer test-api-key"}
    assert c.post("/v1/queue/pause", headers=h).json()["paused"] is True
    assert c.post("/v1/queue/resume", headers=h).json()["paused"] is False


def test_unknown_job_is_404() -> None:
    c = make_client()
    r = c.get("/v1/jobs/nope", headers={"Authorization": "Bearer test-api-key"})
    assert r.status_code == 404
