"""Deepgram live streaming (`wss://api.deepgram.com/v1/listen`), raw WebSocket, no SDK.
Docs (checked 2026-10-20): https://developers.deepgram.com/reference/speech-to-text/listen-streaming"""

from __future__ import annotations

import json
from urllib.parse import urlencode

from sotto_worker.adapters.stt.base import State, WebSocketSTT, event, seconds_to_ms
from sotto_worker.contracts import STTOptions, TranscriptEvent

DEFAULT_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramSTT(WebSocketSTT):
    provider = "deepgram"

    def url(self, opts: STTOptions) -> str:
        query = {
            "model": self.model,
            "encoding": "linear16",
            "sample_rate": opts.sample_rate,
            "channels": 1,
            "interim_results": "true",
            "language": opts.language,
            "smart_format": "true",
            "endpointing": 300,
        }
        return f"{self._base_url or DEFAULT_URL}?{urlencode(query)}"

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Token {self._key}"}

    def end_messages(self, chunks_sent: int, opts: STTOptions) -> list[str]:
        return [json.dumps({"type": "CloseStream"})]

    def parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        message = json.loads(raw)
        kind = message.get("type")
        if kind == "Error":
            raise self._error(str(message.get("description") or message.get("message") or "error"))
        if kind != "Results":
            return [], None
        alternatives = message.get("channel", {}).get("alternatives") or [{}]
        text = str(alternatives[0].get("transcript") or "")
        if not text.strip():
            return [], None
        start = seconds_to_ms(message.get("start"))
        end = start + seconds_to_ms(message.get("duration"))
        final = bool(message.get("is_final"))
        return [event(opts, text, final=final, start_ms=start, end_ms=end)], None
