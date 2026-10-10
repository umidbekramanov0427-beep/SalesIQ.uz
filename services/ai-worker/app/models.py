"""Shapes shared by the queue, the jobs and the API."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeStatus(str, Enum):
    """What /audio-analytics/analyze-one answered for one call."""

    DONE = "done"
    SKIPPED = "skipped"  # already analysed, no recording, or claimed elsewhere
    ORG_BLOCKED = "org_blocked"  # subscription expired / trial AI limit used up
    AI_BUSY = "ai_busy"  # provider rate limit; not the call's fault
    FAILED = "failed"  # counted as an attempt by the app


@dataclass(frozen=True)
class PendingCall:
    id: str
    organization_id: str


@dataclass(frozen=True)
class AnalyzeResult:
    status: AnalyzeStatus
    error: str | None = None


class QueueStats(BaseModel):
    running: bool
    paused: bool
    started_at: datetime | None = None
    last_poll_at: datetime | None = None
    processed: int = 0
    done: int = 0
    failed: int = 0
    skipped: int = 0
    ai_busy: int = 0
    blocked_orgs: list[str] = Field(default_factory=list)


JobState = Literal["running", "finished", "cancelled", "error"]


class ReanalyzeRequest(BaseModel):
    organization_id: str | None = Field(
        default=None, description="Only this organization; all organizations when empty."
    )
    only_failed: bool = Field(
        default=False, description="Only calls whose last analysis attempt failed."
    )


class JobInfo(BaseModel):
    id: str
    kind: Literal["reanalyze"] = "reanalyze"
    state: JobState
    organization_id: str | None = None
    only_failed: bool = False
    created_at: datetime
    finished_at: datetime | None = None
    total_seen: int = 0
    done: int = 0
    failed: int = 0
    skipped: int = 0
    error: str | None = None
