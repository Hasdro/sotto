"""Tests for Task 6: Local models (L6, D-096), benchmark, fallback, and isolation."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from sotto_worker.cloud.obs.log import clear_events, recent_events
from sotto_worker.cloud.owner import local_models as owner_lm
from sotto_worker.cloud.routing import local_models as lm
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.server.vault import Vault


def _setup(tmp_path: Path) -> tuple[CloudStore, Principal, str, str]:
    store = CloudStore(tmp_path / "cloud.db", Vault("c" * 40))
    owner = Principal(
        user_id="owner-1",
        company_id=None,
        role="owner",
        device_id=None,
        email="owner@agn.test",
        name="Owner",
    )
    c1, _ = store.signup(
        company="Alpha",
        name="Ada",
        email="a@alpha.test",
        password="-".join(["correct", "horse", "battery"]),
        ip="127.0.0.1",
    )
    c2, _ = store.signup(
        company="Beta",
        name="Bob",
        email="b@beta.test",
        password="-".join(["correct", "horse", "battery"]),
        ip="127.0.0.1",
    )
    return store, owner, c1, c2


def _stub_transport(
    status: int = 200, sim_ms: int | None = None, fail: bool = False
) -> httpx.MockTransport:
    def handler(_req: httpx.Request) -> httpx.Response:
        if fail:
            raise httpx.ConnectError("connection refused")
        headers = {"x-bench-ms": str(sim_ms)} if sim_ms is not None else {}
        return httpx.Response(status, json={"data": [{"id": "local-stub"}]}, headers=headers)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_local_model_benchmark_fast_slow_optin_and_unreachable(tmp_path: Path) -> None:
    store, owner, c1, _c2 = _setup(tmp_path)
    agent = Principal(
        user_id="u-1",
        company_id=c1,
        role="agent",
        device_id="d1",
        email="u1@alpha.test",
        name="Agent",
    )

    # Default OFF -> always cloud
    assert lm.is_local_enabled(store, c1, "u-1", "text") is False
    assert lm.decide_live_route(store, c1, "u-1").mode == "cloud"

    # Enable text for company (voice stays off)
    owner_lm.update_company(store, owner, c1, text_enabled=True, voice_enabled=False)
    assert lm.is_local_enabled(store, c1, "u-1", "text") is True
    assert lm.is_local_enabled(store, c1, "u-1", "stt") is False

    # 1. Fast local endpoint (420 ms <= 1500 ms) -> live cards allowed
    fast_bench = await lm.test_local_endpoint(
        "http://127.0.0.1:11434", "text", transport=_stub_transport(200, sim_ms=420)
    )
    assert fast_bench.reachable is True
    assert fast_bench.status_label == "Local model: connected ✓"
    assert fast_bench.meets_r1 is True
    lm.save_user_endpoint(
        store,
        agent,
        company_id=c1,
        user_id="u-1",
        kind="text",
        base_url="http://127.0.0.1:11434",
        bench=fast_bench,
    )
    dec_fast = lm.decide_live_route(store, c1, "u-1")
    assert dec_fast.mode == "local_live"
    assert dec_fast.badge is None
    assert dec_fast.exclude_p95_alarm is False

    # 2. Slow local endpoint (2200 ms > 1500 ms) without opt-in -> slow jobs only
    slow_bench = await lm.test_local_endpoint(
        "http://127.0.0.1:11434", "text", transport=_stub_transport(200, sim_ms=2200)
    )
    assert slow_bench.reachable is True
    assert slow_bench.meets_r1 is False
    lm.save_user_endpoint(
        store,
        agent,
        company_id=c1,
        user_id="u-1",
        kind="text",
        base_url="http://127.0.0.1:11434",
        bench=slow_bench,
        live_opt_in=False,
    )
    assert lm.decide_live_route(store, c1, "u-1").mode == "slow_jobs_only"

    # 3. Slow local endpoint WITH D-096 opt-in -> holding line + badge + excluded from alarm
    lm.save_user_endpoint(
        store,
        agent,
        company_id=c1,
        user_id="u-1",
        kind="text",
        base_url="http://127.0.0.1:11434",
        bench=slow_bench,
        live_opt_in=True,
    )
    dec_opt = lm.decide_live_route(store, c1, "u-1")
    assert dec_opt.mode == "local_live_slow_optin"
    assert dec_opt.holding_at_ms == 1500
    assert dec_opt.badge == "local model \u2013 slower"
    assert dec_opt.exclude_p95_alarm is True

    # 4. Unreachable endpoint -> status "Local model: unreachable", falls back to cloud
    down_bench = await lm.test_local_endpoint(
        "http://127.0.0.1:11434", "text", transport=_stub_transport(fail=True)
    )
    assert down_bench.reachable is False
    assert down_bench.status_label == "Local model: unreachable"


def test_mid_call_failure_cloud_backup_vs_holding_line_logged(tmp_path: Path) -> None:
    clear_events()
    store, owner, c1, _c2 = _setup(tmp_path)

    # Default allow_cloud_backup is True -> cloud backup
    r1 = lm.resolve_mid_call_failure(store, c1, "u-1", call_id="call-10", reason="timeout")
    assert r1["action"] == "cloud_backup"
    assert r1["holding_line"] is False

    # Owner disables Allow cloud backup -> holding line
    owner_lm.update_company(store, owner, c1, allow_cloud_backup=False)
    r2 = lm.resolve_mid_call_failure(store, c1, "u-1", call_id="call-10", reason="timeout")
    assert r2["action"] == "holding_line"
    assert r2["holding_line"] is True

    evs = [e.event for e in recent_events(10)]
    assert "fallback_cloud_backup" in evs
    assert "fallback_holding_line" in evs


@pytest.mark.asyncio
async def test_local_models_tenant_isolation(tmp_path: Path) -> None:
    store, _owner, c1, c2 = _setup(tmp_path)
    admin_a = Principal(
        user_id="a1", company_id=c1, role="admin", device_id="d1", email="a@a", name="A"
    )
    admin_b = Principal(
        user_id="b1", company_id=c2, role="admin", device_id="d2", email="b@b", name="B"
    )
    bench = await lm.test_local_endpoint(
        "http://127.0.0.1:11434", "text", transport=_stub_transport(200, sim_ms=300)
    )
    lm.save_user_endpoint(
        store,
        admin_b,
        company_id=c2,
        user_id="b1",
        kind="text",
        base_url="http://127.0.0.1:11434",
        bench=bench,
    )
    with pytest.raises(CloudError):
        lm.get_user_endpoints(store, admin_a, c2, "b1")
    with pytest.raises(CloudError):
        lm.save_user_endpoint(
            store,
            admin_a,
            company_id=c2,
            user_id="b1",
            kind="text",
            base_url="http://127.0.0.1:11434",
            bench=bench,
        )
    with pytest.raises(CloudError):
        lm.delete_user_endpoint(store, admin_a, c2, "b1", "text")
    assert len(lm.get_user_endpoints(store, admin_b, c2, "b1")) == 1
    assert lm.delete_user_endpoint(store, admin_b, c2, "b1", "text") is True
