"""A spoken customer track (browser microphone on the hosted demo, D-020) → real-time STT → turns.

The end of a customer turn is OUR decision (T-007): an energy VAD marks the end of speech after
END_SILENCE_MS of quiet, we ask the vendor for the final at once (`finalize()`), and the R1 clock
(t0) is the moment the customer stopped speaking, not the moment the transcript arrived.
Primary STT first; on an STT error the backup vendor takes over for the rest of the call (R2).
"""

from __future__ import annotations

import array
import asyncio
import contextlib
import math
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass

from sotto_worker.adapters.factory import make_stt
from sotto_worker.adapters.stt.base import STTError
from sotto_worker.clock import Clock
from sotto_worker.contracts import STTAdapter, STTOptions, TranscriptEvent
from sotto_worker.router import StageRoute

SAMPLE_RATE = 16000
FRAME_MS = 20
END_SILENCE_MS = 300  # quiet after speech that ends a turn (ARCHITECTURE §4: ~200-300 ms)
MIN_SPEECH_MS = 160  # shorter bursts (clicks, coughs) are not speech
FLUSH_AFTER_MS = 1500  # if the vendor never sends a final after finalize, use what we have
# Finals already in hand at our end of turn: wait this long for the forced final of the tail,
# then go (Deepgram does not answer Finalize when no new audio is left to process).
TAIL_WAIT_MS = 400
MIN_THRESHOLD = 350.0  # int16 RMS; the noise floor x NOISE_FACTOR when the room is louder
NOISE_FACTOR = 3.0
MAX_QUEUE = 500  # ~10 s of 20 ms frames: a stalled vendor never grows memory without bound


def rms(frame: bytes) -> float:
    samples = array.array("h")
    samples.frombytes(frame[: len(frame) - len(frame) % 2])
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))


@dataclass
class VadState:
    speaking: bool = False
    speech_ms: int = 0
    silence_ms: int = 0
    noise_floor: float = 100.0


class EndOfTurnVAD:
    """Feeds 20 ms frames; returns "start" when speech begins and "end" when a turn ends."""

    def __init__(self, *, end_silence_ms: int = END_SILENCE_MS) -> None:
        self.state = VadState()
        self._end_silence_ms = end_silence_ms
        self._candidate_ms = 0

    def threshold(self) -> float:
        return max(MIN_THRESHOLD, self.state.noise_floor * NOISE_FACTOR)

    def feed(self, frame: bytes) -> str | None:
        level = rms(frame)
        s = self.state
        voiced = level > self.threshold()
        if not voiced:
            s.noise_floor = 0.95 * s.noise_floor + 0.05 * level
        if not s.speaking:
            self._candidate_ms = self._candidate_ms + FRAME_MS if voiced else 0
            if self._candidate_ms >= MIN_SPEECH_MS:
                s.speaking, s.speech_ms, s.silence_ms = True, self._candidate_ms, 0
                self._candidate_ms = 0
                return "start"
            return None
        if voiced:
            s.speech_ms += FRAME_MS
            s.silence_ms = 0
            return None
        s.silence_ms += FRAME_MS
        if s.silence_ms >= self._end_silence_ms:
            s.speaking = False
            return "end"
        return None


OnTurn = Callable[[TranscriptEvent, int], Awaitable[None]]
OnPartial = Callable[[str], Awaitable[None]]
OnNotice = Callable[[str], Awaitable[None]]
MakeSTT = Callable[[StageRoute], STTAdapter]


class CustomerAudio:
    """One call's spoken customer track. `push` raw PCM16 mono 16 kHz; turns come out of
    `on_turn(event, t0_ms)` with t0 = when the customer stopped speaking."""

    def __init__(
        self,
        *,
        routes: Sequence[StageRoute],
        env: dict[str, str] | None = None,
        clock: Clock,
        on_turn: OnTurn,
        on_partial: OnPartial,
        on_notice: OnNotice,
        make: MakeSTT | None = None,
    ) -> None:
        if not routes:
            raise ValueError("no speech-to-text vendor has a key")
        self._routes = list(routes)
        self._make = make or (lambda route: make_stt(route, env=env or {}))
        self._clock = clock
        self._on_turn = on_turn
        self._on_partial = on_partial
        self._on_notice = on_notice
        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=MAX_QUEUE)
        self._vad = EndOfTurnVAD()
        self._buffer = b""
        self._pending: list[TranscriptEvent] = []
        self._speech_start_ms: int | None = None
        self._speech_end_ms: int | None = None  # set at our end of turn, cleared on flush
        self._stt: STTAdapter | None = None
        self._task: asyncio.Task[None] | None = None
        self._flush_timer: asyncio.Task[None] | None = None
        self.vendor: str | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def push(self, pcm: bytes) -> None:
        self._buffer += pcm
        frame_bytes = SAMPLE_RATE * 2 * FRAME_MS // 1000
        while len(self._buffer) >= frame_bytes:
            frame, self._buffer = self._buffer[:frame_bytes], self._buffer[frame_bytes:]
            with contextlib.suppress(asyncio.QueueFull):
                self._queue.put_nowait(frame)
            self._on_vad(self._vad.feed(frame))

    def _on_vad(self, change: str | None) -> None:
        now = self._clock.now_ms()
        if change == "start":
            self._speech_start_ms = now - self._vad.state.speech_ms
            self._speech_end_ms = None
        elif change == "end":
            self._speech_end_ms = now - END_SILENCE_MS  # the last voiced frame
            stt = self._stt
            if stt is not None:
                asyncio.get_running_loop().create_task(self._finalize(stt))
            self._arm_flush()

    async def _finalize(self, stt: STTAdapter) -> None:
        with contextlib.suppress(STTError):
            await stt.finalize()

    def _arm_flush(self) -> None:
        if self._flush_timer is not None:
            self._flush_timer.cancel()

        wait = TAIL_WAIT_MS if self._pending else FLUSH_AFTER_MS

        async def later() -> None:
            await self._clock.sleep(wait)
            await self._flush()

        self._flush_timer = asyncio.get_running_loop().create_task(later())

    async def stop(self) -> None:
        with contextlib.suppress(asyncio.QueueFull):
            self._queue.put_nowait(None)
        for task in (self._task, self._flush_timer):
            if task is not None and not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task

    async def _frames(self) -> AsyncIterator[bytes]:
        while True:
            frame = await self._queue.get()
            if frame is None:
                return
            yield frame

    async def _run(self) -> None:
        for index, route in enumerate(self._routes):
            try:
                self._stt = self._make(route)
                self.vendor = route.provider
                async for event in self._stt.transcribe(
                    self._frames(), STTOptions(speaker="customer", sample_rate=SAMPLE_RATE)
                ):
                    await self._event(event)
                return
            except (STTError, ValueError) as e:
                self._stt = None
                more = index + 1 < len(self._routes)
                await self._on_notice(
                    f"speech-to-text {route.provider} failed ({e})"
                    + ("; switching to the backup vendor" if more else "")
                )
        self.vendor = None

    async def _event(self, event: TranscriptEvent) -> None:
        if not event.final:
            await self._on_partial(event.text)
            return
        self._pending.append(event)
        if self._speech_end_ms is not None:  # our end of turn came first: this is the final
            await self._flush()

    async def _flush(self) -> None:
        if self._flush_timer is not None and self._flush_timer is not asyncio.current_task():
            self._flush_timer.cancel()
        self._flush_timer = None
        if not self._pending:
            return
        text = " ".join(e.text for e in self._pending if e.text).strip()
        self._pending = []
        end = self._speech_end_ms if self._speech_end_ms is not None else self._clock.now_ms()
        start = self._speech_start_ms if self._speech_start_ms is not None else end
        self._speech_end_ms = None
        if text:
            await self._on_turn(
                TranscriptEvent(
                    speaker="customer", text=text, final=True, start_ms=start, end_ms=end
                ),
                end,
            )
