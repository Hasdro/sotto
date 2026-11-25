"""Deterministic fake adapters for offline voice coach and prep coach tests."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sotto_worker.adapters.coach.base import AudioChunk, TTSOptions
from sotto_worker.contracts import (
    LLMChunk,
    LLMRequest,
    ModelCapabilities,
    STTOptions,
    TranscriptEvent,
)


class FakeTTSAdapter:
    provider = "fake"

    def __init__(self, *, model: str = "fake-tts", chunk_bytes: int = 8) -> None:
        self.model = model
        self._chunk_bytes = max(1, chunk_bytes)
        self.calls: list[tuple[str, TTSOptions]] = []

    async def synthesize(
        self, text: str, opts: TTSOptions | None = None
    ) -> AsyncIterator[AudioChunk]:
        options = opts or TTSOptions()
        self.calls.append((text, options))
        payload = text.encode("utf-8")
        for i in range(0, len(payload), self._chunk_bytes):
            yield AudioChunk(
                data=payload[i : i + self._chunk_bytes],
                sample_rate=options.sample_rate,
                encoding=options.encoding,
            )


class FakeCoachSTTAdapter:
    provider = "fake"

    def __init__(self, *, model: str = "fake-stt", utterances: list[str] | None = None) -> None:
        self.model = model
        self._utterances = list(utterances or [])
        self.finalized = False

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        async for _ in audio:
            pass
        cursor = 0
        for line in self._utterances:
            yield TranscriptEvent(
                speaker=opts.speaker,
                text=line,
                final=True,
                start_ms=cursor,
                end_ms=cursor + 1200,
            )
            cursor += 1500

    async def finalize(self) -> bool:
        self.finalized = True
        return True


class FakeCoachLLMAdapter:
    provider = "fake"

    def __init__(self, *, model: str = "fake-llm", replies: list[str] | None = None) -> None:
        self.model = model
        self.capabilities = ModelCapabilities(streaming=True)
        self._replies = list(replies or ["Focus on their timeline first."])
        self._index = 0
        self.requests: list[LLMRequest] = []

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        self.requests.append(req)
        text = self._replies[min(self._index, len(self._replies) - 1)]
        self._index += 1
        yield LLMChunk(text=text)

    async def warm(self) -> None:
        return None
