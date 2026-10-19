"""`pnpm stt:live` helpers: word error rate, real-time pacing and final-latency timing."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

import pytest

from replay.stt_live import (
    SAMPLE_RATE,
    ClipResult,
    format_results,
    paced,
    run_clip,
    vendor_routes,
    word_error_rate,
)
from sotto_worker.contracts import STTOptions, TranscriptEvent
from sotto_worker.router import RoutingConfig, StageRoute


def test_word_error_rate() -> None:
    assert word_error_rate("Can I see it?", "can i see it") == 0
    assert (
        word_error_rate(
            "Another company quoted us twenty percent less.", "another company quoted us 20% less"
        )
        == 0
    )
    assert word_error_rate("a b c d", "a x c") == 0.5


async def test_paced_releases_audio_in_real_time() -> None:
    pcm = b"\x00\x00" * (SAMPLE_RATE // 10)  # 100 ms
    started = time.perf_counter()
    chunks = [c async for c in paced(pcm, started=started, chunk_ms=20)]
    assert len(chunks) == 5
    assert time.perf_counter() - started >= 0.075  # the last chunk is released at +80 ms


class FinalAtEnd:
    provider = "fake"
    model = "fake"

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        async for _ in audio:
            pass
        yield TranscriptEvent(opts.speaker, "hello there", True, 0, 100)

    async def finalize(self) -> bool:
        return False


class FinalOnForce(FinalAtEnd):
    """Emits the final as soon as it is forced, like a vendor's Finalize message (T-007)."""

    def __init__(self) -> None:
        import asyncio

        self.forced = asyncio.Event()

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        await self.forced.wait()
        yield TranscriptEvent(opts.speaker, "hello there", True, 0, 100)
        async for _ in audio:
            pass

    async def finalize(self) -> bool:
        self.forced.set()
        return True


async def test_run_clip_forces_the_final_after_end_of_speech(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import replay.stt_live as live

    monkeypatch.setattr(live, "TRAILING_SILENCE_MS", 600)
    speech = b"\x00\x00" * (SAMPLE_RATE // 20)  # 50 ms
    result = await run_clip(FinalOnForce(), "Hello there.", speech, finalize_after_ms=100)
    assert result.final_latency_ms is not None
    assert 80 <= result.final_latency_ms < 300  # forced at +100 ms, long before the silence ends


async def test_run_clip_times_the_final_after_end_of_speech(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import replay.stt_live as live

    monkeypatch.setattr(live, "TRAILING_SILENCE_MS", 100)
    result = await run_clip(FinalAtEnd(), "Hello there.", b"\x00\x00" * (SAMPLE_RATE // 20))
    assert result.text == "hello there"
    assert result.final_latency_ms is not None
    assert 80 <= result.final_latency_ms < 400  # the fake finalises after the 100 ms silence


def test_vendor_routes_prefer_the_seed_model() -> None:
    config = RoutingConfig(stages={"stt": StageRoute("deepgram", "nova-x")})
    routes = vendor_routes(config)
    assert routes["deepgram"].model == "nova-x"
    assert set(routes) == {"deepgram", "assemblyai", "speechmatics", "elevenlabs"}


def test_format_results_marks_roles_and_missing_finals() -> None:
    out = format_results(
        {"deepgram": [ClipResult("Hi.", "hi", 210)], "assemblyai": [ClipResult("Hi.", "", None)]},
        {"deepgram": "primary", "assemblyai": "backup"},
    )
    assert "deepgram            primary" in out
    assert "no final" in out
