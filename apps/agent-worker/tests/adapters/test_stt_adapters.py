"""Real-time STT adapters (P2.3, D-019) against a scripted fake WebSocket: no keys, no network.
Message shapes follow each vendor's official streaming docs (spec/phase-2-stt.md)."""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from urllib.parse import parse_qs, urlsplit

import pytest

from sotto_worker.adapters.factory import make_stt
from sotto_worker.adapters.stt.assemblyai import AssemblyAISTT
from sotto_worker.adapters.stt.base import STTError, WSClosed, WSClosedAbnormally
from sotto_worker.adapters.stt.deepgram import DeepgramSTT
from sotto_worker.adapters.stt.elevenlabs import ElevenLabsSTT
from sotto_worker.adapters.stt.speechmatics import SpeechmaticsSTT
from sotto_worker.contracts import STTAdapter, STTOptions, TranscriptEvent
from sotto_worker.router import StageRoute

KEY = "sk-test-secret-123"
OPTS = STTOptions(speaker="customer", sample_rate=16000)
CHUNK = b"\x01\x00" * 320  # 20 ms of 16 kHz PCM16


class FakeWS:
    """Plays `initial` messages at once and `after_end` once the client sends its end message."""

    def __init__(
        self,
        initial: list[str | type[WSClosed] | Exception],
        after_end: list[str | type[WSClosed]],
        is_end: Callable[[str | bytes], bool],
    ) -> None:
        self.sent: list[str | bytes] = []
        self.closed = False
        self._inbox: list[str | type[WSClosed] | Exception] = list(initial)
        self._after_end = after_end
        self._is_end = is_end
        self.url = ""
        self.headers: dict[str, str] = {}

    async def send(self, message: str | bytes) -> None:
        self.sent.append(message)
        if self._is_end(message):
            self._inbox += self._after_end

    async def recv(self) -> str | bytes | None:
        import asyncio

        for _ in range(200):
            if self._inbox:
                item = self._inbox.pop(0)
                if item is WSClosed:
                    return None
                if isinstance(item, Exception):
                    raise item
                assert isinstance(item, str)
                return item
            await asyncio.sleep(0.001)
        return None  # server went quiet: treat as closed

    async def close(self) -> None:
        self.closed = True


def connector(ws: FakeWS) -> Callable[[str, dict[str, str]], Awaitable[FakeWS]]:
    async def connect(url: str, headers: dict[str, str]) -> FakeWS:
        ws.url, ws.headers = url, headers
        return ws

    return connect


async def audio(n: int = 3) -> AsyncIterator[bytes]:
    for _ in range(n):
        yield CHUNK


async def collect(adapter: STTAdapter, n_chunks: int = 3) -> list[TranscriptEvent]:
    return [e async for e in adapter.transcribe(audio(n_chunks), OPTS)]


def _text(m: str | bytes) -> bool:
    return isinstance(m, str)


# ---------------- Deepgram ----------------


def dg_result(text: str, *, final: bool, start: float, duration: float) -> str:
    return json.dumps(
        {
            "type": "Results",
            "is_final": final,
            "speech_final": final,
            "start": start,
            "duration": duration,
            "channel": {"alternatives": [{"transcript": text, "confidence": 0.9}]},
        }
    )


async def test_deepgram_streams_binary_and_maps_results() -> None:
    ws = FakeWS(
        initial=[
            dg_result("what is", final=False, start=0.0, duration=0.5),
            dg_result("", final=True, start=0.5, duration=0.1),
        ],
        after_end=[
            dg_result("What is the price?", final=True, start=0.0, duration=1.25),
            json.dumps({"type": "Metadata", "request_id": "r"}),
            WSClosed,
        ],
        is_end=lambda m: m == json.dumps({"type": "CloseStream"}),
    )
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(ws))
    events = await collect(adapter)
    assert events == [
        TranscriptEvent("customer", "what is", final=False, start_ms=0, end_ms=500),
        TranscriptEvent("customer", "What is the price?", final=True, start_ms=0, end_ms=1250),
    ]
    url = urlsplit(ws.url)
    q = parse_qs(url.query)
    assert (url.scheme, url.hostname, url.path) == ("wss", "api.deepgram.com", "/v1/listen")
    assert q["model"] == ["nova-3"]
    assert q["encoding"] == ["linear16"]
    assert q["sample_rate"] == ["16000"]
    assert q["interim_results"] == ["true"]
    assert q["language"] == ["en"]
    assert ws.headers == {"Authorization": f"Token {KEY}"}
    assert ws.sent[:3] == [CHUNK, CHUNK, CHUNK]
    assert ws.sent[-1] == json.dumps({"type": "CloseStream"})
    assert ws.closed
    assert KEY not in ws.url


async def test_deepgram_error_message_raises_without_the_key() -> None:
    error = {"type": "Error", "variant": "x", "description": "bad request"}
    ws = FakeWS(initial=[json.dumps(error)], after_end=[], is_end=lambda m: False)
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(ws))
    with pytest.raises(STTError, match="deepgram: bad request") as err:
        await collect(adapter)
    assert KEY not in str(err.value)
    assert ws.closed


# ---------------- AssemblyAI ----------------


def aai_turn(text: str, *, end: bool, formatted: bool, words: list[tuple[int, int]]) -> str:
    return json.dumps(
        {
            "type": "Turn",
            "turn_order": 0,
            "turn_is_formatted": formatted,
            "end_of_turn": end,
            "transcript": text,
            "end_of_turn_confidence": 0.9,
            "words": [
                {"text": "w", "start": s, "end": e, "confidence": 0.9, "word_is_final": True}
                for s, e in words
            ],
        }
    )


async def test_assemblyai_rechunks_to_50ms_and_waits_for_the_formatted_turn() -> None:
    ws = FakeWS(
        initial=[
            json.dumps({"type": "Begin", "id": "s", "expires_at": 0}),
            aai_turn("can i pay", end=False, formatted=False, words=[(100, 300), (320, 600)]),
            aai_turn("can i pay monthly", end=True, formatted=False, words=[(100, 900)]),
        ],
        after_end=[
            aai_turn("Can I pay monthly?", end=True, formatted=True, words=[(100, 900)]),
            json.dumps({"type": "Termination", "audio_duration_seconds": 1}),
        ],
        is_end=lambda m: m == json.dumps({"type": "Terminate"}),
    )
    adapter = AssemblyAISTT(api_key=KEY, model="universal-streaming-english", connect=connector(ws))
    events = await collect(adapter, n_chunks=6)  # 6 x 20 ms
    assert events == [
        TranscriptEvent("customer", "can i pay", final=False, start_ms=100, end_ms=600),
        TranscriptEvent("customer", "can i pay monthly", final=False, start_ms=100, end_ms=900),
        TranscriptEvent("customer", "Can I pay monthly?", final=True, start_ms=100, end_ms=900),
    ]
    q = parse_qs(urlsplit(ws.url).query)
    assert urlsplit(ws.url).hostname == "streaming.assemblyai.com"
    assert q["encoding"] == ["pcm_s16le"]
    assert q["speech_model"] == ["universal-streaming-english"]
    assert q["format_turns"] == ["true"]
    assert ws.headers == {"Authorization": KEY}  # no Bearer prefix (vendor docs)
    audio_msgs = [m for m in ws.sent if isinstance(m, bytes)]
    assert [len(m) for m in audio_msgs] == [1920, 1920]  # 60 ms each: never under 50 ms
    assert ws.sent[-1] == json.dumps({"type": "Terminate"})


# ---------------- Speechmatics ----------------


def sm(message: str, text: str = "", start: float = 0.0, end: float = 0.0) -> str:
    return json.dumps(
        {
            "message": message,
            "metadata": {"transcript": text, "start_time": start, "end_time": end},
            "results": [],
        }
    )


async def test_speechmatics_starts_recognition_then_streams_and_ends_with_seq_no() -> None:
    ws = FakeWS(
        initial=[
            json.dumps({"message": "RecognitionStarted", "id": "x"}),
            sm("AddPartialTranscript", "do you", 0.2, 0.6),
            sm("AddTranscript", "", 0.6, 0.6),
        ],
        after_end=[
            sm("AddTranscript", "Do you allow pets? ", 0.2, 1.4),
            json.dumps({"message": "EndOfTranscript"}),
        ],
        is_end=lambda m: isinstance(m, str) and '"EndOfStream"' in m,
    )
    adapter = SpeechmaticsSTT(api_key=KEY, model="standard", connect=connector(ws))
    events = await collect(adapter)
    assert events == [
        TranscriptEvent("customer", "do you", final=False, start_ms=200, end_ms=600),
        TranscriptEvent("customer", "Do you allow pets?", final=True, start_ms=200, end_ms=1400),
    ]
    assert urlsplit(ws.url).hostname == "eu.rt.speechmatics.com"
    assert ws.headers == {"Authorization": f"Bearer {KEY}"}
    start = json.loads(ws.sent[0])
    assert start["message"] == "StartRecognition"
    assert start["audio_format"] == {"type": "raw", "encoding": "pcm_s16le", "sample_rate": 16000}
    assert start["transcription_config"]["language"] == "en"
    assert start["transcription_config"]["enable_partials"] is True
    assert start["transcription_config"]["model"] == "standard"
    assert ws.sent[1:4] == [CHUNK, CHUNK, CHUNK]
    assert json.loads(ws.sent[-1]) == {"message": "EndOfStream", "last_seq_no": 3}


async def test_speechmatics_error_message_raises() -> None:
    error = {"message": "Error", "type": "not_authorised", "reason": "bad key"}
    ws = FakeWS(initial=[json.dumps(error)], after_end=[], is_end=lambda m: False)
    adapter = SpeechmaticsSTT(api_key=KEY, model="standard", connect=connector(ws))
    with pytest.raises(STTError, match="speechmatics: not_authorised: bad key"):
        await collect(adapter)


# ---------------- ElevenLabs ----------------


def el(kind: str, **fields: object) -> str:
    return json.dumps({"message_type": kind, **fields})


async def test_elevenlabs_sends_base64_json_chunks_and_commits_at_the_end() -> None:
    words = [
        {"text": "Is", "start": 0.1, "end": 0.2, "type": "word"},
        {"text": " ", "start": 0.2, "end": 0.25, "type": "spacing"},
        {"text": "parking", "start": 0.25, "end": 0.7, "type": "word"},
        {"text": "included?", "start": 0.7, "end": 1.1, "type": "word"},
    ]
    ws = FakeWS(
        initial=[
            el("session_started", session_id="s", config={}),
            el("partial_transcript", text="is park"),
        ],
        after_end=[
            el("committed_transcript", text="Is parking included?"),
            el("committed_transcript_with_timestamps", text="Is parking included?", words=words),
        ],
        is_end=lambda m: isinstance(m, str) and json.loads(m).get("commit") is True,
    )
    adapter = ElevenLabsSTT(api_key=KEY, model="scribe_v2_realtime", connect=connector(ws))
    events = await collect(adapter)
    assert events == [
        TranscriptEvent("customer", "is park", final=False, start_ms=0, end_ms=0),
        TranscriptEvent("customer", "Is parking included?", final=True, start_ms=100, end_ms=1100),
    ]
    q = parse_qs(urlsplit(ws.url).query)
    assert urlsplit(ws.url).hostname == "api.elevenlabs.io"
    assert q["model_id"] == ["scribe_v2_realtime"]
    assert q["audio_format"] == ["pcm_16000"]
    assert q["commit_strategy"] == ["vad"]
    assert q["include_timestamps"] == ["true"]
    assert ws.headers == {"xi-api-key": KEY}
    first = json.loads(ws.sent[0])
    assert first["message_type"] == "input_audio_chunk"
    assert base64.b64decode(first["audio_base_64"]) == CHUNK
    assert first["commit"] is False
    assert first["sample_rate"] == 16000
    assert json.loads(ws.sent[-1])["commit"] is True


async def test_elevenlabs_error_types_raise() -> None:
    ws = FakeWS(initial=[el("auth_error", error="invalid key")], after_end=[], is_end=_text)
    adapter = ElevenLabsSTT(api_key=KEY, model="scribe_v2_realtime", connect=connector(ws))
    with pytest.raises(STTError, match="elevenlabs: auth_error: invalid key"):
        await collect(adapter)


async def test_socket_closed_before_the_end_raises() -> None:
    ws = FakeWS(initial=[WSClosed], after_end=[], is_end=lambda m: False)
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(ws))

    async def live_audio() -> AsyncIterator[
        bytes
    ]:  # paced like a call, so the close comes mid-call
        import asyncio

        for _ in range(50):
            await asyncio.sleep(0.005)
            yield CHUNK

    with pytest.raises(STTError, match="deepgram: connection closed"):
        _ = [e async for e in adapter.transcribe(live_audio(), OPTS)]
    assert ws.closed


# ---------------- factory: keys bound to vendor hosts ----------------


def test_make_stt_builds_each_vendor_with_its_own_key() -> None:
    env = {
        "DEEPGRAM_API_KEY": "d",
        "ASSEMBLYAI_API_KEY": "a",
        "SPEECHMATICS_API_KEY": "s",
        "ELEVENLABS_API_KEY": "e",
    }
    assert isinstance(make_stt(StageRoute("deepgram", "nova-3"), env=env), DeepgramSTT)
    assert isinstance(make_stt(StageRoute("assemblyai", "u"), env=env), AssemblyAISTT)
    assert isinstance(make_stt(StageRoute("speechmatics", "standard"), env=env), SpeechmaticsSTT)
    assert isinstance(make_stt(StageRoute("elevenlabs", "scribe"), env=env), ElevenLabsSTT)


def test_make_stt_refuses_a_key_for_another_host() -> None:
    env = {"DEEPGRAM_API_KEY": "d"}
    route = StageRoute("deepgram", "nova-3", base_url="wss://evil.example/v1/listen")
    with pytest.raises(ValueError, match=r"may only be sent to api\.deepgram\.com"):
        make_stt(route, env=env)
    with pytest.raises(ValueError, match="wss"):
        make_stt(
            StageRoute("deepgram", "nova-3", base_url="ws://api.deepgram.com/v1/listen"), env=env
        )


def test_make_stt_needs_the_key() -> None:
    from sotto_worker.adapters.factory import MissingCredentials

    with pytest.raises(MissingCredentials, match="ASSEMBLYAI_API_KEY"):
        make_stt(StageRoute("assemblyai", "u"), env={})


async def test_abnormal_close_becomes_stt_error_without_the_key() -> None:
    closed = WSClosedAbnormally(f"closed with code 1008 invalid key {KEY}")
    ws = FakeWS(initial=[closed], after_end=[], is_end=lambda m: False)
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(ws))
    with pytest.raises(STTError, match="deepgram: closed with code 1008") as err:
        await collect(adapter)
    assert KEY not in str(err.value)
    assert ws.closed


async def test_unreadable_vendor_message_becomes_stt_error() -> None:
    ws = FakeWS(initial=["not json"], after_end=[], is_end=lambda m: False)
    adapter = AssemblyAISTT(api_key=KEY, model="u", connect=connector(ws))
    with pytest.raises(STTError, match=r"assemblyai: unreadable message \(JSONDecodeError\)"):
        await collect(adapter)


async def test_empty_chunks_are_never_sent() -> None:
    ws = FakeWS(
        initial=[], after_end=[WSClosed], is_end=lambda m: m == json.dumps({"type": "CloseStream"})
    )
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(ws))

    async def with_gaps() -> AsyncIterator[bytes]:
        for chunk in (CHUNK, b"", CHUNK):
            yield chunk

    _ = [e async for e in adapter.transcribe(with_gaps(), OPTS)]
    assert ws.sent == [CHUNK, CHUNK, json.dumps({"type": "CloseStream"})]


async def test_assemblyai_splits_long_audio_and_pads_a_short_tail() -> None:
    ws = FakeWS(
        initial=[],
        after_end=[json.dumps({"type": "Termination"})],
        is_end=lambda m: m == json.dumps({"type": "Terminate"}),
    )
    adapter = AssemblyAISTT(api_key=KEY, model="u", connect=connector(ws))

    async def long_then_short() -> AsyncIterator[bytes]:
        yield b"\x01\x00" * 16000 * 2  # 2 s in one piece
        yield b"\x01\x00" * 160  # 10 ms tail

    _ = [e async for e in adapter.transcribe(long_then_short(), OPTS)]
    sizes = [len(m) for m in ws.sent if isinstance(m, bytes)]
    assert sizes == [32000, 32000, 1600]  # two 1000 ms messages, tail padded to 50 ms


# ---------------- finalize (T-007) ----------------

FINALIZE = {
    "deepgram": {"type": "Finalize"},
    "assemblyai": {"type": "ForceEndpoint"},
    "speechmatics": {"message": "ForceEndOfUtterance"},
}


def _vendor(name: str, ws: FakeWS) -> STTAdapter:
    classes = {
        "deepgram": DeepgramSTT,
        "assemblyai": AssemblyAISTT,
        "speechmatics": SpeechmaticsSTT,
        "elevenlabs": ElevenLabsSTT,
    }
    adapter: STTAdapter = classes[name](api_key=KEY, model="m", connect=connector(ws))
    return adapter


@pytest.mark.parametrize("vendor", ["deepgram", "assemblyai", "speechmatics", "elevenlabs"])
async def test_finalize_sends_the_vendor_force_message_mid_stream(vendor: str) -> None:
    started = json.dumps({"message": "RecognitionStarted"})
    initial: list[str | type[WSClosed] | Exception] = (
        [started] if vendor == "speechmatics" else [el("session_started")]
    )
    ws = FakeWS(initial=initial, after_end=[WSClosed], is_end=lambda m: False)
    adapter = _vendor(vendor, ws)

    async def stream() -> AsyncIterator[bytes]:
        yield CHUNK * 3  # 60 ms: above AssemblyAI's 50 ms minimum, so it is sent at once
        assert await adapter.finalize() is True
        yield CHUNK * 3

    [e async for e in adapter.transcribe(stream(), OPTS)]
    texts = [json.loads(m) for m in ws.sent if isinstance(m, str)]
    if vendor == "elevenlabs":
        force = [m for m in texts if m["commit"] is True and m["audio_base_64"] == ""]
        assert force, texts
        # the forced commit sits between the two audio chunks, not at the end
        assert texts.index(force[0]) == 1
    else:
        sent = ws.sent
        index = sent.index(json.dumps(FINALIZE[vendor]))
        audio_before = [m for m in sent[:index] if isinstance(m, bytes)]
        assert len(audio_before) >= 1
        assert any(isinstance(m, bytes) for m in sent[index:])
        if vendor == "speechmatics":
            assert all(not isinstance(m, str) or "Force" not in m for m in sent[:index])


async def test_finalize_without_an_open_stream_is_a_no_op() -> None:
    adapter = DeepgramSTT(api_key=KEY, model="nova-3", connect=connector(FakeWS([], [], _text)))
    assert await adapter.finalize() is False
