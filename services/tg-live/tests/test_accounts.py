import asyncio

import pytest

from app.accounts import AccountPool, RateLimited, RateLimiter, media_kind, should_forward


def test_only_one_to_one_chats_with_people_are_forwarded():
    ok = dict(is_private=True, peer_id=5, peer_is_bot=False, me_id=1)
    assert should_forward(**ok)
    assert not should_forward(**{**ok, "is_private": False})  # group / channel
    assert not should_forward(**{**ok, "peer_id": 1})  # Saved Messages
    assert not should_forward(**{**ok, "peer_is_bot": True})
    assert not should_forward(**{**ok, "peer_id": 777000})  # Telegram's service account


def test_media_kind():
    class M:
        photo = None
        voice = None
        video_note = None
        video = None
        audio = None
        sticker = None
        document = None

    m = M()
    assert media_kind(m) is None
    m.voice = object()
    assert media_kind(m) == "voice"


def test_rate_limiter_window():
    r = RateLimiter(limit=2, window=60)
    assert r.allow("a", 0) and r.allow("a", 1)
    assert not r.allow("a", 2)
    assert r.allow("b", 2)
    assert r.allow("a", 61)


class FakeClient:
    def __init__(self, session: str) -> None:
        self.session = session
        self.connected = False
        self.sent: list[tuple] = []
        self.handlers: list = []

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False

    async def is_user_authorized(self):
        return self.session != "revoked"

    async def get_me(self):
        class Me:
            id = 1

        return Me()

    def add_event_handler(self, fn, ev):
        self.handlers.append(fn)

    async def get_input_entity(self, peer):
        return peer

    async def get_dialogs(self, limit=100):
        return []

    async def get_messages(self, target, limit=50, offset_id=None):
        import datetime

        class U:
            first_name = "Ali"
            last_name = "Valiyev"
            username = "ali"

        class M:
            def __init__(self, i, action=None):
                self.id = i
                self.message = f"xabar {i}"
                self.date = datetime.datetime(2026, 11, 14, tzinfo=datetime.timezone.utc)
                self.out = i == 3
                self.sender = U()
                self.sender_id = 5
                self.action = action
                self.reply_to = None

        self.history_args = (target, limit, offset_id)
        return [M(3), M(2, action="joined"), M(1)]

    async def send_message(self, target, text):
        self.sent.append((target, text))

        class Sent:
            id = 42
            date = None

        return Sent()


@pytest.fixture
def pool_and_posts(monkeypatch):
    import app.accounts as acc

    class Ev:
        @staticmethod
        def NewMessage():  # noqa: N802
            return "new"

    monkeypatch.setitem(__import__("sys").modules, "telethon", type("T", (), {"events": Ev}))
    posts: list = []

    async def post(path, body):
        posts.append((path, body))

    clients: dict = {}

    def new_client(session):
        c = FakeClient(session)
        clients[session] = c
        return c

    return acc.AccountPool(new_client=new_client, post=post, limit_per_minute=2), posts, clients


def test_sync_starts_and_stops_accounts(pool_and_posts):
    pool, posts, clients = pool_and_posts

    async def run():
        await pool.sync([{"id": "acc-1", "session": "s1"}, {"id": "acc-2", "session": "revoked"}])
        assert pool.ids == ["acc-1"]
        assert posts == [("/telegram/user-webhook", {"accountId": "acc-2", "error": "session_revoked"})]
        await pool.sync([])
        assert pool.ids == []
        assert clients["s1"].connected is False

    asyncio.run(run())


def test_send_goes_out_and_is_rate_limited(pool_and_posts):
    pool, _, clients = pool_and_posts

    async def run():
        r = await pool.send("acc-1", "s1", 777, "Salom")
        assert r["messageId"] == 42
        assert clients["s1"].sent == [(777, "Salom")]
        await pool.send("acc-1", "s1", 777, "2")
        with pytest.raises(RateLimited):
            await pool.send("acc-1", "s1", 777, "3")

    asyncio.run(run())


def test_only_picked_groups_come_in():
    from app.accounts import group_wanted

    assert group_wanted(is_group=True, chat_id=-1001, wanted={-1001})
    assert not group_wanted(is_group=True, chat_id=-1002, wanted={-1001})
    assert not group_wanted(is_group=False, chat_id=-1001, wanted={-1001})
    assert not group_wanted(is_group=True, chat_id=None, wanted={-1001})


def test_sync_hands_each_account_its_groups(pool_and_posts):
    pool, _, _ = pool_and_posts

    async def run():
        await pool.sync([{"id": "acc-1", "session": "s1", "groups": [-1001, "-1002", "x"]}])
        assert pool._entries["acc-1"].groups == {-1001, -1002}
        await pool.sync([{"id": "acc-1", "session": "s1", "groups": []}])
        assert pool._entries["acc-1"].groups == set()

    asyncio.run(run())


def test_history_reads_a_groups_messages_without_service_ones(pool_and_posts):
    pool, _, clients = pool_and_posts

    async def run():
        msgs = await pool.history("acc-1", "s1", -1001, limit=500, before_id=40)
        assert [m["id"] for m in msgs] == [3, 1]
        assert msgs[0]["out"] is True and msgs[0]["sender"]["name"] == "Ali Valiyev"
        assert clients["s1"].history_args == (-1001, 100, 40)

    asyncio.run(run())
