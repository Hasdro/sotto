"""`pnpm cost:estimate` (W4-COST, D-060): cost per call minute per stage, from the SYNTHETIC
replay's token and audio counts and the seed price table. An ESTIMATE: the fake models' text is
short, so output tokens are each route's max_tokens (an upper bound), and input tokens are
characters / 4. The live estimate (`pnpm replay:live`, real models, spends money) is the owner's
step."""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass

from replay.synthetic import LatencyProfile, ReplayReport, replay_synthetic
from sotto_worker.cloud.metering.prices import (
    Price,
    PriceTable,
    audio_cost,
    max_tokens,
    token_cost,
)
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import DEMO, SEED
from sotto_worker.scenarios import load_all
from sotto_worker.server.catalog import Catalog


@dataclass(frozen=True)
class Row:
    stage: str
    vendor_model: str
    detail: str
    usd_per_min: float | None
    price: Price | None


def estimate(
    report: ReplayReport, table: PriceTable, catalog: Catalog, routing: RoutingConfig, calls: int
) -> list[Row]:
    minutes = max(report.call_ms / 60_000, 1e-9)
    cpt = table.usage.get("chars_per_token", 4)
    rows: list[Row] = []

    def name(stage: str) -> str:
        from sotto_worker.cloud.owner.platform import vendor_of

        route = routing.stages.get(stage)
        return f"{vendor_of(catalog, route) or route.provider}/{route.model}" if route else "-"

    tracks = table.usage.get("stt_tracks", 1)
    for stage in ("stt", "stt_backup"):
        price = table.for_route(catalog, routing.stages.get(stage))
        hours = minutes / 60 * tracks if stage == "stt" else 0.0
        cost = audio_cost(price, hours)
        rows.append(
            Row(
                stage,
                name(stage),
                f"{minutes:.1f} min x {tracks} tracks" if stage == "stt" else "only on failover",
                None if cost is None else cost / minutes,
                price,
            )
        )
    for stage in ("suggest", "suggest_backup"):
        route = routing.stages.get(stage)
        price = table.for_route(catalog, route)
        requests, in_chars, _out = report.llm_usage.get(stage, [0, 0, 0])
        tok_in, tok_out = in_chars / cpt, requests * max_tokens(route)
        cost = token_cost(price, tok_in, tok_out)
        rows.append(
            Row(
                stage,
                name(stage),
                f"{requests} req, {tok_in:,.0f} in / {tok_out:,} out tok",
                None if cost is None else cost / minutes,
                price,
            )
        )
    route = routing.stages.get("summary")
    price = table.for_route(catalog, route)
    tok_in = calls * table.usage.get("summary_in_tokens", 0)
    tok_out = calls * max_tokens(route, 600)
    cost = token_cost(price, tok_in, tok_out)
    rows.append(
        Row(
            "summary",
            name("summary"),
            f"{calls} calls, {tok_in:,} in / {tok_out:,} out tok",
            None if cost is None else cost / minutes,
            price,
        )
    )
    return rows


def format_rows(rows: list[Row], minutes: float) -> str:
    out = [
        "ESTIMATE: cost per call minute per stage (synthetic replay + seed/models/prices.yaml).",
        f"Scripted call time: {minutes:.1f} min. Not a vendor bill; live estimate = owner step.",
        "",
        f"{'stage':<15}{'vendor/model':<40}{'usd/min':>10}  usage / source",
    ]
    total = 0.0
    for r in rows:
        usd = "no price" if r.usd_per_min is None else f"{r.usd_per_min:.5f}"
        total += r.usd_per_min or 0.0
        src = (
            f"{r.price.source} ({r.price.confidence}, checked {r.price.checked})"
            if r.price
            else "no row in prices.yaml"
        )
        out.append(f"{r.stage:<15}{r.vendor_model:<40}{usd:>10}  {r.detail}; {src}")
    out.append(f"{'total':<55}{total:>10.5f}  estimate, USD per call minute")
    return "\n".join(out)


def main() -> int:
    calls = load_all(DEMO / "calls")
    report = asyncio.run(replay_synthetic(calls, LatencyProfile()))
    rows = estimate(
        report,
        PriceTable.load(),
        Catalog.load(SEED / "models" / "providers.yaml"),
        RoutingConfig.load(SEED / "models" / "default.yaml"),
        len(calls),
    )
    print(format_rows(rows, report.call_ms / 60_000))
    return 0


if __name__ == "__main__":
    sys.exit(main())
