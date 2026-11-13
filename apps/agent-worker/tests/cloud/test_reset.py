"""UX-39 (D-053): password reset by email — no account enumeration, a single-use 30-minute token
stored hashed, every session (and refresh token) ended on use, rate-limited, audited."""

from __future__ import annotations

import re
import time
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud import store as store_module
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.outbox import EmailMessage
from tests.cloud.conftest import ORIGIN, PASSWORD

NEW = "-".join(["brand", "new", "secret", "words"])


class Outbox:
    provider = "fake"

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        self.sent.append(message)


@pytest.fixture
def outbox() -> Outbox:
    return Outbox()


@pytest.fixture
def rc(store: CloudStore, seed: Seed, outbox: Outbox) -> Iterator[TestClient]:
    config = CloudConfig(public_origin=ORIGIN, static_dir=None, mailer=outbox)
    with TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN) as c:
        yield c


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Callable[[int], None]:
    offset = [0]
    monkeypatch.setattr(store_module, "now_ms", lambda: int(time.time() * 1000) + offset[0])

    def forward(ms: int) -> None:
        offset[0] += ms

    return forward


def signup(c: TestClient, email: str = "admin@acme.test") -> dict[str, Any]:
    r = c.post(
        "/api/v1/auth/signup",
        json={
            "company": "Acme",
            "name": "Ada",
            "email": email,
            "password": PASSWORD,
            "session": "pair",
            "device": {"id": "dev-1", "platform": "mac", "label": "Mac"},
        },
    )
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


def wait_for(cond: Callable[[], bool]) -> None:
    for _ in range(100):
        if cond():
            return
        time.sleep(0.02)
    raise AssertionError("timed out")


def request_token(c: TestClient, outbox: Outbox, email: str = "admin@acme.test") -> str:
    before = len(outbox.sent)
    r = c.post("/api/v1/auth/reset/request", json={"email": email})
    assert r.status_code == 200, r.text
    wait_for(lambda: len(outbox.sent) > before)
    m = re.search(r"#token=([A-Za-z0-9_-]+)", outbox.sent[-1].text)
    assert m
    return m.group(1)


def test_unknown_email_gets_the_same_200_and_no_mail(rc: TestClient, outbox: Outbox) -> None:
    signup(rc)
    known = rc.post("/api/v1/auth/reset/request", json={"email": "admin@acme.test"})
    unknown = rc.post("/api/v1/auth/reset/request", json={"email": "nobody@acme.test"})
    junk = rc.post("/api/v1/auth/reset/request", json={"email": "not an email"})
    assert known.status_code == unknown.status_code == junk.status_code == 200
    assert known.json() == unknown.json() == junk.json()
    wait_for(lambda: len(outbox.sent) == 1)
    time.sleep(0.05)
    assert [m.to for m in outbox.sent] == ["admin@acme.test"]


def test_token_is_stored_hashed_and_works_once(
    rc: TestClient, outbox: Outbox, store: CloudStore
) -> None:
    signup(rc)
    token = request_token(rc, outbox)
    rows = store._q("SELECT token_hash FROM password_resets")
    assert len(rows) == 1
    assert token not in rows[0]["token_hash"]
    assert "#token=" in outbox.sent[-1].text  # a fragment: never sent to the server by a browser
    ok = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW})
    assert ok.status_code == 200, ok.text
    again = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW + "x"})
    assert again.status_code == 400
    assert again.json()["code"] == "reset_invalid"
    login = rc.post("/api/v1/auth/login", json={"email": "admin@acme.test", "password": NEW})
    assert login.status_code == 200
    old = rc.post("/api/v1/auth/login", json={"email": "admin@acme.test", "password": PASSWORD})
    assert old.status_code == 401


def test_token_expires_after_30_minutes(
    rc: TestClient, outbox: Outbox, clock: Callable[[int], None]
) -> None:
    signup(rc)
    token = request_token(rc, outbox)
    clock(30 * 60_000 + 1000)
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW})
    assert r.status_code == 400
    assert r.json()["code"] == "reset_invalid"


def test_token_still_works_just_before_30_minutes(
    rc: TestClient, outbox: Outbox, clock: Callable[[int], None]
) -> None:
    signup(rc)
    token = request_token(rc, outbox)
    clock(29 * 60_000)
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW})
    assert r.status_code == 200


def test_a_newer_request_kills_the_older_token(rc: TestClient, outbox: Outbox) -> None:
    signup(rc)
    first = request_token(rc, outbox)
    second = request_token(rc, outbox)
    assert first != second
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": first, "password": NEW})
    assert r.status_code == 400
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": second, "password": NEW})
    assert r.status_code == 200


def test_confirm_revokes_every_session_and_refresh_token(rc: TestClient, outbox: Outbox) -> None:
    s = signup(rc)
    auth = {"authorization": f"Bearer {s['token']}"}
    assert rc.get("/api/v1/me", headers=auth).status_code == 200
    token = request_token(rc, outbox)
    assert rc.post(
        "/api/v1/auth/reset/confirm", json={"token": token, "password": NEW}
    ).status_code == (200)
    assert rc.get("/api/v1/me", headers=auth).status_code == 401
    r = rc.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 401


def test_weak_password_is_refused_and_the_token_stays_usable(
    rc: TestClient, outbox: Outbox
) -> None:
    signup(rc)
    token = request_token(rc, outbox)
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": "short"})
    assert r.status_code == 400
    assert r.json()["code"] == "weak_password"
    r = rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW})
    assert r.status_code == 200


def test_requests_are_rate_limited_per_address(rc: TestClient) -> None:
    signup(rc)
    codes = [
        rc.post("/api/v1/auth/reset/request", json={"email": "admin@acme.test"}).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_requests_are_rate_limited_per_client(rc: TestClient) -> None:
    codes = [
        rc.post("/api/v1/auth/reset/request", json={"email": f"u{i}@acme.test"}).status_code
        for i in range(21)
    ]
    assert codes[:20] == [200] * 20
    assert codes[20] == 429


def test_token_guessing_is_rate_limited(rc: TestClient) -> None:
    codes = [
        rc.post(
            "/api/v1/auth/reset/confirm", json={"token": f"guess-{i}", "password": NEW}
        ).status_code
        for i in range(6)
    ]
    assert codes[:5] == [400] * 5
    assert codes[5] == 429


def test_request_and_use_are_audited(rc: TestClient, outbox: Outbox, store: CloudStore) -> None:
    signup(rc)
    token = request_token(rc, outbox)
    rc.post("/api/v1/auth/reset/confirm", json={"token": token, "password": NEW})
    actions = [r["action"] for r in store._q("SELECT action FROM audit ORDER BY id")]
    assert "user.reset.requested" in actions
    assert "user.reset.done" in actions
    details = " ".join(r["detail"] for r in store._q("SELECT detail FROM audit"))
    assert token not in details


def test_the_owner_cannot_be_reset_by_email(
    rc: TestClient, outbox: Outbox, store: CloudStore
) -> None:
    store.create_owner("owner@example.com", "Owner", PASSWORD)
    r = rc.post("/api/v1/auth/reset/request", json={"email": "owner@example.com"})
    assert r.status_code == 200
    time.sleep(0.1)
    assert outbox.sent == []


def test_link_uses_the_configured_origin_not_the_host_header(
    rc: TestClient, outbox: Outbox
) -> None:
    signup(rc)
    r = rc.post(
        "/api/v1/auth/reset/request",
        json={"email": "admin@acme.test"},
        headers={"host": "evil.example"},
    )
    assert r.status_code == 200
    wait_for(lambda: len(outbox.sent) == 1)
    assert f"{ORIGIN}/reset-password#token=" in outbox.sent[0].text
    assert "evil.example" not in outbox.sent[0].text
