"""Anthropic Messages API adapter (streaming, prompt caching).

Docs: https://docs.claude.com/en/docs/build-with-claude/streaming and
https://docs.claude.com/en/docs/build-with-claude/prompt-caching. Checked against the installed
SDK (anthropic 1.15.0): `messages.stream(...)` → `text_stream`; `thinking={"type": "disabled"}`
keeps live stages from delaying the first visible token (ARCHITECTURE §2).
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

import httpx2
from anthropic import AsyncAnthropic

from sotto_worker.contracts import LLMChunk, LLMRequest, ModelCapabilities


class AnthropicLLM:
    provider = "anthropic"

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        timeout_s: float = 10.0,
        http_client: httpx2.AsyncClient | None = None,
        capabilities: ModelCapabilities | None = None,
    ) -> None:
        self.model = model
        self.capabilities = capabilities or ModelCapabilities(streaming=True, prompt_caching=True)
        # max_retries=0: the router owns retries and the backup race (R2).
        self._client = AsyncAnthropic(
            api_key=api_key, timeout=timeout_s, max_retries=0, http_client=http_client
        )

    async def warm(self) -> None:
        """Open the HTTPS connection before the first turn (no tokens spent)."""
        with contextlib.suppress(Exception):
            await self._client.models.retrieve(self.model)

    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": req.max_tokens,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
        }
        system = _system_blocks(req)
        if system:
            kwargs["system"] = system
        if "thinking" in req.settings:
            kwargs["thinking"] = req.settings["thinking"]
        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                if text:
                    yield LLMChunk(text=text)


def _system_blocks(req: LLMRequest) -> list[dict[str, Any]]:
    if not req.system:
        return []
    prefix = req.cacheable_prefix
    if prefix and req.system.startswith(prefix):
        blocks: list[dict[str, Any]] = [
            {"type": "text", "text": prefix, "cache_control": {"type": "ephemeral"}}
        ]
        rest = req.system[len(prefix) :]
        if rest:
            blocks.append({"type": "text", "text": rest})
        return blocks
    return [{"type": "text", "text": req.system}]
