"""W4-SCOPES (D-069): one scope bundle, one reconnect. The fake Zoho here also serves the wave-4
reads (Blueprint, field metadata, Campaigns, users) used by the other wave-4 test files."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho.oauth import (
    BASE_SCOPES,
    BUNDLE_SCOPES,
    FEATURE_SCOPES,
    SCOPES,
    has_feature,
    missing_scopes,
    scopes_outdated,
)
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import connect, set_org_client, signup, start_flow
from tests.cloud.test_zoho_actions import CONTACT_ID, DEAL_ID, FakeZohoWrites

CAMPAIGN_ID = "4150868000000500001"
ME_ID = "4150868000000100001"
OTHER_ID = "4150868000000100002"


class FakeZohoW4(FakeZohoWrites):
    def __init__(self) -> None:
        super().__init__()
        self.deal: dict[str, Any] = {"id": DEAL_ID, "Budget_Confirmed": "", "Decision_Maker": "Jo"}
        self.fields_meta: list[dict[str, Any]] = [
            {"api_name": "Stage", "field_label": "Stage", "data_type": "picklist"},
            {"api_name": "Amount", "field_label": "Amount", "data_type": "currency"},
        ]
        self.created_fields: list[Any] = []
        self.blueprint_status = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        path = url.path.removeprefix("/crm/v8/")
        if url.host != "www.zohoapis.com":
            return super().handler(request)
        if path == "settings/fields":
            self.requests.append(request)
            assert url.params["module"] == "Deals"
            if request.method == "POST":
                body = json.loads(request.content)
                self.created_fields.append(body)
                for f in body["fields"]:
                    self.fields_meta.append(
                        {
                            "api_name": f["field_label"].replace(" ", "_"),
                            "field_label": f["field_label"],
                            "data_type": f["data_type"],
                        }
                    )
                return httpx.Response(
                    201,
                    json={
                        "fields": [
                            {"code": "SUCCESS", "status": "success", "details": {"id": f"77{i}"}}
                            for i, _ in enumerate(body["fields"])
                        ]
                    },
                )
            return httpx.Response(200, json={"fields": self.fields_meta})
        if path == f"Deals/{DEAL_ID}/actions/blueprint":
            self.requests.append(request)
            assert request.method == "GET"
            if self.blueprint_status != 200:
                return httpx.Response(self.blueprint_status, json={"code": "RECORD_NOT_IN_PROCESS"})
            return httpx.Response(
                200,
                json={
                    "blueprint": {
                        "process_info": {"name": "Sales process", "field_value": "Qualification"},
                        "transitions": [
                            {
                                "id": "1",
                                "name": "Qualify",
                                "next_field_value": "Proposal",
                                "fields": [
                                    {"api_name": "Budget_Confirmed", "display_label": "Budget"},
                                    {"api_name": "Decision_Maker", "display_label": "Decider"},
                                    {"api_name": "bad name;drop", "display_label": "x"},
                                ],
                            }
                        ],
                    }
                },
            )
        if path == f"Deals/{DEAL_ID}" and request.method == "GET":
            self.requests.append(request)
            return httpx.Response(200, json={"data": [self.deal]})
        if path == f"Campaigns/{CAMPAIGN_ID}":
            self.requests.append(request)
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "Campaign_Name": "Dubai Expo 2026",
                            "Type": "Trade Show",
                            "Status": "Active",
                        }
                    ]
                },
            )
        if path == "users" and url.params.get("type") == "CurrentUser":
            self.requests.append(request)
            return httpx.Response(200, json={"users": [{"id": ME_ID, "full_name": "Ada Admin"}]})
        if path == "users":
            self.requests.append(request)
            return httpx.Response(
                200,
                json={
                    "users": [
                        {
                            "id": OTHER_ID,
                            "full_name": "Bo Seller",
                            "status": "active",
                            "email": "bo@acme.test",
                        },
                        {
                            "id": ME_ID,
                            "full_name": "Ada Admin",
                            "status": "active",
                            "email": "admin@acme.test",
                        },
                    ],
                    "info": {"more_records": False},
                },
            )
        return super().handler(request)


def make_client(store: CloudStore, seed: Seed, z4: FakeZohoW4) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(z4.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def connected_admin(c4: TestClient) -> dict[str, str]:
    a = signup(c4, "Acme", "admin@acme.test")
    set_org_client(c4, a)
    r, _ = connect(c4, a)
    assert r.status_code == 200
    return a


@pytest.fixture
def z4() -> FakeZohoW4:
    return FakeZohoW4()


@pytest.fixture
def c4(store: CloudStore, seed: Seed, z4: FakeZohoW4) -> TestClient:
    return make_client(store, seed, z4)


@pytest.fixture
def a4(c4: TestClient) -> dict[str, str]:
    return connected_admin(c4)


def old_scopes(store: CloudStore) -> None:
    """The connection was made with the wave-3 scope set."""
    store._db.execute("UPDATE zoho_connections SET scopes = ?", (",".join(BASE_SCOPES),))


# --- the bundle ---------------------------------------------------------------------------------
def test_requested_scope_string_is_exactly_the_bundle(c4: TestClient) -> None:
    a = signup(c4, "Acme", "admin@acme.test")
    set_org_client(c4, a)
    url = c4.post("/api/v1/zoho/connect", headers=a).json()["url"]
    state = parse_qs(url.split("?", 1)[1])["state"][0]
    to = start_flow(c4, state)
    assert parse_qs(to.query)["scope"][0] == ",".join(SCOPES)
    for s in (
        "ZohoCRM.modules.tasks.CREATE",
        "ZohoCRM.modules.deals.UPDATE",
        "ZohoCRM.settings.fields.READ",
        "ZohoCRM.settings.fields.CREATE",
        "ZohoCRM.modules.campaigns.READ",
        "ZohoCRM.notifications.ALL",
    ):
        assert s in SCOPES
    assert len(set(SCOPES)) == len(SCOPES)
    assert set(BUNDLE_SCOPES) == {s for g in FEATURE_SCOPES.values() for s in g}


def test_helpers() -> None:
    assert scopes_outdated(",".join(BASE_SCOPES))
    assert not scopes_outdated(",".join(SCOPES))
    assert missing_scopes(",".join(BASE_SCOPES)) == list(BUNDLE_SCOPES)
    assert not has_feature(",".join(BASE_SCOPES), "tasks")
    assert all(has_feature(",".join(SCOPES), f) for f in FEATURE_SCOPES)


def test_old_connection_is_one_reconnect_then_every_feature_is_available(
    c4: TestClient, a4: dict[str, str], store: CloudStore
) -> None:
    old_scopes(store)
    st = c4.get("/api/v1/zoho/status", headers=a4).json()
    assert st["scopes_outdated"] is True
    assert st["needs_reconnect"] is True
    assert st["features"] == {f: False for f in FEATURE_SCOPES}
    # Old kinds keep working on the old scopes; each new one points at the same reconnect.
    r = c4.post(
        "/api/v1/zoho/actions/deal_note",
        json={
            "approved": True,
            "idempotency_key": "key-old-1",
            "fields": {"deal_id": DEAL_ID, "content": "x"},
        },
        headers=a4,
    )
    assert r.status_code == 200, r.text
    for path in ("/api/v1/zoho/agn-fields", "/api/v1/zoho/owners"):
        r = c4.get(path, headers=a4)
        assert r.status_code == 409, path
        assert r.json()["code"] == "zoho_reconnect", path
    r, _ = connect(c4, a4)
    assert r.status_code == 200
    st = c4.get("/api/v1/zoho/status", headers=a4).json()
    assert st["scopes_outdated"] is False
    assert st["needs_reconnect"] is False
    assert st["features"] == {f: True for f in FEATURE_SCOPES}
    assert c4.get("/api/v1/zoho/agn-fields", headers=a4).status_code == 200
    assert c4.get("/api/v1/zoho/owners", headers=a4).status_code == 200


def test_task_owners_list_me_first(c4: TestClient, a4: dict[str, str]) -> None:
    r = c4.get("/api/v1/zoho/owners", headers=a4).json()
    assert r["me"] == ME_ID
    assert r["owners"][0] == {"id": ME_ID, "name": "Ada Admin", "me": True}
    assert r["owners"][1]["id"] == OTHER_ID
    assert CONTACT_ID  # imported for the other wave-4 files
