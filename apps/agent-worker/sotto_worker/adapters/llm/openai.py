"""OpenAI Chat Completions adapter, also used for any OpenAI-compatible endpoint (Ollama,
vLLM, LM Studio, Groq, OpenRouter, …) via `base_url` (R6).

Docs: https://platform.openai.com/docs/api-reference/chat/create (stream=true) and
https://github.com/ollama/ollama/blob/main/docs/openai.md. Checked against openai 3.35.1.
OpenAI models take `max_completion_tokens`; compatible servers get the classic `max_tokens`.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import httpx2
from openai import AsyncOpenAI

from sotto_worker.contracts import LLMChunk, LLMRequest, ModelCapabilities


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
            http_client=http_client,
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
        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield LLMChunk(text=chunk.choices[0].delta.content)
