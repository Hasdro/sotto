"""Fixtures for the management server (D-022)."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from sotto_worker.server.vault import Vault

SECRET = "c" * 40
PASSWORD = "-".join(["correct", "horse", "battery"])
ORIGIN = "https://cloud.example.com"
OWNER_EMAIL = "owner@example.com"
OWNER_PASSWORD = "-".join(["owner", "pass", "123456"])


@pytest.fixture(scope="session")
def seed() -> Seed:
    return Seed.load()


@pytest.fixture
def store(tmp_path: Path) -> Iterator[CloudStore]:
    s = CloudStore(tmp_path / "cloud.db", Vault(SECRET))
    yield s
    s.close()


minted: list[tuple[str, str]] = []


async def fake_minter(vendor: str, key: str) -> dict[str, Any]:
    minted.append((vendor, key))
    return {"token": f"tmp-{vendor}", "param": "token", "ttl_s": 60}


@pytest.fixture
def client(store: CloudStore, seed: Seed) -> TestClient:
    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, secure_cookies=False, stt_minter=fake_minter
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


SignUp = Callable[..., dict[str, Any]]


@pytest.fixture
def sign_up(client: TestClient) -> SignUp:
    """Signs up a company; returns the session body plus an `auth` header dict."""

    def go(company: str = "Acme", email: str = "admin@acme.test", **device: Any) -> dict[str, Any]:
        r = client.post(
            "/api/v1/auth/signup",
            json={
                "company": company,
                "name": "Ada Admin",
                "email": email,
                "password": PASSWORD,
                "device": {"id": "dev-1", "platform": "web", "label": "Chrome", **device},
            },
        )
        assert r.status_code == 201, r.text
        body: dict[str, Any] = r.json()
        body["auth"] = {"authorization": f"Bearer {body['token']}"}
        return body

    return go


@pytest.fixture
def owner(client: TestClient, store: CloudStore) -> TestClient:
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    r = client.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"origin": ORIGIN},
    )
    assert r.status_code == 200, r.text
    return client
