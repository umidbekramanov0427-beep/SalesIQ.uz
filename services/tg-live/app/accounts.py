"""Salespeople's work Telegram accounts (Sozlamalar -> «Telegram akkauntim»).

Each connected account stays online here: its new private messages -- the
client's and the salesperson's own, sent from the phone -- go to the app
(POST {APP_URL}/telegram/user-webhook), and the app sends replies through
it (/v1/user/send). Saved Messages, bots and channels are never
forwarded; a group only when its salesperson picked it (Inbox → «Guruhlar»). The app owns the sessions (sealed in its database) and hands the
list of connected accounts over every minute (GET .../telegram/user-accounts/active).
Sends are rate-limited per account so Telegram does not take it for spam.
"""

from __future__ import annotations

import asyncio
import collections
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

log = logging.getLogger("tglive.accounts")

# Telegram's own service account ("Telegram", login codes): never a client.
TELEGRAM_SERVICE_ID = 777000

SendJson = Callable[[str, dict], Awaitable[None]]


def should_forward(*, is_private: bool, peer_id: int | None, peer_is_bot: bool, me_id: int | None) -> bool:
    """Only a one-to-one chat with a real person: not Saved Messages, not a
    bot, not Telegram's service account, never a group or a channel."""
    if not is_private or peer_id is None:
        return False
    if peer_is_bot or peer_id == TELEGRAM_SERVICE_ID:
        return False
    return me_id is None or peer_id != me_id


def group_wanted(*, is_group: bool, chat_id: int | None, wanted: set[int]) -> bool:
    """A group's message comes in only when the salesperson picked that group."""
    return bool(is_group) and chat_id is not None and chat_id in wanted


def media_kind(message: Any) -> str | None:
    """What a message carries besides text, in the app's words."""
    if getattr(message, "photo", None):
        return "photo"
    if getattr(message, "voice", None):
        return "voice"
    if getattr(message, "video_note", None):
        return "video_note"
    if getattr(message, "video", None):
        return "video"
    if getattr(message, "audio", None):
        return "audio"
    if getattr(message, "sticker", None):
        return "sticker"
    if getattr(message, "document", None):
        return "document"
    return None


class RateLimiter:
    """At most `limit` sends per account in any `window` seconds."""

    def __init__(self, limit: int = 20, window: float = 60.0) -> None:
        self.limit = limit
        self.window = window
        self._sent: dict[str, collections.deque[float]] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        q = self._sent.setdefault(key, collections.deque())
        while q and now - q[0] >= self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


class RateLimited(Exception):
    pass


class SendFailed(Exception):
    pass


@dataclass
class Entry:
    session: str
    client: Any
    me_id: int | None = None
    started: float = field(default_factory=time.time)
    groups: set[int] = field(default_factory=set)


class AccountPool:
    """The connected work accounts, one Telethon client each."""

    def __init__(
        self,
        new_client: Callable[[str], Any],
        post: SendJson,
        limit_per_minute: int | None = None,
    ) -> None:
        self._new_client = new_client
        self._post = post
        self._entries: dict[str, Entry] = {}
        self._lock = asyncio.Lock()
        limit = limit_per_minute or int(os.environ.get("TGUSER_SEND_LIMIT", "20") or 20)
        self.limiter = RateLimiter(limit=limit)
        # Looking numbers up is stricter: Telegram limits contact imports.
        self.resolve_limiter = RateLimiter(limit=10)

    @property
    def ids(self) -> list[str]:
        return list(self._entries)

    async def sync(self, rows: list[dict]) -> None:
        """Starts the accounts that are new (or whose session changed) and
        stops the ones no longer in the list."""
        wanted = {str(r["id"]): str(r["session"]) for r in rows if r.get("id") and r.get("session")}
        groups = {
            str(r["id"]): {int(g) for g in (r.get("groups") or []) if isinstance(g, (int, float, str)) and str(g).lstrip("-").isdigit()}
            for r in rows
            if r.get("id")
        }
        async with self._lock:
            for account_id in list(self._entries):
                if wanted.get(account_id) != self._entries[account_id].session:
                    await self._stop(account_id)
            for account_id, session in wanted.items():
                if account_id not in self._entries:
                    await self._start(account_id, session)
            for account_id, entry in self._entries.items():
                entry.groups = groups.get(account_id, set())

    async def _stop(self, account_id: str) -> None:
        entry = self._entries.pop(account_id, None)
        if entry is not None:
            try:
                await entry.client.disconnect()
            except Exception:  # noqa: BLE001
                pass

    async def _start(self, account_id: str, session: str) -> None:
        client = self._new_client(session)
        try:
            await client.connect()
            if not await client.is_user_authorized():
                await client.disconnect()
                await self._post("/telegram/user-webhook", {"accountId": account_id, "error": "session_revoked"})
                return
            me = await client.get_me()
        except Exception as e:  # noqa: BLE001 - network, flood, revoked...
            log.warning("account %s did not start: %s", account_id, e)
            await self._post("/telegram/user-webhook", {"accountId": account_id, "error": str(e)[:200]})
            return
        entry = Entry(session=session, client=client, me_id=getattr(me, "id", None))
        self._entries[account_id] = entry
        self._watch(account_id, entry)
        log.info("account %s online", account_id)

    def _watch(self, account_id: str, entry: Entry) -> None:
        from telethon import events

        async def on_message(event) -> None:  # noqa: ANN001
            try:
                await self._forward(account_id, entry, event)
            except Exception as e:  # noqa: BLE001 - one bad message never stops the rest
                log.warning("account %s: message not forwarded: %s", account_id, e)

        entry.client.add_event_handler(on_message, events.NewMessage())

    async def _forward(self, account_id: str, entry: Entry, event) -> None:  # noqa: ANN001
        if group_wanted(is_group=bool(getattr(event, "is_group", False)), chat_id=getattr(event, "chat_id", None), wanted=entry.groups):
            await self._forward_group(account_id, event)
            return
        chat = await event.get_chat() if event.is_private else None
        peer_id = getattr(chat, "id", None)
        if not should_forward(
            is_private=bool(event.is_private),
            peer_id=peer_id,
            peer_is_bot=bool(getattr(chat, "bot", False)),
            me_id=entry.me_id,
        ):
            return
        msg = event.message
        kind = media_kind(msg)
        file_name = None
        if kind == "document" and getattr(msg, "file", None) is not None:
            file_name = getattr(msg.file, "name", None)
        await self._post(
            "/telegram/user-webhook",
            {
                "accountId": account_id,
                "out": bool(msg.out),
                "peer": {
                    "id": peer_id,
                    "username": getattr(chat, "username", None),
                    "firstName": getattr(chat, "first_name", None),
                    "lastName": getattr(chat, "last_name", None),
                    "phone": getattr(chat, "phone", None),
                },
                "message": {
                    "id": msg.id,
                    "text": msg.message or "",
                    "date": msg.date.timestamp() if msg.date else time.time(),
                    "media": kind,
                    "fileName": file_name,
                },
            },
        )

    async def _forward_group(self, account_id: str, event) -> None:  # noqa: ANN001
        chat = await event.get_chat()
        sender = await event.get_sender()
        msg = event.message
        kind = media_kind(msg)
        file_name = None
        if kind == "document" and getattr(msg, "file", None) is not None:
            file_name = getattr(msg.file, "name", None)
        name = " ".join(
            x for x in (getattr(sender, "first_name", None), getattr(sender, "last_name", None)) if x
        ) or getattr(sender, "title", None)
        await self._post(
            "/telegram/user-webhook",
            {
                "accountId": account_id,
                "out": bool(msg.out),
                "group": {"id": event.chat_id, "title": getattr(chat, "title", None)},
                "sender": {
                    "id": getattr(sender, "id", None),
                    "name": name,
                    "username": getattr(sender, "username", None),
                },
                "message": {
                    "id": msg.id,
                    "text": msg.message or "",
                    "date": msg.date.timestamp() if msg.date else time.time(),
                    "media": kind,
                    "fileName": file_name,
                },
            },
        )

    async def list_groups(self, account_id: str, session: str) -> list[dict]:
        """The account's groups (not channels, not private chats), newest first."""
        entry = await self._ensure(account_id, session)
        out: list[dict] = []
        async for d in entry.client.iter_dialogs(limit=400):
            if not getattr(d, "is_group", False):
                continue
            ent = getattr(d, "entity", None)
            out.append({
                "id": d.id,
                "title": getattr(d, "title", None) or getattr(d, "name", None) or "",
                "members": getattr(ent, "participants_count", None),
            })
        return out

    async def history(
        self,
        account_id: str,
        session: str,
        chat_id: int,
        limit: int = 50,
        before_id: int | None = None,
    ) -> list[dict]:
        """A group's latest messages (older than `before_id` when given), newest
        first -- what the group's screen in Telegram shows."""
        entry = await self._ensure(account_id, session)
        client = entry.client
        try:
            target = await client.get_input_entity(chat_id)
        except (ValueError, TypeError):
            try:
                await client.get_dialogs(limit=300)
                target = await client.get_input_entity(chat_id)
            except (ValueError, TypeError):
                raise SendFailed("peer_unknown") from None
        kwargs: dict = {"limit": max(1, min(int(limit), 100))}
        if before_id:
            kwargs["offset_id"] = int(before_id)
        try:
            msgs = await client.get_messages(target, **kwargs)
        except Exception as e:  # noqa: BLE001
            raise SendFailed(str(e)[:200]) from e
        out: list[dict] = []
        for m in msgs or []:
            if getattr(m, "action", None) is not None:
                continue  # joins, pins, title changes
            sender = getattr(m, "sender", None)
            name = " ".join(
                x
                for x in (getattr(sender, "first_name", None), getattr(sender, "last_name", None))
                if x
            ) or getattr(sender, "title", None)
            kind = media_kind(m)
            file_name = None
            if kind == "document" and getattr(m, "file", None) is not None:
                file_name = getattr(m.file, "name", None)
            reply = getattr(m, "reply_to", None)
            out.append({
                "id": m.id,
                "text": getattr(m, "message", None) or "",
                "date": m.date.timestamp() if getattr(m, "date", None) else time.time(),
                "out": bool(getattr(m, "out", False)),
                "sender": {
                    "id": getattr(m, "sender_id", None),
                    "name": name,
                    "username": getattr(sender, "username", None),
                },
                "media": kind,
                "fileName": file_name,
                "replyTo": getattr(reply, "reply_to_msg_id", None) if reply else None,
            })
        return out

    async def _ensure(self, account_id: str, session: str) -> Entry:
        """The account's live client, connecting it if it isn't online."""
        entry = self._entries.get(account_id)
        if entry is None or entry.session != session:
            async with self._lock:
                await self._stop(account_id)
                await self._start(account_id, session)
            entry = self._entries.get(account_id)
            if entry is None:
                raise SendFailed("session_revoked")
        return entry

    async def resolve_phone(self, account_id: str, session: str, phone: str, name: str | None = None) -> dict | None:
        """The Telegram profile behind a phone number, as the account sees it
        (it is added to the account's contacts, which is how Telegram allows
        it); None when the number has no Telegram or hides it."""
        if not self.resolve_limiter.allow(account_id):
            raise RateLimited("rate_limited")
        from telethon.tl.functions.contacts import ImportContactsRequest
        from telethon.tl.types import InputPhoneContact

        entry = await self._ensure(account_id, session)
        try:
            res = await entry.client(
                ImportContactsRequest([
                    InputPhoneContact(
                        client_id=int(time.time() * 1000) % 2_000_000_000,
                        phone=phone,
                        first_name=(name or phone)[:60],
                        last_name="",
                    )
                ])
            )
        except Exception as e:  # noqa: BLE001
            raise SendFailed(str(e)[:200]) from e
        users = [u for u in (getattr(res, "users", None) or []) if not getattr(u, "bot", False)]
        if not users:
            return None
        u = users[0]
        return {
            "id": u.id,
            "username": getattr(u, "username", None),
            "firstName": getattr(u, "first_name", None),
            "lastName": getattr(u, "last_name", None),
            "phone": getattr(u, "phone", None),
        }

    async def send(self, account_id: str, session: str, peer_id: int, text: str, username: str | None = None) -> dict:
        """Sends a text through the account (connecting it if it isn't online)."""
        if not self.limiter.allow(account_id):
            raise RateLimited("rate_limited")
        entry = await self._ensure(account_id, session)
        client = entry.client
        try:
            target = await client.get_input_entity(peer_id)
        except (ValueError, TypeError):
            # A fresh client may not know the chat yet: read the dialogs once.
            try:
                await client.get_dialogs(limit=300)
                target = await client.get_input_entity(peer_id)
            except (ValueError, TypeError):
                if not username:
                    raise SendFailed("peer_unknown") from None
                target = await client.get_input_entity(username)
        try:
            sent = await client.send_message(target, text)
        except Exception as e:  # noqa: BLE001
            raise SendFailed(str(e)[:200]) from e
        return {"messageId": sent.id, "date": sent.date.timestamp() if sent.date else time.time()}

    async def stop_all(self) -> None:
        async with self._lock:
            for account_id in list(self._entries):
                await self._stop(account_id)


async def keep_synced(pool: AccountPool, fetch: Callable[[], Awaitable[list[dict]]], every: float = 60.0) -> None:
    """Every minute: the app's list of connected accounts -> the pool."""
    while True:
        try:
            await pool.sync(await fetch())
        except Exception as e:  # noqa: BLE001 - the app restarting, a network blip
            log.warning("accounts sync failed: %s", e)
        await asyncio.sleep(every)
