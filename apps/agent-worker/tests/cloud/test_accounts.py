"""Sign-up, log-in, devices, plans, usage and the call bundle (D-022)."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.passwords import hash_password, verify_password
from sotto_worker.cloud.store import DAY_MS, CloudStore, plan_state
from sotto_worker.server.vault import Vault
from tests.cloud.conftest import PASSWORD, SECRET, SignUp, minted

JSON = {"content-type": "application/json"}


def test_password_hash_round_trip_and_rejects_wrong() -> None:
    stored = hash_password("a-long-password")
    assert stored.startswith("scrypt$")
    assert verify_password("a-long-password", stored)
    assert not verify_password("a-long-passwore", stored)
    assert not verify_password("x", "garbage")


def test_signup_creates_a_trial_company_with_the_signer_as_admin(sign_up: SignUp) -> None:
    body = sign_up()
    assert body["user"]["role"] == "admin"
    company = body["company"]
    assert company["status"] == "trial"
    assert company["days_left"] == 14
    assert (company["seats"], company["minutes_month"], company["seats_used"]) == (3, 300, 1)
    assert company["can_call"] is True


def test_signup_rejects_weak_passwords_bad_emails_and_duplicates(
    client: TestClient, sign_up: SignUp
) -> None:
    def try_signup(**over: str) -> int:
        data = {"company": "B", "name": "B", "email": "b@b.test", "password": PASSWORD, **over}
        return client.post("/api/v1/auth/signup", json=data).status_code

    assert try_signup(password="x" * 5) == 400
    assert try_signup(email="not-an-email") == 400
    sign_up(email="dup@x.test")
    assert try_signup(email="DUP@x.test") == 409  # emails are case-insensitive


def test_login_logout_and_wrong_password(client: TestClient, sign_up: SignUp) -> None:
    sign_up()
    bad = client.post(
        "/api/v1/auth/login", json={"email": "admin@acme.test", "password": PASSWORD + "x"}
    )
    assert bad.status_code == 401
    ok = client.post(
        "/api/v1/auth/login",
        json={
            "email": "ADMIN@acme.test",
            "password": PASSWORD,
            "device": {"id": "phone", "platform": "ios"},
        },
    )
    assert ok.status_code == 200
    auth = {"authorization": f"Bearer {ok.json()['token']}"}
    assert client.get("/api/v1/me", headers=auth).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=auth).status_code == 200
    assert client.get("/api/v1/me", headers=auth).status_code == 401


def test_login_is_rate_limited(client: TestClient, sign_up: SignUp) -> None:
    sign_up()
    codes = [
        client.post(
            "/api/v1/auth/login", json={"email": "admin@acme.test", "password": "wrong-pass-1"}
        ).status_code
        for _ in range(12)
    ]
    assert codes[:10] == [401] * 10
    assert codes[-1] == 429


def test_revoking_a_device_signs_it_out(client: TestClient, sign_up: SignUp) -> None:
    web = sign_up()
    phone = client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@acme.test",
            "password": PASSWORD,
            "device": {"id": "p", "platform": "android", "label": "Pixel"},
        },
    ).json()
    phone_auth = {"authorization": f"Bearer {phone['token']}"}
    devices = client.get("/api/v1/devices", headers=web["auth"]).json()["devices"]
    assert {d["platform"] for d in devices} == {"web", "android"}
    pixel = next(d for d in devices if d["platform"] == "android")
    assert client.delete(f"/api/v1/devices/{pixel['id']}", headers=web["auth"]).status_code == 200
    assert client.get("/api/v1/me", headers=phone_auth).status_code == 401
    assert client.get("/api/v1/me", headers=web["auth"]).status_code == 200


def test_bundle_has_routes_prompts_playbook_and_keys_only_while_calls_are_allowed(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    s = sign_up()
    fake_key = "gsk_" + "x" * 24
    assert (
        client.put(
            "/api/v1/company/keys/GROQ_API_KEY", json={"value": fake_key}, headers=s["auth"]
        ).status_code
        == 200
    )
    b = client.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["v"] == 1
    assert b["stages"]["suggest"]["provider"] == "openai_compatible"
    assert "suggest" in b["prompts"]
    # A real account gets no demo data: no sample playbook, no scripted calls (D-024).
    assert not [e for e in b["playbook"] if e["sample"]]
    assert b["scenarios"] == []
    assert "viewing" not in b["company"]["call_goal"]
    assert b["keys"] == {"GROQ_API_KEY": fake_key}
    assert "GROQ_API_KEY" in b["key_status"]
    # Suspended: no keys, and starting a call is refused.
    company_id = s["company"]["id"]
    with store._tx() as db:  # the owner-only switch, set directly
        db.execute("UPDATE companies SET suspended = 1 WHERE id = ?", (company_id,))
    b = client.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["keys"] is None
    assert b["plan"]["status"] == "suspended"
    assert client.post("/api/v1/calls/start", headers=s["auth"]).status_code == 402


def test_keys_are_stored_encrypted_and_bound_to_their_company(
    sign_up: SignUp, client: TestClient, store: CloudStore
) -> None:
    s = sign_up()
    secret = "sk-test-" + "y" * 20
    client.put("/api/v1/company/keys/OPENAI_API_KEY", json={"value": secret}, headers=s["auth"])
    raw = store._q("SELECT ciphertext FROM company_keys")
    assert secret.encode() not in raw[0]["ciphertext"]


def test_stt_token_is_minted_with_the_company_key(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    assert client.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 400
    key = "aai-" + "z" * 20
    client.put("/api/v1/company/keys/ASSEMBLYAI_API_KEY", json={"value": key}, headers=s["auth"])
    r = client.post("/api/v1/stt-token/assemblyai", headers=s["auth"])
    assert r.status_code == 200
    assert r.json()["token"] == "tmp-" + "assemblyai"
    assert minted[-1] == ("assemblyai", key)
    assert client.post("/api/v1/stt-token/deepgram", headers=s["auth"]).status_code == 400


def test_usage_counts_minutes_and_blocks_calls_when_used_up(
    client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    now = int(time.time() * 1000)
    call = {
        "call_id": "c1",
        "started_at": now - 60_000,
        "duration_s": 301 * 60,
        "cards": 4,
        "playbook_cards": 2,
        "ai_cards": 1,
        "holding_lines": 1,
        "escalations": 1,
        "p50_ms": 600,
        "p95_ms": 1100,
        "stt_vendor": "assemblyai",
        "llm_vendor": "groq",
    }
    r = client.post("/api/v1/usage", json=call, headers={**s["auth"], "x-sotto-platform": "web"})
    assert r.status_code == 200
    # The same call reported twice counts once.
    client.post("/api/v1/usage", json=call, headers=s["auth"])
    me = client.get("/api/v1/me", headers=s["auth"]).json()["company"]
    assert me["minutes_used"] == 301
    assert me["can_call"] is False
    assert me["blocked_reason"] == "monthly minutes used up"
    bad = client.post(
        "/api/v1/usage", json={**call, "call_id": "c2", "cards": -1}, headers=s["auth"]
    )
    assert bad.status_code == 400


def test_plan_state_trial_expiry_and_paid_until() -> None:
    now = 10 * DAY_MS
    base = {
        "plan": "trial",
        "suspended": 0,
        "trial_ends_at": now + DAY_MS,
        "paid_until": None,
        "seats": 3,
        "minutes_month": 300,
    }
    assert plan_state(base, 0, now)["status"] == "trial"
    assert plan_state({**base, "trial_ends_at": now - 1}, 0, now)["status"] == "expired"
    active = {**base, "plan": "starter", "paid_until": now + 5 * DAY_MS}
    assert plan_state(active, 0, now) | {} == plan_state(active, 0, now)
    assert plan_state(active, 0, now)["days_left"] == 5
    assert plan_state({**active, "paid_until": now - 1}, 0, now)["status"] == "expired"


@pytest.mark.parametrize("role", ["manager", "agent"])
def test_invited_members_have_limited_rights(
    client: TestClient, sign_up: SignUp, role: str
) -> None:
    s = sign_up()
    r = client.post(
        "/api/v1/team",
        json={"email": f"{role}@acme.test", "name": role, "role": role},
        headers=s["auth"],
    )
    assert r.status_code == 201
    temp = r.json()["temporary_password"]
    login = client.post(
        "/api/v1/auth/login", json={"email": f"{role}@acme.test", "password": temp}
    ).json()
    assert login["user"]["must_change_password"] is True
    auth = {"authorization": f"Bearer {login['token']}"}
    # Nothing but the password change works until they choose their own password.
    assert client.get("/api/v1/bundle", headers=auth).status_code == 403
    changed = client.post(
        "/api/v1/auth/password", json={"current": temp, "new": PASSWORD + role}, headers=auth
    )
    assert changed.status_code == 200
    assert (
        client.put(
            "/api/v1/company/keys/GROQ_API_KEY", json={"value": "k" * 20}, headers=auth
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/v1/company/settings", json={"ai_answers_allowed": False}, headers=auth
        ).status_code
        == 403
    )
    playbook = client.post(
        "/api/v1/playbook", json={"question": "Q?", "answer": "A."}, headers=auth
    )
    assert playbook.status_code == (201 if role == "manager" else 403)
    # Everyone can raise an unanswered question; only managers and admins can read the inbox.
    assert (
        client.post("/api/v1/escalations", json={"question": "Pets?"}, headers=auth).status_code
        == 201
    )
    assert client.get("/api/v1/escalations", headers=auth).status_code == (
        200 if role == "manager" else 403
    )


def test_seats_are_enforced(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    for i in range(2):
        r = client.post(
            "/api/v1/team",
            json={"email": f"a{i}@acme.test", "name": "A", "role": "agent"},
            headers=s["auth"],
        )
        assert r.status_code == 201
    r = client.post(
        "/api/v1/team",
        json={"email": "a9@acme.test", "name": "A", "role": "agent"},
        headers=s["auth"],
    )
    assert r.status_code == 409
    assert r.json()["code"] == "no_seats"


def test_an_escalation_carries_the_excerpt_the_agent_and_the_call(
    client: TestClient, sign_up: SignUp
) -> None:
    """R2 step 4: the manager needs the conversation around the question, and who asked (T-034)."""
    s = sign_up()
    excerpt = "Customer: We have a cat.\nAgent: Lovely.\nCustomer: Do you allow pets?"
    r = client.post(
        "/api/v1/escalations",
        json={
            "question": "Do you allow pets?",
            "transcript_excerpt": "Agent: hello. " * 300 + excerpt,
            "call_id": "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c",
        },
        headers=s["auth"],
    )
    assert r.status_code == 201
    item = client.get("/api/v1/escalations", headers=s["auth"]).json()["items"][0]
    assert item["transcript_excerpt"].endswith(excerpt)  # the lines nearest the question
    assert len(item["transcript_excerpt"]) <= 2000
    assert item["call_id"] == "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c"
    me = client.get("/api/v1/me", headers=s["auth"]).json()["user"]
    assert item["agent_id"] == me["id"]
    assert item["agent_name"] == me["name"]


def test_an_older_database_gains_the_escalation_context_columns(tmp_path: Path) -> None:
    path = tmp_path / "old.db"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE escalations (id TEXT PRIMARY KEY, company_id TEXT NOT NULL,"
        " user_id TEXT NOT NULL, question TEXT NOT NULL, asked_at INTEGER NOT NULL,"
        " status TEXT NOT NULL DEFAULT 'open', answer TEXT, updated_at INTEGER NOT NULL);"
    )
    db.close()
    CloudStore(path, Vault(SECRET)).close()
    cols = {r[1] for r in sqlite3.connect(path).execute("PRAGMA table_info(escalations)")}
    assert {"transcript_excerpt", "call_id"} <= cols


def test_escalation_answer_added_to_playbook_reaches_the_bundle(
    client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    item = client.post(
        "/api/v1/escalations", json={"question": "Do you allow pets?"}, headers=s["auth"]
    ).json()["id"]
    r = client.post(
        f"/api/v1/escalations/{item}/answer",
        json={"answer": "Yes, up to two pets per unit.", "add_to_playbook": True},
        headers=s["auth"],
    )
    assert r.status_code == 200
    items = client.get("/api/v1/escalations", headers=s["auth"]).json()["items"]
    assert items[0]["status"] == "added"
    bundle = client.get("/api/v1/bundle", headers=s["auth"]).json()
    own = [e for e in bundle["playbook"] if not e["sample"]]
    assert own[0]["question"] == "Do you allow pets?"


def test_routes_are_validated_against_the_catalog(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    ok = client.put(
        "/api/v1/company/routes/suggest",
        json={"provider": "gemini", "model": "gemini-2.5-flash"},
        headers=s["auth"],
    )
    assert ok.status_code == 200
    stage = client.get("/api/v1/bundle", headers=s["auth"]).json()["stages"]["suggest"]
    assert stage["api_key_env"] == "GEMINI_API_KEY"
    assert stage["first_token_ms"] == 1150  # D-025
    wrong_kind = client.put(
        "/api/v1/company/routes/suggest",
        json={"provider": "deepgram", "model": "nova-3"},
        headers=s["auth"],
    )
    assert wrong_kind.status_code == 400


def test_speech_vendors_the_app_cannot_run_are_refused(client: TestClient, sign_up: SignUp) -> None:
    """Picking Deepgram used to pass the key test and then leave calls with no speech-to-text."""
    s = sign_up()
    for stage in ("stt", "stt_backup"):
        for vendor, model in (("deepgram", "nova-3"), ("elevenlabs", "scribe_v2_realtime")):
            r = client.put(
                f"/api/v1/company/routes/{stage}",
                json={"provider": vendor, "model": model},
                headers=s["auth"],
            )
            assert r.status_code == 400, (stage, vendor)
            assert "not available in the app" in r.json()["error"]
    ok = client.put(
        "/api/v1/company/routes/stt",
        json={"provider": "speechmatics", "model": "enhanced"},
        headers=s["auth"],
    )
    assert ok.status_code == 200
    providers = client.get("/api/v1/bundle", headers=s["auth"]).json()["providers"]
    assert providers["deepgram"]["client"] is False
    assert providers["elevenlabs"]["client"] is False
    assert providers["assemblyai"]["client"] is True
    assert providers["groq"]["client"] is True


def test_cors_preflight_and_headers_on_the_app_api(client: TestClient) -> None:
    r = client.options(
        "/api/v1/me", headers={"origin": "app://sotto", "access-control-request-method": "GET"}
    )
    assert r.status_code == 204
    assert r.headers["access-control-allow-origin"] == "*"
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
    assert client.get("/healthz").headers["x-content-type-options"] == "nosniff"
    assert "access-control-allow-origin" not in client.get("/api/owner/me").headers


def test_oversized_bodies_are_refused(client: TestClient) -> None:
    r = client.post("/api/v1/auth/signup", content=b"{" + b" " * 20_000 + b"}", headers=JSON)
    assert r.status_code == 413
