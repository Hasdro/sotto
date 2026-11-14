"""DD-1 (D-059, D-061): AGN's platform keys and model routing in the owner console, and the BYO
entitlement that alone lets a company change its own keys, models and prompts (R7: one test
per state)."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.store import CloudStore
from tests.cloud.conftest import ORIGIN, SignUp, fake_minter

H = {"origin": ORIGIN}
GROQ = "gsk_" + "p" * 30


@pytest.fixture
def tested(store: CloudStore, seed: Seed) -> TestClient:
    async def tester(_provider: str, _url: str, key: str) -> list[str]:
        if key.endswith("bad"):
            import httpx

            raise httpx.HTTPStatusError(
                "no", request=httpx.Request("GET", "https://x"), response=httpx.Response(401)
            )
        return ["m1", "m2", "m3"]

    config = CloudConfig(
        public_origin=ORIGIN, static_dir=None, stt_minter=fake_minter, key_tester=tester
    )
    return TestClient(create_cloud_app(config, store, seed), base_url=ORIGIN)


def _owner(c: TestClient, store: CloudStore) -> TestClient:
    from tests.cloud.conftest import OWNER_EMAIL, OWNER_PASSWORD

    store.create_owner(OWNER_EMAIL, "Owner", OWNER_PASSWORD)
    c.post("/api/owner/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, headers=H)
    c.post(
        "/api/owner/password",
        json={"current": OWNER_PASSWORD, "new": OWNER_PASSWORD + "-2"},
        headers=H,
    )
    return c


def _provider(body: dict[str, Any], pid: str) -> dict[str, Any]:
    return next(p for p in body["providers"] if p["id"] == pid)


def test_platform_key_add_test_replace_remove_and_never_returned(
    tested: TestClient, store: CloudStore
) -> None:
    o = _owner(tested, store)
    r = o.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ}, headers=H)
    assert r.status_code == 200
    assert _provider(r.json(), "groq")["key_set"] is True
    groq = _provider(r.json(), "groq")
    assert groq["key_page"].startswith("https://")
    assert groq["steps"]
    r = o.post("/api/owner/keys/GROQ_API_KEY/test", json={}, headers=H)
    assert r.json()["result"] == {"ok": True, "detail": "3 models available"}
    assert _provider(r.json(), "groq")["test"]["ok"] is True
    r = o.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ + "bad"}, headers=H)
    assert _provider(r.json(), "groq")["test"] is None  # a replaced key needs a new test
    r = o.post("/api/owner/keys/GROQ_API_KEY/test", json={}, headers=H)
    assert r.json()["result"]["ok"] is False
    everything = r.text + o.get("/api/owner/providers").text + o.get("/api/owner/audit").text
    assert GROQ not in everything
    raw = store._q("SELECT ciphertext FROM platform_keys")[0]["ciphertext"]
    assert GROQ.encode() not in raw  # AES-GCM at rest
    r = o.delete("/api/owner/keys/GROQ_API_KEY", headers=H)
    assert _provider(r.json(), "groq")["key_set"] is False
    assert o.put("/api/owner/keys/NOPE_KEY", json={"value": GROQ}, headers=H).status_code == 404


def test_companies_use_platform_keys_without_seeing_them_in_any_response(
    tested: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    s = sign_up()
    o = _owner(tested, store)
    o.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ}, headers=H)
    o.put("/api/owner/keys/ASSEMBLYAI_API_KEY", json={"value": "aai-" + "q" * 20}, headers=H)
    b = tested.get("/api/v1/bundle", headers=s["auth"]).json()
    # The call itself needs the model key (D-022: the client calls the vendor), and only that.
    assert b["keys"] == {"GROQ_API_KEY": GROQ}
    assert b["key_source"]["GROQ_API_KEY"] == "platform"
    assert "ASSEMBLYAI_API_KEY" in b["key_status"]
    assert tested.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 200
    for path in ("/api/v1/me", "/api/v1/features", "/api/v1/company/settings"):
        assert GROQ not in tested.get(path, headers=s["auth"]).text


def test_byo_off_company_writes_get_off_by_platform(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    writes = [
        ("PUT", "/api/v1/company/keys/GROQ_API_KEY", {"value": GROQ}),
        ("DELETE", "/api/v1/company/keys/GROQ_API_KEY", None),
        ("POST", "/api/v1/company/keys/GROQ_API_KEY/test", {}),
        ("PUT", "/api/v1/company/routes/suggest", {"provider": "gemini", "model": "m"}),
        ("DELETE", "/api/v1/company/routes/suggest", None),
        ("POST", "/api/v1/company/prompts", {"key": "suggest", "body": "x" * 30}),
        ("GET", "/api/v1/company/prompts", None),
    ]
    for method, path, payload in writes:
        r = client.request(method, path, json=payload, headers=s["auth"])
        assert r.status_code == 403, (path, r.text)
        assert r.json()["code"] == "feature_unavailable"
        assert r.json()["feature"] == "byo_providers"
        assert r.json()["state"] == "off_by_platform"
    f = client.get("/api/v1/features", headers=s["auth"]).json()["features"]
    assert f["byo_providers"] == {"state": "off_by_platform"}


def test_byo_on_company_admin_can_write_and_its_key_wins(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ}, headers=H)
    assert owner.put(
        f"/api/owner/companies/{cid}/byo", json={"enabled": True}, headers=H
    ).json() == {"enabled": True}
    own = "gsk_" + "o" * 30
    r = owner.put("/api/v1/company/keys/GROQ_API_KEY", json={"value": own}, headers=s["auth"])
    assert r.status_code == 200
    assert GROQ not in r.text
    assert own not in r.text
    r = owner.put(
        "/api/v1/company/routes/suggest",
        json={"provider": "gemini", "model": "gemini-2.5-flash"},
        headers=s["auth"],
    )
    assert r.status_code == 200
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["key_source"]["GROQ_API_KEY"] == "company"
    assert b["overrides"] == ["suggest"]
    assert owner.get("/api/v1/features", headers=s["auth"]).json()["features"]["byo_providers"] == {
        "state": "available"
    }
    # AGN switches BYO off again: the company's own key and route stop applying at once.
    owner.put(f"/api/owner/companies/{cid}/byo", json={"enabled": False}, headers=H)
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["keys"].get("GROQ_API_KEY") == GROQ
    assert b["overrides"] == []
    assert b["stages"]["suggest"]["vendor"] == "groq"


def test_platform_routing_per_stage_with_benchmark_guard_and_rollback(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    s = sign_up()
    r = owner.put(
        "/api/owner/routes/suggest",
        json={"provider": "gemini", "model": "gemini-2.5-flash"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    stage = next(x for x in r.json()["stages"] if x["id"] == "suggest")
    assert stage["source"] == "platform"
    assert stage["benchmark"] is None
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["stages"]["suggest"]["api_key_env"] == "GEMINI_API_KEY"  # next call, no deploy
    # A model whose last benchmark missed R1 is refused on a live stage (R6).
    platform.record_benchmark(
        store,
        provider_id="groq",
        model="slow-model",
        stage="suggest",
        p50_ms=900,
        p95_ms=2100,
        samples=40,
        source="replay-live",
    )
    r = owner.put(
        "/api/owner/routes/suggest", json={"provider": "groq", "model": "slow-model"}, headers=H
    )
    assert r.status_code == 409
    assert r.json()["code"] == "benchmark_failed"
    platform.record_benchmark(
        store,
        provider_id="groq",
        model="fast-model",
        stage="suggest",
        p50_ms=400,
        p95_ms=900,
        samples=40,
        source="replay-live",
    )
    r = owner.put(
        "/api/owner/routes/suggest", json={"provider": "groq", "model": "fast-model"}, headers=H
    )
    stage = next(x for x in r.json()["stages"] if x["id"] == "suggest")
    assert stage["benchmark"]["ok"] is True
    assert stage["benchmark"]["p95_ms"] == 900
    # One click back to the previous choice, then back to the seed default.
    r = owner.post("/api/owner/routes/suggest/rollback", json={}, headers=H)
    stage = next(x for x in r.json()["stages"] if x["id"] == "suggest")
    assert (stage["provider_id"], stage["model"]) == ("gemini", "gemini-2.5-flash")
    r = owner.delete("/api/owner/routes/suggest", headers=H)
    stage = next(x for x in r.json()["stages"] if x["id"] == "suggest")
    assert stage["source"] == "default"
    assert stage["provider_id"] == "groq"
    actions = [a["action"] for a in store.owner_audit()]
    assert "owner.route.set" in actions
    assert "owner.route.reset" in actions


def test_existing_companies_with_their_own_keys_keep_them_after_the_upgrade(
    tmp_path: Any,
) -> None:
    """In-place migration (no data loss): a company that already had keys gets BYO on."""
    import sqlite3

    from sotto_worker.server.vault import Vault
    from tests.cloud.conftest import SECRET

    path = tmp_path / "cloud.db"
    first = CloudStore(path, Vault(SECRET))
    cid, _ = first.signup(company="Old", name="O", email="o@old.test", password="x" * 12)
    first._db.execute("DELETE FROM company_byo")
    first._db.execute("DELETE FROM platform_settings WHERE key = 'byo_migrated'")
    first._db.execute(
        "INSERT INTO company_keys(company_id, key_env, ciphertext, updated_at) VALUES (?,?,?,1)",
        (cid, "GROQ_API_KEY", b"x"),
    )
    first.close()
    again = CloudStore(path, Vault(SECRET))
    assert platform.byo_on(again, cid)
    again.close()
    assert sqlite3.connect(path).execute("SELECT COUNT(*) FROM company_keys").fetchone()[0] == 1


def test_owner_only(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    for method, path in (
        ("GET", "/api/owner/providers"),
        ("PUT", "/api/owner/keys/GROQ_API_KEY"),
        ("PUT", "/api/owner/routes/suggest"),
        ("PUT", f"/api/owner/companies/{s['company']['id']}/byo"),
    ):
        r = client.request(method, path, json={}, headers={**H, **s["auth"]})
        assert r.status_code == 401, path
