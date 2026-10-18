"""Scripted LLM for tests, replay and the offline demo: first-token delay, per-word pacing,
errors and hangs, all on an injectable clock."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable

from sotto_worker.clock import Clock
from sotto_worker.contracts import LLMChunk, LLMRequest, ModelCapabilities


class FakeLLMError(RuntimeError):
    pass


class FakeLLM:
    provider = "fake"

    def __init__(
        self,
        *,
        clock: Clock,
        text: str | Callable[[LLMRequest], str] = "",
        model: str = "fake-llm",
        first_token_ms: int = 300,
        chunk_ms: int = 15,
        error: Exception | None = None,
        hang: bool = False,
        benchmark_p95_ms: dict[str, int] | None = None,
    ) -> None:
        self.model = model
        self.capabilities = ModelCapabilities(
            streaming=True, prompt_caching=True, benchmark_p95_ms=benchmark_p95_ms or {}
        )
        self._clock = clock
        self._text = text
        self._first_token_ms = first_token_ms
        self._chunk_ms = chunk_ms
        self._error = error
        self._hang = hang
        self.requests: list[LLMRequest] = []
        self.warmed = False

    async def warm(self) -> None:
        self.warmed = True

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        self.requests.append(req)
        if self._hang:
            while True:
                await self._clock.sleep(60_000)
        await self._clock.sleep(self._first_token_ms)
        if self._error is not None:
            raise self._error
        text = self._text(req) if callable(self._text) else self._text
        words = text.split(" ")
        for i, word in enumerate(words):
            if i:
                await self._clock.sleep(self._chunk_ms)
            yield LLMChunk(text=word if i == 0 else f" {word}")
