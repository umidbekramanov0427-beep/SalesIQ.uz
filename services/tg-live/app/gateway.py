"""Telegram side of the service, behind a small interface so the API can be
tested without Telegram. The real one is Telethon (MTProto, a user account):
bots are not told how many people watch a channel's live stream.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
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
    async def youtube_frame(self, video_id: str) -> bytes | None: ...
    async def channel_stats(self, session: str, channel: str) -> dict: ...
    async def admin_log(self, session: str, channel: str, since: float) -> list[dict]: ...


class AdminRequired(Exception):
    """The account is not an admin of the channel (or may not see its statistics)."""


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


def parse_graph(data_json: str) -> dict | None:
    """A Telegram statistics graph (columns + names) -> {"x": [...], "series": {name: [...]}}."""
    try:
        d = json.loads(data_json)
    except (TypeError, ValueError):
        return None
    names = d.get("names") or {}
    x: list = []
    series: dict[str, list] = {}
    for col in d.get("columns") or []:
        if not col:
            continue
        key, *vals = col
        if key == "x":
            x = vals
        else:
            series[str(names.get(key, key))] = vals
    if not x or not series:
        return None
    return {"x": x, "series": series}


def admin_event(action_name: str) -> str | None:
    """Which admin-log actions are a join or a leave."""
    if action_name.startswith("ChannelAdminLogEventActionParticipantJoin") or (
        action_name == "ChannelAdminLogEventActionParticipantInvite"
    ):
        return "join"
    if action_name == "ChannelAdminLogEventActionParticipantLeave":
        return "leave"
    return None


YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_stream_url(video_id: str) -> str | None:
    """The live stream's playable (HLS) address, through yt-dlp. YouTube's
    player needs a JavaScript runtime to be read; the VPS has Node."""
    if not YOUTUBE_ID.match(video_id):
        return None
    try:
        r = subprocess.run(
            [
                sys.executable,
                "-m",
                "yt_dlp",
                "--quiet",
                "--no-warnings",
                "--no-playlist",
                "--js-runtimes",
                "node",
                "-f",
                "best[height<=720]/best",
                "-g",
                f"https://www.youtube.com/watch?v={video_id}",
            ],
            check=True,
            timeout=45,
            capture_output=True,
            text=True,
        )
    except (subprocess.SubprocessError, FileNotFoundError):
        return None
    url = r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""
    return url if url.startswith("http") else None


def jpeg_from_stream(url: str) -> bytes | None:
    """The newest frame of a live HLS stream (or the first of a recording)."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "frame.jpg")
        cmd = ["ffmpeg", "-loglevel", "error", "-y"]
        if ".m3u8" in url or "manifest" in url:
            cmd += ["-live_start_index", "-1"]
        cmd += ["-i", url, "-frames:v", "1", "-q:v", "3", out]
        try:
            subprocess.run(cmd, check=True, timeout=30, capture_output=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            return None
        if not os.path.exists(out) or os.path.getsize(out) < 1000:
            return None
        with open(out, "rb") as f:
            return f.read()


def youtube_frame_sync(video_id: str) -> bytes | None:
    url = youtube_stream_url(video_id)
    return jpeg_from_stream(url) if url else None


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

    async def youtube_frame(self, video_id: str) -> bytes | None:
        return await asyncio.to_thread(youtube_frame_sync, video_id)

    async def _graph(self, c, sender, g) -> dict | None:
        from telethon import functions, types

        if isinstance(g, types.StatsGraphAsync):
            req = functions.stats.LoadAsyncGraphRequest(token=g.token)
            g = await (c._call(sender, req) if sender else c(req))  # noqa: SLF001
        if isinstance(g, types.StatsGraph):
            return parse_graph(g.json.data)
        return None

    async def channel_stats(self, session: str, channel: str) -> dict:
        """The channel's own statistics (what Telegram shows its admins):
        subscribers each day, joined / left each day, where new ones came
        from, the hours posts are read, notifications on."""
        from telethon import functions
        from telethon.errors import RPCError

        c = await self._client(session)
        entity = await c.get_entity(channel_ref(channel))
        full = await c(functions.channels.GetFullChannelRequest(entity))
        if not getattr(full.full_chat, "can_view_stats", False):
            raise AdminRequired("stats_unavailable")
        dc = full.full_chat.stats_dc
        sender = None
        if dc and dc != c.session.dc_id:
            sender = await c._borrow_exported_sender(dc)  # noqa: SLF001
        try:
            req = functions.stats.GetBroadcastStatsRequest(channel=entity)
            try:
                st = await (c._call(sender, req) if sender else c(req))  # noqa: SLF001
            except RPCError as e:
                raise AdminRequired(str(e)) from e
            graphs = {}
            for key, attr in [
                ("growth", "growth_graph"),
                ("followers", "followers_graph"),
                ("mute", "mute_graph"),
                ("topHours", "top_hours_graph"),
                ("sources", "new_followers_by_source_graph"),
                ("languages", "languages_graph"),
            ]:
                try:
                    graphs[key] = await self._graph(c, sender, getattr(st, attr, None))
                except Exception:  # noqa: BLE001 - one graph missing is fine
                    graphs[key] = None
        finally:
            if sender:
                await c._return_exported_sender(sender)  # noqa: SLF001
        notif = getattr(st, "enabled_notifications", None)
        pair = lambda v: [v.current, v.previous] if v is not None else None  # noqa: E731
        return {
            "period": [st.period.min_date.timestamp(), st.period.max_date.timestamp()],
            "followers": pair(st.followers),
            "viewsPerPost": pair(getattr(st, "views_per_post", None)),
            "sharesPerPost": pair(getattr(st, "shares_per_post", None)),
            "reactionsPerPost": pair(getattr(st, "reactions_per_post", None)),
            "notificationsPct": round(notif.part / notif.total * 100, 1) if notif and notif.total else None,
            "graphs": graphs,
        }

    async def admin_log(self, session: str, channel: str, since: float) -> list[dict]:
        """Joins and leaves from the channel's recent actions (Telegram keeps 48 hours)."""
        from telethon.errors import ChatAdminRequiredError

        c = await self._client(session)
        entity = await c.get_entity(channel_ref(channel))
        out: list[dict] = []
        try:
            async for ev in c.iter_admin_log(entity, limit=5000, join=True, leave=True, invite=True):
                at = ev.date.timestamp()
                if at < since:
                    break
                kind = admin_event(type(ev.action).__name__)
                # An admin adding someone: the person added, not the admin.
                user = getattr(getattr(ev.action, "participant", None), "user_id", None) or ev.user_id
                if not kind or not user:
                    continue
                invite = getattr(ev.action, "invite", None)
                if not hasattr(invite, "link"):
                    invite = None
                out.append(
                    {
                        "at": at,
                        "kind": kind,
                        "user": user,
                        "link": getattr(invite, "link", None),
                        "name": getattr(invite, "title", None),
                        "chatlist": bool(getattr(ev.action, "via_chatlist", False)),
                    }
                )
        except ChatAdminRequiredError as e:
            raise AdminRequired("admin_required") from e
        return out
