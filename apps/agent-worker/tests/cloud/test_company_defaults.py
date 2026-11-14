"""ZC-11 (data part of draft D-044 (backlog) / DD-4, A4, B9): company defaults — record-calls
policy, consent
record, vendor allow-list, derived manager. Admin-only writes, audited, company-scoped."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import PASSWORD, SignUp


def member(client: TestClient, admin: dict[str, str], role: str, email: str) -> dict[str, str]:
    r = client.post(
        "/api/v1/team", json={"email": email, "name": role, "role": role}, headers=admin
    )
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    token = client.post("/api/v1/auth/login", json={"email": email, "password": temp}).json()[
        "token"
    ]
    auth = {"authorization": f"Bearer {token}"}
    r = client.post(
        "/api/v1/auth/password", json={"current": temp, "new": PASSWORD + role}, headers=auth
    )
    assert r.status_code == 200
    return auth


def put(client: TestClient, auth: dict[str, str], body: dict[str, Any]) -> Any:
    return client.put("/api/v1/company/defaults", json=body, headers=auth)


def test_admin_sets_and_reads_all_defaults(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up()["auth"]
    r = put(
        client,
        a,
        {
            "record_calls": "on",
            "consent": {"choice": "primary_only", "text_version": "2026-11"},
            "vendor_allow_list": ["openai", "deepgram", "openai"],
        },
    )
    assert r.status_code == 200, r.text
    out = client.get("/api/v1/company/defaults", headers=a).json()
    assert out["record_calls"] == "on"
    assert out["vendor_allow_list"] == ["deepgram", "openai"]
    consent = out["consent"]
    assert consent["choice"] == "primary_only"
    assert consent["text_version"] == "2026-11"
    admin_id = store._q("SELECT id FROM users WHERE email = 'admin@acme.test'")[0]["id"]
    assert consent["accepted_by"] == admin_id
    assert consent["accepted_at"] > 0
    assert "agent_context" not in out  # D-062: a platform default, not a company setting


def test_defaults_start_as_before(client: TestClient, sign_up: SignUp) -> None:
    out = client.get("/api/v1/company/defaults", headers=sign_up()["auth"]).json()
    assert out["record_calls"] == "agent_choice"
    assert out["consent"] is None
    assert out["vendor_allow_list"] == []


def test_each_change_is_audited(client: TestClient, sign_up: SignUp, store: CloudStore) -> None:
    a = sign_up()["auth"]
    put(client, a, {"record_calls": "off"})
    put(client, a, {"consent": {"choice": "all", "text_version": "v1"}, "record_calls": "on"})
    rows = store._q("SELECT action, detail FROM audit WHERE action LIKE 'defaults.%' ORDER BY id")
    assert [(r["action"], r["detail"]) for r in rows] == [
        ("defaults.record_calls", "off"),
        ("defaults.consent", "all vv1"),
        ("defaults.record_calls", "on"),
    ]


def test_agents_and_managers_cannot_put_and_read_only_record_calls(
    client: TestClient, sign_up: SignUp
) -> None:
    a = sign_up()["auth"]
    put(client, a, {"record_calls": "on", "vendor_allow_list": ["openai"]})
    for role in ("agent", "manager"):
        auth = member(client, a, role, f"{role}@acme.test")
        assert put(client, auth, {"record_calls": "off"}).status_code == 403
        assert client.get("/api/v1/company/defaults", headers=auth).json() == {"record_calls": "on"}


def test_bad_values_are_refused(client: TestClient, sign_up: SignUp) -> None:
    a = sign_up()["auth"]
    for body in (
        {"record_calls": "sometimes"},
        {"consent": {"choice": "everything", "text_version": "v1"}},
        {"consent": {"choice": "all"}},
        {"consent": {"choice": "all", "text_version": "v1", "accepted_by": "someone-else"}},
        {"vendor_allow_list": "openai"},
        {"vendor_allow_list": ["Open AI!"]},
        {"vendor_allow_list": [f"v{i}" for i in range(31)]},
        {"legal_text": "..."},
    ):
        assert put(client, a, body).status_code == 400, body


def test_manager_is_derived_from_roles(client: TestClient, sign_up: SignUp) -> None:
    a = sign_up()["auth"]
    out = client.get("/api/v1/company/defaults", headers=a).json()
    assert out["manager"] == {"emails": ["admin@acme.test"], "source": "admins"}
    member(client, a, "manager", "boss@acme.test")
    out = client.get("/api/v1/company/defaults", headers=a).json()
    assert out["manager"] == {"emails": ["boss@acme.test"], "source": "managers"}
    client.put("/api/v1/company/settings", json={"manager_email": "sales@acme.test"}, headers=a)
    out = client.get("/api/v1/company/defaults", headers=a).json()
    assert out["manager"] == {"emails": ["sales@acme.test"], "source": "setting"}


def test_company_a_cannot_read_or_write_b(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Acme", "admin@acme.test")["auth"]
    b = sign_up("Beta", "admin@beta.test", id="dev-2")["auth"]
    put(client, a, {"record_calls": "on", "vendor_allow_list": ["openai"]})
    put(client, b, {"record_calls": "off"})
    assert client.get("/api/v1/company/defaults", headers=a).json()["record_calls"] == "on"
    out_b = client.get("/api/v1/company/defaults", headers=b).json()
    assert out_b["record_calls"] == "off"
    assert out_b["vendor_allow_list"] == []
    assert out_b["manager"]["emails"] == ["admin@beta.test"]
    companies = {r["company_id"] for r in store._q("SELECT company_id FROM company_defaults")}
    assert len(companies) == 2


def test_tone_and_goal_are_saved_and_reach_the_next_bundle(
    client: TestClient, sign_up: SignUp
) -> None:
    """ZC-11c: the admin's tone and call goal replace the seed's in the call bundle."""
    a = sign_up()["auth"]
    seed_company = client.get("/api/v1/bundle", headers=a).json()["company"]
    assert "tone" not in client.get("/api/v1/company/defaults", headers=a).json()
    r = put(client, a, {"tone": "  Warm and brief ", "call_goal": "Book a demo"})
    assert r.status_code == 200, r.text
    assert r.json()["tone"] == "Warm and brief"
    assert r.json()["call_goal"] == "Book a demo"
    company = client.get("/api/v1/bundle", headers=a).json()["company"]
    assert company["tone"] == "Warm and brief"
    assert company["call_goal"] == "Book a demo"
    assert company["agent_context"] is seed_company["agent_context"] is True
    assert put(client, a, {"tone": "x" * 301}).status_code == 400
    assert put(client, a, {"call_goal": 5}).status_code == 400


def test_the_retired_agent_context_setting_is_ignored(client: TestClient, sign_up: SignUp) -> None:
    """D-062: an older app may still send it; it is accepted, not stored, and changes nothing."""
    a = sign_up()["auth"]
    r = client.put("/api/v1/company/settings", json={"agent_context": False}, headers=a)
    assert r.status_code == 200, r.text
    settings = client.get("/api/v1/company/settings", headers=a).json()["settings"]
    assert "agent_context" not in settings
    assert client.get("/api/v1/bundle", headers=a).json()["company"]["agent_context"] is True


def test_the_bundle_ships_the_practice_script(client: TestClient, sign_up: SignUp) -> None:
    """D-073: one neutral practice script for every account, without the replay's expectations."""
    practice = client.get("/api/v1/bundle", headers=sign_up()["auth"]).json()["practice"]
    assert practice["id"] == "practice"
    assert practice["lines"]
    assert all("expect" not in line for line in practice["lines"])
    assert {line["speaker"] for line in practice["lines"]} == {"agent", "customer"}
