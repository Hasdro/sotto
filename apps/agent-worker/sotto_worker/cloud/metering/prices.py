"""The seed price table (`seed/models/prices.yaml`) and what a stage route costs. Every number is
an ESTIMATE: seed data with a source URL and a date, never a vendor bill."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from sotto_worker.router import RoutingConfig, StageRoute
from sotto_worker.runtime import SEED
from sotto_worker.server.catalog import Catalog

PRICES = SEED / "models" / "prices.yaml"
UNITS = ("per_hour", "per_mtok")


@dataclass(frozen=True)
class Price:
    vendor: str
    model: str
    unit: str
    usd: float  # per_hour
    in_usd: float  # per_mtok
    out_usd: float
    source: str
    confidence: str
    checked: str


@dataclass(frozen=True)
class PriceTable:
    prices: dict[tuple[str, str], Price]
    usage: dict[str, int]
    checked: str

    @classmethod
    def load(cls, path: Path = PRICES) -> PriceTable:
        raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
        out: dict[tuple[str, str], Price] = {}
        for row in raw.get("prices") or []:
            if row["unit"] not in UNITS:
                raise ValueError(f"unknown price unit {row['unit']!r}")
            if not str(row.get("source", "")).startswith("https://"):
                raise ValueError(f"{row['vendor']}/{row['model']}: every price needs a source URL")
            p = Price(
                vendor=str(row["vendor"]),
                model=str(row["model"]),
                unit=str(row["unit"]),
                usd=float(row.get("usd", 0)),
                in_usd=float(row.get("in_usd", 0)),
                out_usd=float(row.get("out_usd", 0)),
                source=str(row["source"]),
                confidence=str(row.get("confidence", "")),
                checked=str(row["checked"]),
            )
            out[(p.vendor, p.model)] = p
        return cls(
            prices=out,
            usage={k: int(v) for k, v in (raw.get("usage") or {}).items()},
            checked=str(raw.get("checked", "")),
        )

    def for_route(self, catalog: Catalog, route: StageRoute | None) -> Price | None:
        if route is None:
            return None
        from sotto_worker.cloud.owner.platform import vendor_of

        vendor = vendor_of(catalog, route)
        return self.prices.get((vendor, route.model)) if vendor else None


def max_tokens(route: StageRoute | None, default: int = 300) -> int:
    value = (route.settings if route else {}).get("max_tokens")
    return int(value) if isinstance(value, int) and value > 0 else default


def token_cost(price: Price | None, tokens_in: float, tokens_out: float) -> float | None:
    if price is None or price.unit != "per_mtok":
        return None
    return (tokens_in * price.in_usd + tokens_out * price.out_usd) / 1_000_000


def audio_cost(price: Price | None, hours: float) -> float | None:
    if price is None or price.unit != "per_hour":
        return None
    return hours * price.usd


def call_cost(
    table: PriceTable,
    catalog: Catalog,
    routing: RoutingConfig,
    *,
    duration_s: int,
    ai_cards: int,
    summary: bool = True,
) -> float:
    """Estimated USD for one reported call on these routes; unknown prices count as 0 (shown as
    "no price" in the console and the estimate)."""
    u = table.usage
    stt = audio_cost(
        table.for_route(catalog, routing.stages.get("stt")),
        duration_s / 3600 * u.get("stt_tracks", 1),
    )
    route = routing.stages.get("suggest")
    suggest = token_cost(
        table.for_route(catalog, route),
        ai_cards * u.get("suggest_in_tokens", 0),
        ai_cards * max_tokens(route),
    )
    total = (stt or 0.0) + (suggest or 0.0)
    if summary:
        route = routing.stages.get("summary")
        total += (
            token_cost(
                table.for_route(catalog, route),
                u.get("summary_in_tokens", 0),
                max_tokens(route, 600),
            )
            or 0.0
        )
    return total
