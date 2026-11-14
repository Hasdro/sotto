"""INT-06 (D-069): AGN custom fields on Deals. Created only when missing, after the admin
confirms; written only through the allow-list. Stage and Amount can never be written (R12)."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.crm.zoho import (
    AGN_DEAL_FIELDS,
    AGN_FIELD_DEFS,
    FieldNotAllowed,
    ModuleNotAllowed,
    ZohoCRMReader,
)
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudError, CloudStore
from sotto_worker.cloud.zoho import actions
from tests.cloud.test_coaching import member
from tests.cloud.test_zoho_actions import DEAL_ID
from tests.cloud.test_zoho_scopes import (
    FakeZohoW4,
    connected_admin,
    make_client,
    old_scopes,
)


@pytest.fixture
def z4() -> FakeZohoW4:
    return FakeZohoW4()


@pytest.fixture
def c4(store: CloudStore, seed: Seed, z4: FakeZohoW4) -> TestClient:
    return make_client(store, seed, z4)


@pytest.fixture
def a4(c4: TestClient) -> dict[str, str]:
    return connected_admin(c4)


def agn(c4: TestClient, a4: dict[str, str], key: str = "", **fields: Any) -> Any:
    body = {"call_id": "call-abc", "deal_id": DEAL_ID, **fields}
    return c4.post(
        "/api/v1/zoho/actions/agn_fields",
        json={"approved": True, "fields": body, **({"idempotency_key": key} if key else {})},
        headers=a4,
    )


# --- R12: the allow-list ------------------------------------------------------------------------
class Recorder:
    def __init__(self) -> None:
        self.sent: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.sent.append(request)
        return httpx.Response(
            200, json={"data": [{"status": "success", "action": "update", "details": {"id": "1"}}]}
        )


def reader(rec: Recorder) -> tuple[ZohoCRMReader, httpx.AsyncClient]:
    h = httpx.AsyncClient(transport=httpx.MockTransport(rec.handler))
    return ZohoCRMReader(h, "https://www.zohoapis.com", "t"), h


@pytest.mark.parametrize(
    "record",
    [
        {"Stage": "Closed Won"},
        {"Amount": 1},
        {"AGN_Call_Score": 80, "Stage": "Closed Won"},
        {"AGN_Call_Score": 80, "Amount": 0},
        {"Owner": {"id": "1"}},
        {"Closing_Date": "2026-12-01"},
        {"agn_call_score": 1},
        {},
    ],
)
def test_adapter_refuses_any_deal_field_outside_the_allow_list(record: dict[str, Any]) -> None:
    rec = Recorder()

    async def go() -> None:
        rd, h = reader(rec)
        async with h:
            with pytest.raises(FieldNotAllowed):
                await rd.update_deal_fields(DEAL_ID, record)

    asyncio.run(go())
    assert rec.sent == []  # refused before a request was built


def test_generic_writes_still_cannot_touch_deals_or_blueprint() -> None:
    rec = Recorder()

    async def go() -> None:
        rd, h = reader(rec)
        async with h:
            with pytest.raises(ModuleNotAllowed):
                await rd.update("Deals", DEAL_ID, {"Stage": "Closed Won"})
            with pytest.raises(ModuleNotAllowed):
                await rd.create("Deals", {"Amount": 1})
            with pytest.raises(ModuleNotAllowed):
                await rd._request("PUT", f"Deals/{DEAL_ID}/actions/blueprint", {})
            with pytest.raises(FieldNotAllowed):
                await rd.create_agn_fields([{"field_label": "Stage", "data_type": "picklist"}])
            with pytest.raises(FieldNotAllowed):  # a known label with a changed definition
                await rd.create_agn_fields([{**AGN_FIELD_DEFS[2], "length": 10}])

    asyncio.run(go())
    assert rec.sent == []


def test_allowed_fields_are_the_four_agn_fields() -> None:
    assert (
        frozenset({"AGN_Call_Score", "AGN_Chance_Band", "AGN_Top_Objection", "AGN_Last_Call_Date"})
        == AGN_DEAL_FIELDS
    )
    assert not {"Stage", "Amount"} & AGN_DEAL_FIELDS
    assert not {"stage", "amount"} & set(actions.FIELDS["agn_fields"])


@pytest.mark.parametrize("extra", ["stage", "Stage", "amount", "Amount", "owner"])
def test_plan_refuses_stage_amount_and_unknown_fields(extra: str) -> None:
    with pytest.raises(CloudError) as e:
        actions.plan("agn_fields", {"call_id": "c1", "deal_id": DEAL_ID, extra: "x"})
    assert e.value.code == "forbidden"


def test_api_rejects_stage_or_amount_and_sends_nothing(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4
) -> None:
    for extra in ({"Stage": "Closed Won"}, {"Amount": "1"}, {"stage": "x"}):
        r = agn(c4, a4, score="80", **extra)
        assert r.status_code == 403, r.text
    assert not [w for w in z4.writes if w[1].startswith("Deals")]


# --- writes -------------------------------------------------------------------------------------
def test_write_only_the_agn_fields_once_per_call(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    r = agn(
        c4,
        a4,
        score="82",
        chance_band="high",
        top_objection="price",
        last_call_date="2026-11-14",
    )
    assert r.status_code == 200, r.text
    assert agn(c4, a4, score="82").status_code == 200  # a retry
    sent = [w for w in z4.writes if w[1] == f"Deals/{DEAL_ID}"]
    assert len(sent) == 1
    method, _path, body = sent[0]
    assert method == "PUT"
    assert body["data"][0] == {
        "AGN_Call_Score": 82,
        "AGN_Chance_Band": "High",
        "AGN_Top_Objection": "price",
        "AGN_Last_Call_Date": "2026-11-14",
    }
    actions_ = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert "zoho.write.agn_fields" in actions_


@pytest.mark.parametrize(
    "fields",
    [{"score": "101"}, {"score": "-1"}, {"chance_band": "sure"}, {"last_call_date": "14/11"}, {}],
)
def test_bad_values_are_refused(fields: dict[str, str]) -> None:
    with pytest.raises(CloudError):
        actions.plan("agn_fields", {"call_id": "c1", "deal_id": DEAL_ID, **fields})


def test_writes_need_the_bundle(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    old_scopes(store)
    r = agn(c4, a4, score="50")
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_reconnect"


# --- admin: create the fields -------------------------------------------------------------------
def test_preview_then_create_only_missing_fields(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    # One AGN field exists already (made earlier): it is shown and never re-created or changed.
    z4.fields_meta.append(
        {"api_name": "AGN_Top_Objection", "field_label": "AGN Top Objection", "data_type": "text"}
    )
    p = c4.get("/api/v1/zoho/agn-fields", headers=a4).json()["fields"]
    assert [f["exists"] for f in p] == [False, False, True, False]
    assert z4.created_fields == []  # the preview reads only
    r = c4.post("/api/v1/zoho/agn-fields", json={}, headers=a4)
    assert r.status_code == 400
    assert r.json()["code"] == "confirm"
    r = c4.post("/api/v1/zoho/agn-fields", json={"confirm": True}, headers=a4)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == ["AGN_Call_Score", "AGN_Chance_Band", "AGN_Last_Call_Date"]
    labels = [f["field_label"] for f in z4.created_fields[0]["fields"]]
    assert labels == ["AGN Call Score", "AGN Chance Band", "AGN Last Call Date"]
    assert all("api_name" not in f for f in z4.created_fields[0]["fields"])
    assert all(f["exists"] for f in r.json()["fields"])
    # Again: nothing left to create, no second POST.
    again = c4.post("/api/v1/zoho/agn-fields", json={"confirm": True}, headers=a4)
    assert again.json()["created"] == []
    assert len(z4.created_fields) == 1
    assert any(r["action"] == "zoho.fields.created" for r in store._q("SELECT action FROM audit"))


def test_label_made_by_hand_is_left_alone_and_not_writable(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4
) -> None:
    z4.fields_meta.append(
        {"api_name": "AGN_Score_1", "field_label": "AGN Call Score", "data_type": "integer"}
    )
    p = c4.get("/api/v1/zoho/agn-fields", headers=a4).json()["fields"]
    assert p[0]["exists"] is True
    assert p[0]["writable"] is False


def test_only_admins_preview_or_create_fields(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    store._db.execute("UPDATE companies SET seats = 10")
    agent = member(c4, store, a4, "omar@acme.test", "Omar", "agent")
    assert c4.get("/api/v1/zoho/agn-fields", headers=agent).status_code == 403
    r = c4.post("/api/v1/zoho/agn-fields", json={"confirm": True}, headers=agent)
    assert r.status_code == 403
    assert z4.created_fields == []
