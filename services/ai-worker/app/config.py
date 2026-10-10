"""Settings, read from environment variables (or a local .env file)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase -- the same project the platform uses. The service-role key
    # bypasses RLS: keep it on the server, never in a browser.
    supabase_url: str
    supabase_service_role_key: str

    # The SalesIQ app (Vercel) whose /audio-analytics/analyze-one endpoint
    # does the actual analysis, and the shared secret it checks
    # (WORKER_SECRET there must be the same value).
    app_base_url: str = "https://salesiq.uz"
    worker_secret: str

    # Bearer key for this service's own /v1 endpoints.
    worker_api_key: str

    queue_enabled: bool = True
    concurrency: int = Field(default=3, ge=1, le=16)
    batch_size: int = Field(default=20, ge=1, le=200)
    poll_interval_seconds: float = Field(default=30, ge=1)
    max_attempts: int = Field(default=3, ge=1)
    # An org whose subscription expired or whose trial used up its AI
    # allowance is skipped for this long instead of being retried in a loop.
    org_block_minutes: int = Field(default=30, ge=1)
    # When the AI provider says it is busy (429/503), everything pauses.
    ai_busy_backoff_seconds: float = Field(default=60, ge=1)
    request_timeout_seconds: float = Field(default=300, ge=10)

    cors_origins: str = "https://salesiq.uz,https://www.salesiq.uz"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
