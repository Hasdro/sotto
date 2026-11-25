"""Voice coach adapters (STT + TTS) behind clean protocols (R6, V1, V2)."""

from sotto_worker.adapters.coach.base import (
    AudioChunk,
    CoachSTTAdapter,
    TTSAdapter,
    TTSError,
    TTSOptions,
)
from sotto_worker.adapters.coach.deepgram_tts import DeepgramTTSAdapter
from sotto_worker.adapters.coach.fake import FakeCoachLLMAdapter, FakeCoachSTTAdapter, FakeTTSAdapter

__all__ = [
    "AudioChunk",
    "CoachSTTAdapter",
    "DeepgramTTSAdapter",
    "FakeCoachLLMAdapter",
    "FakeCoachSTTAdapter",
    "FakeTTSAdapter",
    "TTSAdapter",
    "TTSError",
    "TTSOptions",
]
