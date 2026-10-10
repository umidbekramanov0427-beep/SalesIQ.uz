from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe for Railway/Render. No secrets, no database call."""
    return {"status": "ok"}
