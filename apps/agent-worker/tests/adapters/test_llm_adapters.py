"""Real LLM adapters against mocked HTTP (no keys, no network). The SSE bodies follow each
provider's documented streaming format; P2.3's live smoke test (with keys) runs separately."""

import json
from pathlib import Path
from typing import Any

import httpx2
import pytest

from sotto_worker.adapters.llm.anthropic import AnthropicLLM
from sotto_worker.adapters.llm.openai import OpenAILLM
from sotto_worker.contracts import LLMRequest, Message

REQ = LLMRequest(
    system="You whisper to an agent.",
    messages=[Message(role="user", content="Customer asked about parking.")],
    max_tokens=80,
    cacheable_prefix="You whisper",
    settings={"thinking": {"type": "disabled"}},
)


FIXTURES = Path(__file__).parent / "fixtures"
# Streaming bodies in each provider's documented SSE format.
ANTHROPIC_BODY = (FIXTURES / "anthropic_text.sse").read_bytes()
OPENAI_BODY = (FIXTURES / "openai_chat.sse").read_bytes()


class Recorder:
    def __init__(self, body: bytes, status: int = 200) -> None:
        self.body = body
        self.status = status
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx2.Response(
                self.status, json={"error": {"type": "overloaded_error", "message": "busy"}}
            )
        return httpx2.Response(
            200, headers={"content-type": "text/event-stream"}, content=self.body
        )

    def json(self) -> dict[str, Any]:
        body: dict[str, Any] = json.loads(self.requests[-1].content)
        return body


async def test_anthropic_streams_text_and_sends_cache_and_thinking_settings() -> None:
    rec = Recorder(ANTHROPIC_BODY)
    llm = AnthropicLLM(
        model="claude-test",
        api_key="k",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    text = "".join([c.text async for c in llm.stream(REQ)])
    assert text == "ANSWER: One space per unit."
    body = rec.json()
    assert body["model"] == "claude-test"
    assert body["max_tokens"] == 80
    assert body["thinking"] == {"type": "disabled"}
    assert body["system"][0] == {
        "type": "text",
        "text": "You whisper",
        "cache_control": {"type": "ephemeral"},
    }
    assert body["system"][1]["text"] == " to an agent."
    assert body["messages"] == [{"role": "user", "content": "Customer asked about parking."}]


async def test_anthropic_error_surfaces_without_retry() -> None:
    rec = Recorder(b"", status=529)
    llm = AnthropicLLM(
        model="m", api_key="k", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec))
    )
    with pytest.raises(Exception, match=r"busy|529|overloaded"):
        [c async for c in llm.stream(REQ)]
    assert len(rec.requests) == 1, "the router owns retries/fallback; the SDK must not retry"


async def test_openai_streams_and_uses_completion_token_limit() -> None:
    rec = Recorder(OPENAI_BODY)
    llm = OpenAILLM(
        model="gpt-test",
        api_key="k",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    text = "".join([c.text async for c in llm.stream(REQ)])
    assert text == "ANSWER: Yes."
    body = rec.json()
    assert body["stream"] is True
    assert body["max_completion_tokens"] == 80
    assert body["messages"][0] == {"role": "system", "content": "You whisper to an agent."}
    assert "thinking" not in body


async def test_openai_compatible_endpoint_uses_base_url_and_max_tokens() -> None:
    rec = Recorder(OPENAI_BODY)
    llm = OpenAILLM(
        model="local-model",
        api_key="unused",
        base_url="http://127.0.0.1:11434/v1",
        provider="openai_compatible",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    assert "".join([c.text async for c in llm.stream(REQ)]) == "ANSWER: Yes."
    assert str(rec.requests[0].url) == "http://127.0.0.1:11434/v1/chat/completions"
    body = rec.json()
    assert body["max_tokens"] == 80
    assert "max_completion_tokens" not in body
    assert llm.provider == "openai_compatible"


GROQ_REASONING_BODY = (
    b'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":'
    b'[{"index":0,"delta":{"reasoning":"Price objection."},"finish_reason":null}]}\n\n'
    b'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":'
    b'[{"index":0,"delta":{"content":"ANSWER: Fair."},"finish_reason":null}]}\n\n'
    b"data: [DONE]\n\n"
)


async def test_openai_compatible_passes_reasoning_effort_and_drops_reasoning_text() -> None:
    # Groq streams gpt-oss reasoning in `delta.reasoning`; only `content` may reach the card.
    rec = Recorder(GROQ_REASONING_BODY)
    llm = OpenAILLM(
        model="m",
        api_key="g",
        base_url="https://api.groq.com/openai/v1",
        provider="openai_compatible",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    req = LLMRequest(
        system="s",
        messages=[Message(role="user", content="u")],
        max_tokens=300,
        settings={"reasoning_effort": "low"},
    )
    assert "".join([c.text async for c in llm.stream(req)]) == "ANSWER: Fair."
    body = rec.json()
    assert body["reasoning_effort"] == "low"
    assert body["max_tokens"] == 300
    assert rec.requests[0].headers["authorization"] == "Bearer g"


async def test_openai_compatible_omits_reasoning_effort_when_unset() -> None:
    rec = Recorder(OPENAI_BODY)
    llm = OpenAILLM(
        model="m",
        api_key="unused",
        base_url="http://127.0.0.1:11434/v1",
        provider="openai_compatible",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(rec)),
    )
    "".join([c.text async for c in llm.stream(REQ)])
    assert "reasoning_effort" not in rec.json()
