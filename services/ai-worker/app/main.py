"""SalesIQ AI worker.

A small always-on service next to the SalesIQ app. It does not replace any
of the app's backend: it only works through long-running AI jobs that do
not fit into a serverless function's time limit, by calling the app's
/audio-analytics/analyze-one endpoint one call at a time.

Run locally:  uvicorn app.main:app --reload
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, jobs, queue
from app.services.analyzer import HttpAnalyzer
from app.services.jobs import JobManager
from app.services.queue import QueueRunner
from app.services.repository import SupabaseCallRepository

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    repo = await SupabaseCallRepository.create(settings)
    analyzer = HttpAnalyzer(settings)
    app.state.queue = QueueRunner(settings, repo, analyzer)
    app.state.jobs = JobManager(settings, repo, analyzer)
    app.state.queue.start()
    try:
        yield
    finally:
        await app.state.queue.stop()
        await app.state.jobs.shutdown()
        await analyzer.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="SalesIQ AI worker", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(health.router)
    app.include_router(queue.router)
    app.include_router(jobs.router)
    return app


app = create_app()
