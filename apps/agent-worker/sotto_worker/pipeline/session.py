"""One call's live path (P2.5) with the R2 chain (P2.6) and per-card telemetry (P2.7).

customer final turn → trigger → playbook → (AI via router, backup race) → streamed card,
with the holding line at t0+1400 ms, a late answer replacing it until t0+5 s, and exactly one
escalation per (call, question). ARCHITECTURE §4 and §5.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal

from sotto_worker.clock import Clock
from sotto_worker.company import CompanyProfile
from sotto_worker.contracts import LLMRequest, Message, TranscriptEvent
from sotto_worker.pipeline.trigger import TurnKind, classify
from sotto_worker.pipeline.verdict import VerdictParser
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.playbook.index import CONFIDENT, NEAR_ENTRIES, PlaybookHit, match_text
from sotto_worker.prompts import PromptContext, PromptRegistry
from sotto_worker.protocol import CardMessage, CardTiming
from sotto_worker.room import EchoGate
from sotto_worker.router import ModelRouter, RouteResult
from sotto_worker.telemetry import CardTimingRecord

HOLDING_AT_MS = 1400  # sent so it renders before the 1500 ms R1 limit
LATE_ANSWER_UNTIL_MS = 5000  # an answer by then replaces the holding line; otherwise escalate
ANSWER_HARD_LIMIT_MS = 8000  # a streaming answer is closed by then, whatever the provider does
CONTEXT_WINDOW_MS = 60_000
TURN_MARKER = "---turn---"  # splits a prompt into cacheable system prefix + per-turn message
LANGUAGE_NAME = {"en": "English", "ar": "Arabic"}

CardType = Literal["answer", "question", "objection", "warning", "holding"]
CardSource = Literal["playbook", "ai", "backup", "holding"]


@dataclass(frozen=True)
class Escalation:
    """R2 step 4. `question_hash` is the idempotency key with `call_id` (ARCHITECTURE §5)."""

    call_id: str
    company_id: str
    question: str
    question_hash: str
    language: str
    transcript_excerpt: str
    at_ms: int


def question_hash(text: str) -> str:
    normalised = re.sub(r"[\W_]+", " ", text.lower()).strip()
    return hashlib.sha256(normalised.encode()).hexdigest()[:16]


class _CardWriter:
    def __init__(
        self,
        session: CallSession,
        *,
        card_type: CardType,
        source: CardSource,
        label: str | None,
        turn: _Turn,
        result: RouteResult | None = None,
    ) -> None:
        self._s = session
        self.card_id = session.new_id()
        self._type = card_type
        self._source = source
        self._label = label
        self._turn = turn
        self._result = result
        self._seq = 0
        self._first_delta_ms: int | None = None
        self.closed = False

    async def delta(self, text: str, *, done: bool = False) -> None:
        now = self._s.clock.now_ms()
        timing = None
        if self._seq == 0:
            self._first_delta_ms = max(now - self._turn.t0_ms, 0)
            timing = CardTiming(
                turn_end_ms=0,
                stt_final_ms=self._turn.stt_final_ms,
                lookup_ms=self._turn.lookup_ms,
                first_token_ms=self._first_token_ms(now),
            )
        card = CardMessage(
            v=1,
            card_id=self.card_id,
            call_id=self._s.call_id,
            turn_id=self._turn.turn_id,
            seq=self._seq,
            type=self._type,
            source=self._source,
            label=self._label if self._seq == 0 else None,
            delta=text,
            done=done,
            timing=timing,
        )
        self._seq += 1
        self.closed = done
        await self._s.on_card(card)
        if done:
            self._record(now)

    def _first_token_ms(self, now: int) -> int:
        if self._result is not None and self._result.first_token_at_ms is not None:
            return max(self._result.first_token_at_ms - self._turn.t0_ms, 0)
        return max(now - self._turn.t0_ms, 0)

    def _record(self, now: int) -> None:
        result = self._result or RouteResult()
        self._s.on_timing(
            CardTimingRecord(
                call_id=self._s.call_id,
                card_id=self.card_id,
                company_id=self._s.company.company_id,
                turn_kind=self._turn.kind,
                source=self._source,
                t0_ms=self._turn.t0_ms,
                stt_final_ms=self._turn.stt_final_ms,
                lookup_ms=self._turn.lookup_ms,
                first_token_ms=(
                    max(result.first_token_at_ms - self._turn.t0_ms, 0)
                    if result.first_token_at_ms is not None
                    else None
                ),
                first_delta_ms=self._first_delta_ms if self._first_delta_ms is not None else 0,
                total_ms=max(now - self._turn.t0_ms, 0),
                provider=result.provider,
                model=result.model,
                fallback_reason=result.fallback_reason,
            )
        )


@dataclass
class _Turn:
    turn_id: str
    event: TranscriptEvent
    kind: TurnKind
    t0_ms: int
    stt_final_ms: int
    language: str
    lookup_ms: int = 0
    # The nearest playbook entries (score > 0), best first; the model sees them (T-032).
    nearest: list[PlaybookHit] = field(default_factory=list)


class CallSession:
    def __init__(
        self,
        *,
        call_id: str,
        company: CompanyProfile,
        router: ModelRouter,
        prompts: PromptRegistry,
        playbook: PlaybookIndex,
        clock: Clock,
        on_card: Callable[[CardMessage], Awaitable[None]],
        on_escalation: Callable[[Escalation], Awaitable[None]],
        on_timing: Callable[[CardTimingRecord], None],
        new_id: Callable[[], str] = lambda: str(uuid.uuid4()),
    ) -> None:
        self.call_id = call_id
        self.company = company
        self.clock = clock
        self.on_card = on_card
        self.on_timing = on_timing
        self._router = router
        self._prompts = prompts
        self._playbook = playbook
        self._on_escalation = on_escalation
        self.new_id = new_id
        self._routing = company.routing()
        self._events: list[TranscriptEvent] = []
        self._tasks: set[asyncio.Task[None]] = set()
        self._escalated: set[str] = set()
        self.holding_at_ms = HOLDING_AT_MS
        self.echo_gate = EchoGate()
        self.prompts_key = "suggest"

    async def warm(self) -> None:
        """Call start: open model connections for the live stage and its backup."""
        await self._router.warm("suggest", self._routing)

    def on_agent_voice(self, *, start_ms: int, end_ms: int, text: str = "") -> None:
        """Agent voice activity (VAD; text only when agent context is on), for echo gating."""
        self.echo_gate.agent_voice(start_ms, end_ms, text)

    async def on_transcript(self, event: TranscriptEvent, *, t0_ms: int) -> str | None:
        """Feed a transcript event. `t0_ms` is when the speaker stopped (the R1 clock start).
        Returns the turn_id when the event starts a turn that will produce a card."""
        if not event.final:
            return None  # drafting on partials: P2.5 follow-up (ARCHITECTURE §4)
        if event.speaker == "customer" and self.echo_gate.is_echo(
            start_ms=event.start_ms, end_ms=event.end_ms, text=event.text
        ):
            return None  # the agent's own voice coming back on the SIP leg (R4, F-18)
        if event.speaker == "agent" and not self.company.agent_context:
            return None
        self._events.append(event)
        kind = classify(event)  # R4: agent speech never classifies
        if kind is None:
            return None
        turn = _Turn(
            turn_id=self.new_id(),
            event=event,
            kind=kind,
            t0_ms=t0_ms,
            stt_final_ms=max(self.clock.now_ms() - t0_ms, 0),
            language=self.company.language_for(event.text),
        )
        task = asyncio.create_task(self._run_turn(turn))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return turn.turn_id

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        for task in list(self._tasks):
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def drain(self) -> None:
        """Wait until every in-flight turn has finished (replay and tests)."""
        # Only unfinished tasks: a finished task leaves `_tasks` in a done-callback, and awaiting
        # finished tasks never yields to the loop to run it (an endless busy loop otherwise).
        while pending := [t for t in self._tasks if not t.done()]:
            await asyncio.gather(*pending, return_exceptions=True)

    async def _run_turn(self, turn: _Turn) -> None:
        card_type: CardType = "answer" if turn.kind == "question" else "objection"
        started = self.clock.now_ms()
        # One scan per turn: a confident top entry is the card; otherwise the nearest few go to
        # the model, which may answer from one of them (T-032).
        top = self._playbook.ranked(turn.event.text, NEAR_ENTRIES)
        turn.lookup_ms = self.clock.now_ms() - started
        turn.nearest = [h for h in top if h.score > 0]
        hit = top[0] if top and top[0].score >= CONFIDENT else None
        if hit is not None:
            writer = _CardWriter(
                self, card_type=card_type, source="playbook", label=None, turn=turn
            )
            await writer.delta(hit.entry.short_answer, done=True)
            return
        if not self.company.ai_answers_allowed:
            await self._holding(turn)
            await self._escalate(turn)
            return
        await self._ai_turn(turn, card_type)

    async def _ai_turn(self, turn: _Turn, card_type: CardType) -> None:
        """R2 for one turn. Whatever fails (provider, prompt, validation), the agent gets either
        a closed answer card or the holding line, and an unanswered question escalates once."""
        result = RouteResult()
        writer: _CardWriter | None = None

        async def suggest() -> bool:
            nonlocal writer
            parser = VerdictParser()
            request = self._request(turn)
            stream = self._router.stream(
                "suggest", request, company=self._routing, t0_ms=turn.t0_ms, result=result
            )
            async with contextlib.aclosing(stream) as chunks:
                async for chunk in chunks:
                    text = parser.feed(chunk.text)
                    if parser.verdict == "no_answer":
                        return False
                    if text:
                        writer = writer or self._ai_writer(turn, card_type, result)
                        await writer.delta(text)
            tail = parser.finish()
            if tail:
                writer = writer or self._ai_writer(turn, card_type, result)
                await writer.delta(tail)
            if writer is None:
                return False
            await writer.delta("", done=True)
            return True

        task = asyncio.create_task(suggest())
        holding_sent = False
        try:
            finished = await self._wait(task, until_ms=turn.t0_ms + self.holding_at_ms)
            if not finished and writer is None:
                await self._holding(turn)
                holding_sent = True
                finished = await self._wait(task, until_ms=turn.t0_ms + LATE_ANSWER_UNTIL_MS)
            if not finished and writer is not None:  # an answer is streaming: give it a hard cap
                finished = await self._wait(task, until_ms=turn.t0_ms + ANSWER_HARD_LIMIT_MS)
            answered = False
            if finished:
                try:
                    answered = task.result()
                except Exception:
                    answered = False
        finally:
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        if writer is not None and not writer.closed:
            await writer.delta("", done=True)  # close what the agent is reading; never retract
        if not answered:
            if writer is None and not holding_sent:
                await self._holding(turn)
            await self._escalate(turn)

    def _ai_writer(self, turn: _Turn, card_type: CardType, result: RouteResult) -> _CardWriter:
        source: CardSource = "backup" if result.winner == "backup" else "ai"
        label = (
            self.company.escalation_label.get(turn.language) or self.company.escalation_label["en"]
        )
        return _CardWriter(
            self, card_type=card_type, source=source, label=label, turn=turn, result=result
        )

    async def _wait(self, task: asyncio.Task[bool], *, until_ms: int) -> bool:
        """Wait for `task` until an absolute time; True if it finished (successfully or not)."""
        if task.done():
            return True
        timer = asyncio.create_task(self.clock.sleep(until_ms - self.clock.now_ms()))
        try:
            await asyncio.wait({task, timer}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            timer.cancel()
        return task.done()

    async def _holding(self, turn: _Turn) -> None:
        text = self.company.holding_line.get(turn.language) or self.company.holding_line["en"]
        writer = _CardWriter(self, card_type="holding", source="holding", label=None, turn=turn)
        await writer.delta(text, done=True)

    async def _escalate(self, turn: _Turn) -> None:
        key = question_hash(turn.event.text)
        if key in self._escalated:
            return
        self._escalated.add(key)
        await self._on_escalation(
            Escalation(
                call_id=self.call_id,
                company_id=self.company.company_id,
                question=turn.event.text,
                question_hash=key,
                language=turn.language,
                transcript_excerpt=self._context(turn.event.end_ms),
                at_ms=turn.t0_ms,
            )
        )

    def _context(self, until_ms: int) -> str:
        lines = [
            f"{'Customer' if e.speaker == 'customer' else 'Agent'}: {e.text}"
            for e in self._events
            if until_ms - CONTEXT_WINDOW_MS <= e.end_ms <= until_ms
        ]
        return "\n".join(lines)

    def _request(self, turn: _Turn) -> LLMRequest:
        playbook_text = match_text(turn.nearest)
        variables = {
            "company.name": self.company.name,
            "company.tone": self.company.tone,
            "company.call_goal": self.company.call_goal,
            "playbook.match": playbook_text,
            "transcript.last_60s": self._context(turn.event.end_ms),
            "turn.kind": turn.kind,
            "turn.text": turn.event.text,
            "card.language": LANGUAGE_NAME.get(turn.language, turn.language),
        }
        rendered = self._prompts.render(
            self.prompts_key, PromptContext(company_id=self.company.company_id), variables
        )
        settings = self._router.resolve("suggest", self._routing).settings
        system, _, user = rendered.text.partition(TURN_MARKER)
        if not user:  # prompt without a cache split: everything is per-turn
            system, user = "", system
        return LLMRequest(
            system=system.strip(),
            messages=[Message(role="user", content=user.strip())],
            max_tokens=int(settings.get("max_tokens", 120)),
            temperature=float(settings.get("temperature", 0.2)),
            cacheable_prefix=system.strip(),
            settings=dict(settings),
        )
