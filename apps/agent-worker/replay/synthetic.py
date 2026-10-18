"""Synthetic replay: scripted text calls through the real pipeline on a fake clock.

What it measures: everything after the final transcript (trigger, playbook, prompt, router race,
holding line, streaming), plus a fixed simulated delay for end-of-turn + final STT. What it does
NOT measure: real STT, network, or real model latency (use --live for real models). Every report
says SYNTHETIC so nobody mistakes it for the golden-call gate (R1 acceptance).
"""

from __future__ import annotations

import random
import uuid
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from functools import partial

from sotto_worker.adapters.factory import demo_fake_text
from sotto_worker.clock import Clock, FakeClock
from sotto_worker.contracts import (
    LLMAdapter,
    LLMChunk,
    LLMRequest,
    ModelCapabilities,
    TranscriptEvent,
)
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.protocol import CardMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import build_demo_runtime
from sotto_worker.scenarios import Scenario
from sotto_worker.telemetry import CardTimingRecord, LatencySummary, percentile, summarise

R1_P95_MS = 1500


@dataclass(frozen=True)
class LatencyProfile:
    seed: int = 42
    final_after_t0_ms: int = 350  # end-of-turn 250 + final STT 100 (ARCHITECTURE §4)
    primary_p50_ms: int = 380
    backup_p50_ms: int = 420
    spread: float = 0.45  # lognormal sigma: a long tail, so some turns hit the backup race
    chunk_ms: int = 25
    providers_down: bool = False  # every model call fails: the agent must still see a card


class ProvidersDown(RuntimeError):
    pass


class _JitterLLM:
    """Fake model whose first-token latency is drawn per request (seeded, reproducible)."""

    provider = "fake"

    def __init__(
        self,
        clock: Clock,
        rng: random.Random,
        p50_ms: int,
        spread: float,
        chunk_ms: int,
        down: bool = False,
    ) -> None:
        self._down = down
        self.model = f"jitter-{p50_ms}"
        self.capabilities = ModelCapabilities(streaming=True)
        self._clock, self._rng, self._p50, self._spread, self._chunk = (
            clock,
            rng,
            p50_ms,
            spread,
            chunk_ms,
        )

    async def warm(self) -> None:
        return None

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        await self._clock.sleep(self._rng.lognormvariate(0, self._spread) * self._p50)
        if self._down:
            raise ProvidersDown("simulated outage")
        for i, word in enumerate(demo_fake_text(req).split(" ")):
            if i:
                await self._clock.sleep(self._chunk)
            yield LLMChunk(text=word if i == 0 else f" {word}")


def _pick(adapters: dict[str, LLMAdapter], route: StageRoute) -> LLMAdapter:
    return adapters[route.model]


@dataclass
class ReplayReport:
    cards: int = 0
    agent_triggered: int = 0
    unmet_expectations: list[str] = field(default_factory=list)
    per_call: dict[str, LatencySummary] = field(default_factory=dict)
    records: list[CardTimingRecord] = field(default_factory=list)
    escalations: int = 0

    @property
    def summary(self) -> LatencySummary:
        return summarise(self.records)

    @property
    def passed(self) -> bool:
        return (
            self.agent_triggered == 0
            and not self.unmet_expectations
            and self.summary.p95_ms <= R1_P95_MS
        )


async def replay_synthetic(
    scenarios: Sequence[Scenario], profile: LatencyProfile, *, holding_line: bool = True
) -> ReplayReport:
    """`holding_line=False` measures the model path alone (to prove a slow model fails R1)."""
    report = ReplayReport()
    for scenario in scenarios:
        clock = FakeClock()
        rng = random.Random(f"{profile.seed}:{scenario.id}")  # noqa: S311 - latency simulation, not security
        base = build_demo_runtime(clock, {}, force_fake=True)
        primary = _JitterLLM(
            clock,
            rng,
            profile.primary_p50_ms,
            profile.spread,
            profile.chunk_ms,
            profile.providers_down,
        )
        backup = _JitterLLM(
            clock,
            rng,
            profile.backup_p50_ms,
            profile.spread,
            profile.chunk_ms,
            profile.providers_down,
        )
        config = RoutingConfig(
            stages={
                "suggest": StageRoute(provider="fake", model="primary", first_token_ms=700),
                "suggest_backup": StageRoute(provider="fake", model="backup", first_token_ms=700),
            }
        )
        adapters: dict[str, LLMAdapter] = {"primary": primary, "backup": backup}
        router = ModelRouter(config, partial(_pick, adapters), clock)
        cards: list[CardMessage] = []
        records: list[CardTimingRecord] = []
        escalations: list[Escalation] = []

        async def on_card(card: CardMessage, sink: list[CardMessage] = cards) -> None:
            sink.append(card)

        async def on_escalation(e: Escalation, sink: list[Escalation] = escalations) -> None:
            sink.append(e)

        session = CallSession(
            call_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"sotto-replay:{scenario.id}")),
            company=base.company,
            router=router,
            prompts=base.prompts,
            playbook=base.playbook,
            clock=clock,
            on_card=on_card,
            on_escalation=on_escalation,
            on_timing=records.append,
        )
        if not holding_line:
            session.holding_at_ms = 10**9  # model path only
        t = 0
        for line in scenario.lines:
            t += line.gap_ms + line.duration_ms
            await clock.advance(max(t + profile.final_after_t0_ms - clock.now_ms(), 0))
            before = len({c.card_id for c in cards})
            event = TranscriptEvent(
                speaker=line.speaker,
                text=line.text,
                final=True,
                start_ms=t - line.duration_ms,
                end_ms=t,
            )
            await session.on_transcript(event, t0_ms=t)
            await clock.advance(6000)
            t = clock.now_ms() - profile.final_after_t0_ms
            new_cards = [c for c in cards if c.seq == 0][before:]
            sources = {c.source for c in new_cards}
            if line.speaker == "agent" and new_cards:
                report.agent_triggered += len(new_cards)
            label = f"{scenario.id}: {line.text[:40]!r}"
            if line.expect == "no_card" and new_cards:
                report.unmet_expectations.append(f"{label} expected no card, got {sorted(sources)}")
            elif line.expect == "playbook" and sources != {"playbook"}:
                report.unmet_expectations.append(
                    f"{label} expected playbook, got {sorted(sources)}"
                )
            elif line.expect == "ai_or_holding" and not sources & {"ai", "backup", "holding"}:
                report.unmet_expectations.append(
                    f"{label} expected ai/holding, got {sorted(sources)}"
                )
        await session.close()
        report.cards += len(records)
        report.escalations += len(escalations)
        report.records += records
        if records:
            report.per_call[scenario.id] = summarise(records)
    return report


SOURCES = ("playbook", "ai", "backup", "holding")


def stage_values(records: Sequence[CardTimingRecord]) -> dict[str, list[int]]:
    return {
        "final transcript": [r.stt_final_ms for r in records],
        "playbook lookup": [r.lookup_ms for r in records],
        "model first token": [r.first_token_ms for r in records if r.first_token_ms is not None],
        "first word shown": [r.first_delta_ms for r in records],
    }


def format_report(report: ReplayReport, profile: LatencyProfile) -> str:
    lines = [
        "SYNTHETIC replay (scripted text calls, fake models with seeded latency, simulated "
        f"end-of-turn + STT {profile.final_after_t0_ms} ms). Not the golden-call R1 gate.",
        "",
        f"{'call':<22}{'cards':>6}{'p50 ms':>9}{'p95 ms':>9}{'max ms':>9}",
    ]
    for call_id, s in report.per_call.items():
        lines.append(f"{call_id:<22}{s.cards:>6}{s.p50_ms:>9}{s.p95_ms:>9}{s.max_ms:>9}")
    s = report.summary
    lines += [f"{'ALL':<22}{s.cards:>6}{s.p50_ms:>9}{s.p95_ms:>9}{s.max_ms:>9}", ""]
    lines += ["per stage (ms after t0)   p50      p95"]
    for name, values in stage_values(report.records).items():
        if values:
            lines.append(f"  {name:<22}{percentile(values, 50):>6}{percentile(values, 95):>9}")
    total = max(len(report.records), 1)
    by_source = {src: sum(1 for r in report.records if r.source == src) for src in SOURCES}
    fallbacks = sum(1 for r in report.records if r.fallback_reason)
    lines += [
        "cards by source: " + ", ".join(f"{k} {v}" for k, v in by_source.items()),
        f"holding rate {100 * by_source['holding'] / total:.0f}% · backup/fallback rate "
        f"{100 * fallbacks / total:.0f}%",
        "",
        f"R1 p95 ≤ {R1_P95_MS} ms: {'PASS' if s.p95_ms <= R1_P95_MS else 'FAIL'}",
        f"R4 agent-triggered cards: {report.agent_triggered} "
        f"({'PASS' if not report.agent_triggered else 'FAIL'})",
        f"Expectations: {'PASS' if not report.unmet_expectations else 'FAIL'}",
        *[f"  - {u}" for u in report.unmet_expectations],
        f"Escalations: {report.escalations}",
    ]
    return "\n".join(lines)
