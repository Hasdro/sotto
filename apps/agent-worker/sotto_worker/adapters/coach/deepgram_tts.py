"""Deepgram Aura-2 HTTP streaming TTS adapter (V1, V2, D-121).

Built against Deepgram's `/v1/speak` API documentation:
- Endpoint: `POST {base_url}/v1/speak?model={model}&encoding={encoding}&sample_rate={sample_rate}`
- Auth header: `Authorization: Token <api_key>`
- Body: `{"text": "<utterance>"}`
- Response: streamed binary audio chunks (interruptible by closing the async iterator).

No model name is hard-coded here; `model` comes from the model router seed/config (R6).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from urllib.parse import urlparse

import httpx

from sotto_worker.adapters.coach.base import AudioChunk, TTSError, TTSOptions

DEFAULT_BASE_URL = "https://api.deepgram.com"
ALLOWED_HOST = "api.deepgram.com"
DEFAULT_TIMEOUT_S = 15.0
CHUNK_SIZE = 4096
MAX_AUDIO_BYTES = 10_000_000


class DeepgramTTSAdapter:
    provider = "deepgram"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise TTSError("deepgram: api_key is required")
        if not model:
            raise TTSError("deepgram: model is required")
        parsed = urlparse(base_url.strip())
        if parsed.scheme != "https" or parsed.username or parsed.password:
            raise TTSError("deepgram: base_url must be https without credentials")
        if transport is None and (parsed.hostname or "").lower() != ALLOWED_HOST:
            raise TTSError(f"deepgram: base_url host must be {ALLOWED_HOST}")
        self.model = model
        self._key = api_key
        self._base_url = base_url.strip().rstrip("/")
        self._timeout_s = timeout_s
        self._transport = transport

    def _error(self, detail: str) -> TTSError:
        msg = f"{self.provider}: {detail}"
        return TTSError(msg.replace(self._key, "***") if self._key else msg)

    async def synthesize(
        self, text: str, opts: TTSOptions | None = None
    ) -> AsyncIterator[AudioChunk]:
        clean = text.strip()
        if not clean:
            return
        options = opts or TTSOptions()
        url = f"{self._base_url}/v1/speak"
        params = {
            "model": self.model,
            "encoding": options.encoding,
            "sample_rate": str(options.sample_rate),
        }
        headers = {
            "Authorization": f"Token {self._key}",
            "Content-Type": "application/json",
        }
        try:
            async with (
                httpx.AsyncClient(timeout=self._timeout_s, transport=self._transport) as client,
                client.stream(
                    "POST", url, params=params, headers=headers, json={"text": clean}
                ) as resp,
            ):
                if resp.status_code >= 400:
                    raise self._error(f"HTTP {resp.status_code} from TTS endpoint")
                total = 0
                async for raw in resp.aiter_bytes(chunk_size=CHUNK_SIZE):
                    if raw:
                        total += len(raw)
                        if total > MAX_AUDIO_BYTES:
                            raise self._error("TTS response exceeded byte limit")
                        yield AudioChunk(
                            data=raw,
                            sample_rate=options.sample_rate,
                            encoding=options.encoding,
                        )
        except TTSError:
            raise
        except Exception as err:
            raise self._error(f"request failed ({type(err).__name__})") from None
