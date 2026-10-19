"""AssemblyAI Universal-Streaming v3 (`wss://streaming.assemblyai.com/v3/ws`), raw WebSocket.
Docs (checked 2026-10-20):
https://www.assemblyai.com/docs/api-reference/streaming-api/streaming-api"""

from __future__ import annotations

import json
from urllib.parse import urlencode

from sotto_worker.adapters.stt.base import State, WebSocketSTT, event
from sotto_worker.contracts import STTOptions, TranscriptEvent

DEFAULT_URL = "wss://streaming.assemblyai.com/v3/ws"


class AssemblyAISTT(WebSocketSTT):
    provider = "assemblyai"
    default_model = (
        "universal-streaming-english"  # capability table: used when no route names a model
    )
    min_chunk_ms = 50  # the API wants 50 to 1000 ms of audio per message
    max_chunk_ms = 1000

    def url(self, opts: STTOptions) -> str:
        query = {
            "sample_rate": opts.sample_rate,
            "encoding": "pcm_s16le",
            "speech_model": self.model,
            "format_turns": "true",
        }
        return f"{self._base_url or DEFAULT_URL}?{urlencode(query)}"

    def headers(self) -> dict[str, str]:
        return {"Authorization": self._key}  # no "Bearer" prefix (vendor docs)

    def end_messages(self, chunks_sent: int, opts: STTOptions) -> list[str]:
        return [json.dumps({"type": "Terminate"})]

    def parse(
        self, raw: str | bytes, opts: STTOptions, *, ending: bool
    ) -> tuple[list[TranscriptEvent], State]:
        message = json.loads(raw)
        kind = message.get("type")
        if kind == "Termination":
            return [], "done"
        if kind == "Error" or "error" in message:
            raise self._error(str(message.get("error") or "error"))
        if kind != "Turn":
            return [], None
        text = str(message.get("transcript") or "")
        if not text.strip():
            return [], None
        words = message.get("words") or []
        start = int(words[0]["start"]) if words else 0
        end = int(words[-1]["end"]) if words else start
        # With format_turns, an end-of-turn arrives unformatted first, then formatted: the
        # formatted one is the final (punctuation and casing help the trigger rules).
        final = bool(message.get("end_of_turn")) and bool(message.get("turn_is_formatted"))
        return [event(opts, text, final=final, start_ms=start, end_ms=end)], None
