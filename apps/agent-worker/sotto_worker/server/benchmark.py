"""Model speed check for the Keys & providers panel (P6.4 R1 guard, R6): the chosen model answers
a few scripted customer questions through the real call pipeline (live-suggestion prompt from the
registry, no backup), and we record its first-token time against the stage's deadline."""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass

from sotto_worker.adapters.factory import make_llm
from sotto_worker.clock import RealClock
from sotto_worker.contracts import LLMAdapter, LLMChunk, LLMRequest, TranscriptEvent
from sotto_worker.pipeline.session import CallSession
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.protocol import CardMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import DEMO, build_demo_runtime
from sotto_worker.scenarios import load_all
from sotto_worker.telemetry import CardTimingRecord

TURNS = 4
TURN_WAIT_S = 6.0
LIVE_STAGES = ("trigger", "suggest", "suggest_backup")
# R1 guard (R6): a live stage refuses a model whose measured typical first token is over this;
# with end of turn + STT (~0.5 s) it cannot put a card on screen inside 1.5 s even on a good day.
R1_GUARD_P50_MS = 1000
BENCH_CALL_ID = "00000000-0000-0000-0000-000000000000"


@dataclass(frozen=True)
class Bench:
    ok: bool
    p50_ms: int | None = None
    worst_ms: int | None = None
    samples: int = 0
    detail: str = ""


def sample_questions(playbook: PlaybookIndex, n: int = TURNS) -> list[str]:
    """Customer lines from the scripted demo calls that the playbook cannot answer, so every one
    goes to the model (AI path)."""
    lines = [
        line.text
        for scenario in load_all(DEMO / "calls")
        for line in scenario.lines
        if line.speaker == "customer" and playbook.lookup(line.text) is None
    ]
    return list(dict.fromkeys(lines))[:n]


class _Timed:
    """Wraps the chosen model's adapter: time from request to the first streamed chunk, whatever
    the answer (a card, or NO_SAFE_ANSWER that becomes the holding line)."""

    def __init__(self, inner: LLMAdapter, clock: RealClock, times: list[int]) -> None:
        self._inner = inner
        self._clock = clock
        self._times = times
        self.provider = inner.provider
        self.model = inner.model
        self.capabilities = inner.capabilities

    async def warm(self) -> None:
        await self._inner.warm()

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        started = self._clock.now_ms()
        first = True
        async for chunk in self._inner.stream(req):
            if first:
                self._times.append(self._clock.now_ms() - started)
                first = False
            yield chunk


async def benchmark(route: StageRoute, env: Mapping[str, str]) -> Bench:
    seed = RoutingConfig.load(DEMO.parent / "models" / "default.yaml")
    stages = {k: v for k, v in seed.stages.items() if k != "suggest_backup"}
    stages["suggest"] = route
    config = dataclasses.replace(seed, stages=stages)
    clock = RealClock()
    runtime = await asyncio.to_thread(build_demo_runtime, clock, env, config=config)
    if runtime.mode != "live":
        return Bench(False, detail="no key for this vendor yet")
    times: list[int] = []
    router = ModelRouter(
        config, lambda r: _Timed(make_llm(r, clock=clock, env=env), clock, times), clock
    )
    done = asyncio.Event()

    async def card(_card: CardMessage) -> None:
        pass

    async def escalation(_e: object) -> None:
        pass

    def timing(_record: CardTimingRecord) -> None:
        done.set()

    session = CallSession(
        call_id=BENCH_CALL_ID,
        company=dataclasses.replace(runtime.company, ai_answers_allowed=True),
        router=router,
        prompts=runtime.prompts,
        playbook=runtime.playbook,
        clock=clock,
        on_card=card,
        on_escalation=escalation,
        on_timing=timing,
    )
    with contextlib.suppress(Exception):  # a cold first turn is still a valid measurement
        await asyncio.wait_for(session.warm(), 3)
    try:
        for text in sample_questions(runtime.playbook):
            done.clear()
            now = clock.now_ms()
            event = TranscriptEvent("customer", text, True, max(now - 1500, 0), now)
            await session.on_transcript(event, t0_ms=now)
            try:
                await asyncio.wait_for(done.wait(), TURN_WAIT_S)
            except TimeoutError:
                continue
            await session.drain()
    finally:
        await session.close()
    if not times:
        return Bench(False, detail="the model did not answer (check the model ID and the key)")
    times.sort()
    return Bench(True, times[len(times) // 2], times[-1], len(times))
