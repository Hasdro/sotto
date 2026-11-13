"""ZC-02 (D-046) and UX-35: the Zoho data centre comes from the OAuth callback, a manual choice
still works, and the connect / done / cancel pages say what they must and nothing secret."""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho.oauth import detect_dc, probe_order
from tests.cloud.conftest import ORIGIN
from tests.cloud.test_zoho import ACCESS, REFRESH, set_org_client, signup

API = {
    "accounts.zoho.com": "https://www.zohoapis.com",
    "accounts.zoho.eu": "https://www.zohoapis.eu",
    "accounts.zoho.in": "https://www.zohoapis.in",
}


class MultiDC:
    """Zoho in three DCs. The person's account lives in `home`; only that DC accepts the code."""

    def __init__(self, home: str = "accounts.zoho.eu") -> None:
        self.home = home
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = request.url
        if url.path == "/oauth/v2/token":
            form = parse_qs(request.content.decode())
            if url.host != self.home:
                return httpx.Response(200, json={"error": "invalid_code"})
            if form.get("grant_type") == ["authorization_code"]:
                return httpx.Response(
                    200,
                    json={
                        "access_token": ACCESS,
                        "refresh_token": REFRESH,
                        "api_domain": API[self.home],
                        "expires_in": 3600,
                    },
                )
            return httpx.Response(200, json={"access_token": ACCESS, "expires_in": 3600})
        if url.host.startswith("www.zohoapis.") and url.path.endswith("/search"):
            return httpx.Response(204)
        return httpx.Response(404, json={"code": "INVALID_URL_PATTERN"})


@pytest.fixture
def eu() -> MultiDC:
    return MultiDC()


@pytest.fixture
def zc(store: CloudStore, seed: Seed, eu: MultiDC) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, zoho_transport=httpx.MockTransport(eu.handler)
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def begin(zc: TestClient, auth: dict[str, str], dc: str | None = None) -> tuple[str, Any]:
    state = parse_qs(urlparse(zc.post("/api/v1/zoho/connect", headers=auth).json()["url"]).query)[
        "state"
    ][0]
    page = zc.get("/auth/zoho/start", params={"state": state, **({"dc": dc} if dc else {})})
    assert page.status_code == 200, page.text
    return state, page


def go_link(page: Any) -> Any:
    m = re.search(r"class='go' href='([^']+)'", page.text)
    assert m
    return urlparse(html.unescape(m.group(1)))


def test_callback_location_sends_exchange_and_api_calls_to_the_eu(
    zc: TestClient, eu: MultiDC, store: CloudStore
) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)  # the client says "us"; the person lives in the EU
    state, page = begin(zc, auth)
    assert go_link(page).netloc == "accounts.zoho.com"  # the global accounts host
    r = zc.get(
        "/auth/zoho/callback/",
        params={
            "code": "c",
            "state": state,
            "location": "eu",
            "accounts-server": "https://accounts.zoho.eu",
        },
    )
    assert r.status_code == 200, r.text
    token_hosts = {q.url.host for q in eu.requests if q.url.path == "/oauth/v2/token"}
    assert token_hosts == {"accounts.zoho.eu"}  # no probing, no secret sent elsewhere
    status = zc.get("/api/v1/zoho/status", headers=auth).json()
    assert status["dc"] == "eu"
    assert status["api_domain"] == "https://www.zohoapis.eu"
    zc.get("/api/v1/zoho/search", params={"q": "jane@acme.test"}, headers=auth)
    api_hosts = {q.url.host for q in eu.requests if q.url.path.startswith("/crm/")}
    assert api_hosts == {"www.zohoapis.eu"}
    # The first detected DC is the org default: the next person's page shows it.
    company = store._q("SELECT dc FROM zoho_org_dc")
    assert company[0]["dc"] == "eu"


def test_location_alone_is_enough(zc: TestClient, eu: MultiDC) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, _ = begin(zc, auth)
    r = zc.get("/auth/zoho/callback/", params={"code": "c", "state": state, "location": "eu"})
    assert r.status_code == 200
    assert {q.url.host for q in eu.requests} == {"accounts.zoho.eu"}


def test_manual_override_goes_to_the_chosen_dc(zc: TestClient, eu: MultiDC) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, page = begin(zc, auth, dc="eu")
    assert "Europe (you chose it)" in page.text
    assert go_link(page).netloc == "accounts.zoho.eu"
    r = zc.get("/auth/zoho/callback/", params={"code": "c", "state": state})
    assert r.status_code == 200, r.text
    assert {q.url.host for q in eu.requests} == {"accounts.zoho.eu"}
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["dc"] == "eu"


def test_unknown_dc_choice_means_detect(zc: TestClient) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    _, page = begin(zc, auth, dc="mars")
    assert "Detected automatically" in page.text
    assert go_link(page).netloc == "accounts.zoho.com"


def test_without_params_the_known_dcs_are_probed_in_order(zc: TestClient, eu: MultiDC) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, _ = begin(zc, auth)
    r = zc.get("/auth/zoho/callback/", params={"code": "c", "state": state})
    assert r.status_code == 200, r.text
    hosts = [q.url.host for q in eu.requests]
    assert hosts[:2] == ["accounts.zoho.com", "accounts.zoho.eu"]  # stopped at the first yes
    assert all(h.startswith("accounts.zoho") for h in hosts)
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["dc"] == "eu"


def test_state_stays_bound_to_person_and_browser(zc: TestClient, store: CloudStore) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, _ = begin(zc, auth, dc="eu")
    zc.cookies.clear()  # another browser
    r = zc.get("/auth/zoho/callback/", params={"code": "c", "state": state, "location": "eu"})
    assert r.status_code == 400
    assert zc.get("/api/v1/zoho/status", headers=auth).json()["connected"] is False


def test_detect_dc_ignores_unknown_hosts() -> None:
    assert detect_dc("https://evil.test", "eu", "us") == ("https://accounts.zoho.eu", "eu")
    assert detect_dc("https://evil.test", "xx", "in") == ("https://accounts.zoho.in", None)
    assert detect_dc(None, None, None) == ("https://accounts.zoho.com", None)
    assert probe_order("eu")[0] == "https://accounts.zoho.eu"
    assert len(set(probe_order("eu"))) == len(probe_order("eu"))


# --- UX-35 pages -------------------------------------------------------------------------------
def test_connect_page_lists_reads_writes_dc_and_cancel(zc: TestClient) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, page = begin(zc, auth)
    text = page.text
    assert "meetings, contacts, deals" in text
    assert "meetings and notes after you approve them" in text
    assert "Zoho data centre" in text
    assert "Change" in text
    assert f"/auth/zoho/cancel?state={state}" in text
    assert "<script" not in text


def test_cancel_kills_the_link(zc: TestClient) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, _ = begin(zc, auth)
    r = zc.get("/auth/zoho/cancel", params={"state": state})
    assert r.status_code == 200
    assert "You can close this tab" in r.text
    r = zc.get("/auth/zoho/callback/", params={"code": "c", "state": state, "location": "eu"})
    assert r.status_code == 400


def test_done_page_has_the_deep_link_and_no_token_or_code(zc: TestClient) -> None:
    auth = signup(zc, "Acme", "admin@acme.test")
    set_org_client(zc, auth)
    state, _ = begin(zc, auth)
    code = "one-time-code-123"
    r = zc.get("/auth/zoho/callback/", params={"code": code, "state": state, "location": "eu"})
    assert r.status_code == 200
    assert "Zoho is connected" in r.text
    assert "You can close this tab." in r.text
    assert "href='agn-sales-shield://zoho/connected'" in r.text
    for secret in (code, state, ACCESS, REFRESH):
        assert secret not in r.text
