"""Slice 2A Commit 2 (F-02, F-03, F-05): R1 benchmark gate labelling, sign-up webhook test &
refused-attempt counter, and per-stage effective key_source + Test stage endpoint."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, OWNER_EMAIL, OWNER_PASSWORD, SignUp, fake_minter

SAME = {"origin": ORIGIN}


@pytest.fixture
def tested_owner(store: CloudStore, seed: Seed) -> TestClient:
    async def tester(_provider: str, _url: str, _key: str) -> list[str]:
        return ["m1", "m2"]

    config = CloudConfig(
        public_origin=ORIGIN,
        static_dir=None,
        secure_cookies=False,
        stt_minter=fake_minter,
        key_tester=tester,
    )
    c = TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)
    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    c.post(
        "/api/owner/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers=SAME,
    )
    c.post(
        "/api/owner/password",
        json={"current": OWNER_PASSWORD, "new": OWNER_PASSWORD + "-2"},
        headers=SAME,
    )
    return c


def test_signup_webhook_refused_counter_and_test_signup(
    owner: TestClient, client: TestClient
) -> None:
    # Refused webhook attempt (no secret yet) increments refused_count with no PII stored.
    r = client.post(
        "/hooks/zoho-forms/signup",
        json={"company": "Blocked Co", "name": "B", "email": "b@blocked.test"},
    )
    assert r.status_code == 401
    data = owner.get("/api/owner/signups").json()
    assert data["refused_count"] == 1
    assert isinstance(data["refused_last_at"], int)
    assert data["signups"] == []

    # Send test sign-up lands a distinctive test company in the queue.
    tr = owner.post("/api/owner/signups/test", json={}, headers=SAME)
    assert tr.status_code == 201
    body = tr.json()
    assert body["ok"] is True
    assert any(s["company"] == "Test — delete me" for s in body["signups"])


def test_stage_key_source_and_test_stage_endpoint(
    tested_owner: TestClient, sign_up: SignUp
) -> None:
    s = sign_up("Zylker", "admin@z.test")
    cid = s["company"]["id"]

    # Initially no keys saved: live stages report key_source == "missing".
    prov = tested_owner.get("/api/owner/providers").json()
    suggest = next(st for st in prov["stages"] if st["id"] == "suggest")
    assert suggest["key_source"]["source"] == "missing"

    # Testing a stage without a key returns ok=False with a clear detail.
    t_miss = tested_owner.post("/api/owner/routes/suggest/test", json={}, headers=SAME)
    assert t_miss.status_code == 200
    assert t_miss.json()["ok"] is False
    assert "No key" in t_miss.json()["detail"]

    # Save platform key for the suggest provider -> key_source="platform" and Test passes.
    provider_obj = next(p for p in prov["providers"] if p["id"] == suggest["provider_id"])
    assert (
        tested_owner.put(
            f"/api/owner/keys/{provider_obj['key_env']}",
            json={"value": "sk-test-valid-key-123456"},
            headers=SAME,
        ).status_code
        == 200
    )

    prov2 = tested_owner.get("/api/owner/providers").json()
    suggest2 = next(st for st in prov2["stages"] if st["id"] == "suggest")
    assert suggest2["key_source"]["source"] == "platform"
    assert suggest2["key_source"]["label"] == "AGN key"

    # Company routes endpoint also returns key_source for each stage.
    croutes = tested_owner.get(f"/api/owner/companies/{cid}/routes").json()
    csuggest = next(st for st in croutes["stages"] if st["id"] == "suggest")
    assert csuggest["key_source"]["source"] == "platform"

    t_ok = tested_owner.post("/api/owner/routes/suggest/test", json={}, headers=SAME)
    assert t_ok.status_code == 200
    res = t_ok.json()
    assert res["ok"] is True
    assert isinstance(res["latency_ms"], int)
    # Audit log records the stage test.
    audit = tested_owner.get("/api/owner/audit").json()["items"]
    assert any(a["action"] == "owner.stage.tested" for a in audit)
