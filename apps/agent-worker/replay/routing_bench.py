"""The routing job's benchmark on the SYNTHETIC set (ZC-05): each candidate is the synthetic
replay with that model's simulated first-token latency (seeded, reproducible). It ranks models by
the pipeline's own p95 and expectations; it says nothing about real vendors (golden calls do)."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping

from replay.synthetic import LatencyProfile, replay_synthetic
from sotto_worker.cloud.routing.job import Bench, Benchmark
from sotto_worker.runtime import DEMO
from sotto_worker.scenarios import load_all


def synthetic_bench(latency_p50_ms: Mapping[tuple[str, str], int], seed: int = 42) -> Benchmark:
    calls = load_all(DEMO / "calls")
    lines = sum(len(c.lines) for c in calls)

    def bench(stage: str, provider_id: str, model: str) -> Bench:
        p50 = latency_p50_ms[(provider_id, model)]
        profile = (
            # The other model is far too slow to win the backup race: the candidate alone counts.
            LatencyProfile(seed=seed, primary_p50_ms=p50, backup_p50_ms=10_000)
            if stage == "suggest"
            else LatencyProfile(seed=seed, backup_p50_ms=p50, primary_p50_ms=10_000)
        )
        # The model path alone (no holding line), so a slow model shows its real p95.
        report = asyncio.run(replay_synthetic(calls, profile, holding_line=False))
        quality = 1 - len(report.unmet_expectations) / max(lines, 1)
        return Bench(
            p50_ms=report.summary.p50_ms,
            p95_ms=report.summary.p95_ms,
            samples=len(report.records),
            quality=quality,
        )

    return bench
