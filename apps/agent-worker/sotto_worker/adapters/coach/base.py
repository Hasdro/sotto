"""Interfaces for voice coach TTS and STT adapters (R6, V1, V2).

Provider SDKs and HTTP/WebSocket calls live strictly inside `adapters/`; application code in
`cloud/coach/` depends only on these protocols and never embeds model names or provider keys.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from sotto_worker.contracts import STTAdapter


class TTSError(RuntimeError):
    """A TTS provider failure. Names the provider, never the API key."""


@dataclass(frozen=True)
class TTSOptions:
    encoding: str = "linear16"
    sample_rate: int = 24000
    language: str = "en"


@dataclass(frozen=True)
class AudioChunk:
    data: bytes
    sample_rate: int = 24000
    encoding: str = "linear16"


class TTSAdapter(Protocol):
    provider: str
    model: str

    def synthesize(self, text: str, opts: TTSOptions | None = None) -> AsyncIterator[AudioChunk]:
        """Stream synthesized audio for `text`. Cancelling the iterator stops playback."""
        ...


class CoachSTTAdapter(STTAdapter, Protocol):
    """Alias for STTAdapter used by the `coach_stt` router stage."""
