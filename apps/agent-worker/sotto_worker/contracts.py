"""Core contracts (ENGINEERING §4, ARCHITECTURE §2). The rest of the worker depends only on
these protocols; provider SDKs live behind them in sotto_worker/adapters/."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

Stage = Literal[
    "stt",
    "stt_backup",
    "turn",
    "trigger",
    "suggest",
    "suggest_backup",
    "summary",
    "embed",
    "judge",
    "memory_merge",
    "call_state",
    "quality_judge",
]
STAGES: tuple[Stage, ...] = (
    "stt", "stt_backup", "turn", "trigger", "suggest", "suggest_backup", "summary", "embed",
    "judge", "memory_merge", "call_state", "quality_judge",
)  # fmt: skip
LIVE_STAGES: frozenset[Stage] = frozenset({"trigger", "suggest", "suggest_backup"})
Speaker = Literal["customer", "agent"]


@dataclass(frozen=True)
class Message:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class LLMRequest:
    system: str
    messages: list[Message]
    max_tokens: int = 120
    temperature: float = 0.2
    # The part of `system` that is identical across turns of a call; adapters that support
    # prompt caching mark it cacheable (ARCHITECTURE §4).
    cacheable_prefix: str = ""
    settings: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMChunk:
    text: str


@dataclass(frozen=True)
class ModelCapabilities:
    streaming: bool = True
    prompt_caching: bool = False
    context_tokens: int = 0
    # Last golden-set p95 for a stage, in ms (R6: a live stage refuses a model that misses R1).
    benchmark_p95_ms: dict[str, int] = field(default_factory=dict)


class LLMAdapter(Protocol):
    provider: str
    model: str
    capabilities: ModelCapabilities

    def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]: ...

    async def warm(self) -> None:
        """Open the connection and prime the prompt cache before the first turn."""
        ...


@dataclass(frozen=True)
class TranscriptEvent:
    speaker: Speaker
    text: str
    final: bool
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class STTOptions:
    speaker: Speaker  # the track this stream belongs to: set by the room, never guessed (R4)
    sample_rate: int = 16000  # PCM16 mono little-endian
    language: str = "en"  # D-018


class STTAdapter(Protocol):
    provider: str
    model: str

    def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]: ...

    async def finalize(self) -> bool:
        """Force the final transcript now (our end-of-turn decided); False if no stream."""
        ...
