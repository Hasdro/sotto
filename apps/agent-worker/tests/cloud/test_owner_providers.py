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
from tests.cloud.byo import own_key, own_route
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
    assert "key_source" not in b  # D-079: the client never learns whose key it is
    assert "ASSEMBLYAI_API_KEY" in b["key_status"]
    assert tested.post("/api/v1/stt-token/assemblyai", headers=s["auth"]).status_code == 200
    for path in ("/api/v1/me", "/api/v1/features", "/api/v1/company/settings"):
        assert GROQ not in tested.get(path, headers=s["auth"]).text


def test_byo_off_company_writes_get_off_by_platform(client: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    writes = [
        ("POST", "/api/v1/company/prompts", {"key": "suggest", "body": "x" * 30}),
        ("GET", "/api/v1/company/prompts", None),
    ]
    for method, path, payload in writes:
        r = client.request(method, path, json=payload, headers=s["auth"])
        assert r.status_code == 403, (path, r.text)
        assert r.json()["code"] == "feature_unavailable"
        assert r.json()["feature"] == "byo_providers"
        assert r.json()["state"] == "off_by_platform"
    # D-078: the company key and route write routes are gone altogether (405), BYO or not.
    for method, path in [
        ("PUT", "/api/v1/company/keys/GROQ_API_KEY"),
        ("DELETE", "/api/v1/company/keys/GROQ_API_KEY"),
        ("POST", "/api/v1/company/keys/GROQ_API_KEY/test"),
        ("PUT", "/api/v1/company/routes/suggest"),
        ("DELETE", "/api/v1/company/routes/suggest"),
    ]:
        r = client.request(method, path, json={}, headers=s["auth"])
        assert r.status_code == 405, (path, r.status_code)
    f = client.get("/api/v1/features", headers=s["auth"]).json()["features"]
    assert f["byo_providers"] == {"state": "off_by_platform"}


def test_byo_on_company_key_wins_and_the_vendor_sets_the_route(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    owner.put("/api/owner/keys/GROQ_API_KEY", json={"value": GROQ}, headers=H)
    assert owner.put(
        f"/api/owner/companies/{cid}/byo", json={"enabled": True}, headers=H
    ).json() == {"enabled": True}
    own = "gsk_" + "o" * 30
    own_key(store, s, "GROQ_API_KEY", own)
    r = own_route(owner, s, "suggest", "gemini", "gemini-2.5-flash")
    assert r.status_code == 200, r.text
    assert GROQ not in r.text
    assert own not in r.text
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert "key_source" not in b  # D-079
    assert b["stages"]["suggest"]["api_key_env"] == "GEMINI_API_KEY"  # the vendor-set route applies
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


# --- Round 3 (M-003, D-081/D-083/D-084): DeepSeek + per-company custom providers -----------

CUSTOM_URL = "https://llm.acme.test/v1"
CUSTOM_KEY = "sk-acme-" + "k" * 20
CUSTOM_BAD_KEY = "sk-" + "x" * 20 + "bad"


def _custom(c: TestClient, cid: str, **kw: Any) -> dict[str, Any]:
    body = {"name": "Acme LLM", "base_url": CUSTOM_URL, "credential": CUSTOM_KEY}
    body.update(kw)
    r = c.post(f"/api/owner/companies/{cid}/providers", json=body, headers=H)
    assert r.status_code == 201, r.text
    return r.json()


def _company_routes(c: TestClient, cid: str) -> list[dict[str, Any]]:
    r = c.get(f"/api/owner/companies/{cid}/routes", headers=H)
    assert r.status_code == 200, r.text
    return r.json()["stages"]


def test_deepseek_selectable_with_host_bound_key(
    owner: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    s = sign_up()
    providers = owner.get("/api/owner/providers", headers=H).json()["providers"]
    deepseek = next(p for p in providers if p["id"] == "deepseek")
    assert deepseek["kind"] == "llm"
    assert deepseek["key_env"] == "DEEPSEEK_API_KEY"
    assert [m["id"] for m in deepseek["models"]] == ["deepseek-flash", "deepseek-v4-pro"]
    assert all(m["enabled"] for m in deepseek["models"])
    assert "deepseek-chat" not in [m["id"] for m in deepseek["models"]]  # retired 2026-07-24
    owner.put("/api/owner/keys/DEEPSEEK_API_KEY", json={"value": "sk-ds-" + "d" * 20}, headers=H)
    r = owner.put(
        "/api/owner/routes/suggest",
        json={"provider": "deepseek", "model": "deepseek-flash"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    b = owner.get("/api/v1/bundle", headers=s["auth"]).json()
    assert b["stages"]["suggest"]["base_url"] == "https://api.deepseek.com/v1"
    assert b["stages"]["suggest"]["api_key_env"] == "DEEPSEEK_API_KEY"
    assert b["stages"]["suggest"]["vendor"] == "deepseek"
    # The key only goes to api.deepseek.com (D-016).
    from sotto_worker.adapters.factory import check_key_host

    check_key_host("DEEPSEEK_API_KEY", "https://api.deepseek.com/v1")
    with pytest.raises(ValueError):
        check_key_host("DEEPSEEK_API_KEY", "https://api.evil.test/v1")


def test_custom_provider_crud_starts_with_zero_models(owner: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    p = _custom(owner, cid)
    assert p["id"] == "custom-acme-llm"
    assert p["models"] == []  # OpenCode §4: a custom provider starts with 0 models
    assert p["key_set"] is True  # same field name as a built-in provider
    assert p["key_env"] == "ENDPOINT_CUSTOMACMELLM_KEY"
    assert p["custom"] is True
    assert CUSTOM_KEY not in owner.get(
        f"/api/owner/companies/{cid}/providers", headers=H
    ).text
    # The company page list merges it in alongside the built-ins.
    merged = owner.get(f"/api/owner/providers?company={cid}", headers=H).json()["providers"]
    assert next(x for x in merged if x["id"] == "custom-acme-llm")["custom"] is True
    assert next(x for x in merged if x["id"] == "groq")["custom"] is False
    # Add a model, toggle it, rename the provider (the id never changes).
    r = owner.post(
        f"/api/owner/companies/{cid}/providers/{p['id']}/models",
        json={"id": "acme-large", "display_name": "Acme Large"},
        headers=H,
    )
    assert r.status_code == 201, r.text
    assert r.json()["models"] == [
        {"id": "acme-large", "display_name": "Acme Large", "enabled": True}
    ]
    r = owner.patch(
        f"/api/owner/companies/{cid}/providers/{p['id']}/models/acme-large",
        json={"enabled": False},
        headers=H,
    )
    assert r.json()["models"][0]["enabled"] is False
    r = owner.patch(
        f"/api/owner/companies/{cid}/providers/{p['id']}",
        json={"name": "Acme LLM 2"},
        headers=H,
    )
    assert r.json()["id"] == "custom-acme-llm"
    assert r.json()["name"] == "Acme LLM 2"
    # Validation: an http endpoint with a key, an unknown format, a custom header
    # without a name — and a duplicate model id.
    for bad in (
        {"name": "Bad", "base_url": "http://x.test/v1", "credential": CUSTOM_KEY},
        {"name": "Bad", "base_url": CUSTOM_URL, "format": "smoke-signals"},
        {"name": "Bad", "base_url": CUSTOM_URL, "auth_mode": "custom-header"},
    ):
        assert (
            owner.post(f"/api/owner/companies/{cid}/providers", json=bad, headers=H).status_code
            == 400
        )
    assert (
        owner.post(
            f"/api/owner/companies/{cid}/providers/{p['id']}/models",
            json={"id": "acme-large"},
            headers=H,
        ).status_code
        == 400
    )
    assert owner.get("/api/owner/companies/nope/providers", headers=H).status_code == 404


def test_custom_route_needs_an_enabled_model_and_flags_it_when_disabled(
    owner: TestClient, sign_up: SignUp
) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    p = _custom(owner, cid)
    pid = p["id"]
    owner.post(
        f"/api/owner/companies/{cid}/providers/{pid}/models",
        json={"id": "acme-large"},
        headers=H,
    )
    owner.post(
        f"/api/owner/companies/{cid}/providers/{pid}/models",
        json={"id": "acme-small"},
        headers=H,
    )
    owner.patch(
        f"/api/owner/companies/{cid}/providers/{pid}/models/acme-small",
        json={"enabled": False},
        headers=H,
    )
    # A disabled model cannot be set on a stage.
    r = owner.put(
        f"/api/owner/companies/{cid}/routes/suggest",
        json={"provider": pid, "model": "acme-small"},
        headers=H,
    )
    assert r.status_code == 400
    assert r.json()["code"] == "model_unavailable"
    # An enabled one can — and setting it turns BYO on (D-079).
    r = owner.put(
        f"/api/owner/companies/{cid}/routes/suggest",
        json={"provider": pid, "model": "acme-large"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    assert r.json()["byo"] is True
    stage = next(x for x in r.json()["stages"] if x["id"] == "suggest")
    assert (stage["provider_id"], stage["model"], stage["source"]) == (
        pid,
        "acme-large",
        "company",
    )
    assert stage["model_available"] is True
    # Disabling the model in use flags the stage; it is never silently swapped.
    owner.patch(
        f"/api/owner/companies/{cid}/providers/{pid}/models/acme-large",
        json={"enabled": False},
        headers=H,
    )
    stage = next(x for x in _company_routes(owner, cid) if x["id"] == "suggest")
    assert stage["model_available"] is False
    assert stage["model"] == "acme-large"  # still the stored pair, flagged for a re-pick


def test_custom_provider_test_records_discovered_models(
    tested: TestClient, store: CloudStore, sign_up: SignUp
) -> None:
    o = _owner(tested, store)
    s = sign_up()
    cid = s["company"]["id"]
    p = _custom(o, cid)
    r = o.post(
        f"/api/owner/companies/{cid}/providers/{p['id']}/test", json={}, headers=H
    )
    assert r.status_code == 200, r.text
    assert r.json()["result"] == {
        "ok": True,
        "detail": "key works; 3 models available",
        "discovered_models": ["m1", "m2", "m3"],
    }
    assert [m["id"] for m in r.json()["models"]] == ["m1", "m2", "m3"]
    assert all(m["enabled"] for m in r.json()["models"])
    # A rejected key fails the test and records nothing.
    bad = _custom(o, cid, name="Bad Key", credential=CUSTOM_BAD_KEY)
    r = o.post(
        f"/api/owner/companies/{cid}/providers/{bad['id']}/test", json={}, headers=H
    )
    assert r.json()["result"]["ok"] is False
    assert r.json()["models"] == []
    assert r.json()["test"]["ok"] is False


def test_custom_route_reaches_the_bundle_from_the_db(
    owner: TestClient, store: CloudStore, sign_up: SignUp, seed: Seed
) -> None:
    from sotto_worker.cloud.bundle import build_bundle
    from sotto_worker.cloud.store import Principal

    s = sign_up()
    cid = s["company"]["id"]
    p = _custom(owner, cid)
    pid = p["id"]
    owner.post(
        f"/api/owner/companies/{cid}/providers/{pid}/models",
        json={"id": "acme-large"},
        headers=H,
    )
    r = owner.put(
        f"/api/owner/companies/{cid}/routes/suggest",
        json={"provider": pid, "model": "acme-large"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    # The global seed does not know the provider (D-082: the endpoint comes from the DB).
    with pytest.raises(ValueError, match="unknown provider"):
        seed.catalog.route_for("suggest", pid, "acme-large", seed.routing.stages["suggest"])
    merged = platform.company_seed(store, seed, cid)
    out = build_bundle(
        merged,
        company_name="Acme",
        settings={},
        routes=platform.effective_routes(store, cid),
        own_playbook=[],
        keys=None,
    )
    stage = out["stages"]["suggest"]
    assert stage["base_url"] == CUSTOM_URL  # the DB endpoint, never from the request
    assert stage["api_key_env"] == "ENDPOINT_CUSTOMACMELLM_KEY"
    assert stage["vendor"] == pid
    # The key itself travels only through the keys allow-list, while BYO is on.
    row = store._q(
        "SELECT id, email, name FROM users WHERE company_id = ?", (cid,)
    )[0]
    who = Principal(
        user_id=str(row["id"]),
        company_id=cid,
        role="admin",
        device_id=None,
        email=str(row["email"]),
        name=str(row["name"]),
    )
    assert store.keys_for_call(who, {"ENDPOINT_CUSTOMACMELLM_KEY"}) == {
        "ENDPOINT_CUSTOMACMELLM_KEY": CUSTOM_KEY
    }


def test_delete_custom_provider_resets_its_routes(owner: TestClient, sign_up: SignUp) -> None:
    s = sign_up()
    cid = s["company"]["id"]
    p = _custom(owner, cid)
    pid = p["id"]
    owner.post(
        f"/api/owner/companies/{cid}/providers/{pid}/models",
        json={"id": "acme-large"},
        headers=H,
    )
    r = owner.put(
        f"/api/owner/companies/{cid}/routes/suggest",
        json={"provider": pid, "model": "acme-large"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    r = owner.delete(f"/api/owner/companies/{cid}/providers/{pid}", headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["providers"] == []
    stage = next(x for x in _company_routes(owner, cid) if x["id"] == "suggest")
    assert stage["source"] in ("platform", "default")  # no longer the company's override
    assert stage["provider_id"] != pid
    assert stage["model_available"] is True


def test_providers_list_honours_company_id_param(owner: TestClient, sign_up: SignUp) -> None:
    """Follow-up 1: the company page calls GET /api/owner/providers?company_id=<id>
    (the ?company= spelling keeps working). A custom provider only appears with the
    company named; without it the list is built-ins only."""
    s = sign_up()
    cid = s["company"]["id"]
    _custom(owner, cid)
    plain = owner.get("/api/owner/providers", headers=H).json()["providers"]
    assert not any(p.get("custom") for p in plain)
    for q in (f"?company_id={cid}", f"?company={cid}"):
        with_company = owner.get(f"/api/owner/providers{q}", headers=H).json()["providers"]
        assert any(p.get("custom") for p in with_company)
    assert owner.get("/api/owner/providers?company_id=nope", headers=H).status_code == 404


def test_seed_model_toggle_disables_it_everywhere(
    owner: TestClient, sign_up: SignUp
) -> None:
    """Follow-up 2 (D-081): a per-model Enabled toggle for a seed provider, immediate,
    no Save. A disabled model leaves providers_out, cannot be set on a stage, and a
    stored route using it is flagged unavailable (never silently swapped). Re-enabling
    clears the flag. The Groq ids carry a slash, so this also exercises {mid:path}."""
    s = sign_up()
    cid = s["company"]["id"]
    pid, model, other = "groq", "openai/gpt-oss-20b", "openai/gpt-oss-120b"
    r = owner.put(
        f"/api/owner/companies/{cid}/routes/suggest",
        json={"provider": pid, "model": model},
        headers=H,
    )
    assert r.status_code == 200, r.text
    r = owner.patch(
        f"/api/owner/providers/{pid}/models/{model}", json={"enabled": False}, headers=H
    )
    assert r.status_code == 200, r.text
    groq = next(p for p in r.json()["providers"] if p["id"] == pid)
    assert next(m for m in groq["models"] if m["id"] == model)["enabled"] is False
    assert next(m for m in groq["models"] if m["id"] == other)["enabled"] is True
    r = owner.put(
        "/api/owner/routes/suggest", json={"provider": pid, "model": model}, headers=H
    )
    assert r.status_code == 400 and r.json()["code"] == "model_unavailable"
    stage = next(x for x in _company_routes(owner, cid) if x["id"] == "suggest")
    assert stage["model_available"] is False
    assert stage["model"] == model  # the stored pair is untouched
    r = owner.patch(
        f"/api/owner/providers/{pid}/models/{model}", json={"enabled": True}, headers=H
    )
    assert r.status_code == 200, r.text
    groq = next(p for p in r.json()["providers"] if p["id"] == pid)
    assert next(m for m in groq["models"] if m["id"] == model)["enabled"] is True
    stage = next(x for x in _company_routes(owner, cid) if x["id"] == "suggest")
    assert stage["model_available"] is True
    assert (
        owner.patch("/api/owner/providers/nope/models/x", json={"enabled": False}, headers=H)
        .status_code
        == 404
    )
    assert (
        owner.patch(f"/api/owner/providers/{pid}/models/nope", json={"enabled": False}, headers=H)
        .status_code
        == 400
    )
    assert (
        owner.patch(f"/api/owner/providers/{pid}/models/{model}", json={"enabled": "yes"}, headers=H)
        .status_code
        == 400
    )
    # A custom provider id is not a seed provider: the override table never touches it.
    custom = _custom(owner, cid)
    assert (
        owner.patch(
            f"/api/owner/providers/{custom['id']}/models/m1", json={"enabled": False}, headers=H
        ).status_code
        == 404
    )
