"""WhatsApp through Gallabox (D-033, D-039, R12): write-only credentials, the template dropdown
from Gallabox, a cached allow-list, template-only sends with preview, confirm, audit and
idempotency, and no message history stored. Gallabox is an httpx.MockTransport."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.whatsapp.gallabox import parse_template
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_email import agent, signup

KEY, SECRET = "gbx-api-key-0001", "gbx-api-secret-very-private"
ACCOUNT, CHANNEL = "acct-5f1e9a", "chan-77aa01"
CHANNEL_TOKEN = "-".join(
    ["EAAG", "channel", "access", "token"]
)  # inside Gallabox's `channel` object
CREDS = {"api_key": KEY, "api_secret": SECRET, "account_id": ACCOUNT, "channel_id": CHANNEL}
SECRETS = (KEY, SECRET, ACCOUNT, CHANNEL, CHANNEL_TOKEN)

TEMPLATES = [
    {
        "name": "meeting_followup",
        "language": "en",
        "category": "UTILITY",
        "status": "APPROVED",
        "components": [
            {"type": "HEADER", "format": "TEXT", "text": "Hello {{name}}"},
            {
                "type": "BODY",
                "text": "Thanks for the call, {{name}}. Our next meeting is on {{date}}.",
                "example": {"body_text": [["Jane", "12 Dec"]]},
            },
        ],
        "channel": {"id": CHANNEL, "accessToken": CHANNEL_TOKEN, "apiKey": KEY},
    },
    {
        "name": "promo_offer",
        "language": "ar",
        "category": "MARKETING",
        "status": "PENDING",
        "variables": [{"name": "offer", "example": "10%"}],
        "body": "عرض {{offer}}",
        "channel": {"accessToken": CHANNEL_TOKEN},
    },
]


class FakeGallabox:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.send_error: tuple[int, dict[str, Any]] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("apiKey") != KEY or request.headers.get("apiSecret") != SECRET:
            return httpx.Response(401, json={"message": "unauthorized"})
        path = request.url.path.removeprefix("/devapi")
        if request.method == "GET" and path == f"/accounts/{ACCOUNT}/whatsappTemplates":
            return httpx.Response(200, json=TEMPLATES)
        if request.method == "POST" and path == "/messages/whatsapp":
            if self.send_error:
                return httpx.Response(self.send_error[0], json=self.send_error[1])
            return httpx.Response(202, json={"id": "msg-123", "status": "ACCEPTED"})
        return httpx.Response(404, json={"message": "not found"})

    def sends(self) -> list[dict[str, Any]]:
        return [
            json.loads(r.content)
            for r in self.requests
            if r.method == "POST" and r.url.path.endswith("/messages/whatsapp")
        ]


@pytest.fixture
def gb() -> FakeGallabox:
    return FakeGallabox()


@pytest.fixture
def gclient(store: CloudStore, seed: Seed, gb: FakeGallabox) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, gallabox_transport=httpx.MockTransport(gb.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def no_secret_in(text: str) -> None:
    for s in SECRETS:
        assert s not in text


def setup_org(c: TestClient, h: dict[str, str]) -> None:
    assert c.put("/api/v1/company/gallabox", json=CREDS, headers=h).status_code == 200
    r = c.put(
        "/api/v1/company/gallabox/templates",
        json={"selected": [{"name": "meeting_followup", "language": "en"}]},
        headers=h,
    )
    assert r.status_code == 200, r.text


def message(**over: Any) -> dict[str, Any]:
    return {
        "template": "meeting_followup",
        "language": "en",
        "recipient": {"name": "Jane Doe", "phone": "+971 50 123 4567"},
        "values": {"name": "Jane", "date": "12 Dec"},
        **over,
    }


def test_credentials_are_write_only_and_encrypted(gclient: TestClient, store: CloudStore) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    assert gclient.get("/api/v1/company/gallabox", headers=h).json()["configured"] is False
    r = gclient.put("/api/v1/company/gallabox", json=CREDS, headers=h)
    assert r.status_code == 200
    assert r.json()["configured"] is True
    no_secret_in(r.text)
    no_secret_in(gclient.get("/api/v1/company/gallabox", headers=h).text)
    blob = bytes(store._q("SELECT ciphertext FROM company_gallabox")[0]["ciphertext"])
    for s in SECRETS:
        assert s.encode() not in blob
    # A blank field keeps the saved value.
    r = gclient.put("/api/v1/company/gallabox", json={**CREDS, "api_secret": ""}, headers=h)
    assert r.status_code == 200
    assert gclient.post("/api/v1/company/gallabox/templates/load", headers=h).status_code == 200
    audit = [r["detail"] for r in store._q("SELECT detail FROM audit WHERE action='gallabox.set'")]
    assert audit[-1] == "changed nothing"
    no_secret_in(" ".join(audit))


def test_only_admins_configure_gallabox(gclient: TestClient) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    ag = agent(gclient, h)
    assert gclient.put("/api/v1/company/gallabox", json=CREDS, headers=ag).status_code == 403
    assert gclient.post("/api/v1/company/gallabox/templates/load", headers=ag).status_code == 403
    bad = gclient.put("/api/v1/company/gallabox", json={**CREDS, "api_key": "has space"}, headers=h)
    assert bad.status_code == 400


def test_template_dropdown_is_redacted_and_parsed(gclient: TestClient) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    assert gclient.post("/api/v1/company/gallabox/templates/load", headers=h).status_code == 409
    gclient.put("/api/v1/company/gallabox", json=CREDS, headers=h)
    r = gclient.post("/api/v1/company/gallabox/templates/load", headers=h)
    assert r.status_code == 200, r.text
    no_secret_in(r.text)
    assert "channel" not in r.text
    first, second = r.json()["templates"]
    assert first == {
        "name": "meeting_followup",
        "language": "en",
        "category": "UTILITY",
        "status": "APPROVED",
        "body": "Thanks for the call, {{name}}. Our next meeting is on {{date}}.",
        "params": [
            # `source` is the guessed field the app pre-fills (ZC-07).
            {
                "name": "name",
                "component": "header",
                "type": "text",
                "example": "",
                "source": "customer.first_name",
            },
            {
                "name": "name",
                "component": "body",
                "type": "text",
                "example": "Jane",
                "source": "customer.first_name",
            },
            {
                "name": "date",
                "component": "body",
                "type": "text",
                "example": "12 Dec",
                "source": "meeting.date",
            },
        ],
    }
    assert second["params"] == [
        {"name": "offer", "component": "body", "type": "text", "example": "10%", "source": ""}
    ]


def test_wrong_keys_say_so(gclient: TestClient) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    gclient.put("/api/v1/company/gallabox", json={**CREDS, "api_key": "wrong-key-0000"}, headers=h)
    r = gclient.post("/api/v1/company/gallabox/templates/load", headers=h)
    assert r.status_code == 502
    assert r.json()["code"] == "gallabox_auth"


def test_allow_list_caches_parameters_from_gallabox_not_the_browser(
    gclient: TestClient, store: CloudStore
) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    gclient.put("/api/v1/company/gallabox", json=CREDS, headers=h)
    r = gclient.put(
        "/api/v1/company/gallabox/templates",
        json={"selected": [{"name": "meeting_followup", "language": "en", "params": ["evil"]}]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    saved = r.json()["templates"]
    assert [p["name"] for p in saved[0]["params"]] == ["name", "name", "date"]
    rows = store._q("SELECT * FROM gallabox_templates")
    assert len(rows) == 1
    for text in (r.text, json.dumps([dict(x) for x in rows], default=str)):
        no_secret_in(text)
    # Unknown or not-yet-approved templates cannot be allowed.
    for pick in ({"name": "ghost", "language": "en"}, {"name": "promo_offer", "language": "ar"}):
        r = gclient.put("/api/v1/company/gallabox/templates", json={"selected": [pick]}, headers=h)
        assert r.status_code == 400, pick
    assert any(
        a["action"] == "gallabox.templates.set" for a in store._q("SELECT action FROM audit")
    )


def test_agent_needs_gallabox_before_whatsapp(gclient: TestClient) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    ag = agent(gclient, h)
    r = gclient.get("/api/v1/whatsapp/templates", headers=ag)
    assert r.status_code == 403
    assert (r.json()["state"], r.json()["cause"]) == ("needs_connection", "gallabox")
    setup_org(gclient, h)
    r = gclient.get("/api/v1/whatsapp/templates", headers=ag)
    assert r.status_code == 200, r.text
    assert r.json()["freeform"] is False
    assert [t["name"] for t in r.json()["templates"]] == ["meeting_followup"]
    no_secret_in(r.text)


def test_preview_confirm_send_audit_and_no_history(
    gclient: TestClient, gb: FakeGallabox, store: CloudStore
) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    setup_org(gclient, h)
    ag = agent(gclient, h)
    p = gclient.post("/api/v1/whatsapp/preview", json=message(), headers=ag)
    assert p.status_code == 200, p.text
    assert p.json() == {
        "template": "meeting_followup",
        "language": "en",
        "to": {"name": "Jane Doe", "phone": "+971501234567"},
        "text": "Thanks for the call, Jane. Our next meeting is on 12 Dec.",
    }
    assert gb.sends() == []
    r = gclient.post("/api/v1/whatsapp/send", json=message(), headers=ag)
    assert r.status_code == 400
    assert r.json()["code"] == "confirm"
    assert gb.sends() == []
    req = {**message(), "confirm": True, "idempotency_key": "call-1-wa"}
    r = gclient.post("/api/v1/whatsapp/send", json=req, headers=ag)
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "sent", "duplicate": False, "id": "msg-123", "window": "unknown"}
    assert gb.sends() == [
        {
            "channelId": CHANNEL,
            "channelType": "whatsapp",
            "recipient": {"name": "Jane Doe", "phone": "971501234567"},
            "whatsapp": {
                "type": "template",
                "template": {
                    "templateName": "meeting_followup",
                    "bodyValues": {"name": "Jane", "date": "12 Dec"},
                    "headerValues": {"name": "Jane"},
                },
            },
        }
    ]
    again = gclient.post("/api/v1/whatsapp/send", json=req, headers=ag)
    assert again.json() == {"status": "sent", "duplicate": True}
    assert len(gb.sends()) == 1
    audit = store._q("SELECT detail FROM audit WHERE action = 'whatsapp.sent'")
    assert [a["detail"] for a in audit] == ["meeting_followup/en to +••••••••4567"]
    # No message text or history is stored anywhere.
    dump = "\n".join(store._db.iterdump())
    assert "Thanks for the call, Jane" not in dump  # only the template with {{variables}}
    assert "971501234567" not in dump
    assert "Jane Doe" not in dump


def test_free_form_and_unlisted_templates_are_refused(
    gclient: TestClient, gb: FakeGallabox
) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    setup_org(gclient, h)
    free = {
        **message(),
        "type": "text",
        "text": "hi",
        "confirm": True,
        "idempotency_key": "k-0000001",
    }
    r = gclient.post("/api/v1/whatsapp/send", json=free, headers=h)
    assert r.status_code == 403
    assert r.json()["code"] == "freeform_disabled"
    for over in (
        {"template": "promo_offer", "language": "ar"},
        {"values": {"name": "Jane"}},
        {"values": {"name": "Jane", "date": "line\nbreak"}},
        {"values": {"name": "Jane", "date": "a     b"}},
        {"recipient": {"name": "J", "phone": "123"}},
    ):
        assert (
            gclient.post("/api/v1/whatsapp/preview", json=message(**over), headers=h).status_code
            == 400
        ), over
    assert gb.sends() == []


def test_stop_codes_block_and_are_audited(
    gclient: TestClient, gb: FakeGallabox, store: CloudStore
) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    setup_org(gclient, h)
    gb.send_error = (400, {"error": {"code": "131049", "message": "ecosystem engagement"}})
    req = {**message(), "confirm": True, "idempotency_key": "call-9-wa"}
    r = gclient.post("/api/v1/whatsapp/send", json=req, headers=h)
    assert r.status_code == 502
    assert r.json()["code"] == "whatsapp_blocked"
    failed = store._q("SELECT detail FROM audit WHERE action = 'whatsapp.failed'")
    assert "131049" in failed[0]["detail"]


def test_org_toggle_and_kill_switch_stop_whatsapp(gclient: TestClient, gb: FakeGallabox) -> None:
    h = signup(gclient, "Acme", "admin@acme.test")
    setup_org(gclient, h)
    gclient.put("/api/v1/company/features/whatsapp", json={"enabled": False}, headers=h)
    req = {**message(), "confirm": True, "idempotency_key": "k-00000002"}
    r = gclient.post("/api/v1/whatsapp/send", json=req, headers=h)
    assert r.status_code == 403
    assert r.json()["state"] == "off_by_org"
    assert gb.sends() == []


def test_org_isolation(gclient: TestClient, gb: FakeGallabox) -> None:
    a = signup(gclient, "Alpha", "admin@a.test")
    b = signup(gclient, "Beta", "admin@b.test")
    setup_org(gclient, a)
    sb = gclient.get("/api/v1/company/gallabox", headers=b).json()
    assert sb == {
        "configured": False,
        "channel": {"set": False, "label": ""},
        "templates": [],
    }
    assert gclient.get("/api/v1/whatsapp/templates", headers=b).status_code == 403
    assert gclient.post("/api/v1/company/gallabox/templates/load", headers=b).status_code == 409
    gclient.delete("/api/v1/company/gallabox", headers=b)
    assert gclient.get("/api/v1/company/gallabox", headers=a).json()["configured"] is True
    req = {**message(), "confirm": True, "idempotency_key": "k-00000003"}
    assert gclient.post("/api/v1/whatsapp/send", json=req, headers=b).status_code == 403
    assert gb.sends() == []


def test_parser_ignores_unknown_fields() -> None:
    t = parse_template({"name": "x", "components": [{"type": "BODY", "text": "Hi {{1}}"}], "x": 1})
    assert t is not None
    assert [p.name for p in t.params] == ["1"]
    assert parse_template({"components": []}) is None
