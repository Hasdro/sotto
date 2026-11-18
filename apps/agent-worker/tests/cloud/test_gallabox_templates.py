"""Gallabox auto-import (ZC-07, D-033 unchanged): after a valid key the server pulls the WhatsApp
numbers and the APPROVED templates into pick lists, guesses each parameter's source and names
only the unmapped ones. Channel ids never reach the app (D-039). Gallabox is a MockTransport."""

from __future__ import annotations

import copy
from typing import Any, cast

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.whatsapp.gallabox import guess_source
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_email import JSON_ORIGIN, agent, owner_login, signup
from tests.cloud.test_gallabox import (
    ACCOUNT,
    CHANNEL,
    KEY,
    SECRET,
    TEMPLATES,
    cid_of,
    no_secret_in,
)

CHANNEL_2 = "chan-88bb02"
NUMBERED: dict[str, Any] = {
    "name": "price_update",
    "language": "en",
    "category": "UTILITY",
    "status": "APPROVED",
    "components": [{"type": "BODY", "text": "Hi {{1}}, the price for {{2}} is ready."}],
    "channel": {"id": CHANNEL, "name": "Sales line", "phone": "+971501234567"},
}
KEYS_ONLY = {"api_key": KEY, "api_secret": SECRET, "account_id": ACCOUNT}


class Fake:
    def __init__(self, templates: list[dict[str, Any]]) -> None:
        self.templates = templates
        self.sends = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("apiKey") != KEY or request.headers.get("apiSecret") != SECRET:
            return httpx.Response(401, json={"message": "unauthorized"})
        path = request.url.path.removeprefix("/devapi")
        if request.method == "GET" and path == f"/accounts/{ACCOUNT}/whatsappTemplates":
            return httpx.Response(200, json=self.templates)
        if request.method == "POST" and path == "/messages/whatsapp":
            self.sends += 1
            return httpx.Response(202, json={"id": "msg-1", "status": "ACCEPTED"})
        return httpx.Response(404, json={"message": "not found"})


@pytest.fixture
def fake() -> Fake:
    rows = [*cast(list[dict[str, Any]], TEMPLATES), NUMBERED]
    return Fake(copy.deepcopy(rows))


@pytest.fixture
def c(store: CloudStore, seed: Seed, fake: Fake) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, gallabox_transport=httpx.MockTransport(fake.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def keys_saved(c: TestClient, store: CloudStore) -> dict[str, str]:
    h = signup(c, "Acme", "admin@acme.test")
    owner_login(c, store)  # D-078: only the vendor configures Gallabox, in the owner console
    r = c.put(f"/api/owner/companies/{cid_of(c, h)}/gallabox", json=KEYS_ONLY, headers=JSON_ORIGIN)
    assert r.status_code == 200, r.text  # the channel is picked after the key works
    assert r.json()["channel"] == {"set": False, "label": ""}
    return h


def test_guesses() -> None:
    assert guess_source("customer_name") == "customer.first_name"
    assert guess_source("Meeting Time") == "meeting.time"
    assert guess_source("1") == ""


def test_discover_fills_pick_lists_with_approved_only(c: TestClient, store: CloudStore) -> None:
    h = keys_saved(c, store)
    r = c.post(f"/api/owner/companies/{cid_of(c, h)}/gallabox/discover", headers=JSON_ORIGIN)
    assert r.status_code == 200, r.text
    body = r.json()
    names = [t["name"] for t in body["templates"]]
    assert names == ["meeting_followup", "price_update"]  # promo_offer is PENDING
    assert body["hidden"] == 1
    params = {p["name"]: p["source"] for p in body["templates"][0]["params"]}
    assert params == {"name": "customer.first_name", "date": "meeting.date"}
    # Only parameters with no guessed source are shown to the admin.
    assert body["unmapped"] == {"meeting_followup/en": [], "price_update/en": ["1", "2"]}
    # One number on the account: it is chosen at once; the screen sees a label, not the id.
    assert len(body["channels"]) == 1
    ch = body["channels"][0]
    assert ch["selected"] is True
    assert ch["label"] == "Sales line (+••••••••4567)"
    assert body["status"]["channel"] == {"set": True, "label": "Sales line (+••••••••4567)"}
    no_secret_in(r.text)


def test_allow_list_saves_the_admins_mapping(c: TestClient, store: CloudStore) -> None:
    h = keys_saved(c, store)
    c.post(f"/api/owner/companies/{cid_of(c, h)}/gallabox/discover", headers=JSON_ORIGIN)
    r = c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/templates",
        json={
            "selected": [
                {"name": "meeting_followup", "language": "en"},
                {
                    "name": "price_update",
                    "language": "en",
                    "mapping": {"1": "customer.first_name", "2": "deal.name"},
                },
            ]
        },
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200, r.text
    saved = {
        t["name"]: {p["name"]: p["source"] for p in t["params"]} for t in r.json()["templates"]
    }
    assert saved["price_update"] == {"1": "customer.first_name", "2": "deal.name"}
    assert saved["meeting_followup"] == {"name": "customer.first_name", "date": "meeting.date"}
    # The agent's list carries the sources, so the app pre-fills them.
    ag = agent(c, h)
    got = c.get("/api/v1/whatsapp/templates", headers=ag).json()["templates"]
    assert {p["source"] for t in got for p in t["params"]} >= {"deal.name"}
    audit = [
        r["detail"] for r in store._q("SELECT detail FROM audit WHERE action LIKE 'gallabox%'")
    ]
    assert any("price_update/en" in d for d in audit)


def test_unknown_source_is_refused(c: TestClient, store: CloudStore) -> None:
    h = keys_saved(c, store)
    r = c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/templates",
        json={"selected": [{"name": "price_update", "language": "en", "mapping": {"1": "x.y"}}]},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 400


def test_two_numbers_are_picked_by_ref(c: TestClient, fake: Fake, store: CloudStore) -> None:
    fake.templates.append(
        {**NUMBERED, "name": "other_line", "channel": {"id": CHANNEL_2, "name": "Support"}}
    )
    h = keys_saved(c, store)
    body = c.post(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/discover", headers=JSON_ORIGIN
    ).json()
    assert [ch["selected"] for ch in body["channels"]] == [False, False]
    support = next(ch for ch in body["channels"] if ch["label"] == "Support")
    r = c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/channel",
        json={"ref": support["ref"]},
        headers=JSON_ORIGIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["channel"] == {"set": True, "label": "Support"}
    assert CHANNEL_2 not in r.text
    bad = c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/channel",
        json={"ref": CHANNEL_2},
        headers=JSON_ORIGIN,
    )
    assert bad.status_code == 400


def test_send_waits_for_a_number(c: TestClient, fake: Fake, store: CloudStore) -> None:
    fake.templates.append({**NUMBERED, "name": "x", "channel": {"id": CHANNEL_2}})
    h = keys_saved(c, store)  # two numbers, none chosen
    c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox/templates",
        json={"selected": [{"name": "meeting_followup", "language": "en"}]},
        headers=JSON_ORIGIN,
    )
    r = c.post(
        "/api/v1/whatsapp/send",
        json={
            "template": "meeting_followup",
            "language": "en",
            "recipient": {"name": "Jane", "phone": "+971501234567"},
            "values": {"name": "Jane", "date": "12 Dec"},
            "type": "template",
            "confirm": True,
            "idempotency_key": "wa-test-0001",
        },
        headers=h,
    )
    assert r.json()["code"] == "gallabox_no_channel"
    assert fake.sends == 0


def test_discover_reports_bad_keys(c: TestClient, store: CloudStore) -> None:
    h = keys_saved(c, store)
    c.put(
        f"/api/owner/companies/{cid_of(c, h)}/gallabox",
        json={**KEYS_ONLY, "api_secret": "wrong-secret"},
        headers=JSON_ORIGIN,
    )
    r = c.post(f"/api/owner/companies/{cid_of(c, h)}/gallabox/discover", headers=JSON_ORIGIN)
    assert r.json()["code"] == "gallabox_auth"
