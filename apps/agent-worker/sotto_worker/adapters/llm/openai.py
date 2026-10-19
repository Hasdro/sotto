"""OpenAI Chat Completions adapter, also used for any OpenAI-compatible endpoint (Ollama,
vLLM, LM Studio, Groq, OpenRouter, …) via `base_url` (R6).

Docs: https://platform.openai.com/docs/api-reference/chat/create (stream=true) and
https://github.com/ollama/ollama/blob/main/docs/openai.md. Checked against openai 3.35.1.
OpenAI models take `max_completion_tokens`; compatible servers get the classic `max_tokens`.
`reasoning_effort` is passed when the route sets it (Groq gpt-oss, Gemini's OpenAI endpoint).
Reasoning streamed in `delta.reasoning` is dropped: only `content` reaches the card.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import httpx2
from openai import AsyncOpenAI, DefaultAsyncHttpxClient

from sotto_worker.contracts import LLMChunk, LLMRequest, ModelCapabilities

# T-005: keep idle HTTPS connections for 2 minutes (the SDK default is 5 s), so the first
# question after a pause in the conversation does not pay a new TLS handshake.
KEEPALIVE_S = 120.0


def keepalive_client() -> httpx2.AsyncClient:
    limits = httpx2.Limits(
        max_connections=1000, max_keepalive_connections=100, keepalive_expiry=KEEPALIVE_S
    )
    return DefaultAsyncHttpxClient(limits=limits)


class OpenAILLM:
    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        base_url: str | None = None,
        provider: str = "openai",
        timeout_s: float = 10.0,
        http_client: httpx2.AsyncClient | None = None,
        capabilities: ModelCapabilities | None = None,
    ) -> None:
        self.provider = provider
        self.model = model
        self.capabilities = capabilities or ModelCapabilities(streaming=True)
        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout_s,
            max_retries=0,
            http_client=http_client or keepalive_client(),
        )

    async def warm(self) -> None:
        with contextlib.suppress(Exception):
            await self._client.models.retrieve(self.model)

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        messages: list[dict[str, str]] = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages += [{"role": m.role, "content": m.content} for m in req.messages]
        kwargs: dict[str, Any] = {"model": self.model, "messages": messages, "stream": True}
        if self.provider == "openai":
            kwargs["max_completion_tokens"] = req.max_tokens
            if "reasoning_effort" in req.settings:
                kwargs["reasoning_effort"] = req.settings["reasoning_effort"]
        else:
            kwargs["max_tokens"] = req.max_tokens
            kwargs["temperature"] = req.temperature
            if "reasoning_effort" in req.settings:
                kwargs["reasoning_effort"] = req.settings["reasoning_effort"]
        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield LLMChunk(text=chunk.choices[0].delta.content)
