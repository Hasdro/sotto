"""Speechmatics real-time v2 (`wss://eu.rt.speechmatics.com/v2/`), raw WebSocket, no SDK.
Docs: https://docs.speechmatics.com/rt-api-ref (checked 2026-10-20)."""

from __future__ import annotations

import json

from sotto_worker.adapters.stt.base import State, WebSocketSTT, event, seconds_to_ms
from sotto_worker.contracts import STTOptions, TranscriptEvent

DEFAULT_URL = "wss://eu.rt.speechmatics.com/v2/"
MAX_DELAY_S = 0.7  # the lowest the API allows: finals as early as possible (R1)


class SpeechmaticsSTT(WebSocketSTT):
    provider = "speechmatics"
    default_model = "standard"  # capability table: used when no route names a model
    wait_ready = True  # audio only after RecognitionStarted

    def url(self, opts: STTOptions) -> str:
        return self._base_url or DEFAULT_URL

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}"}

    def start_messages(self, opts: STTOptions) -> list[str]:
        return [
            json.dumps(
                {
                    "message": "StartRecognition",
                    "audio_format": {
                        "type": "raw",
                        "encoding": "pcm_s16le",
                        "sample_rate": opts.sample_rate,
                    },
                    "transcription_config": {
                        "language": opts.language,
                        "enable_partials": True,
                        "max_delay": MAX_DELAY_S,
                        "model": self.model,
                    },
                }
            )
        ]

    def end_messages(self, chunks_sent: int, opts: STTOptions) -> list[str]:
        return [json.dumps({"message": "EndOfStream", "last_seq_no": chunks_sent})]

    def parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        message = json.loads(raw)
        kind = message.get("message")
        if kind == "RecognitionStarted":
            return [], "ready"
        if kind == "EndOfTranscript":
            return [], "done"
        if kind == "Error":
            raise self._error(f"{message.get('type', 'error')}: {message.get('reason', '')}")
        if kind not in ("AddPartialTranscript", "AddTranscript"):
            return [], None
        meta = message.get("metadata") or {}
        text = str(meta.get("transcript") or "")
        if not text.strip():
            return [], None
        return [
            event(
                opts,
                text,
                final=kind == "AddTranscript",
                start_ms=seconds_to_ms(meta.get("start_time")),
                end_ms=seconds_to_ms(meta.get("end_time")),
            )
        ], None
