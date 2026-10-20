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
import re
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
# After our end of turn, a vendor may send the sentence as two finals (Deepgram answers Finalize
# with the tail as its own result). Each final restarts this short settle timer; the turn goes
# out when no further final arrives within it.
SETTLE_MS = 150
# Text that does not end a sentence yet ("…for the two bedroom") is likely to get its tail as a
# separate final: wait the longer tail window for it.
SENTENCE_END = re.compile(r"[.?!؟]\s*$")
# T-011 (step toward the end-of-turn model): words that almost never end a sentence. When the
# text so far ends with one, the customer is mid-thought: keep the turn open this much longer
# before asking for the final; if they speak again, it stays one turn.
CONTINUATION_WORDS = frozenset(
    {"and", "but", "or", "so", "because", "the", "a", "an", "to", "of", "for", "with", "my"}
    | {"our", "your", "their", "is", "are", "was", "if", "that", "which", "about", "in", "on"}
    | {"at", "from", "than", "like", "um", "uh"}
)
HOLD_MS = 500
# A final whose audio STARTED before the previous turn's end of speech is that turn's late tail
# (vendors report a forced final's end including the silence, so the start is what counts); it
# must never be glued onto the next turn.
MIN_THRESHOLD = 350.0  # int16 RMS; the noise floor x NOISE_FACTOR when the room is louder
NOISE_FACTOR = 3.0
STOP_WAIT_S = 2.0  # on stop: how long the vendor gets to send its last finals
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
        self._stream_ms = 0  # audio pushed so far, on the vendor's clock (ms from stream start)
        self._stream_base = 0  # where the current vendor's stream started (backup after failover)
        self._last_turn_stream_end: int | None = None  # end of the last turn sent (stream clock)
        self._partial = ""  # the vendor's latest partial (words after the last final)
        self._hold = False  # the final ends mid-thought: waiting HOLD_MS before sending
        self._speech_start_ms: int | None = None  # the utterance in progress (our clock)
        # The turn we ended and are waiting to send: (start ms, end ms, end on the stream clock).
        # A snapshot, so a new sentence that starts meanwhile cannot change its R1 clock (t0).
        self._closing: tuple[int, int, int] | None = None
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
            self._stream_ms += FRAME_MS
            self._on_vad(self._vad.feed(frame))

    def _on_vad(self, change: str | None) -> None:
        now = self._clock.now_ms()
        if change == "start":
            unsent = " ".join(e.text for e in self._pending)
            if self._closing is not None and (self._hold or mid_thought(unsent)):
                # They went on talking after "…about the": still the same turn.
                self._hold = False
                self._closing = None
                if self._flush_timer is not None:
                    self._flush_timer.cancel()
                    self._flush_timer = None
            else:
                self._speech_start_ms = now - self._vad.state.speech_ms
        elif change == "end":
            end = now - END_SILENCE_MS  # the last voiced frame
            start = self._speech_start_ms if self._speech_start_ms is not None else end
            self._closing = (start, end, self._stream_ms - END_SILENCE_MS)
            stt = self._stt
            if stt is not None:
                asyncio.get_running_loop().create_task(self._finalize(stt))
            self._arm_flush()

    async def _finalize(self, stt: STTAdapter) -> None:
        with contextlib.suppress(Exception):  # a failed finalize only costs vendor latency
            await stt.finalize()

    def _arm_flush(self, wait: int | None = None) -> None:
        if self._flush_timer is not None:
            self._flush_timer.cancel()
        if wait is None:
            wait = TAIL_WAIT_MS if self._pending else FLUSH_AFTER_MS

        async def later() -> None:
            await self._clock.sleep(wait)
            await self._flush()

        self._flush_timer = asyncio.get_running_loop().create_task(later())

    async def stop(self) -> None:
        """End of the spoken track: let the vendor send its last finals, then send the last
        turn, so "ask, then press Stop" still gets its card."""
        with contextlib.suppress(asyncio.QueueFull):
            self._queue.put_nowait(None)
        if self._task is not None and not self._task.done():
            with contextlib.suppress(Exception):
                await asyncio.wait_for(asyncio.shield(self._task), STOP_WAIT_S)
        if self._pending:
            if self._closing is None:  # stopped mid-sentence: the turn ends now
                now = self._clock.now_ms()
                start = self._speech_start_ms if self._speech_start_ms is not None else now
                self._closing = (start, now, self._stream_ms)
            self._hold = True  # no more speech is coming: do not wait for more
            with contextlib.suppress(Exception):
                await self._flush()
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
                self._stream_base = self._stream_ms - self._queue.qsize() * FRAME_MS
                self.vendor = route.provider
                async for event in self._stt.transcribe(
                    self._frames(), STTOptions(speaker="customer", sample_rate=SAMPLE_RATE)
                ):
                    await self._event(event)
                return
            except asyncio.CancelledError:
                raise
            except Exception as e:  # any vendor failure: say so, then try the backup (R2)
                self._stt = None
                more = index + 1 < len(self._routes)
                detail = str(e) if isinstance(e, STTError | ValueError) else type(e).__name__
                await self._on_notice(
                    f"speech-to-text {route.provider} failed ({detail})"
                    + ("; switching to the backup vendor" if more else "")
                )
        self.vendor = None

    async def _event(self, event: TranscriptEvent) -> None:
        if not event.final:
            self._partial = event.text
            await self._on_partial(event.text)
            return
        self._partial = ""
        await self._on_partial("")  # the words are final now: clear "Hearing: …"
        last = self._last_turn_stream_end
        if last is not None and self._stream_base + event.start_ms < last:
            return  # the late tail of a turn already sent
        self._pending.append(event)
        if self._closing is not None:  # our end of turn came first: settle, then send
            done = SENTENCE_END.search(event.text) is not None
            self._arm_flush(SETTLE_MS if done else TAIL_WAIT_MS)

    async def _flush(self) -> None:
        if self._flush_timer is not None and self._flush_timer is not asyncio.current_task():
            self._flush_timer.cancel()
        self._flush_timer = None
        closing = self._closing
        if not self._pending or closing is None:
            return
        start, end, end_stream = closing
        # Finals that began after this turn ended belong to the next sentence: keep them.
        mine = [e for e in self._pending if self._stream_base + e.start_ms < end_stream]
        rest = [e for e in self._pending if e not in mine] if mine else []
        mine = mine or self._pending
        text = " ".join(e.text for e in mine if e.text).strip()
        if not self._hold and mid_thought(text):
            self._hold = True  # "…and the": give them HOLD_MS to go on before sending
            self._arm_flush(HOLD_MS)
            return
        self._hold = False
        self._pending = rest
        self._closing = None
        self._last_turn_stream_end = end_stream
        if text:
            await self._on_turn(
                TranscriptEvent(
                    speaker="customer", text=text, final=True, start_ms=start, end_ms=end
                ),
                end,
            )


def mid_thought(text: str) -> bool:
    """True when the words so far end with a word that almost never ends a sentence."""
    words = re.findall(r"[a-z']+", text.lower())
    return bool(words) and not SENTENCE_END.search(text) and words[-1] in CONTINUATION_WORDS
