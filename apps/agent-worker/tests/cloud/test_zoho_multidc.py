"""ZC-01 (D-064): the platform Zoho client per DC family, picked by the detected DC; an
owner-set per-org override wins; no client secret ever leaves the server."""

from __future__ import annotations

import asyncio

import httpx
from starlette.testclient import TestClient

from sotto_worker.cloud.store import CloudStore
from sotto_worker.cloud.zoho.oauth import ACCOUNTS, Client, exchange_code, refresh_access
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}
MAIN_ID, MAIN_SECRET = "1000.MAINCLIENTID0001", "main-secret-" + "m" * 20
EU_SECRET = "eu-secret-" + "e" * 20
OVR_ID, OVR_SECRET = "1000.ORGOVERRIDE00042", "org-secret-" + "o" * 20


def _setup(owner: TestClient) -> None:
    r = owner.put(
        "/api/owner/zoho",
        json={"client_id": MAIN_ID, "client_secret": MAIN_SECRET, "dc": "us"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    r = owner.put(
        "/api/owner/zoho/clients/eu",
        json={"client_id": MAIN_ID, "client_secret": EU_SECRET},
        headers=H,
    )
    assert r.status_code == 200, r.text


def test_an_eu_detected_user_gets_the_eu_family_client(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    _setup(owner)
    company = sign_up()["company"]["id"]
    eu = store.zoho_client(company, dc="eu")
    assert eu is not None
    assert eu["client_secret"] == EU_SECRET
    assert eu["dc"] == "eu"
    us = store.zoho_client(company, dc="us")
    assert us is not None
    assert us["client_secret"] == MAIN_SECRET
    # Detected later (the callback names the EU accounts server): the code swap still takes the
    # EU secret, even when the client was looked up before the DC was known.
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        form = dict(httpx.QueryParams(request.content.decode()))
        seen.append({"host": request.url.host, **form})
        return httpx.Response(
            200,
            json={
                "refresh_token": "r",
                "access_token": "a",
                "api_domain": "https://www.zohoapis.eu",
                "expires_in": 3600,
            },
        )

    client = Client.from_store(store.zoho_client(company) or {})

    async def go() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as h:
            await exchange_code(h, client, ACCOUNTS["eu"], "code", "https://x/cb")
            await refresh_access(h, client, ACCOUNTS["us"], "r")

    asyncio.run(go())
    assert seen[0]["host"] == "accounts.zoho.eu"
    assert seen[0]["client_secret"] == EU_SECRET
    assert seen[1]["host"] == "accounts.zoho.com"
    assert seen[1]["client_secret"] == MAIN_SECRET


def test_an_owner_set_org_override_wins_and_is_write_only(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    _setup(owner)
    company = sign_up()["company"]["id"]
    r = owner.put(
        f"/api/owner/companies/{company}/zoho-client",
        json={"client_id": OVR_ID, "client_secret": OVR_SECRET, "dc": "in"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    picked = store.zoho_client(company, dc="eu")
    assert picked is not None
    assert picked["scope"] == "org"
    assert picked["client_id"] == OVR_ID
    shown = owner.get("/api/owner/zoho/clients").json()
    assert shown["overrides"][0]["client_id_ends"] == "0042"
    assert shown["platform"]["client_id_ends"] == "0001"
    assert shown["dc_clients"] == [
        {"dc": "eu", "client_id_ends": "0001", "updated_at": shown["dc_clients"][0]["updated_at"]}
    ]
    text = r.text + owner.get("/api/owner/zoho/clients").text + owner.get("/api/owner/zoho").text
    for secret in (MAIN_SECRET, EU_SECRET, OVR_SECRET, MAIN_ID, OVR_ID):
        assert secret not in text
    assert owner.delete(f"/api/owner/companies/{company}/zoho-client", headers=H).status_code == 200
    back = store.zoho_client(company, dc="eu")
    assert back is not None
    assert back["scope"] == "platform"


def test_only_per_dc_clients_count_as_the_platform_client(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    company = sign_up()["company"]["id"]
    assert store.zoho_client(company) is None
    owner.put(
        "/api/owner/zoho/clients/eu",
        json={"client_id": MAIN_ID, "client_secret": EU_SECRET},
        headers=H,
    )
    assert store.zoho_client_status(company)["active"] == "platform"
    picked = store.zoho_client(company)
    assert picked is not None
    assert picked["dc"] == "eu"


def test_zoho_client_routes_are_owner_only(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    assert client.get("/api/owner/zoho/clients").status_code == 401
    r = client.put(
        f"/api/owner/companies/{s['company']['id']}/zoho-client",
        json={"client_id": OVR_ID, "client_secret": OVR_SECRET},
        headers={**H, **s["auth"]},
    )
    assert r.status_code == 401
    r = client.put(
        "/api/owner/zoho/clients/xx",
        json={"client_id": OVR_ID, "client_secret": OVR_SECRET},
        headers=H,
    )
    assert r.status_code == 401
