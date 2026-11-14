"""The weekly routing job (ZC-05, D-067).

One run:
1. Guards: no `routing.monthly_cap_usd` → "cap_unset" (nothing runs); no golden calls and not an
   explicit synthetic run → "waiting_golden"; this month's runs plus this run's estimate over the
   cap → "over_cap".
2. Canaries from the last run: with enough calls on the demo org since the canary started, a p95
   above the demo org's baseline (or above R1) or a lower quality rolls it back; otherwise it is
   promoted to every company through `platform.write_route` (R6 guard, history, rollback).
3. Benchmarks: the current route and every candidate per live stage, each recorded as the model's
   last benchmark (R6). The winner meets R1, keeps the quality bar, and is faster than the current
   route by MIN_GAIN_MS; it is staged as a canary on the demo org only.

The golden-call bench (real STT on recorded calls) does not exist yet (P0.5/P2.8), so `weekly`
only reports "waiting_golden"; tests and `replay.routing_bench` drive `run` on the synthetic set."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sotto_worker.cloud.metering.store import month_start
from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.routing import store as rstore
from sotto_worker.cloud.store import CloudError, CloudStore, now_ms
from sotto_worker.runtime import REPO_ROOT

if TYPE_CHECKING:
    from sotto_worker.cloud.bundle import Seed

STAGES = ("suggest", "suggest_backup")
QUALITY_BAR = 0.95  # share of the set's expectations met
QUALITY_SLACK = 0.02  # a canary may not lose more than this against its baseline
MIN_GAIN_MS = 50
MIN_CANARY_CALLS = 5
BASELINE_DAYS = 14
GOLDEN_DIR = REPO_ROOT / "test-calls"


@dataclass(frozen=True)
class Bench:
    p50_ms: int
    p95_ms: int
    samples: int
    quality: float  # 0..1
    cost_usd: float = 0.0


Benchmark = Callable[[str, str, str], Bench]  # (stage, provider_id, model)
Candidates = dict[str, list[tuple[str, str]]]  # stage → [(provider_id, model)]


def golden_available() -> bool:
    return any(GOLDEN_DIR.glob("*.json"))


def default_candidates(store: CloudStore, seed: Seed) -> Candidates:
    """Every catalogue model the apps can run, on a vendor whose platform key is set."""
    keys = platform.platform_key_status(store)
    out: Candidates = {}
    for stage in STAGES:
        slot = seed.catalog.stages.get(stage)
        out[stage] = [
            (p.id, m)
            for p in seed.catalog.providers.values()
            if slot is not None and p.kind == slot.kind and p.client and p.key_env in keys
            for m in p.models
        ]
    return out


def current_route(store: CloudStore, seed: Seed, stage: str) -> tuple[str, str] | None:
    chosen = platform.platform_routes(store).get(stage)
    if chosen:
        return chosen
    route = seed.routing.stages.get(stage)
    vendor = platform.vendor_of(seed.catalog, route) if route else None
    return (vendor, route.model) if route and vendor else None


def live_metrics(
    store: CloudStore, company_id: str, since: int, until: int | None = None
) -> tuple[int | None, float | None, int]:
    """(p95 ms, quality, calls) of a company's reported calls: the worst call p95 below the top
    5 %, and quality = share of cards that were not the holding line."""
    rows = store._q(
        "SELECT p95_ms, cards, holding_lines FROM usage WHERE company_id = ? AND started_at >= ?"
        " AND started_at < ? AND p95_ms IS NOT NULL",
        (company_id, since, until or 2**62),
    )
    if not rows:
        return None, None, 0
    p95s = sorted(int(r["p95_ms"]) for r in rows)
    p95 = p95s[min(len(p95s) - 1, int(0.95 * len(p95s)))]
    cards = sum(int(r["cards"]) for r in rows)
    holding = sum(int(r["holding_lines"]) for r in rows)
    return p95, (1 - holding / cards) if cards else None, len(rows)


def _settle_canaries(store: CloudStore, seed: Seed, t: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for stage, c in rstore.canaries(store).items():
        company = c["company_id"]
        if company is None:
            out.append({"stage": stage, "canary": "waiting_demo_org"})
            continue
        p95, quality, calls = live_metrics(store, str(company), int(c["since"]))
        if calls < MIN_CANARY_CALLS or p95 is None:
            out.append({"stage": stage, "canary": "collecting", "calls": calls})
            continue
        limit = min(platform.R1_P95_MS, int(c["baseline_p95"] or platform.R1_P95_MS))
        worse_quality = (
            quality is not None
            and c["baseline_quality"] is not None
            and quality < float(c["baseline_quality"]) - QUALITY_SLACK
        )
        with store._tx() as db:
            db.execute("DELETE FROM routing_canaries WHERE stage = ?", (stage,))
        if p95 > limit or worse_quality:
            with store._tx() as db:
                store.audit(
                    db,
                    "routing_job.rolled_back",
                    f"{stage}={c['provider_id']}/{c['model']}: p95 {p95} vs {limit}",
                )
            out.append(
                {"stage": stage, "canary": "rolled_back", "p95_ms": p95, "baseline_p95": limit}
            )
            continue
        try:
            platform.write_route(
                store,
                seed,
                stage,
                str(c["provider_id"]),
                str(c["model"]),
                actor=None,
                action="routing_job.promoted",
            )
        except CloudError as e:  # e.g. a newer benchmark missed R1: R6 wins over the canary
            out.append({"stage": stage, "canary": "promote_refused", "reason": str(e)})
            continue
        out.append({"stage": stage, "canary": "promoted", "p95_ms": p95})
    return out


def _stage(
    store: CloudStore,
    stage: str,
    winner: tuple[str, str],
    bench: Bench,
    current: tuple[str, str] | None,
    t: int,
) -> dict[str, Any]:
    demo = rstore.demo_company(store)
    baseline_p95, baseline_quality = (None, None)
    if demo:
        baseline_p95, baseline_quality, _n = live_metrics(
            store, demo, t - BASELINE_DAYS * 86_400_000, t
        )
    with store._tx() as db:
        db.execute(
            "INSERT OR REPLACE INTO routing_canaries(stage, provider_id, model, from_provider,"
            " from_model, bench_p95, baseline_p95, baseline_quality, company_id, since)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                stage,
                winner[0],
                winner[1],
                current[0] if current else None,
                current[1] if current else None,
                bench.p95_ms,
                baseline_p95,
                baseline_quality,
                demo,
                t,
            ),
        )
        store.audit(db, "routing_job.staged", f"{stage}={winner[0]}/{winner[1]} on {demo}")
    return {
        "stage": stage,
        "staged": f"{winner[0]}/{winner[1]}",
        "p95_ms": bench.p95_ms,
        "canary_on": demo,
    }


def run(
    store: CloudStore,
    seed: Seed,
    bench: Benchmark,
    *,
    source: str,
    candidates: Candidates | None = None,
    estimate_usd: float = 0.0,
    t: int | None = None,
) -> dict[str, Any]:
    t = now_ms() if t is None else t
    cap = rstore.cap_usd(store)
    if cap is None:
        return {"status": "cap_unset"}
    if source != "synthetic" and not golden_available():
        return {"status": "waiting_golden"}
    if rstore.month_cost(store, month_start(t)) + estimate_usd > cap:
        rstore.record_run(store, "over_cap", source, 0.0, [])
        return {"status": "over_cap"}
    detail: list[dict[str, Any]] = _settle_canaries(store, seed, t)
    pending = rstore.canaries(store)
    cost = 0.0
    for stage, options in (candidates or default_candidates(store, seed)).items():
        current = current_route(store, seed, stage)
        tried: dict[tuple[str, str], Bench] = {}
        for option in dict.fromkeys(([current] if current else []) + list(options)):
            result = bench(stage, option[0], option[1])
            cost += result.cost_usd
            platform.record_benchmark(
                store,
                provider_id=option[0],
                model=option[1],
                stage=stage,
                p50_ms=result.p50_ms,
                p95_ms=result.p95_ms,
                samples=result.samples,
                source=f"routing:{source}",
            )
            tried[option] = result
        eligible = {
            k: b
            for k, b in tried.items()
            if b.samples > 0 and b.p95_ms <= platform.R1_P95_MS and b.quality >= QUALITY_BAR
        }
        base = tried.get(current) if current else None
        if base is not None:
            eligible = {k: b for k, b in eligible.items() if b.quality >= base.quality}
        if not eligible:
            detail.append({"stage": stage, "result": "no_candidate_meets_r1"})
            continue
        winner = min(eligible, key=lambda k: (eligible[k].p95_ms, eligible[k].p50_ms))
        if winner == current or (
            base is not None and eligible[winner].p95_ms > base.p95_ms - MIN_GAIN_MS
        ):
            detail.append(
                {"stage": stage, "result": "kept", "p95_ms": base.p95_ms if base else None}
            )
            continue
        if stage in pending:
            detail.append({"stage": stage, "result": "canary_running"})
            continue
        detail.append(_stage(store, stage, winner, eligible[winner], current, t))
    rstore.record_run(store, "ran", source, cost, detail)
    return {"status": "ran", "detail": detail, "cost_usd": cost}


def weekly(store: CloudStore, seed: Seed) -> dict[str, Any]:
    """The scheduler's weekly entry (T-081 registers it). Until the golden-call bench exists it
    never benchmarks anything: it reports why it did not run."""
    if rstore.cap_usd(store) is None:
        return {"status": "cap_unset"}
    return {"status": "waiting_golden"}


def state(store: CloudStore, t: int | None = None) -> dict[str, Any]:
    t = now_ms() if t is None else t
    cap = rstore.cap_usd(store)
    status = "cap_unset" if cap is None else "waiting_golden" if not golden_available() else "ready"
    return {
        "status": status,
        "monthly_cap_usd": cap,
        "spent_usd": rstore.month_cost(store, month_start(t)),
        "demo_company_id": rstore.demo_company(store),
        "golden_calls": golden_available(),
        "canaries": list(rstore.canaries(store).values()),
        "runs": rstore.runs(store),
    }
