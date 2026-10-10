from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.models import JobInfo, ReanalyzeRequest
from app.security import require_api_key
from app.services.jobs import JobManager

router = APIRouter(prefix="/v1/jobs", tags=["jobs"], dependencies=[Depends(require_api_key)])


def _jobs(request: Request) -> JobManager:
    return request.app.state.jobs


@router.get("", response_model=list[JobInfo])
async def list_jobs(request: Request) -> list[JobInfo]:
    return _jobs(request).list()


@router.post("/reanalyze", response_model=JobInfo, status_code=status.HTTP_202_ACCEPTED)
async def start_reanalyze(body: ReanalyzeRequest, request: Request) -> JobInfo:
    try:
        return _jobs(request).start_reanalyze(body)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/{job_id}", response_model=JobInfo)
async def get_job(job_id: str, request: Request) -> JobInfo:
    job = _jobs(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/{job_id}/cancel", response_model=JobInfo)
async def cancel_job(job_id: str, request: Request) -> JobInfo:
    jobs = _jobs(request)
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    jobs.cancel(job_id)
    return job
