from fastapi.testclient import TestClient

from app.gateway import LiveInfo, LoginError, NeedPassword, channel_ref, mp4_from_part
from app.main import create_app

SECRET = "s3cret"
H = {"x-tglive-secret": SECRET}


class FakeGateway:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def start_login(self, phone: str) -> str:
        if phone == "+000":
            raise LoginError("PHONE_NUMBER_INVALID")
        return "login123456"

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
    assert r.json() == {"loginId": "login123456"}
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
