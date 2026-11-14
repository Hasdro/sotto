"""Tenant isolation through every company-scoped route (D-022 replaces RLS on this server with
one data-access module + these tests): company B can never read or change company A's rows."""

from __future__ import annotations

from typing import Any

from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from tests.cloud.byo import allow_byo
from tests.cloud.conftest import SignUp


def _seed_company_a(client: TestClient, a: dict[str, Any]) -> dict[str, str]:
    h = a["auth"]
    client.put("/api/v1/company/keys/GROQ_API_KEY", json={"value": "gsk_" + "a" * 24}, headers=h)
    client.put("/api/v1/company/settings", json={"ai_answers_allowed": False}, headers=h)
    entry = client.post(
        "/api/v1/playbook", json={"question": "A secret?", "answer": "A only."}, headers=h
    ).json()["id"]
    esc = client.post("/api/v1/escalations", json={"question": "A question?"}, headers=h).json()[
        "id"
    ]
    member = client.post(
        "/api/v1/team", json={"email": "agent@a.test", "name": "Ag", "role": "agent"}, headers=h
    ).json()["id"]
    client.post(
        "/api/v1/usage",
        json={
            "call_id": "a-call",
            "started_at": 1,
            "duration_s": 60,
            "cards": 1,
            "playbook_cards": 1,
            "ai_cards": 0,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=h,
    )
    device = client.get("/api/v1/devices", headers=h).json()["devices"][0]["id"]
    return {"entry": entry, "escalation": esc, "member": member, "device": device}


def test_company_b_cannot_read_or_change_company_a(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha", "admin@a.test")
    allow_byo(store, a)  # A brings its own key (D-059 BYO): it must still never reach B
    b = sign_up("Beta", "admin@b.test")
    ids = _seed_company_a(client, a)
    hb = b["auth"]

    bundle = client.get("/api/v1/bundle", headers=hb).json()
    assert bundle["keys"] in ({}, None)
    own = [e["question"] for e in bundle["playbook"] if not e["sample"]]
    assert "A secret?" not in own  # B sees only its own entries: the two examples it started with
    assert len(own) == 2
    assert bundle["company"]["ai_answers_allowed"] is True  # A's setting did not leak
    b_entries = client.get("/api/v1/playbook", headers=hb).json()["entries"]
    assert [e for e in b_entries if "example" not in e["tags"]] == []
    assert client.get("/api/v1/escalations", headers=hb).json()["items"] == []
    assert [u["email"] for u in client.get("/api/v1/team", headers=hb).json()["users"]] == [
        "admin@b.test"
    ]
    assert client.get("/api/v1/company/usage", headers=hb).json()["calls"] == []
    assert all(
        d["id"] != ids["device"]
        for d in client.get("/api/v1/devices?all=1", headers=hb).json()["devices"]
    )

    # Writes aimed at A's rows fail as "not found" and change nothing.
    assert (
        client.put(
            f"/api/v1/playbook/{ids['entry']}", json={"question": "x?", "answer": "y"}, headers=hb
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/playbook/{ids['entry']}", headers=hb).status_code == 404
    assert (
        client.post(
            f"/api/v1/escalations/{ids['escalation']}/answer", json={"answer": "z"}, headers=hb
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/team/{ids['member']}", json={"active": False}, headers=hb
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/devices/{ids['device']}", headers=hb).status_code == 404

    ha = a["auth"]
    assert (
        client.get("/api/v1/playbook", headers=ha).json()["entries"][0]["question"] == "A secret?"
    )
    assert client.get("/api/v1/escalations", headers=ha).json()["items"][0]["status"] == "open"
    assert client.get("/api/v1/me", headers=ha).status_code == 200  # A's device still signed in
    assert client.get("/api/v1/bundle", headers=ha).json()["keys"] == {
        "GROQ_API_KEY": "gsk_" + "a" * 24
    }
