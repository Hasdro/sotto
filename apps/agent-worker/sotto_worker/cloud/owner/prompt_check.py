"""Prompt studio "Test" (R6, DD-2): a prompt version runs through the real call pipeline on the
recorded calls before it may be published.

Until the golden calls exist (P0.5) the recorded calls are the scripted demo calls and the models
are seeded fakes on a fake clock, so the numbers are SYNTHETIC: they prove the version renders on
every turn, keeps R4 (no card from the agent track) and the scripted card expectations, and they
estimate the latency effect of its length. Real-model numbers come from `pnpm replay:live`, which
spends money and is the owner's to start (D-060)."""

from __future__ import annotations

import random
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from sotto_worker.adapters.factory import demo_fake_text
from sotto_worker.clock import Clock, FakeClock
from sotto_worker.contracts import LLMChunk, LLMRequest, ModelCapabilities, TranscriptEvent
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.prompts import PromptRegistry, PromptVersion
from sotto_worker.prompts.registry import PromptRenderError, render
from sotto_worker.protocol import CardMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import DEMO, build_demo_runtime
from sotto_worker.scenarios import load_all
from sotto_worker.telemetry import CardTimingRecord, summarise

R1_P95_MS = 1500
END_OF_TURN_MS = 350  # end-of-turn 250 + final STT 100 (ARCHITECTURE §4), as the replay
PRIMARY_P50_MS = 380
BACKUP_P50_MS = 420
SPREAD = 0.45
# Assumption for the length estimate: each 1,000 prompt tokens adds this much time to the first
# token (prefill). Shown with the result; real numbers come from the live replay.
PREFILL_MS_PER_1K_TOKENS = 40
LIVE_KEYS = ("suggest",)


@dataclass
class _Tally:
    lines: int = 0
    met: int = 0
    agent_triggered: int = 0
    records: list[CardTimingRecord] = field(default_factory=list)


class _Jitter:
    """A seeded fake model: first token after a lognormal delay plus the prompt's prefill."""

    provider = "fake"

    def __init__(self, clock: Clock, rng: random.Random, p50_ms: int, prefill_ms: float) -> None:
        self.model = f"jitter-{p50_ms}"
        self.capabilities = ModelCapabilities(streaming=True)
        self._clock, self._rng, self._p50, self._prefill = clock, rng, p50_ms, prefill_ms

    async def warm(self) -> None:
        return None

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        await self._clock.sleep(self._rng.lognormvariate(0, SPREAD) * self._p50 + self._prefill)
        for i, word in enumerate(demo_fake_text(req).split(" ")):
            if i:
                await self._clock.sleep(25)
            yield LLMChunk(text=word if i == 0 else f" {word}")


def _tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def _run_live(key: str, body: str, variables: tuple[str, ...]) -> _Tally:
    tally = _Tally()
    prefill = _tokens(body) / 1000 * PREFILL_MS_PER_1K_TOKENS
    for scenario in load_all(DEMO / "calls"):
        clock = FakeClock()
        rng = random.Random(f"prompt-test:{scenario.id}")  # noqa: S311 - latency simulation
        base = build_demo_runtime(clock, {}, force_fake=True)
        registry: PromptRegistry = base.prompts
        registry.add(
            PromptVersion(
                key=key,
                version=10**6,
                scope="platform",
                scope_id=None,
                stage="suggest",
                variables=variables,
                body=body,
            ),
            publish=True,
        )
        adapters = {
            "primary": _Jitter(clock, rng, PRIMARY_P50_MS, prefill),
            "backup": _Jitter(clock, rng, BACKUP_P50_MS, prefill),
        }
        config = RoutingConfig(
            stages={
                "suggest": StageRoute(provider="fake", model="primary", first_token_ms=700),
                "suggest_backup": StageRoute(provider="fake", model="backup", first_token_ms=700),
            }
        )

        def pick(route: StageRoute, a: dict[str, _Jitter] = adapters) -> _Jitter:
            return a[route.model]

        router = ModelRouter(config, pick, clock)
        cards: list[CardMessage] = []
        records: list[CardTimingRecord] = []

        async def on_card(card: CardMessage, sink: list[CardMessage] = cards) -> None:
            sink.append(card)

        async def on_escalation(_e: Escalation) -> None:
            return None

        session = CallSession(
            call_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"prompt-test:{scenario.id}")),
            company=base.company,
            router=router,
            prompts=registry,
            playbook=base.playbook,
            clock=clock,
            on_card=on_card,
            on_escalation=on_escalation,
            on_timing=records.append,
        )
        t = 0
        for line in scenario.lines:
            t += line.gap_ms + line.duration_ms
            await clock.advance(max(t + END_OF_TURN_MS - clock.now_ms(), 0))
            before = len([c for c in cards if c.seq == 0])
            await session.on_transcript(
                TranscriptEvent(
                    speaker=line.speaker,
                    text=line.text,
                    final=True,
                    start_ms=t - line.duration_ms,
                    end_ms=t,
                ),
                t0_ms=t,
            )
            await clock.advance(6000)
            t = clock.now_ms() - END_OF_TURN_MS
            new = [c for c in cards if c.seq == 0][before:]
            sources = {c.source for c in new}
            tally.lines += 1
            if line.speaker == "agent" and new:
                tally.agent_triggered += len(new)
            ok = (
                (line.expect == "no_card" and not new)
                or (line.expect == "playbook" and sources == {"playbook"})
                or (line.expect == "ai_or_holding" and bool(sources & {"ai", "backup", "holding"}))
                or line.expect == "any"
            )
            tally.met += int(ok)
        await session.close()
        tally.records += records
    return tally


async def check_prompt(
    key: str, body: str, variables: list[str], seed_prompt: dict[str, Any]
) -> dict[str, Any]:
    """The result shown in the studio and stored on the version (quality + latency)."""
    names = tuple(seed_prompt["variables"])
    sample = {name: f"[{name}]" for name in names}
    try:
        render(body, sample)
    except PromptRenderError as e:
        return {"passed": False, "synthetic": True, "detail": str(e), "quality": 0.0}
    result: dict[str, Any] = {
        "synthetic": True,
        "tokens": _tokens(body),
        "seed_tokens": _tokens(str(seed_prompt["body"])),
        "prefill_ms_per_1k_tokens": PREFILL_MS_PER_1K_TOKENS,
    }
    if key not in LIVE_KEYS:
        # After-call and drafting prompts are not on the live path: a render check is the test.
        result.update(
            {"passed": True, "quality": 1.0, "detail": "renders with every variable; not live"}
        )
        return result
    draft = await _run_live(key, body, names)
    baseline = await _run_live(key, str(seed_prompt["body"]), names)
    summary = summarise(draft.records)
    quality = draft.met / max(draft.lines, 1)
    floor = baseline.met / max(baseline.lines, 1)
    passed = draft.agent_triggered == 0 and summary.p95_ms <= R1_P95_MS and quality >= floor
    result.update(
        {
            "passed": passed,
            "quality": round(quality, 3),
            "baseline_quality": round(floor, 3),
            "agent_triggered": draft.agent_triggered,
            "cards": len(draft.records),
            "p50_ms": summary.p50_ms,
            "p95_ms": summary.p95_ms,
            "detail": (
                f"{draft.met} of {draft.lines} scripted turns as expected; p95 {summary.p95_ms} ms"
                + ("" if passed else " — fails (R1, R4 or below the seed version)")
            ),
        }
    )
    return result
