"""SalesIQ tg-live: reads a Telegram channel's live stream for the
marketing panel -- how many people watch, and a frame as proof -- through
the company's own Telegram account (MTProto). Runs next to the app on the
VPS (127.0.0.1:3100); only the app calls it, with x-tglive-secret. It keeps
no data: the app stores the (sealed) session and passes it on each call.

Run: TELEGRAM_API_ID=.. TELEGRAM_API_HASH=.. TGLIVE_SECRET=.. uvicorn app.main:app --port 3100
"""

from __future__ import annotations

import hmac
import logging
import os

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.gateway import Gateway, LoginError, NeedPassword, TelethonGateway

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class StartIn(BaseModel):
    phone: str = Field(min_length=7, max_length=20)


class CodeIn(BaseModel):
    login_id: str = Field(min_length=8, max_length=64)
    code: str = Field(default="", max_length=12)
    password: str | None = Field(default=None, max_length=256)


class ChannelIn(BaseModel):
    session: str = Field(min_length=10)
    channel: str = Field(min_length=2, max_length=64)


def create_app(gateway: Gateway | None = None, secret: str | None = None) -> FastAPI:
    app = FastAPI(title="SalesIQ tg-live", docs_url=None, redoc_url=None)
    key = secret if secret is not None else os.environ.get("TGLIVE_SECRET", "")
    gw = gateway

    def get_gw() -> Gateway:
        nonlocal gw
        if gw is None:
            api_id = int(os.environ.get("TELEGRAM_API_ID", "0") or 0)
            api_hash = os.environ.get("TELEGRAM_API_HASH", "")
            if not api_id or not api_hash:
                raise HTTPException(503, "TELEGRAM_API_ID / TELEGRAM_API_HASH not set")
            gw = TelethonGateway(api_id, api_hash)
        return gw

    def auth(x_tglive_secret: str = Header(default="")) -> None:
        if not key or not hmac.compare_digest(x_tglive_secret, key):
            raise HTTPException(401, "unauthorized")

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    @app.post("/v1/login/start", dependencies=[Depends(auth)])
    async def login_start(body: StartIn) -> dict:
        try:
            return {"loginId": await get_gw().start_login(body.phone)}
        except LoginError as e:
            raise HTTPException(400, str(e)) from e

    @app.post("/v1/login/code", dependencies=[Depends(auth)])
    async def login_code(body: CodeIn) -> dict:
        try:
            session, user = await get_gw().finish_login(body.login_id, body.code, body.password)
        except NeedPassword:
            return {"needPassword": True}
        except LoginError as e:
            raise HTTPException(400, str(e)) from e
        return {"session": session, "user": user}

    @app.post("/v1/live", dependencies=[Depends(auth)])
    async def live(body: ChannelIn) -> dict:
        try:
            info = await get_gw().live(body.session, body.channel)
        except LoginError as e:
            raise HTTPException(401, str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, str(e)[:300]) from e
        return {
            "live": info.live,
            "participants": info.participants,
            "title": info.title,
            "rtmp": info.rtmp,
        }

    @app.post("/v1/frame", dependencies=[Depends(auth)])
    async def frame(body: ChannelIn) -> Response:
        try:
            jpg = await get_gw().frame(body.session, body.channel)
        except LoginError as e:
            raise HTTPException(401, str(e)) from e
        except Exception:  # noqa: BLE001 - a frame is best effort
            jpg = None
        if not jpg:
            return Response(status_code=204)
        return Response(content=jpg, media_type="image/jpeg")

    return app


app = create_app()
