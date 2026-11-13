"""SalesIQ tg-live: reads a Telegram channel's live stream for the
marketing panel -- how many people watch, and a frame as proof -- through
the company's own Telegram account (MTProto); also takes a YouTube live
stream's current frame (yt-dlp + ffmpeg). Runs next to the app on the
VPS (127.0.0.1:3100); only the app calls it, with x-tglive-secret. It keeps
no data: the app stores the (sealed) session and passes it on each call.

It also keeps salespeople's work Telegram accounts online (app/accounts.py):
their private chats go to the app's /telegram/user-webhook and replies go
out through /v1/user/send; sign-in by code or QR (/v1/login/qr/*).

Run: TELEGRAM_API_ID=.. TELEGRAM_API_HASH=.. TGLIVE_SECRET=.. uvicorn app.main:app --port 3100
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import urllib.request
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.accounts import AccountPool, RateLimited, SendFailed, keep_synced
from app.gateway import (
    AdminRequired,
    Gateway,
    LoginError,
    NeedPassword,
    TelethonGateway,
    qr_svg,
    youtube_frame_sync,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class StartIn(BaseModel):
    phone: str = Field(min_length=7, max_length=20)


class ResendIn(BaseModel):
    login_id: str = Field(min_length=8, max_length=64)


class CodeIn(BaseModel):
    login_id: str = Field(min_length=8, max_length=64)
    code: str = Field(default="", max_length=12)
    password: str | None = Field(default=None, max_length=256)


class QrIn(BaseModel):
    login_id: str = Field(min_length=8, max_length=64)


class UserSendIn(BaseModel):
    account_id: str = Field(min_length=8, max_length=64)
    session: str = Field(min_length=10)
    peer_id: int
    username: str | None = Field(default=None, max_length=64)
    text: str = Field(min_length=1, max_length=4096)


class YoutubeIn(BaseModel):
    video_id: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")


class ChannelIn(BaseModel):
    session: str = Field(min_length=10)
    channel: str = Field(min_length=2, max_length=64)


class LogIn(ChannelIn):
    since: float = 0


def _app_url() -> str:
    return os.environ.get("TGLIVE_APP_URL", "http://127.0.0.1:3000").rstrip("/")


def _app_request(method: str, path: str, key: str, body: dict | None = None) -> object:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        _app_url() + path,
        data=data,
        method=method,
        headers={"content-type": "application/json", "x-tglive-secret": key},
    )
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 - our own app on localhost
        raw = r.read()
    return json.loads(raw) if raw else None


def create_app(
    gateway: Gateway | None = None,
    secret: str | None = None,
    pool: AccountPool | None = None,
    sync_accounts: bool | None = None,
) -> FastAPI:
    key = secret if secret is not None else os.environ.get("TGLIVE_SECRET", "")
    gw = gateway
    accounts = pool

    def get_pool() -> AccountPool:
        nonlocal accounts
        if accounts is None:
            g = get_gw()

            async def post(path: str, body: dict) -> None:
                await asyncio.to_thread(_app_request, "POST", path, key, body)

            accounts = AccountPool(new_client=g._new, post=post)  # type: ignore[attr-defined]
        return accounts

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Salespeople's work accounts stay online (Sozlamalar -> «Telegram akkauntim»).
        run = sync_accounts if sync_accounts is not None else os.environ.get("TGUSER_SYNC", "1") != "0"
        task = None
        if run and key and os.environ.get("TELEGRAM_API_ID"):

            async def fetch() -> list[dict]:
                data = await asyncio.to_thread(_app_request, "GET", "/telegram/user-accounts/active", key)
                return list((data or {}).get("accounts", [])) if isinstance(data, dict) else []

            task = asyncio.create_task(keep_synced(get_pool(), fetch))
        yield
        if task:
            task.cancel()
        if accounts is not None:
            await accounts.stop_all()

    app = FastAPI(title="SalesIQ tg-live", docs_url=None, redoc_url=None, lifespan=lifespan)

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
            login_id, info = await get_gw().start_login(body.phone)
            return {"loginId": login_id, **info}
        except LoginError as e:
            raise HTTPException(400, str(e)) from e

    @app.post("/v1/login/resend", dependencies=[Depends(auth)])
    async def login_resend(body: ResendIn) -> dict:
        try:
            return await get_gw().resend_code(body.login_id)
        except LoginError as e:
            raise HTTPException(400, str(e)) from e

    @app.post("/v1/login/code", dependencies=[Depends(auth)])
    async def login_code(body: CodeIn) -> dict:
        try:
            res = await get_gw().finish_login(body.login_id, body.code, body.password)
        except NeedPassword:
            return {"needPassword": True}
        except LoginError as e:
            raise HTTPException(400, str(e)) from e
        out: dict = {"session": res[0], "user": res[1]}
        if len(res) > 2:
            out["me"] = res[2]
        return out

    @app.post("/v1/login/qr/start", dependencies=[Depends(auth)])
    async def qr_start() -> dict:
        try:
            login_id, url = await get_gw().start_qr()  # type: ignore[attr-defined]
        except LoginError as e:
            raise HTTPException(400, str(e)) from e
        return {"loginId": login_id, "url": url, "svg": qr_svg(url)}

    @app.post("/v1/login/qr/poll", dependencies=[Depends(auth)])
    async def qr_poll(body: QrIn) -> dict:
        try:
            res = await get_gw().poll_qr(body.login_id)  # type: ignore[attr-defined]
        except LoginError as e:
            raise HTTPException(400, str(e)) from e
        if res.get("status") == "pending":
            res["svg"] = qr_svg(res["url"])
        return res

    @app.post("/v1/user/send", dependencies=[Depends(auth)])
    async def user_send(body: UserSendIn) -> dict:
        try:
            return await get_pool().send(body.account_id, body.session, body.peer_id, body.text, body.username)
        except RateLimited as e:
            raise HTTPException(429, "rate_limited") from e
        except SendFailed as e:
            raise HTTPException(400, str(e)) from e

    @app.get("/v1/user/online", dependencies=[Depends(auth)])
    async def user_online() -> dict:
        return {"accounts": accounts.ids if accounts is not None else []}

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

    @app.post("/v1/channel-stats", dependencies=[Depends(auth)])
    async def channel_stats(body: ChannelIn) -> dict:
        try:
            return await get_gw().channel_stats(body.session, body.channel)
        except LoginError as e:
            raise HTTPException(401, str(e)) from e
        except AdminRequired as e:
            raise HTTPException(403, str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, str(e)[:300]) from e

    @app.post("/v1/admin-log", dependencies=[Depends(auth)])
    async def admin_log(body: LogIn) -> dict:
        try:
            return {"events": await get_gw().admin_log(body.session, body.channel, body.since)}
        except LoginError as e:
            raise HTTPException(401, str(e)) from e
        except AdminRequired as e:
            raise HTTPException(403, str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, str(e)[:300]) from e

    @app.post("/v1/youtube-frame", dependencies=[Depends(auth)])
    async def youtube_frame(body: YoutubeIn) -> Response:
        # No Telegram account needed: yt-dlp + ffmpeg on the stream itself.
        try:
            if gw is not None:
                jpg = await gw.youtube_frame(body.video_id)
            else:
                jpg = await asyncio.to_thread(youtube_frame_sync, body.video_id)
        except Exception:  # noqa: BLE001 - a frame is best effort
            jpg = None
        if not jpg:
            return Response(status_code=204)
        return Response(content=jpg, media_type="image/jpeg")

    return app


app = create_app()
