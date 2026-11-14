"""ZC-10 (D-068): the Zoho Forms sign-up webhook creates one trial company and one invite per
address; a wrong secret is 401; a flood is 429; the owner's queue lists it; suspending blocks
calls (R3)."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.outbox import EmailMessage
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, PASSWORD

H = {"origin": ORIGIN}
HOOK = "/hooks/zoho-forms/signup"


class Mailer:
    provider = "test"

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> None:
        self.sent.append(message)


@pytest.fixture
def mailer() -> Mailer:
    return Mailer()


@pytest.fixture
def app(store: CloudStore, seed: Seed, mailer: Mailer) -> TestClient:
    config = CloudConfig(public_origin=ORIGIN, static_dir=None, mailer=mailer)
    c = TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    c.post("/api/owner/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, headers=H)
    c.post(
        "/api/owner/password",
        json={"current": OWNER_PASSWORD, "new": OWNER_PASSWORD + "-2"},
        headers=H,
    )
    return c


def _secret(app: TestClient) -> str:
    r = app.post("/api/owner/signups/secret", json={}, headers=H)
    assert r.status_code == 200
    assert r.json()["header"] == "X-AGN-Signup-Secret"
    return str(r.json()["secret"])


def _form(email: str = "new@lead.test") -> dict[str, str]:
    return {"company": "Lead Co", "name": "Lee Lead", "email": email, "phone": "+971500000000"}


def test_a_valid_webhook_creates_one_trial_company_and_one_invite(
    app: TestClient, store: CloudStore, mailer: Mailer
) -> None:
    secret = _secret(app)
    r = app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": secret})
    assert r.status_code == 201
    assert r.json() == {"ok": True, "created": True}
    company = store._q("SELECT * FROM companies WHERE name = 'Lead Co'")
    assert len(company) == 1
    assert company[0]["plan"] == "trial"
    days = (company[0]["trial_ends_at"] - company[0]["created_at"]) / 86_400_000
    assert round(days) == 14
    assert len(mailer.sent) == 1
    assert mailer.sent[0].to == "new@lead.test"
    link = next(w for w in mailer.sent[0].text.split() if "/reset-password#token=" in w)
    token = link.split("#token=", 1)[1]
    # The invite link sets the first admin's password; then the admin signs in.
    r = app.post("/api/v1/auth/reset/confirm", json={"token": token, "password": PASSWORD})
    assert r.status_code == 200
    r = app.post("/api/v1/auth/login", json={"email": "new@lead.test", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"
    # A replay of the same address creates nothing new (Zoho re-pushes failed entries).
    r = app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": secret})
    assert r.status_code == 200
    assert r.json()["created"] is False
    r = app.post(HOOK, json=_form("NEW@lead.test"), headers={"X-AGN-Signup-Secret": secret})
    assert r.json()["created"] is False
    assert len(store._q("SELECT id FROM companies WHERE name = 'Lead Co'")) == 1
    assert len(mailer.sent) == 1
    # A form-encoded post (Zoho Forms' other payload format) works the same way.
    r = app.post(
        HOOK,
        content="company=Form+Co&name=F&email=f%40form.test",
        headers={
            "X-AGN-Signup-Secret": secret,
            "content-type": "application/x-www-form-urlencoded",
        },
    )
    assert r.status_code == 201


def test_wrong_or_missing_secret_is_401(app: TestClient, store: CloudStore) -> None:
    assert app.post(HOOK, json=_form()).status_code == 401  # no secret set yet
    _secret(app)
    assert app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": "nope"}).status_code == 401
    assert store._q("SELECT * FROM signups") == []
    old = _secret(app)
    _secret(app)  # rotated: the old one stops working
    assert app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": old}).status_code == 401


def test_a_flood_from_one_address_is_rate_limited(app: TestClient) -> None:
    secret = _secret(app)
    codes = [
        app.post(
            HOOK, json=_form(f"p{i}@flood.test"), headers={"X-AGN-Signup-Secret": secret}
        ).status_code
        for i in range(12)
    ]
    assert codes[:10] == [201] * 10
    assert codes[10:] == [429, 429]


def test_the_queue_lists_it_and_suspend_blocks_calls(app: TestClient, store: CloudStore) -> None:
    secret = _secret(app)
    app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": secret})
    q: dict[str, Any] = app.get("/api/owner/signups").json()
    assert q["secret_set_at"] is not None
    item = q["signups"][0]
    assert item["email"] == "new@lead.test"
    assert item["status"] == "trial"
    assert item["invited_at"]
    cid = item["company_id"]
    r = app.patch(f"/api/owner/companies/{cid}", json={"suspended": True}, headers=H)
    assert r.status_code == 200
    assert app.get("/api/owner/signups").json()["signups"][0]["status"] == "suspended"
    user = store._q("SELECT * FROM users WHERE email = 'new@lead.test'")[0]
    token = store.open_session(user, kind="app")
    r = app.post("/api/v1/calls/start", json={}, headers={"authorization": f"Bearer {token}"})
    assert r.status_code == 402  # plan_blocked: sign-in works, calls do not (R3)
    r = app.delete(f"/api/owner/companies/{cid}?confirm=Lead%20Co", headers=H)
    assert r.status_code == 200
    assert app.get("/api/owner/signups").json()["signups"] == []  # its personal data is gone too
    assert store._q("SELECT * FROM signups") == []
    assert app.get("/api/owner/signups").status_code == 200
    plain = TestClient(app.app, base_url=ORIGIN)
    assert plain.get("/api/owner/signups").status_code == 401


def test_platform_keys_reach_a_signup_only_after_the_owner_approves(
    app: TestClient, store: CloudStore, mailer: Mailer
) -> None:
    """Security review H1: a throwaway sign-up cannot read AGN's vendor keys off the bundle."""
    secret = _secret(app)
    groq = "gsk_" + "k" * 30
    app.put("/api/owner/keys/GROQ_API_KEY", json={"value": groq}, headers=H)
    app.put("/api/owner/keys/ASSEMBLYAI_API_KEY", json={"value": "aai-" + "k" * 20}, headers=H)
    app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": secret})
    token = next(w for w in mailer.sent[0].text.split() if "#token=" in w).split("#token=")[1]
    app.post("/api/v1/auth/reset/confirm", json={"token": token, "password": PASSWORD})
    tok = app.post(
        "/api/v1/auth/login", json={"email": "new@lead.test", "password": PASSWORD}
    ).json()["token"]
    auth = {"authorization": f"Bearer {tok}"}
    b = app.get("/api/v1/bundle", headers=auth).json()
    assert b["keys"] == {}
    assert b["key_status"] == {}
    assert groq not in app.get("/api/v1/bundle", headers=auth).text
    assert app.post("/api/v1/stt-token/assemblyai", headers=auth).status_code == 400
    item = app.get("/api/owner/signups").json()["signups"][0]
    assert item["approved_at"] is None
    r = app.post(f"/api/owner/signups/{item['id']}/approve", json={}, headers=H)
    assert r.status_code == 200
    assert r.json()["signups"][0]["approved_at"] is not None
    assert app.get("/api/v1/bundle", headers=auth).json()["keys"] == {"GROQ_API_KEY": groq}


def test_requests_without_the_secret_do_not_use_up_the_signup_budget(app: TestClient) -> None:
    secret = _secret(app)
    other = TestClient(app.app, base_url=ORIGIN, client=("198.51.100.7", 1234))
    codes = [
        other.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": "nope"}).status_code
        for _ in range(12)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]
    r = app.post(HOOK, json=_form(), headers={"X-AGN-Signup-Secret": secret})
    assert r.status_code == 201
