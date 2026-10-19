"""ElevenLabs Scribe realtime (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`), raw WebSocket.
Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
(checked 2026-10-20)."""

from __future__ import annotations

import base64
import json
from urllib.parse import urlencode

from sotto_worker.adapters.stt.base import State, WebSocketSTT, event, seconds_to_ms
from sotto_worker.contracts import STTOptions, TranscriptEvent

DEFAULT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
ERROR_TYPES = frozenset(
    {
        "error", "auth_error", "quota_exceeded", "commit_throttled", "unaccepted_terms",
        "rate_limited", "queue_overflow", "resource_exhausted", "session_time_limit_exceeded",
        "input_error", "invalid_request", "chunk_size_exceeded", "insufficient_audio_activity",
        "transcriber_error",
    }
)  # fmt: skip


class ElevenLabsSTT(WebSocketSTT):
    provider = "elevenlabs"
    default_model = "scribe_v2_realtime"  # capability table: used when no route names a model
    wait_ready = True  # audio only after session_started

    def url(self, opts: STTOptions) -> str:
        query = {
            "model_id": self.model,
            "audio_format": f"pcm_{opts.sample_rate}",
            "commit_strategy": "vad",
            "language_code": opts.language,
            "include_timestamps": "true",
        }
        return f"{self._base_url or DEFAULT_URL}?{urlencode(query)}"

    def headers(self) -> dict[str, str]:
        return {"xi-api-key": self._key}

    def audio_message(self, chunk: bytes, opts: STTOptions) -> str:
        return json.dumps(
            {
                "message_type": "input_audio_chunk",
                "audio_base_64": base64.b64encode(chunk).decode("ascii"),
                "commit": False,
                "sample_rate": opts.sample_rate,
            }
        )

    def end_messages(self, chunks_sent: int, opts: STTOptions) -> list[str]:
        return [
            json.dumps(
                {
                    "message_type": "input_audio_chunk",
                    "audio_base_64": "",
                    "commit": True,
                    "sample_rate": opts.sample_rate,
                }
            )
        ]

    def parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        message = json.loads(raw)
        kind = message.get("message_type")
        if kind == "session_started":
            return [], "ready"
        if kind in ERROR_TYPES:
            raise self._error(f"{kind}: {message.get('error', '')}")
        if kind == "partial_transcript":
            text = str(message.get("text") or "")
            return (
                [event(opts, text, final=False, start_ms=0, end_ms=0)] if text.strip() else []
            ), None
        if kind != "committed_transcript_with_timestamps":
            return [], None  # committed_transcript duplicates the timestamped one
        text = str(message.get("text") or "")
        words = [w for w in message.get("words") or [] if w.get("type", "word") == "word"]
        start = seconds_to_ms(words[0]["start"]) if words else 0
        end = seconds_to_ms(words[-1]["end"]) if words else start
        events = [event(opts, text, final=True, start_ms=start, end_ms=end)] if text.strip() else []
        # No "done" marker: a VAD commit in flight could be mistaken for the answer to our closing
        # commit and drop the last words, so the stream ends on close or after END_TIMEOUT_S.
        return events, None
