"""Zoho Notifications watch (INT-13): needs the notifications scope on the connection
(needs_connection without it); one channel per connection; renewed by the scheduler before it
expires; a change notification (with our token) refreshes the brief of a recent call."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, Headers, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import ZOHO_NOTIFY_SCOPE, CloudStore, now_ms
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import FakeZoho, connect, set_org_client, signup

DAY = 24 * 3600 * 1000
DEAL = "4150868000000300001"
CONTACT = "4150868000000224005"


class WatchZoho(FakeZoho):
    def __init__(self) -> None:
        super().__init__()
        self.watches: list[tuple[str, dict[str, Any]]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/crm/v8/actions/watch":
            self.requests.append(request)
            item = json.loads(request.content)["watch"][0]
            self.watches.append((request.method, item))
            return httpx.Response(
                200,
                json={"watch": [{"code": "SUCCESS", "status": "success", "details": {}}]},
            )
        return super().handler(request)


class Clock:
    def __init__(self) -> None:
        self.t = now_ms()

    def __call__(self) -> int:
        return self.t


@pytest.fixture
def zoho() -> WatchZoho:
    return WatchZoho()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def app(store: CloudStore, seed: Seed, zoho: WatchZoho, clock: Clock) -> Headers:
    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        zoho_transport=httpx.MockTransport(zoho.handler),
        clock=clock,
    )
    return create_cloud_app(config, store, seed)


@pytest.fixture
def c(app: Headers) -> TestClient:
    return TestClient(app, base_url=ORIGIN)


def connected(c: TestClient, store: CloudStore, *, scope: bool = True) -> dict[str, str]:
    h = signup(c, "Acme", "admin@acme.test")
    set_org_client(c, h)
    r, _state = connect(c, h)
    assert r.status_code == 200, r.text
    if scope:
        with store._tx() as db:
            db.execute(
                "UPDATE zoho_connections SET scopes = COALESCE(scopes, '') || ?",
                ("," + ZOHO_NOTIFY_SCOPE,),
            )
    return h


def test_without_the_scope_the_watch_needs_a_reconnect(c: TestClient, store: CloudStore) -> None:
    h = connected(c, store, scope=False)
    got = c.get("/api/v1/zoho/watch", headers=h).json()
    assert got["state"] == {"state": "needs_connection", "cause": "zoho_notifications"}
    r = c.post("/api/v1/zoho/watch", headers=h)
    assert r.status_code == 403
    assert r.json()["feature"] == "zoho_watch"


def test_one_channel_per_connection_with_our_token_and_a_week_at_most(
    c: TestClient, store: CloudStore, zoho: WatchZoho, clock: Clock
) -> None:
    h = connected(c, store)
    r = c.post("/api/v1/zoho/watch", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["watching"] is True
    method, item = zoho.watches[-1]
    assert method == "POST"
    assert item["events"] == ["Deals.edit", "Events.all"]
    assert item["notify_url"] == f"{ORIGIN}/api/hooks/zoho/notify"
    assert len(item["token"]) <= 50
    expiry = datetime.fromisoformat(item["channel_expiry"]).timestamp() * 1000
    assert clock.t < expiry <= clock.t + 7 * DAY
    # Asking again while it is fresh calls Zoho no more.
    c.post("/api/v1/zoho/watch", headers=h)
    assert len(zoho.watches) == 1
    assert store._q("SELECT token_hash FROM zoho_watches")[0]["token_hash"] != item["token"]


def test_the_scheduler_renews_before_expiry(
    c: TestClient, app: Headers, store: CloudStore, zoho: WatchZoho, clock: Clock
) -> None:
    h = connected(c, store)
    c.post("/api/v1/zoho/watch", headers=h)
    first = zoho.watches[-1][1]
    assert app.scheduler is not None
    asyncio.run(app.scheduler.tick(clock.t + DAY))  # 5 days left: nothing to do
    assert len(zoho.watches) == 1
    clock.t += 5 * DAY
    asyncio.run(app.scheduler.tick(clock.t))  # 1 day left: renewed in place (PATCH)
    method, item = zoho.watches[-1]
    assert method == "PATCH"
    assert item["channel_id"] == first["channel_id"]
    assert item["channel_expiry"] > first["channel_expiry"]


def test_a_change_refreshes_the_brief_of_a_recent_call(
    c: TestClient, store: CloudStore, zoho: WatchZoho
) -> None:
    h = connected(c, store)
    c.post("/api/v1/zoho/watch", headers=h)
    item = zoho.watches[-1][1]
    old = {
        "person": {"module": "Contacts", "id": CONTACT, "name": "Jane Doe"},
        "deals": [{"id": DEAL, "name": "Acme renewal", "stage": "Qualification"}],
        "meeting": {"id": "4150868000000500001", "title": "Pricing call"},
    }
    assert c.put("/api/v1/calls/call-5/brief", json={"brief": old}, headers=h).status_code == 200

    bad = c.post(
        "/api/hooks/zoho/notify",
        json={
            "channel_id": item["channel_id"],
            "token": "not-ours",
            "module": "Deals",
            "ids": [DEAL],
        },
    )
    assert bad.status_code == 401
    hook = {"channel_id": item["channel_id"], "token": item["token"], "module": "Deals"}
    r = c.post("/api/hooks/zoho/notify", json={**hook, "ids": [DEAL], "operation": "update"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "refreshed": 1}
    brief = c.get("/api/v1/calls/call-5/brief", headers=h).json()["brief"]
    assert brief["deals"][0]["stage"] == "Negotiation"  # read again from Zoho
    assert brief["meeting"]["title"] == "Pricing call"  # kept
    assert brief["changed"] == {"module": "Deals"}
    changes = c.get("/api/v1/zoho/changes", headers=h).json()["changes"]
    assert [(x["module"], x["record_id"]) for x in changes] == [("Deals", DEAL)]
    # An unrelated record refreshes nothing.
    other = c.post("/api/hooks/zoho/notify", json={**hook, "ids": ["4150868000000999999"]})
    assert other.json()["refreshed"] == 0


def test_another_company_cannot_use_a_channel(
    c: TestClient, store: CloudStore, zoho: WatchZoho
) -> None:
    h = connected(c, store)
    c.post("/api/v1/zoho/watch", headers=h)
    beta = c.post(
        "/api/v1/auth/signup",
        json={
            "company": "Beta",
            "name": "B",
            "email": "b@beta.test",
            "password": "-".join(["correct", "horse", "battery"]),
            "device": {"id": "d-b", "platform": "web", "label": "x"},
        },
    ).json()
    hb = {"authorization": f"Bearer {beta['token']}"}
    assert c.get("/api/v1/zoho/changes", headers=hb).json()["changes"] == []
    assert c.get("/api/v1/zoho/watch", headers=hb).json()["watching"] is False
