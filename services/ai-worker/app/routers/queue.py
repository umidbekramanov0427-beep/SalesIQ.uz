from fastapi import APIRouter, Depends, Request

from app.models import QueueStats
from app.security import require_api_key
from app.services.queue import QueueRunner

router = APIRouter(prefix="/v1/queue", tags=["queue"], dependencies=[Depends(require_api_key)])


def _queue(request: Request) -> QueueRunner:
    return request.app.state.queue


@router.get("", response_model=QueueStats)
async def status(request: Request) -> QueueStats:
    q = _queue(request)
    q.stats.blocked_orgs = q.blocked_orgs()
    return q.stats


@router.post("/pause", response_model=QueueStats)
async def pause(request: Request) -> QueueStats:
    q = _queue(request)
    q.pause()
    return q.stats


@router.post("/resume", response_model=QueueStats)
async def resume(request: Request) -> QueueStats:
    q = _queue(request)
    q.resume()
    return q.stats
