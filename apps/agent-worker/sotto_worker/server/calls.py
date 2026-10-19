"""One call over the demo protocol (packages/shared/src/demo.ts): typed, scripted or spoken
customer turns into the real pipeline (CallSession), cards back to the app. Transport-agnostic:
the server hands in a `send` coroutine. Ported from the D-013 localhost bridge."""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from sotto_worker.clock import RealClock
from sotto_worker.contracts import Speaker, TranscriptEvent
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.protocol import CardMessage
from sotto_worker.runtime import Runtime
from sotto_worker.scenarios import Scenario
from sotto_worker.server.audio import CustomerAudio
from sotto_worker.server.store import Store
from sotto_worker.telemetry import CardTimingRecord, summarise

WARM_TIMEOUT_S = 2.0
Send = Callable[[dict[str, Any]], Awaitable[None]]


class Call:
    def __init__(
        self,
        *,
        runtime: Runtime,
        send: Send,
        store: Store | None,
        title: str,
        log: Callable[[str], None],
    ) -> None:
        self.call_id = str(uuid.uuid4())
        self._runtime = runtime
        self._send = send
        self._store = store
        self._log = log
        self._clock = RealClock()
        self._started_ms = self._clock.now_ms()
        self._lock = asyncio.Lock()
        self.timings: list[CardTimingRecord] = []
        self.transcript: list[dict[str, Any]] = []
        self.playback: asyncio.Task[None] | None = None
        self.warmup: asyncio.Task[None] | None = None
        self.audio: CustomerAudio | None = None
        self._ended = False
        self.session = CallSession(
            call_id=self.call_id,
            company=runtime.company,
            router=runtime.router,
            prompts=runtime.prompts,
            playbook=runtime.playbook,
            clock=self._clock,
            on_card=self._card,
            on_escalation=self._escalation,
            on_timing=self._timing,
        )
        if store is not None:
            store.call_started(self.call_id, title, runtime.mode)

    async def begin(self) -> None:
        await self.send({"type": "call_started", "call_id": self.call_id})
        # Warm model connections in the background; the call is usable at once.
        self.warmup = asyncio.create_task(asyncio.wait_for(self.session.warm(), WARM_TIMEOUT_S))
        self._log(f"call started ({self._runtime.mode} models)")

    def _at(self) -> int:
        return max(self._clock.now_ms() - self._started_ms, 0)

    async def send(self, message: dict[str, Any]) -> None:
        async with self._lock:
            await self._send(message)

    async def _card(self, card: CardMessage) -> None:
        wire = json.loads(card.to_wire())
        if wire.get("done"):
            self.transcript.append(
                {"kind": "card", "source": wire.get("source"), "at_ms": self._at()}
            )
        await self.send({"type": "card", "card": wire})

    async def _escalation(self, escalation: Escalation) -> None:
        self.transcript.append({"kind": "escalation", "text": escalation.question})
        await self.send({"type": "escalation", "question": escalation.question})

    def _timing(self, record: CardTimingRecord) -> None:
        self.timings.append(record)
        self._log(
            f"card {record.source:<8} {record.turn_kind:<9} "
            f"first word {record.first_delta_ms:>5} ms"
            + (f"  ({record.fallback_reason})" if record.fallback_reason else "")
        )

    async def turn(self, event: TranscriptEvent, t0_ms: int) -> None:
        """A finished turn: show it, then run the pipeline with t0 = end of speech (R1)."""
        at = max(event.end_ms - self._started_ms, 0)
        self.transcript.append({"kind": "line", "speaker": event.speaker, "text": event.text})
        await self.send(
            {"type": "transcript", "speaker": event.speaker, "text": event.text, "at_ms": at}
        )
        turn_id = await self.session.on_transcript(event, t0_ms=t0_ms)
        if event.speaker == "customer":
            # Sent before the turn's cards: the turn task only runs once this coroutine yields,
            # and the send lock orders the frames.
            await self.send({"type": "turn_end", "at_ms": at, "turn_id": turn_id})

    async def say(self, speaker: Speaker, text: str, duration_ms: int = 1500) -> None:
        now = self._clock.now_ms()
        event = TranscriptEvent(
            speaker=speaker, text=text, final=True, start_ms=max(now - duration_ms, 0), end_ms=now
        )
        await self.turn(event, now)

    async def play(self, scenario: Scenario, speed: float) -> None:
        for line in scenario.lines:
            await self._clock.sleep((line.gap_ms + line.duration_ms) * speed)
            await self.say(line.speaker, line.text, line.duration_ms)

    # --- spoken customer track ---------------------------------------------------------------
    async def audio_start(self) -> bool:
        if self.audio is not None:
            return True
        if not self._runtime.stt_routes:
            await self.send(
                {"type": "error", "message": "no speech-to-text key is set (Keys & providers)"}
            )
            return False

        async def partial(text: str) -> None:
            await self.send({"type": "partial", "speaker": "customer", "text": text[:2000]})

        async def notice(message: str) -> None:
            self._log(message)
            await self.send({"type": "notice", "message": message[:500]})

        self.audio = CustomerAudio(
            routes=self._runtime.stt_routes,
            env=dict(self._runtime.env),
            clock=self._clock,
            on_turn=self.turn,
            on_partial=partial,
            on_notice=notice,
        )
        self.audio.start()
        self._log(f"microphone on ({self._runtime.stt_routes[0].provider})")
        return True

    def audio_frame(self, pcm: bytes) -> None:
        if self.audio is not None:
            self.audio.push(pcm)

    async def audio_stop(self) -> None:
        if self.audio is not None:
            audio, self.audio = self.audio, None
            await audio.stop()

    async def end(self) -> None:
        if self._ended:
            return
        self._ended = True
        await self.audio_stop()
        for task in (self.playback, self.warmup):
            if task is not None and not task.done():
                task.cancel()
            if task is not None:
                with contextlib.suppress(asyncio.CancelledError, TimeoutError, Exception):
                    await task
        await self.session.close()
        summary = summarise(self.timings) if self.timings else None
        if summary is not None:
            self._log(
                f"call ended: {summary.cards} cards, first word p50 {summary.p50_ms} ms, "
                f"p95 {summary.p95_ms} ms"
            )
        if self._store is not None:
            self._store.call_ended(
                self.call_id,
                cards=summary.cards if summary else 0,
                p50_ms=summary.p50_ms if summary else None,
                p95_ms=summary.p95_ms if summary else None,
                transcript=self.transcript,
            )
        with contextlib.suppress(Exception):
            await self.send({"type": "call_ended", "call_id": self.call_id})
