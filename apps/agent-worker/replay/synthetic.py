"""Synthetic replay: scripted text calls through the real pipeline on a fake clock.

What it measures: everything after the final transcript (trigger, playbook, prompt, router race,
holding line, streaming), plus a fixed simulated delay for end-of-turn + final STT. What it does
NOT measure: real STT, network, or real model latency (`pnpm replay:live` uses real models).
Every report says SYNTHETIC so nobody mistakes it for the golden-call gate (R1 acceptance).
"""

from __future__ import annotations

import random
import uuid
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from functools import partial

from replay.quality import QualityReport, format_quality_report, judge_card_stub
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
from sotto_worker.playbook.index import CONFIDENT, PlaybookIndex
from sotto_worker.protocol import CardMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import build_demo_runtime
from sotto_worker.scenarios import Scenario, ScriptLine
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
        self.requests = 0
        self.in_chars = 0  # what a real model would bill as input (system + messages)
        self.out_chars = 0

    async def warm(self) -> None:
        return None

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        self.requests += 1
        self.in_chars += len(req.system) + sum(len(m.content) for m in req.messages)
        await self._clock.sleep(self._rng.lognormvariate(0, self._spread) * self._p50)
        if self._down:
            raise ProvidersDown("simulated outage")
        text = demo_fake_text(req)
        self.out_chars += len(text)
        for i, word in enumerate(text.split(" ")):
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
    # Top-1 playbook score of each customer turn that got a card (T-033: matching quality).
    top1_scores: list[float] = field(default_factory=list)
    # W4-COST: what the calls would bill. Per stage: [requests, input chars, output chars]; the
    # scripted call time (both tracks stream for the whole call).
    llm_usage: dict[str, list[int]] = field(default_factory=dict)
    call_ms: int = 0
    quality: QualityReport = field(default_factory=QualityReport)

    @property
    def summary(self) -> LatencySummary:
        return summarise(self.records)

    @property
    def passed(self) -> bool:
        return (
            self.agent_triggered == 0
            and not self.unmet_expectations
            and self.summary.p95_ms <= R1_P95_MS
            and self.quality.passed
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
                "call_state": StageRoute(provider="fake", model="backup", first_token_ms=700),
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
            check_line(report, scenario, line, new_cards)
            record_match(report, base.playbook, line, new_cards)
            if line.speaker == "customer":
                history_lines = [f"{ln.speaker}: {ln.text}" for ln in scenario.lines]
                for nc in new_cards:
                    if nc.source in ("ai", "backup"):
                        full_text = "".join(c.delta for c in cards if c.card_id == nc.card_id)
                        report.quality.scores.append(
                            judge_card_stub(
                                card_id=nc.card_id,
                                card_text=full_text,
                                turn_text=line.text,
                                history=history_lines,
                            )
                        )
        await session.close()
        for stage, model in (("suggest", primary), ("suggest_backup", backup)):
            used = report.llm_usage.setdefault(stage, [0, 0, 0])
            used[0] += model.requests
            used[1] += model.in_chars
            used[2] += model.out_chars
        report.call_ms += t
        report.cards += len(records)
        report.escalations += len(escalations)
        report.records += records
        if records:
            report.per_call[scenario.id] = summarise(records)
    return report


def record_match(
    report: ReplayReport,
    playbook: PlaybookIndex,
    line: ScriptLine,
    new_cards: Sequence[CardMessage],
) -> None:
    """The best playbook score for each customer turn that got a card (T-033)."""
    if line.speaker != "customer" or not new_cards:
        return
    best = playbook.nearest(line.text)
    report.top1_scores += [best.score if best is not None else 0.0] * len(new_cards)


def check_line(
    report: ReplayReport, scenario: Scenario, line: ScriptLine, new_cards: Sequence[CardMessage]
) -> None:
    """R4 (agent lines never trigger) and the scripted expectation for one line's new cards."""
    sources = {c.source for c in new_cards}
    if line.speaker == "agent" and new_cards:
        report.agent_triggered += len(new_cards)
    label = f"{scenario.id}: {line.text[:40]!r}"
    if line.expect == "no_card" and new_cards:
        report.unmet_expectations.append(f"{label} expected no card, got {sorted(sources)}")
    elif line.expect == "playbook" and sources != {"playbook"}:
        report.unmet_expectations.append(f"{label} expected playbook, got {sorted(sources)}")
    elif line.expect == "ai_or_holding" and not sources & {"ai", "backup", "holding"}:
        report.unmet_expectations.append(f"{label} expected ai/holding, got {sorted(sources)}")


SOURCES = ("playbook", "ai", "backup", "holding")


def stage_values(records: Sequence[CardTimingRecord]) -> dict[str, list[int]]:
    return {
        "final transcript": [r.stt_final_ms for r in records],
        "playbook lookup": [r.lookup_ms for r in records],
        "model first token": [r.first_token_ms for r in records if r.first_token_ms is not None],
        "first word shown": [r.first_delta_ms for r in records],
    }


def match_quality(report: ReplayReport, by_source: dict[str, int], total: int) -> str:
    """Playbook share, holding share and how close the matcher came (T-033)."""
    scores = report.top1_scores
    mean = sum(scores) / len(scores) if scores else 0.0
    low = sum(1 for s in scores if s < CONFIDENT)
    return (
        f"playbook cards {100 * by_source['playbook'] / total:.0f}% · holding "
        f"{100 * by_source['holding'] / total:.0f}% · mean top-1 score {mean:.2f} · "
        f"turns below {CONFIDENT}: {low} of {len(scores)} "
        f"({100 * low / max(len(scores), 1):.0f}%)"
    )


def format_report(
    report: ReplayReport,
    profile: LatencyProfile,
    *,
    header: str | None = None,
    kind: str = "synthetic",
) -> str:
    """`kind` names what was measured, so a PASS here is never read as the R1 gate (T-031)."""
    lines = [
        header
        or (
            "SYNTHETIC replay (scripted text calls, fake models with seeded latency, simulated "
            f"end-of-turn + STT {profile.final_after_t0_ms} ms). Not the golden-call R1 gate."
        ),
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
    r1 = "PASS" if s.p95_ms <= R1_P95_MS else "FAIL"
    lines += [
        "cards by source: " + ", ".join(f"{k} {v}" for k, v in by_source.items()),
        f"holding rate {100 * by_source['holding'] / total:.0f}% · backup/fallback rate "
        f"{100 * fallbacks / total:.0f}%",
        f"backup started on {fallbacks} of {len(report.records)} turns · backup won "
        f"{by_source['backup']}",
        match_quality(report, by_source, total),
        "",
        f"R1 p95 ≤ {R1_P95_MS} ms: {r1} ({kind} — not the R1 gate)",
        "  The R1 gate needs real recorded calls (test-calls/, P2.8); this run does not count.",
        f"R4 agent-triggered cards: {report.agent_triggered} "
        f"({'PASS' if not report.agent_triggered else 'FAIL'})",
        f"Expectations: {'PASS' if not report.unmet_expectations else 'FAIL'}",
        *[f"  - {u}" for u in report.unmet_expectations],
        f"Escalations: {report.escalations}",
        format_quality_report(report.quality),
    ]
    return "\n".join(lines)


class _StubLocalLLM:
    """Deterministic fake local model for D-096 synthetic verification."""

    provider = "openai_compatible"

    def __init__(self, clock: Clock, delay_ms: int, *, fail: bool = False) -> None:
        self._clock = clock
        self._delay_ms = delay_ms
        self._fail = fail
        self.model = "local-stub"
        self.capabilities = ModelCapabilities(streaming=True)

    async def warm(self) -> None:
        return None

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        await self._clock.sleep(self._delay_ms)
        if self._fail:
            raise ProvidersDown("local endpoint unavailable")
        text = "ANSWER: Local response confirmed for this pricing question."
        for i, word in enumerate(text.split(" ")):
            if i:
                await self._clock.sleep(20)
            yield LLMChunk(text=word if i == 0 else f" {word}")


@dataclass
class LocalStubReport:
    fast_ok: bool
    slow_optin_ok: bool
    backup_fallback_ok: bool
    holding_fallback_ok: bool
    details: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return (
            self.fast_ok
            and self.slow_optin_ok
            and self.backup_fallback_ok
            and self.holding_fallback_ok
        )


async def replay_local_stub() -> LocalStubReport:
    """Verify D-096 local routing behaviors: fast local, slow opt-in, and mid-call fallback."""
    details: list[str] = []

    async def run_one(
        *,
        primary_ms: int,
        primary_down: bool = False,
        allow_backup: bool = True,
        holding_at_ms: int = 1400,
        late_until_ms: int = 5000,
        local_badge: str | None = None,
    ) -> tuple[list[CardMessage], list[CardTimingRecord], list[Escalation]]:
        clock = FakeClock()
        base = build_demo_runtime(clock, {}, force_fake=True)
        local_llm = _StubLocalLLM(clock, primary_ms, fail=primary_down)
        backup_llm = _StubLocalLLM(clock, 220, fail=False)
        stages: dict[str, StageRoute] = {
            "suggest": StageRoute(provider="fake", model="local-stub"),
        }
        adapters: dict[str, LLMAdapter] = {"local-stub": local_llm}
        if allow_backup:
            stages["suggest_backup"] = StageRoute(provider="fake", model="cloud-backup")
            adapters["cloud-backup"] = backup_llm
        router = ModelRouter(RoutingConfig(stages=stages), partial(_pick, adapters), clock)
        cards: list[CardMessage] = []
        timings: list[CardTimingRecord] = []
        escalations: list[Escalation] = []

        async def on_card(c: CardMessage) -> None:
            cards.append(c)

        async def on_esc(e: Escalation) -> None:
            escalations.append(e)

        session = CallSession(
            call_id=str(uuid.uuid4()),
            company=base.company,
            router=router,
            prompts=base.prompts,
            playbook=base.playbook,
            clock=clock,
            on_card=on_card,
            on_escalation=on_esc,
            on_timing=timings.append,
            holding_at_ms=holding_at_ms,
            late_answer_until_ms=late_until_ms,
            local_badge=local_badge,
        )
        t = 1000
        await clock.advance(t)
        await session.on_transcript(
            TranscriptEvent(
                speaker="customer",
                text="How much does your enterprise tier cost per seat per month?",
                final=True,
                start_ms=500,
                end_ms=t,
            ),
            t0_ms=t,
        )
        await clock.advance(max(late_until_ms + 1000, 6000))
        await session.close()
        return cards, timings, escalations

    # 1. Fast local (< 1500 ms): direct AI answer, no holding card, p95 <= 1500
    c_fast, t_fast, _ = await run_one(primary_ms=250)
    fast_sources = {c.source for c in c_fast if c.seq == 0}
    fast_ok = fast_sources == {"ai"} and bool(t_fast) and t_fast[0].first_delta_ms <= R1_P95_MS
    fast_ms = t_fast[0].first_delta_ms if t_fast else None
    details.append(f"fast local: sources={sorted(fast_sources)} first_delta={fast_ms}ms")

    # 2. Slow opt-in (D-096): holding at 1500 ms, local answer replaces it with badge
    c_slow, _t_slow, _ = await run_one(
        primary_ms=2200,
        allow_backup=True,
        holding_at_ms=1500,
        late_until_ms=30_000,
        local_badge="local model \u2013 slower",
    )
    first_slow = [c for c in c_slow if c.seq == 0]
    turn_ids = {str(c.turn_id.root) for c in first_slow if c.turn_id is not None}
    slow_sources = [c.source for c in first_slow]
    slow_badges = [
        c.label.root if c.label is not None else None for c in first_slow if c.source == "ai"
    ]
    slow_optin_ok = (
        slow_sources == ["holding", "ai"]
        and len(turn_ids) == 1
        and slow_badges == ["local model \u2013 slower"]
    )
    details.append(f"slow opt-in: sources={slow_sources} badges={slow_badges}")

    # 3. Mid-call failure with allow_cloud_backup=True -> backup card
    c_bak, _t_bak, _ = await run_one(primary_ms=100, primary_down=True, allow_backup=True)
    bak_sources = {c.source for c in c_bak if c.seq == 0}
    backup_fallback_ok = "backup" in bak_sources
    details.append(f"mid-call backup: sources={sorted(bak_sources)}")

    # 4. Mid-call failure with allow_cloud_backup=False -> holding line
    c_hold, _t_hold, e_hold = await run_one(primary_ms=100, primary_down=True, allow_backup=False)
    hold_sources = {c.source for c in c_hold if c.seq == 0}
    holding_fallback_ok = hold_sources == {"holding"} and len(e_hold) == 1
    details.append(f"mid-call holding: sources={sorted(hold_sources)} esc={len(e_hold)}")

    return LocalStubReport(
        fast_ok=fast_ok,
        slow_optin_ok=slow_optin_ok,
        backup_fallback_ok=backup_fallback_ok,
        holding_fallback_ok=holding_fallback_ok,
        details=details,
    )
