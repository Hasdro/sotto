"""Zoho through the management server (D-031, R10): client config, per-person OAuth, lookup.

Zoho itself is an httpx.MockTransport: every request the server makes is recorded, so the tests
also prove where secrets and tokens go."""

from __future__ import annotations

import html
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.adapters.crm.zoho import ModuleNotAllowed, ZohoCRMReader, check_read
from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho import lookup
from sotto_worker.cloud.zoho.oauth import AccessCache, Client, accounts_server_for
from tests.cloud.conftest import ORIGIN

PLATFORM_ID, PLATFORM_SECRET = "1000.PLATFORMCLIENT", "platform-secret-xyz-123"
ORG_ID, ORG_SECRET = "1000.ORGCLIENTIDAAA", "org-secret-abc-456789"
REFRESH = "1000.refresh-token-very-secret"
ACCESS = "1000.access-token-short-lived"
NOW = datetime.now(UTC)
SECRETS = (PLATFORM_SECRET, ORG_SECRET, REFRESH, ACCESS)


class FakeZoho:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.refreshes = 0
        self.revoked: list[str] = []
        self.contacts = [
            {
                "id": "4150868000000224005",
                "Full_Name": "Jane Doe",
                "Title": "CFO",
                "Email": "jane@acme.test",
                "Phone": "+1 (555) 010-2030",
                "Account_Name": {"name": "Acme Corp", "id": "4150868000000224001"},
            }
        ]

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = request.url
        form = parse_qs(request.content.decode()) if request.method == "POST" else {}
        if url.host.startswith("accounts.") and url.path == "/oauth/v2/token":
            grant = form.get("grant_type", [""])[0]
            if grant == "authorization_code":
                if form.get("code") != ["good-code"]:
                    return httpx.Response(200, json={"error": "invalid_code"})
                return httpx.Response(
                    200,
                    json={
                        "access_token": ACCESS,
                        "refresh_token": REFRESH,
                        "api_domain": "https://www.zohoapis.com",
                        "token_type": "Bearer",
                        "expires_in": 3600,
                    },
                )
            if grant == "refresh_token":
                self.refreshes += 1
                if form.get("refresh_token") != [REFRESH]:
                    return httpx.Response(400, json={"error": "invalid_code"})
                return httpx.Response(200, json={"access_token": ACCESS, "expires_in": 3600})
        if url.path == "/oauth/v2/token/revoke":
            self.revoked.append(url.params.get("token", ""))
            return httpx.Response(200, json={"status": "success"})
        if url.host == "www.zohoapis.com":
            assert request.headers["authorization"] == f"Zoho-oauthtoken {ACCESS}"
            path = url.path.removeprefix("/crm/v8/")
            if path == "Contacts/search":
                if url.params.get("phone") == "15550102030" or url.params.get("email"):
                    return httpx.Response(200, json={"data": self.contacts})
                return httpx.Response(204)
            if path == "Leads/search":
                return httpx.Response(204)
            if path == "Contacts/4150868000000224005":
                return httpx.Response(200, json={"data": self.contacts})
            if path == "Accounts/4150868000000224001":
                return httpx.Response(
                    200, json={"data": [{"Account_Name": "Acme Corp", "Industry": "Retail"}]}
                )
            if path == "Contacts/4150868000000224005/Deals":
                return httpx.Response(
                    200,
                    json={
                        "data": [
                            {
                                "Deal_Name": "Acme renewal",
                                "Stage": "Negotiation",
                                "Amount": 12000,
                                "Closing_Date": "2026-12-01",
                                "Owner": {"name": "Ada Admin"},
                            },
                            {"Deal_Name": "Old", "Stage": "Closed Won", "Amount": 1},
                        ]
                    },
                )
            if path == "Contacts/4150868000000224005/Notes":
                notes = [
                    {
                        "Note_Title": f"Call {i}",
                        "Note_Content": "Asked about volume pricing " * 3,
                        "Created_Time": (NOW - timedelta(days=i * 10)).isoformat(),
                    }
                    for i in range(1, 10)
                ]
                return httpx.Response(200, json={"data": notes})
            if path == "settings/modules":
                return httpx.Response(
                    200,
                    json={
                        "modules": [
                            {
                                "api_name": "Events",
                                "plural_label": "Meetings",
                                "api_supported": True,
                            }
                        ]
                    },
                )
        return httpx.Response(404, json={"code": "INVALID_URL_PATTERN"})


@pytest.fixture
def zoho() -> FakeZoho:
    return FakeZoho()


@pytest.fixture
def zclient(store: CloudStore, seed: Seed, zoho: FakeZoho) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        zoho_transport=httpx.MockTransport(zoho.handler),
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def signup(client: TestClient, company: str, email: str) -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "company": company,
            "name": "Ada Admin",
            "email": email,
            "password": "-".join(["correct", "horse", "battery"]),
            "device": {"id": f"dev-{company}", "platform": "web", "label": "Chrome"},
        },
    )
    assert r.status_code == 201, r.text
    return {"authorization": f"Bearer {r.json()['token']}"}


def set_org_client(client: TestClient, auth: dict[str, str]) -> None:
    r = client.put(
        "/api/v1/company/zoho/client",
        json={"client_id": ORG_ID, "client_secret": ORG_SECRET, "dc": "us"},
        headers=auth,
    )
    assert r.status_code == 200, r.text


def start_flow(client: TestClient, state: str) -> Any:
    """/auth/zoho/start: a page naming the account, a Continue link to Zoho, a browser cookie."""
    r = client.get(f"/auth/zoho/start?state={state}")
    assert r.status_code == 200, r.text
    assert "admin@" in r.text
    assert "sotto_zoho_flow" in r.headers["set-cookie"]
    href = re.search(r"href='([^']+)'", r.text)
    assert href
    return urlparse(html.unescape(href.group(1)))


def connect(client: TestClient, auth: dict[str, str], code: str = "good-code") -> Any:
    r = client.post("/api/v1/zoho/connect", headers=auth)
    assert r.status_code == 200, r.text
    start = urlparse(r.json()["url"])
    assert start.path == "/auth/zoho/start"
    state = parse_qs(start.query)["state"][0]
    to = start_flow(client, state)
    q = parse_qs(to.query)
    assert to.netloc == "accounts.zoho.com"
    assert q["state"] == [state]
    assert q["access_type"] == ["offline"]
    assert q["redirect_uri"] == [f"{ORIGIN}/auth/zoho/callback/"]
    return client.get(
        "/auth/zoho/callback/",
        params={"code": code, "state": state, "accounts-server": "https://accounts.zoho.com"},
    ), state


def no_secret_in(text: str) -> None:
    for s in SECRETS:
        assert s not in text


# --- client configuration ----------------------------------------------------------------------
def test_platform_client_is_write_only_and_encrypted(owner: TestClient, store: CloudStore) -> None:
    r = owner.put(
        "/api/owner/zoho",
        json={"client_id": PLATFORM_ID, "client_secret": PLATFORM_SECRET},
        headers={"origin": ORIGIN},
    )
    assert r.status_code == 200, r.text
    assert r.json()["configured"] is True
    assert r.json()["dc"] == "us"
    no_secret_in(r.text)
    no_secret_in(owner.get("/api/owner/zoho").text)
    raw = store._q("SELECT ciphertext FROM zoho_platform_client")[0]["ciphertext"]
    assert PLATFORM_SECRET.encode() not in raw
    assert PLATFORM_ID.encode() not in raw
    audit = json.dumps(store.owner_audit())
    no_secret_in(audit)
    assert PLATFORM_ID not in audit


def test_owner_client_route_needs_the_owner(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    r = zclient.put(
        "/api/owner/zoho",
        json={"client_id": PLATFORM_ID, "client_secret": PLATFORM_SECRET},
        headers={**auth, "origin": ORIGIN},
    )
    assert r.status_code == 401


def test_org_client_beats_the_platform_client(
    zclient: TestClient, store: CloudStore, zoho: FakeZoho
) -> None:
    from sotto_worker.cloud.store import Principal

    owner_p = Principal("o", None, "owner", None, "o@x.test", "O")
    store.set_platform_zoho_client(owner_p, PLATFORM_ID, PLATFORM_SECRET, "us")
    auth = signup(zclient, "Acme", "admin@acme.test")
    assert zclient.get("/api/v1/company/zoho/client", headers=auth).json()["active"] == "platform"
    set_org_client(zclient, auth)
    body = zclient.get("/api/v1/company/zoho/client", headers=auth)
    assert body.json()["active"] == "org"
    no_secret_in(body.text)
    r, _ = connect(zclient, auth)
    assert r.status_code == 200, r.text
    token_calls = [q for q in zoho.requests if q.url.path == "/oauth/v2/token"]
    form = parse_qs(token_calls[-1].content.decode())
    assert form["client_id"] == [ORG_ID]
    assert form["client_secret"] == [ORG_SECRET]
    # Removing the org client falls back to the platform one.
    zclient.delete("/api/v1/company/zoho/client", headers=auth)
    assert zclient.get("/api/v1/company/zoho/client", headers=auth).json()["active"] == "platform"


def test_bad_client_values_are_refused(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    r = zclient.put(
        "/api/v1/company/zoho/client",
        json={"client_id": "x", "client_secret": "has space inside", "dc": "us"},
        headers=auth,
    )
    assert r.status_code == 400
    r = zclient.put(
        "/api/v1/company/zoho/client",
        json={"client_id": ORG_ID, "client_secret": ORG_SECRET, "dc": "mars"},
        headers=auth,
    )
    assert r.status_code == 400


# --- OAuth -------------------------------------------------------------------------------------
def test_needs_connection_until_connected_then_available(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    s = zclient.get("/api/v1/zoho/status", headers=auth).json()
    assert s["connected"] is False
    assert s["feature"] == {"state": "needs_connection", "cause": "zoho"}
    assert (
        zclient.get("/api/v1/features", headers=auth).json()["features"]["zoho"]["state"]
        == "needs_connection"
    )
    r = zclient.get("/api/v1/zoho/search?q=jane@acme.test", headers=auth)
    assert r.status_code == 403
    assert r.json()["error"] == "feature_unavailable"
    r, _ = connect(zclient, auth)
    assert r.status_code == 200
    assert "Connected to Zoho" in r.text
    no_secret_in(r.text)
    s = zclient.get("/api/v1/zoho/status", headers=auth)
    assert s.json()["connected"] is True
    assert s.json()["feature"] == {"state": "available"}
    no_secret_in(s.text)


def test_connect_without_any_client_says_so(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    r = zclient.post("/api/v1/zoho/connect", headers=auth)
    assert r.status_code == 409
    assert r.json()["code"] == "zoho_no_client"


def test_state_is_one_time(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    r, state = connect(zclient, auth)
    assert r.status_code == 200
    again = zclient.get("/auth/zoho/callback/", params={"code": "good-code", "state": state})
    assert again.status_code == 400
    assert "expired" in again.text.lower()


def test_unknown_and_expired_state_are_refused(zclient: TestClient, store: CloudStore) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    assert (
        zclient.get(
            "/auth/zoho/callback/", params={"code": "good-code", "state": "nope"}
        ).status_code
        == 400
    )
    url = zclient.post("/api/v1/zoho/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    store._db.execute("UPDATE zoho_states SET expires_at = 0")
    assert zclient.get(f"/auth/zoho/start?state={state}", follow_redirects=False).status_code == 400
    r = zclient.get("/auth/zoho/callback/", params={"code": "good-code", "state": state})
    assert r.status_code == 400
    assert zclient.get("/api/v1/zoho/status", headers=auth).json()["connected"] is False


def test_a_forwarded_link_cannot_connect_from_another_browser(
    zclient: TestClient, store: CloudStore, seed: Seed, zoho: FakeZoho
) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    url = zclient.post("/api/v1/zoho/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    start_flow(zclient, state)  # the attacker's browser opened the link …
    victim = TestClient(
        create_cloud_app(
            CloudConfig(
                public_origin=ORIGIN,
                static_dir=None,
                zoho_transport=httpx.MockTransport(zoho.handler),
            ),
            store,
            seed,
        ),
        base_url=ORIGIN,
    )
    # … the victim's browser comes back from Zoho without the cookie: refused, nothing saved.
    r = victim.get("/auth/zoho/callback/", params={"code": "good-code", "state": state})
    assert r.status_code == 400
    assert store._q("SELECT * FROM zoho_connections") == []


def test_callback_rechecks_the_feature(zclient: TestClient, store: CloudStore) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    url = zclient.post("/api/v1/zoho/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    start_flow(zclient, state)
    assert (
        zclient.put(
            "/api/v1/company/features/zoho", json={"enabled": False}, headers=auth
        ).status_code
        == 200
    )
    r = zclient.get("/auth/zoho/callback/", params={"code": "good-code", "state": state})
    assert r.status_code == 403
    assert store._q("SELECT * FROM zoho_connections") == []


def test_lookups_are_rate_limited(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    connect(zclient, auth)
    codes = [
        zclient.get("/api/v1/zoho/search?q=jane@acme.test", headers=auth).status_code
        for _ in range(61)
    ]
    assert codes[:60] == [200] * 60
    assert codes[60] == 429


def test_refused_code_does_not_connect(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    r, _ = connect(zclient, auth, code="bad-code")
    assert r.status_code == 502
    assert zclient.get("/api/v1/zoho/status", headers=auth).json()["connected"] is False


def test_callback_never_sends_the_secret_to_an_unknown_accounts_server(
    zclient: TestClient, zoho: FakeZoho
) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    url = zclient.post("/api/v1/zoho/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    start_flow(zclient, state)
    r = zclient.get(
        "/auth/zoho/callback/",
        params={"code": "good-code", "state": state, "accounts-server": "https://evil.test"},
    )
    assert r.status_code == 200
    hosts = {q.url.host for q in zoho.requests}
    assert hosts == {"accounts.zoho.com"}
    assert accounts_server_for("https://accounts.zoho.eu", Client("a", "b", "us")) == (
        "https://accounts.zoho.eu"
    )


def test_refresh_token_is_encrypted_and_disconnect_revokes(
    zclient: TestClient, store: CloudStore, zoho: FakeZoho
) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    connect(zclient, auth)
    raw = store._q("SELECT ciphertext FROM zoho_connections")[0]["ciphertext"]
    assert REFRESH.encode() not in raw
    r = zclient.delete("/api/v1/zoho/connection", headers=auth)
    assert r.status_code == 200
    assert r.json()["revoked"] is True
    assert zoho.revoked == [REFRESH]
    assert store._q("SELECT * FROM zoho_connections") == []


def test_access_token_is_cached() -> None:
    cache = AccessCache()
    cache.put(("c", "u"), "tok", 3600, now=0)
    assert cache.get(("c", "u"), now=55 * 60 - 1) == "tok"
    assert cache.get(("c", "u"), now=55 * 60 + 1) is None


# --- lookup ------------------------------------------------------------------------------------
def test_lookup_returns_candidates_with_evidence_and_a_capped_brief(
    zclient: TestClient, zoho: FakeZoho, store: CloudStore
) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    connect(zclient, auth)
    zoho.refreshes = 0
    r = zclient.get("/api/v1/zoho/search", params={"q": "+1 555 010 2030"}, headers=auth)
    assert r.status_code == 200, r.text
    (c,) = r.json()["candidates"]
    assert c["name"] == "Jane Doe"
    assert c["module"] == "Contacts"
    assert c["evidence"] == {"field": "phone", "value": "+1 (555) 010-2030"}
    assert zoho.refreshes == 0  # the callback's access token was cached
    r = zclient.get(f"/api/v1/zoho/records/Contacts/{c['id']}", headers=auth)
    assert r.status_code == 200, r.text
    brief = r.json()["brief"]
    assert brief["account"] == {"name": "Acme Corp", "industry": "Retail"}
    assert [d["name"] for d in brief["deals"]] == ["Acme renewal"]  # closed deals left out
    assert len(brief["notes"]) == 5  # last five …
    assert all(n["date"] >= (NOW - timedelta(days=90)).date().isoformat() for n in brief["notes"])
    assert len(brief["text"]) <= lookup.BRIEF_CHARS
    assert brief["text"].startswith("Contact: Jane Doe, CFO")
    no_secret_in(r.text)
    actions = [a["action"] for a in store.owner_audit()]
    assert "zoho.read" in actions
    assert "zoho.search" in actions


def test_at_most_three_candidates() -> None:
    class Many:
        async def search(self, module: str, by: str, value: str) -> list[dict[str, Any]]:
            return [{"id": f"{module}{i}", "Full_Name": f"P {i}"} for i in range(5)]

    import asyncio

    found = asyncio.run(lookup.find_candidates(cast(ZohoCRMReader, Many()), "Jane"))
    assert len(found) == 3
    assert all(c["evidence"]["field"] == "name" for c in found)


def test_read_matrix_is_enforced(zclient: TestClient) -> None:
    with pytest.raises(ModuleNotAllowed):
        check_read("Invoices")
    for m in ("Leads", "Contacts", "Accounts", "Deals", "Events", "Notes"):
        check_read(m)
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    connect(zclient, auth)
    for module in ("Deals", "Invoices", "Users"):
        r = zclient.get(f"/api/v1/zoho/records/{module}/4150868000000224005", headers=auth)
        assert r.status_code == 403, module


def test_zoho_modules_check_for_admins(zclient: TestClient) -> None:
    auth = signup(zclient, "Acme", "admin@acme.test")
    set_org_client(zclient, auth)
    connect(zclient, auth)
    r = zclient.get("/api/v1/zoho/modules", headers=auth)
    assert r.json()["modules"][0]["api_name"] == "Events"


# --- isolation ---------------------------------------------------------------------------------
def test_org_isolation(zclient: TestClient, store: CloudStore) -> None:
    a = signup(zclient, "Acme", "admin@acme.test")
    b = signup(zclient, "Beta", "admin@beta.test")
    set_org_client(zclient, a)
    connect(zclient, a)
    # B sees neither A's client nor A's connection, and cannot use A's Zoho.
    assert zclient.get("/api/v1/company/zoho/client", headers=b).json()["active"] is None
    assert zclient.get("/api/v1/zoho/status", headers=b).json()["connected"] is False
    r = zclient.get("/api/v1/zoho/search?q=jane@acme.test", headers=b)
    assert r.status_code == 403
    # B disconnecting touches only B.
    zclient.delete("/api/v1/zoho/connection", headers=b)
    assert zclient.get("/api/v1/zoho/status", headers=a).json()["connected"] is True
    # A state issued for A cannot be completed into B (it is bound to A's person).
    rows = store._q("SELECT company_id FROM zoho_connections")
    assert len(rows) == 1


def test_signed_out_cannot_reach_zoho(zclient: TestClient) -> None:
    for path in (
        "/api/v1/zoho/status",
        "/api/v1/zoho/search?q=jane",
        "/api/v1/company/zoho/client",
    ):
        assert zclient.get(path).status_code == 401
