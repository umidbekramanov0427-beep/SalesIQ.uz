from fastapi.testclient import TestClient

from app.gateway import AdminRequired, code_info, LiveInfo, admin_event, parse_graph, LoginError, NeedPassword, channel_ref, mp4_from_part, youtube_stream_url
from app.main import create_app

SECRET = "s3cret"
H = {"x-tglive-secret": SECRET}


class FakeGateway:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def start_login(self, phone: str):
        if phone == "+000":
            raise LoginError("PHONE_NUMBER_INVALID")
        return "login123456", {"via": "app", "next": "sms", "timeout": 60}

    async def resend_code(self, login_id: str):
        if login_id != "login123456":
            raise LoginError("login_expired")
        return {"via": "sms", "next": None, "timeout": None}

    async def finish_login(self, login_id: str, code: str, password: str | None):
        if password is None and code == "2fa":
            raise NeedPassword()
        return "session-string-xyz", "Umidbek (@umidbek)"

    async def live(self, session: str, channel: str) -> LiveInfo:
        self.calls.append(("live", channel))
        if session == "revoked-session":
            raise LoginError("session_revoked")
        return LiveInfo(live=channel == "@on_air", participants=5456, title="Efir")

    async def frame(self, session: str, channel: str):
        return b"\xff\xd8jpeg" if channel == "@on_air" else None

    async def channel_stats(self, session: str, channel: str):
        if channel == "@small":
            raise AdminRequired("stats_unavailable")
        return {"followers": [23501, 23400], "graphs": {}}

    async def admin_log(self, session: str, channel: str, since: float):
        if channel == "@notadmin":
            raise AdminRequired("admin_required")
        return [{"at": 1700000000.0, "kind": "join", "user": 42, "link": None, "name": None, "chatlist": False}]

    async def youtube_frame(self, video_id: str):
        return b"\xff\xd8yt" if video_id == "LIVEvideo01" else None


def client() -> TestClient:
    return TestClient(create_app(FakeGateway(), SECRET))


def test_needs_the_secret():
    c = client()
    assert c.get("/health").json() == {"ok": True}
    assert c.post("/v1/live", json={"session": "x" * 12, "channel": "@a"}).status_code == 401
    bad = {"x-tglive-secret": "wrong"}
    assert c.post("/v1/live", json={"session": "x" * 12, "channel": "@a"}, headers=bad).status_code == 401


def test_login_with_code_and_two_step_password():
    c = client()
    r = c.post("/v1/login/start", json={"phone": "+998901234567"}, headers=H)
    assert r.json() == {"loginId": "login123456", "via": "app", "next": "sms", "timeout": 60}
    r = c.post("/v1/login/resend", json={"login_id": "login123456"}, headers=H)
    assert r.json()["via"] == "sms"
    assert c.post("/v1/login/resend", json={"login_id": "expired0000"}, headers=H).status_code == 400
    assert c.post("/v1/login/start", json={"phone": "+000"[:7].ljust(7, "0")}, headers=H).status_code in (200, 400)
    r = c.post("/v1/login/code", json={"login_id": "login123456", "code": "2fa"}, headers=H)
    assert r.json() == {"needPassword": True}
    r = c.post("/v1/login/code", json={"login_id": "login123456", "code": "2fa", "password": "pw"}, headers=H)
    assert r.json() == {"session": "session-string-xyz", "user": "Umidbek (@umidbek)"}


def test_live_and_frame():
    c = client()
    on = c.post("/v1/live", json={"session": "x" * 12, "channel": "@on_air"}, headers=H).json()
    assert on == {"live": True, "participants": 5456, "title": "Efir", "rtmp": False}
    off = c.post("/v1/live", json={"session": "x" * 12, "channel": "@quiet"}, headers=H).json()
    assert off["live"] is False
    revoked = c.post("/v1/live", json={"session": "revoked-session", "channel": "@a"}, headers=H)
    assert revoked.status_code == 401
    f = c.post("/v1/frame", json={"session": "x" * 12, "channel": "@on_air"}, headers=H)
    assert f.status_code == 200 and f.headers["content-type"] == "image/jpeg"
    assert c.post("/v1/frame", json={"session": "x" * 12, "channel": "@quiet"}, headers=H).status_code == 204


def test_helpers():
    assert channel_ref("@salesiq_uz") == "salesiq_uz"
    assert channel_ref("-1001234") == -1001234
    assert mp4_from_part(b"\x0d\x81\x2e\xa1header....\x00\x00\x00\x18ftypisom") == b"\x00\x00\x00\x18ftypisom"
    assert mp4_from_part(b"no video here") is None


def test_youtube_frame():
    c = client()
    assert c.post("/v1/youtube-frame", json={"video_id": "LIVEvideo01"}).status_code == 401
    r = c.post("/v1/youtube-frame", json={"video_id": "LIVEvideo01"}, headers=H)
    assert r.status_code == 200 and r.content == b"\xff\xd8yt"
    assert c.post("/v1/youtube-frame", json={"video_id": "ENDEDvideo1"}, headers=H).status_code == 204
    bad = c.post("/v1/youtube-frame", json={"video_id": "x; rm -rf /"}, headers=H)
    assert bad.status_code == 422
    assert youtube_stream_url("--exec=evil") is None


def test_channel_stats_and_admin_log():
    c = client()
    body = {"session": "x" * 12, "channel": "@big"}
    assert c.post("/v1/channel-stats", json=body, headers=H).json()["followers"] == [23501, 23400]
    assert c.post("/v1/channel-stats", json={**body, "channel": "@small"}, headers=H).status_code == 403
    r = c.post("/v1/admin-log", json={**body, "since": 0}, headers=H).json()
    assert r["events"][0]["kind"] == "join"
    assert c.post("/v1/admin-log", json={**body, "channel": "@notadmin"}, headers=H).status_code == 403


def test_graph_and_admin_helpers():
    g = parse_graph(
        '{"columns":[["x",1,2],["y0",5,6],["y1",1,0]],"names":{"y0":"Joined","y1":"Left"},"types":{}}'
    )
    assert g == {"x": [1, 2], "series": {"Joined": [5, 6], "Left": [1, 0]}}
    assert parse_graph("not json") is None
    assert admin_event("ChannelAdminLogEventActionParticipantJoinByInvite") == "join"
    assert admin_event("ChannelAdminLogEventActionParticipantLeave") == "leave"
    assert admin_event("ChannelAdminLogEventActionChangeTitle") is None


def test_code_info():
    from telethon.tl.types import auth

    sent = auth.SentCode(type=auth.SentCodeTypeApp(length=5), phone_code_hash="h", next_type=auth.CodeTypeSms(), timeout=60)
    assert code_info(sent) == {"via": "app", "next": "sms", "timeout": 60}
    sent = auth.SentCode(type=auth.SentCodeTypeSms(length=5), phone_code_hash="h")
    assert code_info(sent) == {"via": "sms", "next": None, "timeout": None}


class FakePool:
    def __init__(self) -> None:
        self.ids: list[str] = []
        self.sent: list[tuple] = []

    async def send(self, account_id, session, peer_id, text, username=None):
        from app.accounts import RateLimited

        if text == "spam":
            raise RateLimited("rate_limited")
        self.sent.append((account_id, peer_id, text))
        return {"messageId": 7, "date": 1700000000.0}

    async def list_groups(self, account_id, session):
        return [{"id": -1001, "title": "Ombor", "members": 5}]

    async def history(self, account_id, session, chat_id, limit=50, before_id=None):
        from app.accounts import SendFailed

        if chat_id == -1:
            raise SendFailed("peer_unknown")
        return [{"id": 10, "text": "Salom", "date": 1700000000.0, "out": False,
                 "sender": {"id": 5, "name": "Ali", "username": None},
                 "media": None, "fileName": None, "replyTo": None, "limit": limit, "before": before_id}]

    async def resolve_phone(self, account_id, session, phone, name=None):
        if phone == "+998000000000":
            return None
        return {"id": 999, "username": "mijoz", "firstName": "Ali", "lastName": None, "phone": phone[1:]}

    async def stop_all(self):
        pass


def test_user_send_through_the_work_account():
    pool = FakePool()
    c = TestClient(create_app(FakeGateway(), SECRET, pool=pool, sync_accounts=False))
    h = {"x-tglive-secret": SECRET}
    body = {"account_id": "acc-12345", "session": "s" * 12, "peer_id": 555, "text": "Salom"}
    assert c.post("/v1/user/send", json=body).status_code == 401
    r = c.post("/v1/user/send", json=body, headers=h)
    assert r.status_code == 200 and r.json()["messageId"] == 7
    assert pool.sent == [("acc-12345", 555, "Salom")]
    assert c.post("/v1/user/send", json={**body, "text": "spam"}, headers=h).status_code == 429


def test_login_code_returns_who_signed_in_when_known():
    r = client().post("/v1/login/code", json={"login_id": "x" * 12, "code": "12345"}, headers={"x-tglive-secret": SECRET})
    assert r.status_code == 200
    assert r.json()["session"] == "session-string-xyz"


def test_user_resolve_finds_the_profile_behind_a_number():
    c = TestClient(create_app(FakeGateway(), SECRET, pool=FakePool(), sync_accounts=False))
    h = {"x-tglive-secret": SECRET}
    body = {"account_id": "acc-12345", "session": "s" * 12, "phone": "+998901234567"}
    assert c.post("/v1/user/resolve", json=body).status_code == 401
    r = c.post("/v1/user/resolve", json=body, headers=h)
    assert r.status_code == 200 and r.json()["user"]["id"] == 999
    r = c.post("/v1/user/resolve", json={**body, "phone": "+998000000000"}, headers=h)
    assert r.status_code == 200 and r.json()["user"] is None


def test_user_groups_lists_the_accounts_groups():
    c = TestClient(create_app(FakeGateway(), SECRET, pool=FakePool(), sync_accounts=False))
    body = {"account_id": "acc-12345", "session": "s" * 12}
    assert c.post("/v1/user/groups", json=body).status_code == 401
    r = c.post("/v1/user/groups", json=body, headers={"x-tglive-secret": SECRET})
    assert r.status_code == 200 and r.json()["groups"][0]["title"] == "Ombor"


def test_user_history_reads_a_groups_messages():
    c = TestClient(create_app(FakeGateway(), SECRET, pool=FakePool(), sync_accounts=False))
    h = {"x-tglive-secret": SECRET}
    body = {"account_id": "acc-12345", "session": "s" * 12, "chat_id": -1001, "limit": 30, "before_id": 99}
    assert c.post("/v1/user/history", json=body).status_code == 401
    r = c.post("/v1/user/history", json=body, headers=h)
    assert r.status_code == 200
    m = r.json()["messages"][0]
    assert m["text"] == "Salom" and m["limit"] == 30 and m["before"] == 99
    assert c.post("/v1/user/history", json={**body, "chat_id": -1}, headers=h).status_code == 400
