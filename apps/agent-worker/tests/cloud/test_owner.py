"""The owner console API (D-022): only the owner cookie gets in; every tool works and is logged."""

from __future__ import annotations

from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, PASSWORD, SignUp

SAME = {"origin": ORIGIN}


def test_owner_api_needs_the_owner_session(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    assert client.get("/api/owner/stats").status_code == 401
    s = sign_up()
    # An admin's bearer token does not open the owner API; the owner cannot use the app login.
    assert client.get("/api/owner/stats", headers=s["auth"]).status_code == 401
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    r = client.post("/api/v1/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert r.status_code == 401
    wrong_origin = client.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"origin": "https://evil.test"},
    )
    assert wrong_origin.status_code == 403


def test_owner_sees_stats_and_manages_a_company(
    owner: TestClient, client: TestClient, sign_up: SignUp
) -> None:
    s = sign_up("Gamma", "admin@g.test")
    client.post(
        "/api/v1/usage",
        json={
            "call_id": "g1",
            "started_at": 1_800_000_000_000,
            "duration_s": 120,
            "cards": 3,
            "playbook_cards": 1,
            "ai_cards": 1,
            "holding_lines": 1,
            "escalations": 1,
            "p95_ms": 900,
        },
        headers=s["auth"],
    )
    stats = owner.get("/api/owner/stats").json()
    assert stats["companies"] == 1
    assert stats["users"] == 1
    assert stats["devices"] == 1
    assert stats["by_status"] == {"trial": 1}
    company_id = s["company"]["id"]
    detail = owner.get(f"/api/owner/companies/{company_id}").json()
    assert detail["users"][0]["email"] == "admin@g.test"

    # Mutations need the right origin and JSON.
    assert (
        owner.patch(
            f"/api/owner/companies/{company_id}",
            json={"seats": 9},
            headers={"origin": "https://x.test"},
        ).status_code
        == 403
    )
    r = owner.patch(
        f"/api/owner/companies/{company_id}",
        json={"plan": "starter", "extend_days": 30},
        headers=SAME,
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["plan"], body["status"], body["seats"], body["minutes_month"]) == (
        "starter",
        "active",
        5,
        2000,
    )
    assert body["days_left"] == 30
    r = owner.patch(f"/api/owner/companies/{company_id}", json={"suspended": True}, headers=SAME)
    assert r.json()["status"] == "suspended"
    assert client.post("/api/v1/calls/start", headers=s["auth"]).status_code == 402

    # Reset a password: old one stops working, sessions end, the new one must be changed.
    user_id = detail["users"][0]["id"]
    temp = owner.post(f"/api/owner/users/{user_id}/reset", json={}, headers=SAME).json()[
        "temporary_password"
    ]
    assert client.get("/api/v1/me", headers=s["auth"]).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "admin@g.test", "password": PASSWORD}
        ).status_code
        == 401
    )
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@g.test", "password": temp}
    ).json()
    assert login["user"]["must_change_password"] is True

    audit = owner.get("/api/owner/audit").json()["items"]
    actions = [a["action"] for a in audit]
    assert "owner.company.changed" in actions
    assert "owner.password.reset" in actions


def test_owner_creates_and_deletes_a_company(owner: TestClient, client: TestClient) -> None:
    r = owner.post(
        "/api/owner/companies",
        json={"name": "Delta", "admin_name": "Di", "admin_email": "di@d.test", "plan": "team"},
        headers=SAME,
    )
    assert r.status_code == 201
    company_id, temp = r.json()["id"], r.json()["temporary_password"]
    assert (
        client.post("/api/v1/auth/login", json={"email": "di@d.test", "password": temp}).status_code
        == 200
    )
    assert (
        owner.delete(f"/api/owner/companies/{company_id}?confirm=wrong", headers=SAME).status_code
        == 400
    )
    assert (
        owner.delete(f"/api/owner/companies/{company_id}?confirm=Delta", headers=SAME).status_code
        == 200
    )
    assert owner.get("/api/owner/companies").json()["companies"] == []
    assert (
        client.post("/api/v1/auth/login", json={"email": "di@d.test", "password": temp}).status_code
        == 401
    )


def test_owner_page_is_served_with_a_strict_policy(client: TestClient) -> None:
    page = client.get("/owner")
    assert page.status_code == 200
    assert "<title>AGN Sales Shield · Owner</title>" in page.text
    assert "Sotto" not in page.text
    assert "Sotto" not in client.get("/owner/owner.js").text
    assert "script-src 'self'" in page.headers["content-security-policy"]
    assert client.get("/owner/owner.js").status_code == 200
    assert client.get("/owner/secret.txt").status_code == 404


def test_owner_kill_switch_is_a_status_table_with_a_confirmed_destructive_action(
    client: TestClient,
) -> None:
    """UX-33: the page ships a status table, a confirm dialog and the two button labels; the
    server side (audit row per kill, D-028) is covered in test_features."""
    page = client.get("/owner").text
    assert '<table id="kills"' in page
    assert 'id="killDialog"' in page
    js = client.get("/owner/owner.js").text
    for text in ("Turn off for everyone", "Turn back on", "Killed since", "Live"):
        assert text in js, text
    kill = js[js.index("async function setKill") :].split("async function setEntitled")[0]
    assert "await confirmKill(f)" in kill  # turning off waits for the dialog
