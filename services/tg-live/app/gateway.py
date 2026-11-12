"""Telegram side of the service, behind a small interface so the API can be
tested without Telegram. The real one is Telethon (MTProto, a user account):
bots are not told how many people watch a channel's live stream.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass
from typing import Protocol


@dataclass
class LiveInfo:
    live: bool
    participants: int | None = None
    title: str | None = None
    rtmp: bool = False


class NeedPassword(Exception):
    """The account has two-step verification: ask for the password."""


class LoginError(Exception):
    pass


class Gateway(Protocol):
    async def start_login(self, phone: str) -> str: ...
    async def finish_login(self, login_id: str, code: str, password: str | None) -> tuple[str, str]: ...
    async def live(self, session: str, channel: str) -> LiveInfo: ...
    async def frame(self, session: str, channel: str) -> bytes | None: ...


def channel_ref(channel: str) -> str | int:
    """'@name' / 'name' -> 'name'; '-100123' -> -100123 (a private channel's id)."""
    c = channel.strip().lstrip("@")
    if c.lstrip("-").isdigit():
        return int(c)
    return c


def mp4_from_part(data: bytes) -> bytes | None:
    """A stream part starts with Telegram's own header; the video is the MP4
    from its 'ftyp' box on."""
    i = data.find(b"ftyp")
    if i < 4:
        return None
    return data[i - 4 :]


def jpeg_from_mp4(mp4: bytes) -> bytes | None:
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "part.mp4")
        out = os.path.join(d, "frame.jpg")
        with open(src, "wb") as f:
            f.write(mp4)
        try:
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-frames:v", "1", "-q:v", "3", out],
                check=True,
                timeout=20,
                capture_output=True,
            )
        except (subprocess.SubprocessError, FileNotFoundError):
            return None
        if not os.path.exists(out):
            return None
        with open(out, "rb") as f:
            return f.read()


class TelethonGateway:
    """Connected clients are kept for a while per session so a poll every
    minute does not log in again each time."""

    LOGIN_TTL = 600
    IDLE = 600

    def __init__(self, api_id: int, api_hash: str) -> None:
        self.api_id = api_id
        self.api_hash = api_hash
        self._logins: dict[str, tuple[object, str, str, float]] = {}
        self._clients: dict[str, tuple[object, float]] = {}
        self._lock = asyncio.Lock()

    def _new(self, session: str | None):
        from telethon import TelegramClient
        from telethon.sessions import StringSession

        return TelegramClient(StringSession(session), self.api_id, self.api_hash)

    async def _client(self, session: str):
        async with self._lock:
            now = time.time()
            for key, (c, used) in list(self._clients.items()):
                if now - used > self.IDLE:
                    self._clients.pop(key, None)
                    await c.disconnect()  # type: ignore[attr-defined]
            hit = self._clients.get(session)
            if hit:
                self._clients[session] = (hit[0], now)
                return hit[0]
            c = self._new(session)
            await c.connect()
            if not await c.is_user_authorized():
                await c.disconnect()
                raise LoginError("session_revoked")
            self._clients[session] = (c, now)
            return c

    async def start_login(self, phone: str) -> str:
        c = self._new(None)
        await c.connect()
        try:
            sent = await c.send_code_request(phone)
        except Exception as e:  # noqa: BLE001 - Telegram's errors are many
            await c.disconnect()
            raise LoginError(str(e)) from e
        login_id = os.urandom(12).hex()
        self._logins[login_id] = (c, phone, sent.phone_code_hash, time.time())
        for k, (old, _, _, t) in list(self._logins.items()):
            if time.time() - t > self.LOGIN_TTL:
                self._logins.pop(k, None)
                await old.disconnect()  # type: ignore[attr-defined]
        return login_id

    async def finish_login(self, login_id: str, code: str, password: str | None) -> tuple[str, str]:
        from telethon.errors import SessionPasswordNeededError

        entry = self._logins.get(login_id)
        if not entry:
            raise LoginError("login_expired")
        c, phone, code_hash, _ = entry
        try:
            if password:
                await c.sign_in(password=password)  # type: ignore[attr-defined]
            else:
                await c.sign_in(phone=phone, code=code, phone_code_hash=code_hash)  # type: ignore[attr-defined]
        except SessionPasswordNeededError as e:
            raise NeedPassword() from e
        except Exception as e:  # noqa: BLE001
            raise LoginError(str(e)) from e
        me = await c.get_me()  # type: ignore[attr-defined]
        session = c.session.save()  # type: ignore[attr-defined]
        self._logins.pop(login_id, None)
        await c.disconnect()  # type: ignore[attr-defined]
        name = " ".join(x for x in [me.first_name, me.last_name] if x) or "Telegram"
        if me.username:
            name += f" (@{me.username})"
        return session, name

    async def _call(self, client, channel: str):
        from telethon import functions

        entity = await client.get_entity(channel_ref(channel))
        full = await client(functions.channels.GetFullChannelRequest(entity))
        ref = full.full_chat.call
        if ref is None:
            return None, None
        gc = await client(functions.phone.GetGroupCallRequest(call=ref, limit=1))
        return ref, gc.call

    async def live(self, session: str, channel: str) -> LiveInfo:
        from telethon.tl.types import GroupCall

        c = await self._client(session)
        ref, call = await self._call(c, channel)
        if not isinstance(call, GroupCall):
            return LiveInfo(live=False)
        # A stream scheduled for later is not live yet.
        if call.schedule_date and call.schedule_date.timestamp() > time.time():
            return LiveInfo(live=False, title=call.title)
        return LiveInfo(
            live=True,
            participants=call.participants_count,
            title=call.title,
            rtmp=bool(getattr(call, "rtmp_stream", False)),
        )

    async def frame(self, session: str, channel: str) -> bytes | None:
        from telethon import functions, types
        from telethon.tl.types import GroupCall

        c = await self._client(session)
        ref, call = await self._call(c, channel)
        if not isinstance(call, GroupCall) or not call.stream_dc_id:
            return None
        try:
            chans = await c(functions.phone.GetGroupCallStreamChannelsRequest(call=ref))
            if not chans.channels:
                return None
            ch = chans.channels[0]
            loc = types.InputGroupCallStream(
                call=ref,
                time_ms=ch.last_timestamp_ms,
                scale=ch.scale,
                video_channel=ch.channel,
                video_quality=1,
            )
            sender = await c._borrow_exported_sender(call.stream_dc_id)  # noqa: SLF001
            try:
                part = await c._call(  # noqa: SLF001
                    sender, functions.upload.GetFileRequest(location=loc, offset=0, limit=1024 * 1024)
                )
            finally:
                await c._return_exported_sender(sender)  # noqa: SLF001
        except Exception:  # noqa: BLE001 - a frame is best effort
            return None
        mp4 = mp4_from_part(bytes(part.bytes))
        return await asyncio.to_thread(jpeg_from_mp4, mp4) if mp4 else None
