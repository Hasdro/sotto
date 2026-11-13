"""Zoho round 2 (zoho-actions): meetings, approved writes (R12, T-062), reconnect for new scopes,
the branded OAuth pages, and the structured brief saved with a call (T-056)."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.crm.zoho import ModuleNotAllowed, check_write
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho import actions
from sotto_worker.cloud.zoho.oauth import SCOPES, missing_scopes
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import FakeZoho, connect, set_org_client, signup, start_flow

NOW = datetime.now(UTC)
EVENT_ID = "4150868000000300001"
CONTACT_ID = "4150868000000224005"
DEAL_ID = "4150868000000400001"


class FakeZohoWrites(FakeZoho):
    def __init__(self) -> None:
        super().__init__()
        self.writes: list[tuple[str, str, Any]] = []
        self.fail_next = False
        self.server_error_next = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        path = url.path.removeprefix("/crm/v8/")
        if url.host == "www.zohoapis.com" and request.method in ("POST", "PUT"):
            self.requests.append(request)
            body = json.loads(request.content)
            self.writes.append((request.method, path, body))
            if self.server_error_next:  # Zoho may have saved it, then answered 500
                self.server_error_next = False
                return httpx.Response(500, json={"code": "INTERNAL_ERROR"})
            if self.fail_next:
                self.fail_next = False
                return httpx.Response(
                    400, json={"data": [{"code": "INVALID_DATA", "status": "error"}]}
                )
            action = "update" if request.method == "PUT" else "insert"
            return httpx.Response(
                201,
                json={
                    "data": [
                        {
                            "code": "SUCCESS",
                            "status": "success",
                            "action": action,
                            "details": {"id": f"99{len(self.writes):03d}0000000001"},
                        }
                    ]
                },
            )
        if url.host == "www.zohoapis.com" and path == "Events/search":
            self.requests.append(request)
            assert "Start_DateTime:greater_equal" in url.params["criteria"]
            soon = (NOW + timedelta(minutes=30)).replace(microsecond=0)
            later = (NOW + timedelta(hours=5)).replace(microsecond=0)
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "4150868000000300002",
                            "Event_Title": "Later",
                            "Start_DateTime": later.isoformat(),
                            "End_DateTime": (later + timedelta(hours=1)).isoformat(),
                        },
                        self.event(soon),
                    ]
                },
            )
        if url.host == "www.zohoapis.com" and path == f"Events/{EVENT_ID}":
            self.requests.append(request)
            return httpx.Response(
                200,
                json={"data": [self.event((NOW + timedelta(minutes=30)).replace(microsecond=0))]},
            )
        return super().handler(request)

    @staticmethod
    def event(start: datetime) -> dict[str, Any]:
        return {
            "id": EVENT_ID,
            "Event_Title": "Acme renewal call",
            "Start_DateTime": start.isoformat(),
            "End_DateTime": (start + timedelta(minutes=30)).isoformat(),
            "Description": "Go through volume pricing",
            "Who_Id": {"name": "Jane Doe", "id": CONTACT_ID},
            "Participants": [{"name": "Jane Doe", "Email": "jane@acme.test", "type": "contact"}],
        }


@pytest.fixture
def zw() -> FakeZohoWrites:
    return FakeZohoWrites()


@pytest.fixture
def zc(store: CloudStore, seed: Seed, zw: FakeZohoWrites) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(zw.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


@pytest.fixture
def auth(zc: TestClient) -> dict[str, str]:
    a = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, a)
    r, _ = connect(zc, a)
    assert r.status_code == 200
    return a


def act(
    zc: TestClient,
    auth: dict[str, str],
    kind: str,
    fields: dict[str, Any],
    key: str = "key-0001",
    **extra: Any,
) -> Any:
    return zc.post(
        f"/api/v1/zoho/actions/{kind}",
        json={"approved": True, "idempotency_key": key, "fields": fields, **extra},
        headers=auth,
    )


# --- OAuth pages and scopes ---------------------------------------------------------------------
def test_oauth_pages_keep_all_css_in_the_head(zc: TestClient) -> None:
    a = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, a)
    url = zc.post("/api/v1/zoho/connect", headers=a).json()["url"]
    state = parse_qs(url.split("?", 1)[1])["state"][0]
    page = zc.get(f"/auth/zoho/start?state={state}")
    assert page.headers["content-type"].startswith("text/html")
    assert "style-src 'unsafe-inline'" in page.headers["content-security-policy"]
    head, body = page.text.split("</head>", 1)
    assert "a.go{" in head
    assert "{" not in re.sub(r"<svg.*?</svg>", "", body)  # no CSS leaked into the page text
    assert "AGN Sales Shield" in body
    done = zc.get("/auth/zoho/callback/", params={"code": "good-code", "state": state})
    assert "Connected to Zoho" in done.text
    assert "{" not in re.sub(r"<svg.*?</svg>", "", done.text.split("</head>", 1)[1])


def test_connect_asks_for_write_scopes_but_never_deals_or_accounts_writes(zc: TestClient) -> None:
    a = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, a)
    url = zc.post("/api/v1/zoho/connect", headers=a).json()["url"]
    state = parse_qs(url.split("?", 1)[1])["state"][0]
    to = start_flow(zc, state)
    scopes = parse_qs(to.query)["scope"][0].split(",")
    assert "ZohoCRM.modules.events.CREATE" in scopes
    assert "ZohoCRM.modules.notes.CREATE" in scopes
    assert not [
        s
        for s in scopes
        if s.startswith(("ZohoCRM.modules.deals.", "ZohoCRM.modules.accounts."))
        and not s.endswith(".READ")
    ]


def test_old_read_only_connections_are_asked_to_reconnect(
    zc: TestClient, auth: dict[str, str], store: CloudStore
) -> None:
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["needs_reconnect"] is False
    store._db.execute("UPDATE zoho_connections SET scopes = NULL")  # connected with 0.3.1
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["needs_reconnect"] is True
    r = act(zc, auth, "deal_note", {"deal_id": DEAL_ID, "content": "Sent pricing"})
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_reconnect"
    assert missing_scopes(",".join(SCOPES)) == []


# Meetings: see test_zoho_meetings.py (owner-filtered upcoming list, detail, brief).


# --- writes -------------------------------------------------------------------------------------
def test_each_kind_writes_one_record_with_an_audit_row(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites, store: CloudStore
) -> None:
    start = (NOW + timedelta(days=2)).replace(microsecond=0)
    cases = [
        (
            "meeting",
            {
                "title": "Follow-up",
                "start": start.isoformat(),
                "end": (start + timedelta(minutes=30)).isoformat(),
                "contact_id": CONTACT_ID,
            },
        ),
        ("lead", {"last_name": "Doe", "company": "Doe Trading", "email": "john@doe.test"}),
        ("contact_update", {"contact_id": CONTACT_ID, "phone": "+1 555 0100"}),
        (
            "deal_note",
            {"deal_id": DEAL_ID, "title": "Call", "content": "Wants a quarterly invoice"},
        ),
    ]
    for i, (kind, fields) in enumerate(cases):
        r = act(zc, auth, kind, fields, key=f"key-{i:04d}")
        assert r.status_code == 200, (kind, r.text)
    paths = [(m, p) for m, p, _ in zw.writes]
    assert paths == [
        ("POST", "Events"),
        ("POST", "Leads"),
        ("PUT", f"Contacts/{CONTACT_ID}"),
        ("POST", "Notes"),
    ]
    assert "duplicate_check_fields" not in zw.writes[1][2]  # a new lead never overwrites one
    note = zw.writes[3][2]["data"][0]
    assert note["Parent_Id"] == {"module": {"api_name": "Deals"}, "id": DEAL_ID}
    audit = [a["action"] for a in store.owner_audit()]
    for kind, _ in cases:
        assert f"zoho.write.{kind}" in audit


def test_a_retry_with_the_same_key_never_writes_twice(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    fields = {"last_name": "Doe", "company": "Doe Trading"}
    one = act(zc, auth, "lead", fields, key="retry-0001")
    two = act(zc, auth, "lead", fields, key="retry-0001")
    assert one.status_code == two.status_code == 200
    assert two.json()["repeat"] is True
    assert two.json()["id"] == one.json()["id"]
    assert len(zw.writes) == 1


def test_a_failed_write_frees_the_key(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    zw.fail_next = True
    fields = {"last_name": "Doe", "company": "Doe Trading"}
    assert act(zc, auth, "lead", fields, key="fail-0001").status_code == 502
    assert act(zc, auth, "lead", fields, key="fail-0001").status_code == 200
    assert len(zw.writes) == 2


def test_nothing_is_written_without_approval(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    r = zc.post(
        "/api/v1/zoho/actions/lead",
        json={"idempotency_key": "nope-0001", "fields": {"last_name": "D", "company": "C"}},
        headers=auth,
    )
    assert r.status_code == 400
    assert zw.writes == []


@pytest.mark.parametrize(
    ("kind", "fields"),
    [
        ("deal_note", {"deal_id": DEAL_ID, "content": "x", "Stage": "Closed Won"}),
        ("deal_note", {"deal_id": DEAL_ID, "content": "x", "amount": "1"}),
        ("contact_update", {"contact_id": CONTACT_ID, "Owner": "someone"}),
        ("deal_update", {"stage": "Closed Won"}),
        ("deal", {"amount": "100"}),
    ],
)
def test_no_deal_stage_or_amount_write_is_possible(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites, kind: str, fields: dict[str, Any]
) -> None:
    r = act(zc, auth, kind, fields)
    assert r.status_code == 403, r.text
    assert zw.writes == []


def test_adapter_refuses_deal_and_account_writes() -> None:
    for module in ("Deals", "Accounts", "Users", "Invoices"):
        with pytest.raises(ModuleNotAllowed):
            check_write(module)
    for module in ("Leads", "Contacts", "Events", "Notes"):
        check_write(module)


def test_action_fields_are_validated() -> None:
    from sotto_worker.cloud.store import CloudError

    bad = [
        ("lead", {"last_name": "Doe"}),  # company missing
        ("contact_update", {"contact_id": "abc"}),
        ("lead", {"last_name": "D", "company": "C", "email": "nope"}),
        ("meeting", {"title": "x", "start": "2026-11-14T10:00:00", "end": "2026-11-14T11:00:00"}),
        (
            "meeting",
            {
                "title": "x",
                "start": "2026-11-14T10:00:00+00:00",
                "end": "2026-11-14T20:00:00+00:00",
            },
        ),
    ]
    for kind, fields in bad:
        with pytest.raises(CloudError):
            actions.plan(kind, fields)


def test_writes_are_isolated_per_company(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    b = signup(zc, "Beta", "admin@beta.test")
    r = act(zc, b, "lead", {"last_name": "Doe", "company": "X"}, key="beta-0001")
    assert r.status_code == 403  # B has no Zoho connection: needs_connection
    assert zw.writes == []


# --- the brief saved with the call ---------------------------------------------------------------
def test_brief_is_saved_with_the_call_and_company_scoped(zc: TestClient) -> None:
    a = signup(zc, "Acme", "admin@acme.test")
    b = signup(zc, "Beta", "admin@beta.test")
    brief = {"tldr": "Renewal", "objective": "Book the start date", "pains": "Price"}
    assert zc.put("/api/v1/calls/call-1/brief", json={"brief": brief}, headers=a).status_code == 200
    assert zc.get("/api/v1/calls/call-1/brief", headers=a).json()["brief"] == brief
    assert zc.get("/api/v1/calls/call-1/brief", headers=b).json()["brief"] is None
    # B writing the same call id stores B's own row, never A's.
    zc.put("/api/v1/calls/call-1/brief", json={"brief": {"tldr": "B"}}, headers=b)
    assert zc.get("/api/v1/calls/call-1/brief", headers=a).json()["brief"] == brief
    big = {"tldr": "x" * 9000}
    assert zc.put("/api/v1/calls/call-2/brief", json={"brief": big}, headers=a).status_code == 413


def test_an_unconfirmed_write_keeps_its_key_so_a_retry_cannot_double(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites, store: CloudStore
) -> None:
    zw.server_error_next = True
    fields = {"deal_id": DEAL_ID, "content": "Sent pricing"}
    r = act(zc, auth, "deal_note", fields, key="unk-0001")
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_unknown"
    again = act(zc, auth, "deal_note", fields, key="unk-0001")
    assert again.json()["code"] == "zoho_unknown"
    assert len(zw.writes) == 1  # the retry never reached Zoho
    actions_logged = [a["action"] for a in store.owner_audit()]
    assert "zoho.write.deal_note.unknown" in actions_logged


def test_a_refused_write_is_audited(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites, store: CloudStore
) -> None:
    zw.fail_next = True
    act(zc, auth, "lead", {"last_name": "Doe", "company": "X"}, key="aud-0001")
    assert "zoho.write.lead.failed" in [a["action"] for a in store.owner_audit()]


def test_a_call_id_cannot_be_squatted_inside_a_company(zc: TestClient, store: CloudStore) -> None:
    from sotto_worker.cloud.store import CloudError, Principal

    signup(zc, "Acme", "admin@acme.test")
    admin = store._q("SELECT id, company_id FROM users WHERE email = 'admin@acme.test'")[0]
    a = Principal(admin["id"], admin["company_id"], "admin", None, "admin@acme.test", "A")
    agent_id, _ = store.invite(a, "agent@acme.test", "Agent", "agent")
    b = Principal(agent_id, admin["company_id"], "agent", None, "agent@acme.test", "B")
    store.save_call_brief(b, "call-a", {"tldr": "B first"})
    with pytest.raises(CloudError):
        store.save_call_brief(a, "call-a", {"tldr": "A"})
    assert store.call_brief(b, "call-a") == {"tldr": "B first"}
