"""FastAPI entry point -- Python port of src/server.ts / the TanStack Start
server routes. Run with: uvicorn app.main:app --reload

Each router file under app/routers/ is a 1:1 port of one src/routes/*.ts
file. See PORT_STATUS.md at the repo root of this folder for exactly which
of the original ~39 backend routes (and the frontend it serves) are ported
here versus still only existing in the original TypeScript app.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    admin,
    ai_assistant,
    amocrm,
    audio_analytics,
    daily_report_settings,
    errors,
    fines,
    hr,
    misc,
    platform,
    telegram,
    telegram_hr,
)

app = FastAPI(title="SalesIQ CRM API (Python port)")

# The frontend is a separate origin from this API (unlike the original
# TypeScript app, where frontend and backend were the same Cloudflare
# Worker) -- every protected route here authenticates via a Supabase JWT
# in the `Authorization: Bearer` header, never a cookie, so there is no
# cookie/CSRF surface a permissive CORS policy would expose. Wide open by
# origin is deliberate and safe under that model.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(errors.router)
app.include_router(telegram.router)
app.include_router(telegram_hr.router)
app.include_router(hr.router)
app.include_router(admin.router)
app.include_router(platform.router)
app.include_router(fines.router)
app.include_router(daily_report_settings.router)
app.include_router(audio_analytics.router)
app.include_router(ai_assistant.router)
app.include_router(misc.router)
app.include_router(amocrm.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
