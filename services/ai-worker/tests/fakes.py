from collections.abc import Sequence

from app.models import AnalyzeResult, AnalyzeStatus, PendingCall


class FakeRepo:
    def __init__(self, calls: list[PendingCall]) -> None:
        self.calls = calls
        self.analyzed: set[str] = set()
        self.last_exclude: list[str] = []

    async def fetch_pending(
        self, limit: int, max_attempts: int, exclude_orgs: Sequence[str]
    ) -> list[PendingCall]:
        self.last_exclude = list(exclude_orgs)
        return [
            c
            for c in self.calls
            if c.id not in self.analyzed and c.organization_id not in exclude_orgs
        ][:limit]

    async def page_calls(self, offset, limit, organization_id, only_failed):  # noqa: ANN001
        rows = [c for c in self.calls if not organization_id or c.organization_id == organization_id]
        return rows[offset : offset + limit]


class FakeAnalyzer:
    def __init__(self, repo: FakeRepo, answers: dict[str, AnalyzeStatus] | None = None) -> None:
        self.repo = repo
        self.answers = answers or {}
        self.calls: list[tuple[str, bool]] = []

    async def analyze(self, call_id: str, force: bool = False) -> AnalyzeResult:
        self.calls.append((call_id, force))
        status = self.answers.get(call_id, AnalyzeStatus.DONE)
        if status is AnalyzeStatus.DONE:
            self.repo.analyzed.add(call_id)
        return AnalyzeResult(status)

    async def aclose(self) -> None:
        return None
