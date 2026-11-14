"""ZC-05 (D-067): the routing job on the SYNTHETIC set. It picks the faster model that meets R1,
stages it as a canary on AGN's demo org only, promotes it or rolls it back on a worse p95, and
does not run at all while `routing.monthly_cap_usd` is unset or golden calls are missing."""

from __future__ import annotations

import time
from typing import Any

import pytest
from starlette.testclient import TestClient

from replay.routing_bench import synthetic_bench
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.routing import job
from sotto_worker.cloud.routing import store as rstore
from sotto_worker.cloud.store import CloudStore
from sotto_worker.server.catalog import apply_overrides
from tests.cloud.conftest import ORIGIN, SignUp

H = {"origin": ORIGIN}
SEED_SUGGEST = ("groq", "openai/gpt-oss-20b")
FAST = ("groq", "openai/gpt-oss-120b")
SLOW = ("gemini", "gemini-2.5-flash")
CANDIDATES = {"suggest": [FAST, SLOW]}
# Simulated first-token latency per model (synthetic set): FAST beats the seed; SLOW misses R1.
LATENCY = {SEED_SUGGEST: 380, FAST: 180, SLOW: 2600}


@pytest.fixture(scope="module")
def bench() -> job.Benchmark:
    cache: dict[tuple[str, str, str], job.Bench] = {}
    inner = synthetic_bench(LATENCY)

    def go(stage: str, provider_id: str, model: str) -> job.Bench:
        key = (stage, provider_id, model)
        if key not in cache:
            cache[key] = inner(stage, provider_id, model)
        return cache[key]

    return go


def _never(stage: str, provider_id: str, model: str) -> job.Bench:
    raise AssertionError(f"benchmarked {stage} {provider_id}/{model} while the job is off")


def _settings(owner: TestClient, **data: Any) -> dict[str, Any]:
    r = owner.put("/api/owner/routing-job", json=data, headers=H)
    assert r.status_code == 200, r.text
    return dict(r.json())


def _calls(client: TestClient, s: dict[str, Any], n: int, p95: int, tag: str, t: int) -> None:
    for i in range(n):
        r = client.post(
            "/api/v1/usage",
            json={
                "call_id": f"{tag}{i}",
                "started_at": t + i,
                "duration_s": 60,
                "cards": 4,
                "playbook_cards": 1,
                "ai_cards": 3,
                "holding_lines": 0,
                "escalations": 0,
                "p95_ms": p95,
            },
            headers=s["auth"],
        )
        assert r.status_code == 200, r.text


def _suggest(store: CloudStore, seed: Seed, company_id: str) -> tuple[str, str]:
    routing = apply_overrides(
        seed.routing, seed.catalog, platform.effective_routes(store, company_id)
    )
    route = routing.stages["suggest"]
    return platform.vendor_of(seed.catalog, route) or "", route.model


def test_does_not_run_without_the_owners_monthly_cap(
    owner: TestClient, store: CloudStore, seed: Seed, bench: job.Benchmark
) -> None:
    state = owner.get("/api/owner/routing-job").json()
    assert state["status"] == "cap_unset"
    assert state["monthly_cap_usd"] is None
    assert job.run(store, seed, _never, source="synthetic") == {"status": "cap_unset"}
    assert rstore.runs(store) == []
    assert job.weekly(store, seed) == {"status": "cap_unset"}


def test_waits_for_golden_calls_once_the_cap_is_set(
    owner: TestClient, store: CloudStore, seed: Seed
) -> None:
    state = _settings(owner, monthly_cap_usd=25)
    assert state["monthly_cap_usd"] == 25.0
    assert state["status"] == "waiting_golden"
    assert state["golden_calls"] is False
    assert job.run(store, seed, _never, source="golden") == {"status": "waiting_golden"}
    assert job.weekly(store, seed) == {"status": "waiting_golden"}


def test_picks_the_faster_model_meeting_r1_and_canaries_on_the_demo_org_only(
    owner: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed, bench: job.Benchmark
) -> None:
    demo = sign_up("AGN Demo", "admin@agn-demo.test")
    other = sign_up("Customer", "admin@customer.test")
    _settings(owner, monthly_cap_usd=25, demo_company_id=demo["company"]["id"])
    t0 = int(time.time() * 1000) - 3 * 86_400_000
    _calls(owner, demo, 6, 900, "base", t0)  # the demo org's baseline before the canary

    out = job.run(store, seed, bench, source="synthetic", candidates=CANDIDATES)
    assert out["status"] == "ran"
    staged = next(d for d in out["detail"] if d.get("stage") == "suggest")
    assert staged["staged"] == "/".join(FAST)
    assert staged["canary_on"] == demo["company"]["id"]
    # Every candidate got its benchmark recorded (R6); the slow one missed R1.
    fast, slow = (platform.benchmark(store, *m, "suggest") for m in (FAST, SLOW))
    assert fast is not None
    assert fast["ok"] is True
    assert slow is not None
    assert slow["ok"] is False
    # Canary: only the demo org runs it; every other company keeps the seed route.
    assert _suggest(store, seed, demo["company"]["id"]) == FAST
    assert _suggest(store, seed, other["company"]["id"]) == SEED_SUGGEST
    assert platform.platform_routes(store) == {}

    # Next run: the demo org's calls on the canary are as fast → promoted to everyone.
    _calls(owner, demo, 6, 850, "canary", int(time.time() * 1000))
    out = job.run(store, seed, bench, source="synthetic", candidates=CANDIDATES)
    assert {"stage": "suggest", "canary": "promoted", "p95_ms": 850} in out["detail"]
    assert platform.platform_routes(store)["suggest"] == FAST
    assert _suggest(store, seed, other["company"]["id"]) == FAST
    assert rstore.canaries(store) == {}
    actions = [r["action"] for r in store._q("SELECT action FROM audit")]
    assert "routing_job.staged" in actions
    assert "routing_job.promoted" in actions


def test_rolls_back_on_a_worse_p95(
    owner: TestClient, sign_up: SignUp, store: CloudStore, seed: Seed, bench: job.Benchmark
) -> None:
    demo = sign_up("AGN Demo", "admin@agn-demo.test")
    _settings(owner, monthly_cap_usd=25, demo_company_id=demo["company"]["id"])
    _calls(owner, demo, 6, 800, "base", int(time.time() * 1000) - 3 * 86_400_000)
    job.run(store, seed, bench, source="synthetic", candidates=CANDIDATES)
    assert "suggest" in rstore.canaries(store)

    _calls(owner, demo, 6, 1200, "slow", int(time.time() * 1000))  # worse than its 800 ms
    out = job.run(store, seed, bench, source="synthetic", candidates={"suggest": [SLOW]})
    rolled = next(d for d in out["detail"] if d.get("canary"))
    assert rolled["canary"] == "rolled_back"
    assert rolled["baseline_p95"] == 800
    assert rstore.canaries(store) == {}
    assert platform.platform_routes(store) == {}
    assert _suggest(store, seed, demo["company"]["id"]) == SEED_SUGGEST


def test_keeps_the_route_when_no_candidate_is_faster(
    owner: TestClient, store: CloudStore, seed: Seed, bench: job.Benchmark
) -> None:
    _settings(owner, monthly_cap_usd=25)
    out = job.run(store, seed, bench, source="synthetic", candidates={"suggest": [SLOW]})
    assert out["detail"] == [
        {"stage": "suggest", "result": "kept", "p95_ms": out["detail"][0]["p95_ms"]}
    ]
    assert rstore.canaries(store) == {}


def test_stops_when_the_months_runs_would_pass_the_cap(
    owner: TestClient, store: CloudStore, seed: Seed, bench: job.Benchmark
) -> None:
    _settings(owner, monthly_cap_usd=1)
    out = job.run(store, seed, bench, source="synthetic", candidates=CANDIDATES, estimate_usd=2)
    assert out == {"status": "over_cap"}
    assert rstore.runs(store)[0]["status"] == "over_cap"


def test_settings_are_owner_only_and_validated(
    owner: TestClient, client: TestClient, sign_up: SignUp
) -> None:
    for bad in ({"monthly_cap_usd": 0}, {"monthly_cap_usd": "5"}, {"other": 1}):
        assert owner.put("/api/owner/routing-job", json=bad, headers=H).status_code == 400
    assert (
        owner.put("/api/owner/routing-job", json={"demo_company_id": "nope"}, headers=H).status_code
        == 404
    )
    state = _settings(owner, monthly_cap_usd=None)
    assert state["status"] == "cap_unset"
