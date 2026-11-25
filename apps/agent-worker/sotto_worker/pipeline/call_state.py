"""Asynchronous running call-state summary (C5).

Rewritten after every customer turn by a cheap model (`call_state` router stage), capped at
120 words, and NEVER awaited on the 1.5 s live-card path (0 ms added to card latency).
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable

from sotto_worker.clock import Clock
from sotto_worker.cloud.obs.log import log_event
from sotto_worker.contracts import LLMRequest, Message
from sotto_worker.pipeline.verdict import enforce_word_limit
from sotto_worker.prompts import PromptContext, PromptRegistry
from sotto_worker.router import CompanyRouting, ModelRouter

MAX_STATE_WORDS = 120
CALL_STATE_TIMEOUT_S = 5.0
TURN_MARKER = "---turn---"


def _strip_marker(value: str) -> str:
    return value.replace(TURN_MARKER, " ")


class CallStateUpdater:
    """Maintains a <= 120-word running summary of the call in the background."""

    def __init__(
        self,
        *,
        call_id: str,
        company_id: str,
        router: ModelRouter,
        routing: CompanyRouting,
        prompts: PromptRegistry,
        clock: Clock | None = None,
        on_update: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        self._call_id = call_id
        self._company_id = company_id
        self._router = router
        self._routing = routing
        self._prompts = prompts
        self._clock = clock
        self._on_update = on_update
        self._state = ""
        self._task: asyncio.Task[None] | None = None
        self._pending_transcript: str | None = None
        self._closed = False

    @property
    def current(self) -> str:
        """Latest finished call state (empty string before the first update completes)."""
        return self._state

    def schedule_update(self, transcript_last_60s: str) -> None:
        """Fire-and-forget update. Coalesces to the latest transcript if one is running."""
        if self._closed or not transcript_last_60s.strip():
            return
        if self._task is not None and not self._task.done():
            self._pending_transcript = transcript_last_60s
            return
        self._task = asyncio.create_task(self._run(transcript_last_60s))

    async def _stream_once(self, req: LLMRequest) -> str:
        t0 = self._clock.now_ms() if self._clock is not None else 0
        chunks: list[str] = []
        stream = self._router.stream("call_state", req, company=self._routing, t0_ms=t0)
        async with contextlib.aclosing(stream) as it:
            async for chunk in it:
                chunks.append(chunk.text)
        return "".join(chunks).strip()

    async def _run(self, transcript_last_60s: str) -> None:
        try:
            rendered = self._prompts.render(
                "call_state",
                PromptContext(company_id=self._company_id),
                {
                    "call.state_previous": _strip_marker(self._state) or "(none yet)",
                    "transcript.last_60s": _strip_marker(transcript_last_60s),
                },
            )
            system, _, user = rendered.text.partition(TURN_MARKER)
            if not user:
                system, user = "", system
            req = LLMRequest(
                system=system.strip(),
                messages=[Message(role="user", content=user.strip())],
                max_tokens=220,
                temperature=0.1,
                cacheable_prefix=system.strip(),
            )
            raw = await asyncio.wait_for(self._stream_once(req), timeout=CALL_STATE_TIMEOUT_S)
            if raw:
                trimmed, _ = enforce_word_limit(raw, max_words=MAX_STATE_WORDS)
                self._state = trimmed
                log_event(
                    "call_state",
                    "updated",
                    call_id=self._call_id,
                    words=len(trimmed.split()),
                )
                if self._on_update is not None:
                    await self._on_update(self._state)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never fail or disrupt the live call if the background state summary fails.
            log_event("call_state", "update_failed", call_id=self._call_id, level="warn")
        finally:
            nxt = None if self._closed else self._pending_transcript
            self._pending_transcript = None
            if nxt:
                self._task = asyncio.create_task(self._run(nxt))

    async def drain(self) -> None:
        while self._task is not None and not self._task.done():
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task

    async def close(self) -> None:
        self._closed = True
        self._pending_transcript = None
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
