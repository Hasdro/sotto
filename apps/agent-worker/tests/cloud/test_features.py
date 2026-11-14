"""Feature flags (R7, D-028, D-036): five states, server enforcement on every feature route, the
owner's entitlement matrix and kill switch, Admin → Features, audit, and tenant isolation."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud import features
from sotto_worker.cloud.features import Feature, Layers, evaluate
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, PASSWORD, SignUp

NONE = Layers(frozenset(), frozenset(), frozenset(), frozenset())
JSON_ORIGIN = {"origin": ORIGIN}


def layers(**kw: set[str]) -> Layers:
    base: dict[str, set[str]] = {
        "killed": set(),
        "not_entitled": set(),
        "org_off": set(),
        "connections": set(),
    }
    base.update(kw)
    return Layers(**{k: frozenset(v) for k, v in base.items()})


# --- the evaluator --------------------------------------------------------------------------------
def test_every_existing_capability_and_every_planned_one_is_in_the_catalog() -> None:
    existing = {
        "call_review",
        "follow_up",
        "recordings",
        "reports",
        "ai_knowledge",
        "integrations",
        "prep",
    }
    learning = {"card_ratings", "learned_instructions"}  # built in 0.5.0 (T-058, T-059)
    planned = {"gallabox", "email_send", "whatsapp"}
    followup = {  # T-081 (INT-08, INT-09, INT-10, INT-13, INT-14b)
        "followup_plan",
        "meeting_reminders",
        "whatsapp_status",
        "zoho_watch",
        "email_attachments",
    }
    assert set(features.CATALOG) == existing | learning | planned | followup | {"zoho"}
    assert all(features.CATALOG[f].built for f in existing | learning)
    for f in learning:
        assert evaluate(f, "agent", NONE).state == "available", f
    for f in planned | {"zoho"}:
        assert evaluate(f, "admin", NONE).state == "needs_connection", f


def test_the_five_states_in_order() -> None:
    assert evaluate("reports", "agent", NONE).state == "available"
    assert evaluate("ai_knowledge", "agent", NONE).state == "no_permission"
    assert evaluate("zoho", "agent", NONE).state == "needs_connection"
    assert evaluate("reports", "agent", layers(org_off={"reports"})).state == "off_by_org"
    assert evaluate("reports", "agent", layers(killed={"reports"})).state == "off_by_platform"
    assert evaluate("reports", "agent", layers(not_entitled={"reports"})).state == (
        "off_by_platform"
    )
    # Platform wins over org, org over connection, connection over role.
    both = layers(killed={"ai_knowledge"}, org_off={"ai_knowledge"})
    assert evaluate("ai_knowledge", "agent", both).state == "off_by_platform"
    assert evaluate("zoho", "agent", layers(org_off={"zoho"})).state == "off_by_org"
    assert evaluate("gallabox", "agent", NONE).state == "needs_connection"


def test_dependencies_carry_their_state_and_name_the_cause() -> None:
    off = evaluate("zoho", "agent", layers(org_off={"integrations"}))
    assert (off.state, off.cause) == ("off_by_org", "integrations")
    killed = evaluate("whatsapp", "agent", layers(killed={"gallabox"}))
    assert (killed.state, killed.cause) == ("off_by_platform", "gallabox")
    # An agent cannot manage Gallabox, but WhatsApp still only needs it connected, not their role.
    built = {
        **features.CATALOG,
        "whatsapp": Feature("whatsapp", ("agent",), ("gallabox",), ("gallabox",), True),
        "gallabox": Feature("gallabox", ("admin",), ("gallabox",), (), True),
    }
    assert evaluate("whatsapp", "agent", NONE, built).out() == {
        "state": "needs_connection",
        "cause": "gallabox",
    }
    connected = layers(connections={"gallabox"})
    assert evaluate("whatsapp", "agent", connected, built).state == "available"


def test_the_app_reads_the_same_catalog_file() -> None:
    raw = json.loads(features.CATALOG_FILE.read_text())
    assert [f["id"] for f in raw["features"]] == list(features.CATALOG)
    app_copy = Path(__file__).parents[3] / "app/features/flags/catalog.ts"
    for fid in features.CATALOG:
        assert f'"{fid}"' in app_copy.read_text(), fid


# --- server enforcement: every non-available state answers 403 feature_unavailable ----
def call(client: TestClient, h: dict[str, str], call_id: str = "c1") -> None:
    r = client.post(
        "/api/v1/usage",
        json={
            "call_id": call_id,
            "started_at": int(time.time() * 1000) - 60_000,
            "duration_s": 60,
            "cards": 1,
            "playbook_cards": 1,
            "ai_cards": 0,
            "holding_lines": 0,
            "escalations": 0,
        },
        headers=h,
    )
    assert r.status_code == 200, r.text


REVIEW = {
    "scores": dict.fromkeys(
        ("opening", "discovery", "listening", "objections", "clarity", "next_step"), 5
    ),
    "success": 50,
    "sentiment": "neutral",
}


def unavailable(r: Any, feature: str, state: str) -> None:
    assert r.status_code == 403, r.text
    body = r.json()
    assert body["error"] == "feature_unavailable"
    assert body["feature"] == feature
    assert body["state"] == state


def test_off_by_platform_kill_switch_rejects_and_is_audited(
    owner: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha", "admin@a.test")
    call(owner, a["auth"])
    assert owner.post("/api/v1/calls/c1/review", json=REVIEW, headers=a["auth"]).status_code == 200
    r = owner.put(
        "/api/owner/features/call_review/kill", json={"killed": True}, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    assert next(f for f in r.json()["features"] if f["id"] == "call_review")["killed_at"]
    # Takes effect on the very next request: no deploy, no cache (R7: within 10 minutes).
    unavailable(
        owner.post("/api/v1/calls/c1/review", json=REVIEW, headers=a["auth"]),
        "call_review",
        "off_by_platform",
    )
    assert owner.get("/api/v1/features", headers=a["auth"]).json()["features"]["call_review"] == {
        "state": "off_by_platform"
    }
    owner.put("/api/owner/features/call_review/kill", json={"killed": False}, headers=JSON_ORIGIN)
    assert owner.post("/api/v1/calls/c1/review", json=REVIEW, headers=a["auth"]).status_code == 200
    actions = [i["action"] for i in store.owner_audit()]
    assert actions.count("owner.features.kill") == 2


def test_off_by_platform_entitlement_hides_it_from_admin_features(
    owner: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha", "admin@a.test")
    cid = a["company"]["id"]
    r = owner.patch(
        f"/api/owner/companies/{cid}/features", json={"recordings": False}, headers=JSON_ORIGIN
    )
    assert r.status_code == 200, r.text
    row = next(c for c in r.json()["companies"] if c["id"] == cid)
    assert row["entitled"]["recordings"] is False
    assert row["entitled"]["reports"] is True
    unavailable(
        owner.put("/api/v1/recordings/c1", content=b"x", headers=a["auth"]),
        "recordings",
        "off_by_platform",
    )
    unavailable(
        owner.get("/api/v1/company/usage?for=recordings", headers=a["auth"]),
        "recordings",
        "off_by_platform",
    )
    listed = [
        f["id"] for f in owner.get("/api/v1/company/features", headers=a["auth"]).json()["features"]
    ]
    assert "recordings" not in listed
    assert "reports" in listed
    r = owner.put("/api/v1/company/features/recordings", json={"enabled": True}, headers=a["auth"])
    assert r.status_code == 404  # an org cannot switch on what AGN did not entitle
    audit = [i for i in store.owner_audit(cid) if i["action"] == "owner.features.entitlement"]
    assert json.loads(audit[0]["detail"]) == {"recordings": False}


def test_off_by_org_admin_toggle_rejects_and_is_audited(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha", "admin@a.test")
    h = a["auth"]
    assert client.get("/api/v1/company/usage", headers=h).status_code == 200
    r = client.put("/api/v1/company/features/reports", json={"enabled": False}, headers=h)
    assert r.status_code == 200, r.text
    row = next(f for f in r.json()["features"] if f["id"] == "reports")
    assert row["enabled"] is False
    assert row["state"] == "off_by_org"
    unavailable(client.get("/api/v1/company/usage", headers=h), "reports", "off_by_org")
    # Recordings has its own switch, so Admin → Recordings still lists calls, but never the
    # report numbers (security review M1).
    call(client, h, "rec-1")
    call(client, h, "no-rec")
    client.post("/api/v1/calls/rec-1/review", json=REVIEW, headers=h)
    who = store.principal(a["token"], kind="app")
    assert who is not None
    store.set_recording(who, "rec-1", 1234)  # this test server keeps no audio files
    rec = client.get("/api/v1/company/usage?for=recordings", headers=h)
    assert rec.status_code == 200
    rows = rec.json()["calls"]
    assert [r["id"] for r in rows] == [f"{a['company']['id']}:rec-1"]
    assert "review" not in rows[0]
    assert "cards" not in rows[0]
    items = client.get("/api/v1/audit", headers=h).json()["items"]
    assert any(i["action"] == "features.toggle" and i["detail"] == "reports off" for i in items)
    assert (
        client.put(
            "/api/v1/company/features/reports", json={"enabled": "no"}, headers=h
        ).status_code
        == 400
    )
    assert (
        client.put("/api/v1/company/features/nope", json={"enabled": True}, headers=h).status_code
        == 404
    )


def test_needs_connection_rejects(
    client: TestClient, sign_up: SignUp, monkeypatch: pytest.MonkeyPatch
) -> None:
    # No connection modules exist before 0.4.0, so pretend Recordings needs Zoho.
    monkeypatch.setitem(
        features.CATALOG,
        "recordings",
        Feature("recordings", ("admin", "manager", "agent"), ("zoho",), (), True),
    )
    a = sign_up("Alpha", "admin@a.test")
    r = client.get("/api/v1/recordings/c1", headers=a["auth"])
    unavailable(r, "recordings", "needs_connection")
    assert r.json()["cause"] == "zoho"


def test_no_permission_rejects(client: TestClient, sign_up: SignUp) -> None:
    a = sign_up("Alpha", "admin@a.test")
    pw = client.post(
        "/api/v1/team",
        json={"email": "ag@a.test", "name": "Ag", "role": "agent"},
        headers=a["auth"],
    ).json()["temporary_password"]
    token = client.post("/api/v1/auth/login", json={"email": "ag@a.test", "password": pw}).json()[
        "token"
    ]
    h = {"authorization": f"Bearer {token}"}
    client.post("/api/v1/auth/password", json={"current": pw, "new": PASSWORD}, headers=h)
    unavailable(
        client.put("/api/v1/company/settings", json={"context": "x"}, headers=h),
        "ai_knowledge",
        "no_permission",
    )
    me = client.get("/api/v1/me", headers=h).json()
    assert me["features"]["ai_knowledge"] == {"state": "no_permission"}
    assert me["features"]["reports"] == {"state": "available"}
    assert client.get("/api/v1/company/features", headers=h).status_code == 403  # admins only
    assert (
        client.put(
            "/api/v1/company/features/reports", json={"enabled": False}, headers=h
        ).status_code
        == 403
    )


def test_withheld_from_the_bundle_when_off(client: TestClient, sign_up: SignUp) -> None:
    """D-036: client-run features stop because the server withholds what they need."""
    a = sign_up("Alpha", "admin@a.test")
    h = a["auth"]
    client.put("/api/v1/company/settings", json={"context": "We sell solar."}, headers=h)
    assert client.get("/api/v1/bundle", headers=h).json()["company"]["context"] == "We sell solar."
    client.put("/api/v1/company/features/ai_knowledge", json={"enabled": False}, headers=h)
    bundle = client.get("/api/v1/bundle", headers=h).json()
    assert bundle["company"]["context"] == ""
    settings = client.get("/api/v1/company/settings", headers=h).json()["settings"]
    assert "context" not in settings  # security review L3
    assert bundle["features"]["ai_knowledge"] == {"state": "off_by_org"}
    unavailable(
        client.put("/api/v1/company/settings", json={"context": "y"}, headers=h),
        "ai_knowledge",
        "off_by_org",
    )
    # Other settings still save.
    assert (
        client.put("/api/v1/company/settings", json={"card_language": "en"}, headers=h).status_code
        == 200
    )


def test_org_a_cannot_read_or_change_org_b_toggles(owner: TestClient, sign_up: SignUp) -> None:
    a = sign_up("Alpha", "admin@a.test")
    b = sign_up("Beta", "admin@b.test")
    owner.put("/api/v1/company/features/reports", json={"enabled": False}, headers=a["auth"])
    owner.patch(
        f"/api/owner/companies/{a['company']['id']}/features",
        json={"follow_up": False},
        headers=JSON_ORIGIN,
    )
    b_view = {
        f["id"]: f
        for f in owner.get("/api/v1/company/features", headers=b["auth"]).json()["features"]
    }
    assert b_view["reports"]["enabled"] is True
    assert b_view["reports"]["state"] == "available"
    assert "follow_up" in b_view
    b_map = owner.get("/api/v1/features", headers=b["auth"]).json()["features"]
    assert b_map["reports"]["state"] == "available"
    assert b_map["follow_up"]["state"] == "available"
    # B's admin switching a feature changes only B; A stays as A set it.
    owner.put("/api/v1/company/features/reports", json={"enabled": True}, headers=b["auth"])
    a_map = owner.get("/api/v1/features", headers=a["auth"]).json()["features"]
    assert a_map["reports"]["state"] == "off_by_org"
    assert a_map["follow_up"]["state"] == "off_by_platform"
    # The route takes no company id, so B has no way to name A's toggles at all.
    assert (
        owner.put(
            f"/api/v1/company/features/reports?company={a['company']['id']}",
            json={"enabled": True},
            headers=b["auth"],
        ).status_code
        == 200
    )
    assert (
        owner.get("/api/v1/features", headers=a["auth"]).json()["features"]["reports"]["state"]
        == "off_by_org"
    )
    b_audit = [i["action"] for i in owner.get("/api/v1/audit", headers=b["auth"]).json()["items"]]
    assert "owner.features.entitlement" not in b_audit


def test_owner_routes_validate_and_need_the_owner(owner: TestClient, sign_up: SignUp) -> None:
    a = sign_up("Alpha", "admin@a.test")
    cid = a["company"]["id"]
    bad = owner.patch(
        f"/api/owner/companies/{cid}/features", json={"nope": True}, headers=JSON_ORIGIN
    )
    assert bad.status_code == 400
    assert (
        owner.patch(
            f"/api/owner/companies/{cid}/features", json={"reports": 1}, headers=JSON_ORIGIN
        ).status_code
        == 400
    )
    assert (
        owner.patch(
            f"/api/owner/companies/{cid}/features", json={}, headers=JSON_ORIGIN
        ).status_code
        == 400
    )
    assert (
        owner.put(
            "/api/owner/features/nope/kill", json={"killed": True}, headers=JSON_ORIGIN
        ).status_code
        == 404
    )
    assert (
        owner.put(
            "/api/owner/features/reports/kill", json={"killed": "yes"}, headers=JSON_ORIGIN
        ).status_code
        == 400
    )
    matrix = owner.get("/api/owner/features").json()
    assert {f["id"] for f in matrix["features"]} == set(features.CATALOG)
    owner.post("/api/owner/logout")
    assert owner.get("/api/owner/features").status_code == 401
    assert (
        owner.put(
            "/api/owner/features/reports/kill",
            json={"killed": True},
            headers=a["auth"] | JSON_ORIGIN,
        ).status_code
        == 401
    )


def test_shipped_features_are_built_so_no_later_version_label_shows() -> None:
    """UX-09: every feature that ships today is built; `release` (the "Coming in a later
    version" reason) can only come from a feature a future version adds as built=false."""
    shipped = {
        "zoho", "zoho_actions", "email_send", "gallabox", "whatsapp", "card_ratings",
        "learned_instructions", "prep", "integrations", "call_review", "follow_up",
        "recordings", "reports", "ai_knowledge",
    }  # fmt: skip
    for fid in shipped & set(features.CATALOG):
        assert features.CATALOG[fid].built, fid
    layers = features.Layers(
        killed=frozenset(),
        not_entitled=frozenset(),
        org_off=frozenset(),
        connections=frozenset({"zoho", "gallabox", "email_sender"}),
    )
    for fid in features.CATALOG:
        assert features.evaluate(fid, "admin", layers).cause != "release", fid


# --- T-081: default-off features (D-070, D-071) ---------------------------------------------------
def test_meeting_reminders_and_whatsapp_status_are_off_until_the_admin_turns_them_on(
    client: Any, sign_up: Any, store: Any
) -> None:
    from sotto_worker.cloud.gallabox import data as gb

    admin = sign_up()
    h = admin["auth"]
    gb.ensure(store)
    company = store._q("SELECT id FROM companies")[0]["id"]
    with store._tx() as db:  # pretend Gallabox is configured: only the default decides then
        db.execute(
            "INSERT INTO company_gallabox(company_id, ciphertext, updated_at) VALUES (?,?,0)",
            (company, b"x"),
        )
    assert features.DEFAULT_OFF == {"meeting_reminders", "whatsapp_status"}
    m = client.get("/api/v1/features", headers=h).json()["features"]
    assert m["meeting_reminders"]["state"] == "off_by_org"
    assert m["whatsapp_status"]["state"] == "off_by_org"
    rows = {r["id"]: r for r in client.get("/api/v1/company/features", headers=h).json()["features"]}
    assert rows["meeting_reminders"]["enabled"] is False
    r = client.put("/api/v1/company/features/whatsapp_status", json={"enabled": True}, headers=h)
    assert r.status_code == 200, r.text
    m = client.get("/api/v1/features", headers=h).json()["features"]
    assert m["whatsapp_status"]["state"] != "off_by_org"
    assert m["meeting_reminders"]["state"] == "off_by_org"


def test_zoho_watch_needs_the_notifications_scope_on_the_connection() -> None:
    zoho = layers(connections={"zoho"})
    assert evaluate("zoho_watch", "agent", zoho).out() == {
        "state": "needs_connection",
        "cause": "zoho_notifications",
    }
    both = layers(connections={"zoho", "zoho_notifications"})
    assert evaluate("zoho_watch", "agent", both).state == "available"
