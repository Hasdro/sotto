"""Gallabox status webhook (INT-10, D-071, D-033): off by default; bad HMAC 401; a valid event
stores sent/delivered/read/failed per sent message and nothing else; no message text column or
field anywhere; company A cannot read company B statuses."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.gallabox.webhook import SCHEMA, parse_status
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD
from tests.cloud.test_email import agent, owner_login, signup
from tests.cloud.test_gallabox import CREDS, JSON_ORIGIN, FakeGallabox, cid_of, message

TEXT = "Thanks for the call, Jane. Our next meeting is on 12 Dec."


@pytest.fixture
def gb() -> FakeGallabox:
    return FakeGallabox()


@pytest.fixture
def c(store: CloudStore, seed: Seed, gb: FakeGallabox) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, gallabox_transport=httpx.MockTransport(gb.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def ensure_owner(c: TestClient, store: CloudStore) -> None:
    """The owner signs in; created once per store, then the changed password signs back in."""
    if store.owner_exists():
        assert c.post(
            "/api/owner/login",
            json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD + "-2"},
            headers={"origin": ORIGIN},
        ).is_success
    else:
        owner_login(c, store)


def org(c: TestClient, name: str, store: CloudStore) -> tuple[dict[str, str], dict[str, str]]:
    """Round 2 (D-078): Gallabox and its webhook are configured by the vendor on the company
    profile. The owner is signed in once per test client (ensure_owner)."""
    ensure_owner(c, store)
    h = signup(c, name, f"admin@{name.lower()}.test")
    cid = cid_of(c, h)
    assert c.put(f"/api/owner/companies/{cid}/gallabox", json=CREDS, headers=JSON_ORIGIN).status_code == 200
    r = c.put(
        f"/api/owner/companies/{cid}/gallabox/templates",
        json={"selected": [{"name": "meeting_followup", "language": "en"}]},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200, r.text
    return h, agent(c, h, f"ag@{name.lower()}.test")


def turn_on(c: TestClient, h: dict[str, str]) -> dict[str, str]:
    r = c.put("/api/v1/company/features/whatsapp_status", json={"enabled": True}, headers=h)
    assert r.status_code == 200
    cid = cid_of(c, h)
    r = c.post(f"/api/owner/companies/{cid}/gallabox/webhook", json={}, headers=JSON_ORIGIN)
    assert r.status_code == 200, r.text
    return dict(r.json())


def hook_state(c: TestClient, h: dict[str, str]) -> Any:
    return c.get(f"/api/owner/companies/{cid_of(c, h)}/gallabox/webhook", headers=JSON_ORIGIN)


def send(c: TestClient, ag: dict[str, str], key: str) -> None:
    r = c.post(
        "/api/v1/whatsapp/send",
        json={**message(), "confirm": True, "idempotency_key": key},
        headers=ag,
    )
    assert r.status_code == 200, r.text


def post(
    c: TestClient, hook: dict[str, str], payload: dict[str, Any], event: str, **kw: Any
) -> Any:
    raw = json.dumps(payload).encode()
    sig = base64.b64encode(hmac.new(hook["secret"].encode(), raw, hashlib.sha256).digest()).decode()
    path = hook["url"].removeprefix(ORIGIN)
    headers = {"x-gallabox-signature": kw.get("sig", sig), "x-event-name": event}
    return c.post(path, content=raw, headers=headers)


def status_payload(status: str, mid: str = "msg-123") -> dict[str, Any]:
    # Shape not documented by Gallabox [verify]: carries text we must never keep.
    return {"whatsapp": {"id": mid, "status": status, "text": {"body": TEXT}}, "contact": {}}


def test_off_by_default_and_the_hook_is_not_found(c: TestClient, store: CloudStore) -> None:
    h, ag = org(c, "Acme", store)
    got = hook_state(c, h).json()
    assert got["configured"] is False
    assert got["enabled"] is False
    assert got["url"] is None
    # Rotating needs the feature on for the company.
    assert c.post(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/webhook", json={}, headers=JSON_ORIGIN
    ).status_code == 403
    assert c.get("/api/v1/whatsapp/status?keys=a", headers=ag).status_code == 403
    assert c.post("/api/hooks/gallabox/" + "x" * 32, content=b"{}").status_code == 404


def test_bad_signature_is_401_and_valid_status_is_stored(c: TestClient, store: CloudStore) -> None:
    h, ag = org(c, "Acme", store)
    hook = turn_on(c, h)
    assert hook["url"].startswith(f"{ORIGIN}/api/hooks/gallabox/")
    # An agent cannot rotate the webhook — and the owner cookie must not leak into the check.
    c.cookies.clear()
    assert c.post(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/webhook", json={}, headers=JSON_ORIGIN
    ).status_code == 401
    send(c, ag, "wa-step-0001")
    assert (
        c.get("/api/v1/whatsapp/status?keys=wa-step-0001", headers=ag).json()["status"][
            "wa-step-0001"
        ]["status"]
        == "sent"
    )

    bad = post(c, hook, status_payload("read"), "Message.WA.Status.Received", sig="AAAA")
    assert bad.status_code == 401
    assert post(c, hook, status_payload("delivered"), "Message.WA.Status.Received").json() == {
        "ok": True,
        "stored": True,
    }
    post(c, hook, status_payload("read"), "Message.WA.Status.Received")
    post(c, hook, status_payload("delivered"), "Message.WA.Status.Received")  # late: no downgrade
    got = c.get("/api/v1/whatsapp/status?keys=wa-step-0001", headers=ag).json()["status"]
    assert got["wa-step-0001"]["status"] == "read"

    failed = {"whatsapp": {"id": "msg-123", "error": {"code": 131049}}}
    post(c, hook, failed, "Message.WA.Status.Failed")
    got = c.get("/api/v1/whatsapp/status?keys=wa-step-0001", headers=ag).json()["status"]
    assert got["wa-step-0001"] == {
        "status": "failed",
        "at": got["wa-step-0001"]["at"],
        "error_code": "131049",
    }

    # An unknown message id (not sent by this org through us) is ignored.
    other = post(c, hook, status_payload("read", "msg-999"), "Message.WA.Status.Received")
    assert other.json()["stored"] is False
    # No message text anywhere in the database.
    dump = "\n".join(store._db.iterdump())
    assert TEXT not in dump
    assert "Jane. Our next" not in dump


def test_no_text_column_or_field_anywhere() -> None:
    cols = [ln.split()[0] for ln in SCHEMA.splitlines() if ln.startswith("  ") and ln.strip()]
    assert not {"text", "body", "content", "phone", "values", "payload"} & set(cols)
    parsed = parse_status("Message.WA.Status.Received", status_payload("read"))
    assert parsed == ("msg-123", "read", None)  # only id, status and an error code leave the body


def test_company_a_cannot_read_company_b_statuses(c: TestClient, store: CloudStore) -> None:
    ha, aga = org(c, "Acme", store)
    hb, agb = org(c, "Beta", store)
    hook_a, hook_b = turn_on(c, ha), turn_on(c, hb)
    turn_on(c, hb)  # rotating replaces the old URL and secret
    send(c, aga, "wa-shared-key")
    # B's hook cannot write A's message (it is not a message B sent).
    hook_b = c.post(
        f"/api/owner/companies/{cid_of(c, hb)}/gallabox/webhook", json={}, headers=JSON_ORIGIN
    ).json()
    assert (
        post(c, hook_b, status_payload("read"), "Message.WA.Status.Received").json()["stored"]
        is False
    )
    # A's secret on B's URL fails the signature.
    mixed = {"url": hook_b["url"], "secret": hook_a["secret"]}
    assert post(c, mixed, status_payload("read"), "Message.WA.Status.Received").status_code == 401
    assert c.get("/api/v1/whatsapp/status?keys=wa-shared-key", headers=agb).json()["status"] == {}
    assert c.get("/api/v1/whatsapp/status?keys=wa-shared-key", headers=hb).json()["status"] == {}
    assert (
        "wa-shared-key"
        in c.get("/api/v1/whatsapp/status?keys=wa-shared-key", headers=aga).json()["status"]
    )
