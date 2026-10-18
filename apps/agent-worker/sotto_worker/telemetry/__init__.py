"""Per-card timing (P2.7, R1): one record per card, the only input to replay summaries and the
admin latency dashboard. No transcript text here (ENGINEERING §7)."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class CardTimingRecord:
    call_id: str
    card_id: str
    company_id: str
    turn_kind: str
    source: str
    t0_ms: int
    # All below are milliseconds after t0 (the customer stopped speaking).
    stt_final_ms: int
    lookup_ms: int
    first_token_ms: int | None
    first_delta_ms: int
    total_ms: int
    provider: str | None = None
    model: str | None = None
    fallback_reason: str | None = None


def percentile(values: Sequence[int], pct: float) -> int:
    """Nearest-rank percentile (no interpolation), so p95 is a value that actually happened."""
    if not values:
        raise ValueError("no values")
    ordered = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[rank - 1]


@dataclass(frozen=True)
class LatencySummary:
    cards: int
    p50_ms: int
    p95_ms: int
    max_ms: int


def summarise(records: Sequence[CardTimingRecord]) -> LatencySummary:
    shown = [r.first_delta_ms for r in records]
    return LatencySummary(len(shown), percentile(shown, 50), percentile(shown, 95), max(shown))
