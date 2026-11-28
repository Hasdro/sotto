"""Slice 3B server tests: UX-012-server (Inbox dismiss) and PROD-004 / SAFE-001
(per-call Zoho contact storage, retrieval, rename, and tenancy isolation)."""

from __future__ import annotations

import time

from starlette.testclient import TestClient

from tests.cloud.conftest import SignUp


def test_inbox_dismiss_escalation_and_tenancy_isolation(
    client: TestClient, sign_up: SignUp
) -> None:
    s1 = sign_up("Alpha", "admin@alpha.test")
    s2 = sign_up("Beta", "admin@beta.test")

    created = client.post(
        "/api/v1/escalations",
        json={"question": "uh background noise", "transcript_excerpt": "Customer: uh"},
        headers=s1["auth"],
    )
    assert created.status_code == 201
    eid = created.json()["id"]

    # Another company cannot dismiss Alpha's escalation (RLS/tenancy isolation).
    assert (
        client.post(f"/api/v1/escalations/{eid}/dismiss", json={}, headers=s2["auth"]).status_code
        == 404
    )

    # Alpha admin dismisses it cleanly.
    r = client.post(f"/api/v1/escalations/{eid}/dismiss", json={}, headers=s1["auth"])
    assert r.status_code == 200
    items = client.get("/api/v1/escalations", headers=s1["auth"]).json()["items"]
    assert next(i for i in items if i["id"] == eid)["status"] == "dismissed"


def test_per_call_zoho_contact_storage_isolation_and_rename(
    client: TestClient, sign_up: SignUp
) -> None:
    """PROD-004 / SAFE-001: each call stores its own contact record and never leaks to another."""
    s1 = sign_up("Sales Co", "admin@sales.test")
    s2 = sign_up("Other Co", "admin@other.test")
    now = int(time.time() * 1000)

    # Call 1 reported with Contact A
    r1 = client.post(
        "/api/v1/usage",
        json={
            "call_id": "call-a",
            "started_at": now - 60_000,
            "duration_s": 90,
            "cards": 2,
            "playbook_cards": 1,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 0,
            "title": "Intro with Alice",
            "contact": {
                "name": "Alice Buyer",
                "email": "alice@buyer.test",
                "phone": "+971500000001",
                "company": "Buyer LLC",
                "zoho_module": "Contacts",
                "zoho_id": "zc-101",
            },
        },
        headers=s1["auth"],
    )
    assert r1.status_code == 200

    # Call 2 reported with Contact B
    r2 = client.post(
        "/api/v1/usage",
        json={
            "call_id": "call-b",
            "started_at": now - 10_000,
            "duration_s": 60,
            "cards": 1,
            "playbook_cards": 0,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 0,
            "contact": {
                "name": "Bob Prospect",
                "email": "bob@prospect.test",
                "zoho_module": "Leads",
                "zoho_id": "zl-202",
            },
        },
        headers=s1["auth"],
    )
    assert r2.status_code == 200

    # Each call returns strictly its own contact.
    ca = client.get("/api/v1/calls/call-a/contact", headers=s1["auth"]).json()["contact"]
    cb = client.get("/api/v1/calls/call-b/contact", headers=s1["auth"]).json()["contact"]
    assert ca["email"] == "alice@buyer.test"
    assert cb["email"] == "bob@prospect.test"

    # Cross-company read/write is rejected with 404.
    assert client.get("/api/v1/calls/call-a/contact", headers=s2["auth"]).status_code == 404
    assert (
        client.put(
            "/api/v1/calls/call-a/contact",
            json={"name": "Intruder"},
            headers=s2["auth"],
        ).status_code
        == 404
    )

    # PATCH call title + contact updates cleanly and appears in /api/v1/company/usage.
    p = client.patch(
        "/api/v1/calls/call-a",
        json={"title": "Renamed Alice Call"},
        headers=s1["auth"],
    )
    assert p.status_code == 200
    calls = client.get("/api/v1/company/usage", headers=s1["auth"]).json()["calls"]
    row_a = next(c for c in calls if c["id"].endswith(":call-a"))
    assert row_a["title"] == "Renamed Alice Call"
    assert row_a["contact"]["zoho_id"] == "zc-101"
