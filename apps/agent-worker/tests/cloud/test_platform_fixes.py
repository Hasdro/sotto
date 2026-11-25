"""Security, tenancy, and HTTP integration tests for Round 4 platform fixes."""

from __future__ import annotations

import time

import httpx
import pytest
from starlette.testclient import TestClient

from sotto_worker.cloud import github as gh
from sotto_worker.cloud.obs import call_logs as obs_call_logs
from sotto_worker.cloud.obs import store as obs_store
from sotto_worker.cloud.owner import local_models as owner_lm
from sotto_worker.cloud.owner import logs as owner_logs
from sotto_worker.cloud.owner import setup as owner_setup
from sotto_worker.cloud.routing import local_models as lm
from sotto_worker.cloud.routing.job import live_metrics
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from tests.cloud.conftest import ORIGIN, SignUp


@pytest.mark.asyncio
async def test_local_url_ssrf_and_metadata_hardening() -> None:
    bad_urls = [
        "http://0.0.0.0:11434",
        "http://169.254.169.254/latest/meta-data",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://[::ffff:169.254.169.254]/v1",
        "http://[fd00:ec2::254]/latest",
        "http://[fe80::1]/v1",
        "http://user:pass@127.0.0.1:11434/v1",
        "http://127.0.0.1:11434/v1?secret=1",
        "http://127.0.0.1:11434/v1#frag",
        "https://8.8.8.8/v1",
        "http://2130706433/v1",
        "http://0x7f000001/v1",
        "ftp://127.0.0.1:11434",
    ]
    for url in bad_urls:
        with pytest.raises(CloudError):
            lm.validate_local_url(url)

    assert lm.validate_local_url("http://127.0.0.1:11434/v1/") == "http://127.0.0.1:11434/v1"
    assert lm.validate_local_url("http://localhost:11434") == "http://localhost:11434"
    assert lm.validate_local_url("http://10.0.2.15:8000") == "http://10.0.2.15:8000"
    assert lm.require_kind("stt") == "stt"
    assert lm.require_kind("tts") == "tts"
    with pytest.raises(CloudError):
        lm.require_kind("invalid-kind")

    # Probe HTTP 500 -> unreachable, and STT health check without x-bench-ms header
    http500 = httpx.MockTransport(lambda _r: httpx.Response(503))
    r500 = await lm.probe_local_endpoint("http://127.0.0.1:11434", "text", transport=http500)
    assert r500.reachable is False
    ok_stt = httpx.MockTransport(lambda _r: httpx.Response(200, json={"ok": True}))
    r_stt = await lm.probe_local_endpoint("http://127.0.0.1:8000", "stt", transport=ok_stt)
    assert r_stt.reachable is True
    assert r_stt.measured_ms is not None
    assert r_stt.measured_ms >= 1


@pytest.mark.asyncio
async def test_github_log_issue_and_comment_error_handling() -> None:
    def _bad(code: int) -> httpx.MockTransport:
        return httpx.MockTransport(lambda _r: httpx.Response(code, json={}))

    def _net_err(_r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    with pytest.raises(CloudError):
        await gh.create_log_issue("o/r", "tok", title="t", body="b", labels=[], transport=_bad(500))
    with pytest.raises(CloudError):
        await gh.comment_on_log_issue("o/r", "tok", 1, "c", transport=_bad(502))
    with pytest.raises(CloudError):
        await gh.comment_on_log_issue("o/r", "tok", 1, "c", transport=httpx.MockTransport(_net_err))

    def _comment_fail(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/issues"):
            return httpx.Response(201, json={"number": 7, "html_url": "https://x/7"})
        return httpx.Response(500, json={})

    with pytest.raises(CloudError):
        await gh.create_log_issue(
            "o/r",
            "tok",
            title="t",
            body="b",
            labels=[],
            comments=["c1"],
            transport=httpx.MockTransport(_comment_fail),
        )

    def _close_fail(req: httpx.Request) -> httpx.Response:
        if req.method == "POST":
            return httpx.Response(201, json={"number": 8, "html_url": "https://x/8"})
        return httpx.Response(502, json={})

    with pytest.raises(CloudError):
        await gh.create_log_issue(
            "o/r",
            "tok",
            title="t",
            body="b",
            labels=[],
            close_immediately=True,
            transport=httpx.MockTransport(_close_fail),
        )


def test_obs_logs_repo_encrypted_at_rest_and_validated(store: CloudStore) -> None:
    owner_p = Principal(
        user_id="o1", company_id="owner", role="owner", device_id="d0", email="o@x", name="Owner"
    )
    with pytest.raises(CloudError):
        obs_store.set_logs_repo(store, owner_p, "invalid-no-slash", "ghp_tok")
    with pytest.raises(CloudError):
        obs_store.set_logs_repo(store, owner_p, "Hasdro/logs", "   ")

    sample_tok = "ghp_" + "test_pat_123"
    obs_store.set_logs_repo(store, owner_p, "Hasdro/sales-shield-logs", sample_tok)
    raw_row = store._q("SELECT repo, ciphertext FROM obs_logs_config WHERE id = 1")[0]
    assert raw_row["repo"] == "Hasdro/sales-shield-logs"
    assert sample_tok.encode() not in bytes(raw_row["ciphertext"])
    assert obs_store.get_logs_repo(store) == (
        "Hasdro/sales-shield-logs",
        sample_tok,
    )


@pytest.mark.asyncio
async def test_publish_and_endpoints_reject_cross_tenant_principals(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha Co", "a@alpha.test")
    b = sign_up("Beta Co", "b@beta.test")
    cid_a = str(a["company"]["id"])
    uid_a = str(a["user"]["id"])
    cid_b = str(b["company"]["id"])
    uid_b = str(b["user"]["id"])

    actor_a = Principal(
        user_id=uid_a,
        company_id=cid_a,
        role="admin",
        device_id="d1",
        email="a@alpha.test",
        name="A",
    )
    transport = httpx.MockTransport(
        lambda req: httpx.Response(201, json={"number": 1, "html_url": "https://x/1"})
    )

    # Cross-tenant publish attempts must fail
    payload = obs_call_logs.CallLogPayload(
        company_id=cid_b,
        user_id=uid_b,
        call_id="call-cross",
        platform="desktop",
        os_version="macOS",
        app_version="0.7.0",
        device="dev-1",
        timings={},
        connections={},
    )
    with pytest.raises(CloudError):
        await obs_call_logs.publish_call_log(store, actor_a, payload, transport=transport)
    with pytest.raises(CloudError):
        await obs_call_logs.publish_background_failure(
            store,
            actor_a,
            company_id=cid_b,
            user_id=uid_b,
            job_kind="zoho_sync",
            stage="refresh",
            error_code="timeout",
            error_message="boom",
            transport=transport,
        )

    # Actor checks on local_models helpers
    with pytest.raises(CloudError):
        lm.get_company_policy(store, cid_b, actor=actor_a)
    with pytest.raises(CloudError):
        lm.decide_live_route(store, cid_b, uid_b, actor=actor_a)
    with pytest.raises(CloudError):
        lm.resolve_mid_call_failure(store, cid_b, uid_b, call_id="c1", actor=actor_a)


def test_company_admin_blocked_from_per_user_override_features(
    client: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha Co", "admin@alpha.test")
    for fid in ("call_logs_github", "local_models_text", "local_models_voice"):
        r = client.put(
            f"/api/v1/company/features/{fid}",
            json={"enabled": True},
            headers=a["auth"],
        )
        assert r.status_code == 403, f"expected 403 for {fid}, got {r.status_code}: {r.text}"


def test_owner_modules_enforce_owner_principal(store: CloudStore) -> None:
    non_owner = Principal(
        user_id="u1", company_id="c1", role="admin", device_id="d1", email="a@x", name="A"
    )
    with pytest.raises(CloudError):
        owner_logs.logs_overview(store, non_owner)
    with pytest.raises(CloudError):
        owner_lm.overview(store, non_owner)
    with pytest.raises(CloudError):
        owner_setup.owner_setup_steps(store, non_owner)


def test_http_routes_owner_and_app_platform_round4(
    owner: TestClient, sign_up: SignUp, store: CloudStore
) -> None:
    a = sign_up("Alpha Co", "admin@alpha.test")
    b = sign_up("Beta Co", "admin@beta.test")
    cid_a = str(a["company"]["id"])
    uid_a = str(a["user"]["id"])

    # Owner UI pages require owner session
    assert owner.get("/owner/logs.html").status_code == 200
    assert owner.get("/owner/local-models.html").status_code == 200
    assert owner.get("/owner/setup.html").status_code == 200

    # Non-owner app user gets 401/403 on owner APIs (use a separate client without owner cookie)
    anon = TestClient(owner.app, base_url=ORIGIN)
    assert anon.get("/api/owner/setup", headers=a["auth"]).status_code in (401, 403)
    assert anon.get("/api/owner/logs", headers=a["auth"]).status_code in (401, 403)

    # Owner configures logs repo + company switch + user override (D-095)
    H = {"origin": ORIGIN}
    assert (
        owner.post(
            "/api/owner/logs/repo",
            json={"repo": "Hasdro/sales-shield-logs", "token": "pat-for-test-only"},
            headers=H,
        ).status_code
        == 200
    )
    assert (
        owner.post(
            "/api/owner/logs/company",
            json={"company_id": cid_a, "enabled": True},
            headers=H,
        ).status_code
        == 200
    )
    assert (
        owner.post(
            "/api/owner/logs/user",
            json={"company_id": cid_a, "user_id": uid_a, "enabled": False},
            headers=H,
        ).status_code
        == 200
    )
    logs_data = owner.get("/api/owner/logs").json()
    assert logs_data["configured"] is True
    assert logs_data["repo"] == "Hasdro/sales-shield-logs"

    # Company switch enabled call_logs_github, but user override disabled it for uid_a (D-095)
    feats_a = owner.get("/api/v1/features", headers=a["auth"]).json()["features"]
    assert feats_a["call_logs_github"]["state"] == "off_by_platform"
    assert feats_a["local_models_text"]["state"] == "off_by_platform"

    # Owner enables local_models text for company A (and user override on for uid_a)
    assert (
        owner.post(
            "/api/owner/local-models/company",
            json={"company_id": cid_a, "text_enabled": True, "allow_cloud_backup": False},
            headers=H,
        ).status_code
        == 200
    )
    feats_a2 = owner.get("/api/v1/features", headers=a["auth"]).json()["features"]
    assert feats_a2["local_models_text"]["state"] == "available"
    feats_b = owner.get("/api/v1/features", headers=b["auth"]).json()["features"]
    assert feats_b["local_models_text"]["state"] == "off_by_platform"

    # Setup guide API for owner
    setup_steps = owner.get("/api/owner/setup").json()["steps"]
    assert any(s["id"] == "call_logs" and s["ok"] is True for s in setup_steps)

    # App user local-models CRUD + validation
    lm_get = owner.get("/api/v1/local-models", headers=a["auth"])
    assert lm_get.status_code == 200
    assert lm_get.json()["policy"]["allow_cloud_backup"] is False

    # Reject metadata URL via HTTP route
    bad_put = owner.put(
        "/api/v1/local-models",
        json={"kind": "text", "base_url": "http://169.254.169.254/v1", "live_opt_in": False},
        headers=a["auth"],
    )
    assert bad_put.status_code == 400

    # Save valid local endpoint (untested) & bundle check
    ok_put = owner.put(
        "/api/v1/local-models",
        json={"kind": "text", "base_url": "http://127.0.0.1:11434/v1", "live_opt_in": True},
        headers=a["auth"],
    )
    assert ok_put.status_code == 200

    # Mark endpoint connected in store to test D-096 bundle payload
    lm.save_user_endpoint(
        store,
        Principal(
            user_id=uid_a,
            company_id=cid_a,
            role="admin",
            device_id="d1",
            email="admin@alpha.test",
            name="A",
        ),
        company_id=cid_a,
        user_id=uid_a,
        kind="text",
        base_url="http://127.0.0.1:11434/v1",
        bench=lm.BenchmarkResult(
            reachable=True,
            status_label="Local model: connected ✓",
            measured_ms=2200,
            meets_r1=False,
            detail="",
        ),
        live_opt_in=True,
    )
    bundle = owner.get("/api/v1/bundle", headers=a["auth"]).json()
    assert bundle["local_model"]["mode"] == "local_live_slow_optin"
    assert bundle["local_model"]["holding_at_ms"] == 1500
    assert bundle["local_model"]["exclude_p95_alarm"] is True

    # Verify usage with exclude_p95_alarm=True does not pollute owner_stats p95 or live_metrics
    now = int(time.time() * 1000)
    owner.post(
        "/api/v1/usage",
        json={
            "started_at": now - 10_000,
            "duration_s": 10,
            "cards": 1,
            "playbook_cards": 0,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 0,
            "p50_ms": 500,
            "p95_ms": 600,
            "exclude_p95_alarm": False,
        },
        headers=a["auth"],
    )
    owner.post(
        "/api/v1/usage",
        json={
            "started_at": now - 5_000,
            "duration_s": 5,
            "cards": 1,
            "playbook_cards": 0,
            "ai_cards": 1,
            "holding_lines": 0,
            "escalations": 0,
            "p50_ms": 2400,
            "p95_ms": 2800,
            "exclude_p95_alarm": True,
        },
        headers=a["auth"],
    )
    stats = owner.get("/api/owner/stats").json()
    assert stats["p95_ms_30d"] == 600
    m_p95, _qual, m_calls = live_metrics(store, cid_a, 0)
    assert m_p95 == 600
    assert m_calls == 1

    # Delete local model endpoint & exercise owner local-models + obs/call-logs routes
    assert owner.delete("/api/v1/local-models/text", headers=a["auth"]).status_code == 200
    assert (
        owner.post(
            "/api/owner/local-models/user",
            json={
                "company_id": cid_a,
                "user_id": uid_a,
                "feature_id": "local_models_voice",
                "enabled": True,
            },
            headers=H,
        ).status_code
        == 200
    )
    lm_ov = owner.get("/api/owner/local-models").json()
    assert len(lm_ov["companies"]) >= 1
    assert len(lm_ov["user_overrides"]) == 1
    assert (
        owner.post(
            "/api/owner/local-models/user",
            json={
                "company_id": cid_a,
                "user_id": uid_a,
                "feature_id": "local_models_voice",
                "enabled": None,
            },
            headers=H,
        ).status_code
        == 200
    )
    assert (
        owner.post(
            "/api/owner/logs/user",
            json={"company_id": cid_a, "user_id": uid_a, "enabled": None},
            headers=H,
        ).status_code
        == 200
    )
    # Test endpoint HTTP route (closed local port returns 200 with reachable=False)
    test_res = owner.post(
        "/api/v1/local-models/test",
        json={"kind": "text", "base_url": "http://127.0.0.1:9", "live_opt_in": False},
        headers=a["auth"],
    )
    assert test_res.status_code == 200
    assert test_res.json()["reachable"] is False
    # Toggle off company logs switch before hitting /api/v1/obs/call-logs so no external network
    assert (
        owner.post(
            "/api/owner/logs/company",
            json={"company_id": cid_a, "enabled": False},
            headers=H,
        ).status_code
        == 200
    )
    log_post = owner.post(
        "/api/v1/obs/call-logs",
        json={
            "call_id": "call-log-http-1",
            "os_version": "macOS 15",
            "app_version": "0.7.0",
            "timings": {"p95_ms": 400},
            "connections": {"stt": "assemblyai", "models": "groq"},
        },
        headers=a["auth"],
    )
    assert log_post.status_code == 200
    assert log_post.json()["sent"] is False
    assert log_post.json()["reason"] == "disabled"
