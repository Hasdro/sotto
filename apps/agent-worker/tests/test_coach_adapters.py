"""Unit tests for voice coach TTS/STT adapters (V1, V2, R6)."""

from __future__ import annotations

import json
import unittest

import httpx

from sotto_worker.adapters.coach import (
    DeepgramTTSAdapter,
    FakeCoachSTTAdapter,
    FakeTTSAdapter,
    TTSError,
    TTSOptions,
)
from sotto_worker.contracts import STTOptions


class CoachAdaptersTest(unittest.IsolatedAsyncioTestCase):
    async def test_deepgram_tts_streams_audio_and_sends_auth_header(self) -> None:
        seen: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("Authorization")
            seen["body"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(200, content=b"PCM1PCM2PCM3")

        adapter = DeepgramTTSAdapter(
            api_key="dg-secret-key",
            model="test-voice-model",
            transport=httpx.MockTransport(handler),
        )
        chunks = [c async for c in adapter.synthesize("Short prep tip.", TTSOptions(sample_rate=16000))]
        self.assertEqual(b"".join(c.data for c in chunks), b"PCM1PCM2PCM3")
        self.assertEqual(seen["auth"], "Token dg-secret-key")
        self.assertEqual(seen["body"], {"text": "Short prep tip."})
        self.assertIn("model=test-voice-model", str(seen["url"]))
        self.assertIn("sample_rate=16000", str(seen["url"]))

    async def test_deepgram_tts_interruptible_iteration(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"A" * 10000)

        adapter = DeepgramTTSAdapter(
            api_key="dg-secret-key",
            model="test-voice-model",
            transport=httpx.MockTransport(handler),
        )
        got = 0
        async for _chunk in adapter.synthesize("Long review line"):
            got += 1
            break
        self.assertEqual(got, 1)

    async def test_deepgram_tts_redacts_api_key_on_error(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="invalid key dg-super-secret")

        adapter = DeepgramTTSAdapter(
            api_key="dg-super-secret",
            model="test-voice-model",
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(TTSError) as ctx:
            _ = [c async for c in adapter.synthesize("Hello")]
        self.assertNotIn("dg-super-secret", str(ctx.exception))
        self.assertIn("deepgram", str(ctx.exception))

    async def test_fake_tts_and_stt_adapters(self) -> None:
        tts = FakeTTSAdapter(chunk_bytes=4)
        chunks = [c async for c in tts.synthesize("abcdefgh")]
        self.assertEqual(len(chunks), 2)
        self.assertEqual(b"".join(c.data for c in chunks), b"abcdefgh")

        async def audio():
            yield b"\x00\x01"

        stt = FakeCoachSTTAdapter(utterances=["Remember to ask about budget."])
        events = [e async for e in stt.transcribe(audio(), STTOptions(speaker="agent"))]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].text, "Remember to ask about budget.")
        self.assertTrue(await stt.finalize())


if __name__ == "__main__":
    unittest.main()
