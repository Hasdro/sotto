"""Regression tests for the security review of the management server (2026-10-20, T-017)."""

from __future__ import annotations

import time
from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.byo import own_key
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, PASSWORD, SignUp


def _login(client: TestClient, email: str, password: str = PASSWORD, dev: str = "d") -> Any:
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "device": {"id": dev, "platform": "web"}},
    )


def test_h1_devices_get_only_the_model_keys_their_calls_use(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    for env in ("GROQ_API_KEY", "OPENAI_API_KEY", "ASSEMBLYAI_API_KEY"):
        own_key(store, s, env, env.lower() + "-" + "v" * 12)
    keys = client.get("/api/v1/bundle", headers=s["auth"]).json()["keys"]
    assert set(keys) == {"GROQ_API_KEY"}  # routes use Groq (+ Gemini, not set); never STT keys
    status = client.get("/api/v1/bundle", headers=s["auth"]).json()["key_status"]
    assert "ASSEMBLYAI_API_KEY" in status  # the app still knows speech is set up
    assert client.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 200
    actions = [a["action"] for a in store.owner_audit(s["company"]["id"])]
    assert "keys.delivered" in actions


def test_m2_re_enabling_a_user_needs_a_free_seat(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    ids = [
        client.post(
            "/api/v1/team",
            json={"email": f"u{i}@acme.test", "name": "U", "role": "agent"},
            headers=s["auth"],
        ).json()["id"]
        for i in range(2)
    ]
    client.patch(f"/api/v1/team/{ids[0]}", json={"active": False}, headers=s["auth"])
    r = client.post(
        "/api/v1/team",
        json={"email": "u9@acme.test", "name": "U", "role": "agent"},
        headers=s["auth"],
    )
    assert r.status_code == 201  # the freed seat is reused
    back = client.patch(f"/api/v1/team/{ids[0]}", json={"active": True}, headers=s["auth"])
    assert back.status_code == 409
    assert back.json()["code"] == "no_seats"


def test_m3_only_failed_sign_ins_count_and_the_owner_has_its_own_limit(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    sign_up()
    for _ in range(15):  # successful sign-ins never lock anyone out
        assert _login(client, "admin@acme.test").status_code == 200
    for _ in range(10):
        _login(client, "admin@acme.test", PASSWORD + "x")
    assert _login(client, "admin@acme.test").status_code == 429
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    owner = client.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"origin": ORIGIN},
    )
    assert owner.status_code == 200


def test_m4_one_companys_call_ids_cannot_hide_anothers(client: TestClient, sign_up: SignUp) -> None:
    a = sign_up("A", "a@a.test")
    b = sign_up("B", "b@b.test")
    call = {
        "call_id": "same",
        "started_at": int(time.time() * 1000) - 60_000,
        "duration_s": 120,
        "cards": 0,
        "playbook_cards": 0,
        "ai_cards": 0,
        "holding_lines": 0,
        "escalations": 0,
    }
    client.post("/api/v1/usage", json=call, headers=b["auth"])
    client.post("/api/v1/usage", json=call, headers=a["auth"])
    for s in (a, b):
        assert client.get("/api/v1/me", headers=s["auth"]).json()["company"]["minutes_used"] == 2


def test_l2_changing_the_password_signs_out_other_devices(
    client: TestClient, sign_up: SignUp
) -> None:
    web = sign_up()
    phone = {
        "authorization": f"Bearer {_login(client, 'admin@acme.test', dev='p').json()['token']}"
    }
    r = client.post(
        "/api/v1/auth/password",
        json={"current": PASSWORD, "new": PASSWORD + "2"},
        headers=web["auth"],
    )
    assert r.status_code == 200
    assert client.get("/api/v1/me", headers=phone).status_code == 401
    assert client.get("/api/v1/me", headers=web["auth"]).status_code == 200
    for _ in range(5):
        client.post(
            "/api/v1/auth/password",
            json={"current": "wrong-guess-1", "new": PASSWORD},
            headers=web["auth"],
        )
    limited = client.post(
        "/api/v1/auth/password", json={"current": "x", "new": "y"}, headers=web["auth"]
    )
    assert limited.status_code == 429


def test_m1_the_owner_console_lives_on_its_own_origin(store: CloudStore, seed: Seed) -> None:
    owner_origin = "https://owner.cloud.example.com"
    config = CloudConfig(public_origin=ORIGIN, owner_origin=owner_origin, static_dir=None)
    app = create_cloud_app(config, store, seed)
    on_app = TestClient(app, base_url=ORIGIN)
    on_owner = TestClient(app, base_url=owner_origin)
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    creds = {"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    assert on_app.get("/owner").status_code == 404
    assert (
        on_app.post("/api/owner/login", json=creds, headers={"origin": ORIGIN}).status_code == 404
    )
    assert on_owner.get("/owner").status_code == 200
    assert on_owner.get("/").status_code == 404  # the app itself is not served there
    wrong = on_owner.post("/api/owner/login", json=creds, headers={"origin": ORIGIN})
    assert wrong.status_code == 403
    ok = on_owner.post("/api/owner/login", json=creds, headers={"origin": owner_origin})
    assert ok.status_code == 200


def test_m4_reported_minutes_cannot_exceed_the_servers_own_clock(
    client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    assert (
        client.post("/api/v1/calls/start", json={"call_id": "c-1"}, headers=s["auth"]).status_code
        == 200
    )
    now = int(time.time() * 1000)
    call = {
        "call_id": "c-1",
        "started_at": now - 3_600_000,
        "duration_s": 3600,
        "cards": 0,
        "playbook_cards": 0,
        "ai_cards": 0,
        "holding_lines": 0,
        "escalations": 0,
    }
    client.post("/api/v1/usage", json=call, headers=s["auth"])
    # The call began on the server a moment ago: at most ~30 s count, not the claimed hour.
    assert client.get("/api/v1/me", headers=s["auth"]).json()["company"]["minutes_used"] == 1
