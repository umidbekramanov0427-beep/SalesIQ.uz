"""Client for the app's /audio-analytics/analyze-one endpoint.

The analysis itself (download, transcription, AI scoring, saving the result)
stays in the TypeScript app, so its prompts and rules live in one place.
This client only asks for one call at a time.
"""

from typing import Protocol

import httpx

from app.config import Settings
from app.models import AnalyzeResult, AnalyzeStatus


class Analyzer(Protocol):
    async def analyze(self, call_id: str, force: bool = False) -> AnalyzeResult: ...

    async def aclose(self) -> None: ...


class HttpAnalyzer:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._url = settings.app_base_url.rstrip("/") + "/audio-analytics/analyze-one"
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.request_timeout_seconds, connect=15),
            headers={"x-worker-secret": settings.worker_secret},
        )

    async def analyze(self, call_id: str, force: bool = False) -> AnalyzeResult:
        try:
            res = await self._client.post(self._url, json={"callId": call_id, "force": force})
        except httpx.TimeoutException:
            # The app may still finish the call; its claim keeps others off it.
            return AnalyzeResult(AnalyzeStatus.FAILED, "timeout")
        except httpx.HTTPError as exc:
            # Network trouble is not the call's fault: back off like a busy AI.
            return AnalyzeResult(AnalyzeStatus.AI_BUSY, f"network: {exc}")

        if res.status_code == 401:
            raise RuntimeError(
                "analyze-one answered 401: WORKER_SECRET differs between the app server and this worker"
            )
        if res.status_code >= 500:
            return AnalyzeResult(AnalyzeStatus.AI_BUSY, f"app error {res.status_code}")
        try:
            body = res.json()
            status = AnalyzeStatus(body.get("status"))
        except (ValueError, TypeError):
            return AnalyzeResult(AnalyzeStatus.FAILED, f"unexpected answer {res.status_code}")
        return AnalyzeResult(status, body.get("error"))

    async def aclose(self) -> None:
        await self._client.aclose()
