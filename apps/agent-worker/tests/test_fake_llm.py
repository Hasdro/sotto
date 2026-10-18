"""Contract tests for LLM adapters, run against the fake (real adapters run the same in P2.3)."""

import asyncio

import pytest

from sotto_worker.adapters.llm.fake import FakeLLM, FakeLLMError
from sotto_worker.clock import FakeClock
from sotto_worker.contracts import LLMAdapter, LLMRequest, Message


def _req() -> LLMRequest:
    return LLMRequest(system="s", messages=[Message(role="user", content="hi")], max_tokens=50)


def test_fake_satisfies_the_protocol() -> None:
    adapter: LLMAdapter = FakeLLM(clock=FakeClock(), text="hello there")
    assert adapter.provider == "fake"
    assert adapter.capabilities.streaming


async def test_streams_words_after_first_token_delay() -> None:
    clock = FakeClock()
    llm = FakeLLM(clock=clock, text="one two three", first_token_ms=300, chunk_ms=20)
    seen: list[tuple[str, int]] = []

    async def consume() -> None:
        async for chunk in llm.stream(_req()):
            seen.append((chunk.text, clock.now_ms()))

    task = asyncio.create_task(consume())
    await clock.advance(1000)
    await task
    assert "".join(t for t, _ in seen) == "one two three"
    assert seen[0][1] == 300
    assert seen[-1][1] == 340


async def test_scripted_error_raises_after_delay() -> None:
    clock = FakeClock()
    llm = FakeLLM(clock=clock, text="x", first_token_ms=50, error=FakeLLMError("boom"))

    async def consume() -> None:
        async for _ in llm.stream(_req()):
            pass

    task = asyncio.create_task(consume())
    await clock.advance(100)
    with pytest.raises(FakeLLMError):
        await task


async def test_hang_never_yields_until_cancelled() -> None:
    clock = FakeClock()
    llm = FakeLLM(clock=clock, text="x", hang=True)
    got: list[str] = []

    async def consume() -> None:
        async for chunk in llm.stream(_req()):
            got.append(chunk.text)

    task = asyncio.create_task(consume())
    await clock.advance(60_000)
    assert got == []
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_text_can_depend_on_the_request() -> None:
    clock = FakeClock()
    llm = FakeLLM(
        clock=clock, text=lambda req: f"echo:{req.messages[-1].content}", first_token_ms=0
    )
    task = asyncio.create_task(_collect(llm))
    await clock.advance(100)
    assert await task == "echo:hi"


async def _collect(llm: FakeLLM) -> str:
    return "".join([c.text async for c in llm.stream(_req())])
