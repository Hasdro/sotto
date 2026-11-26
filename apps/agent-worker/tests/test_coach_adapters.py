"""Unit tests for voice coach TTS/STT adapters (V1, V2, R6)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx
import pytest

from sotto_worker.adapters.coach import (
    DeepgramTTSAdapter,
    FakeCoachLLMAdapter,
    FakeCoachSTTAdapter,
    FakeTTSAdapter,
    TTSError,
    TTSOptions,
)
from sotto_worker.adapters.coach.deepgram_tts import MAX_AUDIO_BYTES
from sotto_worker.adapters.factory import make_coach_tts
from sotto_worker.contracts import STTOptions
from sotto_worker.router import StageRoute


async def test_deepgram_tts_streams_audio_and_sends_auth_header() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, content=b"PCM1PCM2PCM3")

    adapter = DeepgramTTSAdapter(
        api_key="dg-secret-key",
        model="test-voice-model",
        transport=httpx.MockTransport(handler),
    )
    chunks = [c async for c in adapter.synthesize("Short prep tip.", TTSOptions(sample_rate=16000))]
    assert b"".join(c.data for c in chunks) == b"PCM1PCM2PCM3"
    assert seen["auth"] == "Token dg-secret-key"
    assert seen["body"] == {"text": "Short prep tip."}
    assert "model=test-voice-model" in str(seen["url"])
    assert "sample_rate=16000" in str(seen["url"])


async def test_deepgram_tts_interruptible_iteration() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"A" * 10000)

    adapter = DeepgramTTSAdapter(
        api_key="dg-secret-key",
        model="test-voice-model",
        transport=httpx.MockTransport(handler),
    )
    got = 0
    async for _chunk in adapter.synthesize("Long review line"):
        got += 1
        break
    assert got == 1


async def test_deepgram_tts_redacts_api_key_on_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="invalid key dg-super-secret")

    adapter = DeepgramTTSAdapter(
        api_key="dg-super-secret",
        model="test-voice-model",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(TTSError) as ctx:
        _ = [c async for c in adapter.synthesize("Hello")]
    assert "dg-super-secret" not in str(ctx.value)
    assert "deepgram" in str(ctx.value)


async def test_fake_tts_and_stt_adapters() -> None:
    tts = FakeTTSAdapter(chunk_bytes=4)
    chunks = [c async for c in tts.synthesize("abcdefgh")]
    assert len(chunks) == 2
    assert b"".join(c.data for c in chunks) == b"abcdefgh"

    async def audio() -> AsyncIterator[bytes]:
        yield b"\x00\x01"

    stt = FakeCoachSTTAdapter(utterances=["Remember to ask about budget."])
    events = [e async for e in stt.transcribe(audio(), STTOptions(speaker="agent"))]
    assert len(events) == 1
    assert events[0].text == "Remember to ask about budget."
    assert await stt.finalize() is True
    await FakeCoachLLMAdapter().warm()


async def test_deepgram_tts_validation_and_factory() -> None:
    with pytest.raises(TTSError, match="api_key"):
        DeepgramTTSAdapter(api_key="", model="m")
    with pytest.raises(TTSError, match="model"):
        DeepgramTTSAdapter(api_key="k", model="")
    with pytest.raises(TTSError, match="https"):
        DeepgramTTSAdapter(api_key="k", model="m", base_url="http://api.deepgram.com")
    with pytest.raises(TTSError, match=r"api\.deepgram\.com"):
        DeepgramTTSAdapter(api_key="k", model="m", base_url="https://evil.example")

    empty_adapter = DeepgramTTSAdapter(
        api_key="k",
        model="m",
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, content=b"")),
    )
    assert [c async for c in empty_adapter.synthesize("   ")] == []

    big_adapter = DeepgramTTSAdapter(
        api_key="k",
        model="m",
        transport=httpx.MockTransport(
            lambda _r: httpx.Response(200, content=b"X" * (MAX_AUDIO_BYTES + 1))
        ),
    )
    with pytest.raises(TTSError, match="byte limit"):
        _ = [c async for c in big_adapter.synthesize("Too big")]

    assert isinstance(
        make_coach_tts(StageRoute(provider="fake", model="m"), env={}), FakeTTSAdapter
    )
    assert make_coach_tts(StageRoute(provider="deepgram", model="m"), env={}) is None
    dg1 = make_coach_tts(
        StageRoute(provider="deepgram", model="m"), env={"DEEPGRAM_API_KEY": "dg-key"}
    )
    assert isinstance(dg1, DeepgramTTSAdapter)
    dg2 = make_coach_tts(
        StageRoute(provider="deepgram", model="m", base_url="https://api.deepgram.com"),
        env={"DEEPGRAM_API_KEY": "dg-key"},
    )
    assert isinstance(dg2, DeepgramTTSAdapter)
    assert make_coach_tts(StageRoute(provider="unknown", model="m"), env={}) is None
