"""Slice 3A server tests: UX-002-server, FUNC-001-server, UX-016, UX-017,
FUNC-004-server, and FUNC-003-server."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from starlette.testclient import TestClient

from sotto_worker.cloud.coach import CoachStore
from sotto_worker.cloud.coach.morning_brief import generate_morning_brief
from sotto_worker.cloud.store import CloudStore, Principal
from tests.cloud.conftest import ORIGIN, SignUp

SAME = {"origin": ORIGIN}


def test_morning_brief_filters_meetings_to_local_day(store: CloudStore, sign_up: SignUp) -> None:
    """UX-002-server: future meetings must never be labelled Today's meetings."""
    s = sign_up("Brief Co", "admin@brief.test")
    who = Principal(
        user_id=s["user"]["id"],
        company_id=s["company"]["id"],
        role="admin",
        device_id=None,
        email=s["user"]["email"],
        name=s["user"]["name"],
    )
    coach = CoachStore(store)
    # 2026-11-28 08:30 Asia/Dubai (+04:00) = 2026-11-28 04:30 UTC
    now = int(datetime(2026, 11, 28, 4, 30, tzinfo=UTC).timestamp() * 1000)
    coach.set_morning_brief_prefs(who, enabled=True, timezone_offset_min=240)

    future_only = [
        {"title": "Monday Demo", "start": "2026-11-30T11:00:00+04:00"},
    ]
    saved = asyncio.run(generate_morning_brief(coach, who, meetings=future_only, now=now))
    content = saved["content"]
    assert content["day"] == "2026-11-28"
    assert content["has_zoho_meetings"] is False
    assert content["meetings"] == []
    assert content["next_meeting"]["title"] == "Monday Demo"
    assert "Today's meetings" not in content["summary_text"]
    assert "No meetings today" in content["summary_text"]

    mixed = [
        {"title": "Today Sync", "start": "2026-11-28T14:00:00+04:00"},
        {"title": "Monday Demo", "start": "2026-11-30T11:00:00+04:00"},
    ]
    saved2 = asyncio.run(generate_morning_brief(coach, who, meetings=mixed, now=now))
    c2 = saved2["content"]
    assert c2["has_zoho_meetings"] is True
    assert [m["title"] for m in c2["meetings"]] == ["Today Sync"]
    assert "Today's meetings (1): Today Sync" in c2["summary_text"]
    assert "Monday Demo" not in c2["summary_text"]


def test_v1_health_endpoint_cors_and_stage_readiness(
    owner: TestClient, client: TestClient, sign_up: SignUp
) -> None:
    """FUNC-001-server: authenticated tenant health check with CORS and stage readiness."""
    s = sign_up("Health Co", "admin@health.test")
    r0 = client.get("/api/v1/health", headers=s["auth"])
    assert r0.status_code == 200
    assert r0.headers.get("access-control-allow-origin") == "*"
    body0 = r0.json()
    assert body0["ok"] is True
    assert body0["stages"]["suggest"]["ready"] is False
    assert "GROQ_API_KEY" not in r0.text

    # Save platform Groq key -> suggest becomes ready without exposing the key.
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": "gsk_" + "x" * 24}, headers=SAME)
    r1 = client.get("/api/v1/health", headers=s["auth"])
    assert r1.status_code == 200
    assert r1.json()["stages"]["suggest"]["ready"] is True
    assert "gsk_" not in r1.text


def test_devices_include_user_and_os_label_and_audit_filters_noise(
    owner: TestClient, client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    """UX-016 & UX-017: devices expose user/os_label; audit hides keys.delivered and zoho.read."""
    s = sign_up("Audit Co", "admin@audit.test", platform="mac", label="Hasan-MBP")
    devs = client.get("/api/v1/devices?all=1", headers=s["auth"]).json()["devices"]
    assert len(devs) == 1
    assert devs[0]["user"] == {"email": "admin@audit.test", "name": "Ada Admin"}
    assert devs[0]["os_label"] == "macOS"
    assert devs[0]["hostname"] == "Hasan-MBP"

    # Trigger keys.delivered and zoho.read audit rows + a real settings change.
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": "gsk_" + "y" * 24}, headers=SAME)
    client.get("/api/v1/bundle", headers=s["auth"])
    with store._tx() as db:
        store.audit(db, "zoho.read", "lookup", company_id=s["company"]["id"])
    client.put("/api/v1/company/settings", json={"card_language": "en"}, headers=s["auth"])

    default_audit = client.get("/api/v1/audit", headers=s["auth"]).json()["items"]
    actions = [a["action"] for a in default_audit]
    assert "settings" in actions
    assert "keys.delivered" not in actions
    assert "zoho.read" not in actions

    full_audit = client.get("/api/v1/audit?include_system=1", headers=s["auth"]).json()["items"]
    full_actions = [a["action"] for a in full_audit]
    assert "keys.delivered" in full_actions
    assert "zoho.read" in full_actions


def test_team_last_active_and_bug_reports_owner_only(client: TestClient, sign_up: SignUp) -> None:
    """FUNC-004 & FUNC-003: team exposes last_active_at; bug reports stay owner-only."""
    s = sign_up("Team Co", "admin@team.test")
    users = client.get("/api/v1/team", headers=s["auth"]).json()["users"]
    assert len(users) == 1
    assert "last_active_at" in users[0]
    assert users[0]["last_active_at"] == users[0]["last_seen_at"]

    # Tenant admin cannot list owner bug reports (401) and GET /api/v1/bug-reports returns 403.
    assert client.get("/api/owner/bug-reports", headers=s["auth"]).status_code == 401
    assert client.get("/api/v1/bug-reports", headers=s["auth"]).status_code == 403
