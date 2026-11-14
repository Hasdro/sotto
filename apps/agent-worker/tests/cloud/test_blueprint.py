"""INT-04 (D-056): the Blueprint checklist is read only; no code path reaches a transition."""

from __future__ import annotations

import ast
import inspect

import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.crm import zoho as adapter
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho import lookup, routes
from tests.cloud.test_zoho_actions import DEAL_ID
from tests.cloud.test_zoho_scopes import (
    FakeZohoW4,
    connected_admin,
    make_client,
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


def test_checklist_shows_the_missing_fields_for_the_next_transition(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4, store: CloudStore
) -> None:
    r = c4.get(f"/api/v1/zoho/deals/{DEAL_ID}/blueprint", headers=a4)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["current"] == "Qualification"
    t = b["transitions"][0]
    assert t["to"] == "Proposal"
    assert t["missing"] == [{"api_name": "Budget_Confirmed", "label": "Budget"}]
    assert t["done"] == [{"api_name": "Decision_Maker", "label": "Decider"}]
    assert t["ready"] is False
    assert b["note"] == "To move to Proposal: still need Budget."
    # The Deal read asked only for the transition's (valid) fields.
    deal_reads = [q for q in z4.requests if q.url.path.endswith(f"Deals/{DEAL_ID}")]
    assert deal_reads[0].url.params["fields"] == "Budget_Confirmed,Decision_Maker"
    # Only GETs reached Zoho's API host for this checklist.
    assert {q.method for q in z4.requests if q.url.host == "www.zohoapis.com"} == {"GET"}
    assert any("Blueprint" in r["detail"] for r in store._q("SELECT detail FROM audit"))


def test_a_deal_without_a_blueprint_gives_an_empty_checklist(
    c4: TestClient, a4: dict[str, str], z4: FakeZohoW4
) -> None:
    z4.blueprint_status = 400
    b = c4.get(f"/api/v1/zoho/deals/{DEAL_ID}/blueprint", headers=a4).json()
    assert b["transitions"] == []
    assert b["note"] == ""


def test_bad_ids_are_refused(c4: TestClient, a4: dict[str, str]) -> None:
    assert c4.get("/api/v1/zoho/deals/abc/blueprint", headers=a4).status_code == 400


def test_no_transition_endpoint_exists_in_the_code_path() -> None:
    """Zoho executes a transition with `PUT /{module}/{id}/actions/blueprint`. No module that
    serves the checklist builds a write to it: the only `actions/blueprint` string is the GET in
    the adapter, and the adapter's write helper refuses any `actions` path."""
    for mod in (adapter, lookup, routes):
        src = inspect.getsource(mod)
        tree = ast.parse(src)
        strings = [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant)]
        hits = [s for s in strings if isinstance(s, str) and "actions/blueprint" in s]
        if mod is adapter:
            assert hits == ["Deals/{deal_id}/actions/blueprint"] or all(
                "actions/blueprint" in h for h in hits
            )
        else:
            assert not [h for h in hits if "PUT" in h]
    bp = inspect.getsource(adapter.ZohoCRMReader.blueprint)
    assert "_get(" in bp
    assert "_request(" not in bp
    assert "_send(" not in bp
    assert "transitions" not in inspect.getsource(adapter.ZohoCRMReader._request).split('"""')[0]
