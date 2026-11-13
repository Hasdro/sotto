"""INT-01 (D-047): the after-call log as one structured Note on the Deal, else the Contact, else
the Lead; approved only, one per call (idempotent), audited, never transcript text."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudError, CloudStore
from sotto_worker.cloud.zoho import actions
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import connect, set_org_client, signup
from tests.cloud.test_zoho_actions import CONTACT_ID, DEAL_ID, FakeZohoWrites, act

LEAD_ID = "4150868000000500001"
LOG = {
    "call_id": "call-abc-123",
    "summary": "Wants volume pricing for 40 seats.",
    "objections": "Price vs. current vendor",
    "commitments": "We send a quote by Friday",
    "next_step": "Demo with the CFO",
    "chance_band": "medium",
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


def notes(zw: FakeZohoWrites) -> list[Any]:
    return [b for (_m, path, b) in zw.writes if path == "Notes"]


@pytest.mark.parametrize(
    ("ids", "module", "parent"),
    [
        ({"deal_id": DEAL_ID, "contact_id": CONTACT_ID, "lead_id": LEAD_ID}, "Deals", DEAL_ID),
        ({"contact_id": CONTACT_ID, "lead_id": LEAD_ID}, "Contacts", CONTACT_ID),
        ({"lead_id": LEAD_ID}, "Leads", LEAD_ID),
    ],
)
def test_parent_order_deal_then_contact_then_lead(
    zc: TestClient,
    auth: dict[str, str],
    zw: FakeZohoWrites,
    ids: dict[str, str],
    module: str,
    parent: str,
) -> None:
    r = act(zc, auth, "call_log", {**LOG, **ids})
    assert r.status_code == 200, r.text
    (note,) = notes(zw)
    record = note["data"][0]
    assert record["Parent_Id"] == {"module": {"api_name": module}, "id": parent}
    content = record["Note_Content"]
    for label in ("Summary:", "Objections:", "Commitments:", "Next step:", "Chance: medium"):
        assert label in content


def test_one_note_per_call_even_with_a_new_client_key(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    first = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID}, key="key-aaaa-1")
    again = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID}, key="key-bbbb-2")
    assert first.status_code == again.status_code == 200
    assert again.json()["repeat"] is True
    assert again.json()["id"] == first.json()["id"]
    assert len(notes(zw)) == 1


def test_unapproved_is_refused(zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites) -> None:
    r = zc.post(
        "/api/v1/zoho/actions/call_log",
        json={"approved": False, "fields": {**LOG, "deal_id": DEAL_ID}},
        headers=auth,
    )
    assert r.status_code == 400
    assert notes(zw) == []


def test_transcript_text_is_refused(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    transcript = "Customer: hello. Agent: hi there. " * 200
    r = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID, "summary": transcript})
    assert r.status_code == 400
    assert "too long" in r.json()["error"]
    r = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID, "transcript": "x"})
    assert r.status_code == 403
    assert notes(zw) == []


def test_needs_a_parent_and_valid_values() -> None:
    with pytest.raises(CloudError, match="deal, contact or lead"):
        actions.plan("call_log", LOG)
    with pytest.raises(CloudError, match="chance_band"):
        actions.plan("call_log", {**LOG, "deal_id": DEAL_ID, "chance_band": "sure"})
    with pytest.raises(CloudError, match="lead_id"):
        actions.plan("call_log", {**LOG, "lead_id": "abc"})
    with pytest.raises(CloudError, match="call_id"):
        actions.plan("call_log", {**LOG, "deal_id": DEAL_ID, "call_id": "a b"})


def test_audit_row_names_the_parent_not_the_content(
    zc: TestClient, auth: dict[str, str], store: CloudStore
) -> None:
    assert act(zc, auth, "call_log", {**LOG, "contact_id": CONTACT_ID}).status_code == 200
    rows = store._q("SELECT detail FROM audit WHERE action = 'zoho.write.call_log'")
    assert len(rows) == 1
    assert f"Contacts:{CONTACT_ID}" in rows[0]["detail"]
    assert "volume pricing" not in rows[0]["detail"]


def test_unconfirmed_write_still_blocks_a_retry(
    zc: TestClient, auth: dict[str, str], zw: FakeZohoWrites
) -> None:
    zw.server_error_next = True
    r = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID})
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_unknown"
    r = act(zc, auth, "call_log", {**LOG, "deal_id": DEAL_ID}, key="other-key-9")
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_unknown"
    assert len(notes(zw)) == 1
