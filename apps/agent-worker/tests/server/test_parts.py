"""Server parts (D-020, P6.7): vault, store, catalogue, key test, end-of-turn VAD, spoken track."""

from __future__ import annotations

import asyncio
import dataclasses
import json
import math
import struct
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from sotto_worker.adapters.stt.base import STTError
from sotto_worker.clock import RealClock
from sotto_worker.contracts import STTOptions, TranscriptEvent
from sotto_worker.router import RoutingConfig, StageRoute
from sotto_worker.runtime import SEED
from sotto_worker.server.__main__ import hosted_problems, local_secret
from sotto_worker.server.audio import FRAME_MS, CustomerAudio, EndOfTurnVAD
from sotto_worker.server.auth import AccessGate
from sotto_worker.server.catalog import Catalog, apply_overrides
from sotto_worker.server.keytest import check_key
from sotto_worker.server.store import Store
from sotto_worker.server.vault import Vault, VaultError

CATALOG = Catalog.load(SEED / "models" / "providers.yaml")
SEED_ROUTING = RoutingConfig.load(SEED / "models" / "default.yaml")


# --- vault + store -------------------------------------------------------------------------


def test_vault_round_trip_and_binding() -> None:
    vault = Vault("k" * 40)
    blob = vault.encrypt("GROQ_API_KEY", "secret-1")
    assert b"secret-1" not in blob
    assert vault.decrypt("GROQ_API_KEY", blob) == "secret-1"
    assert vault.encrypt("GROQ_API_KEY", "secret-1") != blob  # fresh nonce each time
    with pytest.raises(VaultError):
        vault.decrypt("OPENAI_API_KEY", blob)  # cannot be moved to another vendor's slot
    with pytest.raises(VaultError):
        Vault("z" * 40).decrypt("GROQ_API_KEY", blob)
    with pytest.raises(ValueError, match="at least"):
        Vault("short")


def test_store_keeps_keys_encrypted_on_disk(tmp_path: Path) -> None:
    store = Store(tmp_path / "s.db", Vault("k" * 40))
    store.set_key("GROQ_API_KEY", "gsk_plaintext_never_on_disk")
    store.close()
    for f in tmp_path.iterdir():
        assert b"gsk_plaintext_never_on_disk" not in f.read_bytes()
    again = Store(tmp_path / "s.db", Vault("k" * 40))
    assert again.env_overlay({"X": "1"}) == {
        "X": "1",
        "GROQ_API_KEY": "gsk_plaintext_never_on_disk",
    }
    wrong = Store(tmp_path / "s.db", Vault("w" * 40))
    assert "GROQ_API_KEY" not in wrong.env_overlay({})  # unreadable: behaves as not set
    again.close()
    wrong.close()


def test_store_test_results_reset_when_the_key_changes(tmp_path: Path) -> None:
    store = Store(tmp_path / "s.db", Vault("k" * 40))
    store.set_key("GROQ_API_KEY", "a" * 20)
    store.record_test("GROQ_API_KEY", True, "ok", ["m1"])
    assert store.key_statuses()["GROQ_API_KEY"].models == ("m1",)
    store.set_key("GROQ_API_KEY", "b" * 20)
    status = store.key_statuses()["GROQ_API_KEY"]
    assert (status.test_ok, status.models) == (None, ())
    store.close()


# --- catalogue -----------------------------------------------------------------------------


def test_panel_choice_keeps_stage_limits_and_uses_the_vendor_template() -> None:
    config = apply_overrides(SEED_ROUTING, CATALOG, {"suggest": ("gemini", "gemini-x")})
    route = config.stages["suggest"]
    assert route.provider == "openai_compatible"
    assert route.api_key_env == "GEMINI_API_KEY"
    assert route.base_url == "https://generativelanguage.googleapis.com/v1beta/openai/"
    assert route.first_token_ms == SEED_ROUTING.stages["suggest"].first_token_ms
    assert route.settings["reasoning_effort"] == "none"
    assert route.settings["max_tokens"] == SEED_ROUTING.stages["suggest"].settings["max_tokens"]


@pytest.mark.parametrize(
    ("stage", "provider", "model"),
    [("suggest", "deepgram", "m"), ("stt", "groq", "m"), ("turn", "groq", "m"),
     ("suggest", "nope", "m"), ("suggest", "groq", "two words"), ("suggest", "groq", "")],
)  # fmt: skip
def test_panel_choice_is_validated(stage: str, provider: str, model: str) -> None:
    with pytest.raises(ValueError, match=r"stage|provider|cannot serve|model"):
        CATALOG.route_for(stage, provider, model, None)


def test_every_seed_route_maps_back_to_a_catalogue_vendor() -> None:
    for stage in CATALOG.stages:
        assert CATALOG.provider_for_route(SEED_ROUTING.stages[stage]) is not None, stage


# --- key test ------------------------------------------------------------------------------


def _client(status: int, body: object, seen: list[httpx.Request]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, json=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_llm_key_test_lists_models_from_the_vendor_host_only() -> None:
    seen: list[httpx.Request] = []
    body = {"data": [{"id": "models/gemini-a"}, {"id": "gemini-b"}]}
    result = await check_key(
        CATALOG.providers["gemini"], "key-123456", client=_client(200, body, seen)
    )
    assert result.ok
    assert result.models == ("gemini-a", "gemini-b")
    assert seen[0].url.host == "generativelanguage.googleapis.com"
    assert seen[0].headers["authorization"] == "Bearer key-123456"


async def test_llm_key_test_reports_a_rejected_key_without_echoing_it() -> None:
    result = await check_key(
        CATALOG.providers["anthropic"], "sk-ant-secret", client=_client(401, {}, [])
    )
    assert not result.ok
    assert "rejected" in result.detail
    assert "sk-ant-secret" not in result.detail


# --- access gate ---------------------------------------------------------------------------


def test_session_tokens_expire_and_cannot_be_forged() -> None:
    gate = AccessGate("code-1234", "s" * 40)
    token = gate.issue(now=1000)
    assert gate.valid(token, now=1001)
    assert not gate.valid(token, now=1000 + 13 * 3600)
    assert not gate.valid(token.replace("v1.", "v1.9"), now=1001)
    assert not AccessGate("code-1234", "t" * 40).valid(token, now=1001)
    assert AccessGate(None, "s" * 40).valid(None)


def test_hosted_mode_refuses_to_start_without_its_secrets(tmp_path: Path) -> None:
    assert hosted_problems("127.0.0.1", {}) == []
    assert len(hosted_problems("0.0.0.0", {})) == 3  # noqa: S104 - the case under test
    good = {
        "SOTTO_ACCESS_CODE": "longenough",
        "SOTTO_SECRET_KEY": "x" * 40,
        "SOTTO_PUBLIC_ORIGIN": "https://a.example",
    }
    assert hosted_problems("0.0.0.0", good) == []  # noqa: S104
    first = local_secret(tmp_path)
    assert local_secret(tmp_path) == first
    assert (tmp_path / "secret.key").stat().st_mode & 0o077 == 0


# --- end of turn + spoken track ------------------------------------------------------------


def tone(ms: int, amplitude: int = 4000) -> bytes:
    n = 16 * ms
    return b"".join(
        struct.pack("<h", int(amplitude * math.sin(2 * math.pi * 220 * i / 16000)))
        for i in range(n)
    )


def silence(ms: int) -> bytes:
    return b"\x00\x00" * 16 * ms


def frames(pcm: bytes) -> list[bytes]:
    size = 32 * FRAME_MS
    return [pcm[i : i + size] for i in range(0, len(pcm), size)]


def test_vad_marks_speech_start_and_end_of_turn() -> None:
    vad = EndOfTurnVAD()
    changes = [vad.feed(f) for f in frames(silence(200) + tone(600) + silence(400))]
    assert changes.count("start") == 1
    assert changes.count("end") == 1
    end_at = changes.index("end") * FRAME_MS
    assert 800 + 280 <= end_at <= 800 + 320  # 300 ms of quiet after the last word


def test_vad_ignores_clicks_shorter_than_speech() -> None:
    vad = EndOfTurnVAD()
    assert [c for c in (vad.feed(f) for f in frames(tone(60) + silence(500))) if c] == []


class ScriptedSTT:
    """Emits a final for whatever it heard when forced (or at the end), like a vendor."""

    provider = "scripted"
    model = "m"

    def __init__(self, text: str = "what is the price?", fail: bool = False) -> None:
        self._text = text
        self._fail = fail
        self.finalized = 0
        self._forced = asyncio.Event()

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        if self._fail:
            raise STTError("scripted: closed with code 4001")
        yield TranscriptEvent(opts.speaker, "what is", False, 0, 0)
        reader = asyncio.ensure_future(self._drain(audio))
        await self._forced.wait()
        yield TranscriptEvent(opts.speaker, self._text, True, 0, 100)  # stream ms
        await reader

    async def _drain(self, audio: AsyncIterator[bytes]) -> None:
        async for _ in audio:
            pass

    async def finalize(self) -> bool:
        self.finalized += 1
        self._forced.set()
        return True


async def _speak(audio: CustomerAudio, pcm: bytes) -> None:
    for f in frames(pcm):
        audio.push(f)
        await asyncio.sleep(FRAME_MS / 1000)


async def test_spoken_turn_is_forced_final_with_t0_at_end_of_speech() -> None:
    clock = RealClock()
    turns: list[tuple[TranscriptEvent, int, int]] = []
    partials: list[str] = []
    stt = ScriptedSTT()

    async def on_turn(event: TranscriptEvent, t0: int) -> None:
        turns.append((event, t0, clock.now_ms()))

    async def on_partial(text: str) -> None:
        partials.append(text)

    async def on_notice(_m: str) -> None:
        pass

    audio = CustomerAudio(
        routes=[StageRoute("scripted", "m")], clock=clock, on_turn=on_turn,
        on_partial=on_partial, on_notice=on_notice, make=lambda _r: stt,
    )  # fmt: skip
    audio.start()
    await _speak(audio, silence(100) + tone(500) + silence(500))
    await asyncio.sleep(0.05)
    await audio.stop()
    assert stt.finalized == 1
    assert partials == ["what is"]
    [(event, t0, delivered)] = turns
    assert event.text == "what is the price?"
    assert event.speaker == "customer"
    assert event.end_ms == t0
    assert 250 <= delivered - t0 <= 600  # 300 ms end-of-turn wait + scheduling, not vendor VAD


async def test_backup_vendor_takes_over_when_the_primary_fails() -> None:
    clock = RealClock()
    notices: list[str] = []
    turns: list[str] = []
    made: list[str] = []
    backup = ScriptedSTT("backup heard it.")

    def make(route: StageRoute) -> ScriptedSTT:
        made.append(route.provider)
        return ScriptedSTT(fail=True) if route.provider == "primary" else backup

    async def on_turn(event: TranscriptEvent, _t0: int) -> None:
        turns.append(event.text)

    async def on_partial(_t: str) -> None:
        pass

    async def on_notice(message: str) -> None:
        notices.append(message)

    audio = CustomerAudio(
        routes=[StageRoute("primary", "m"), StageRoute("backup", "m")], clock=clock,
        on_turn=on_turn, on_partial=on_partial, on_notice=on_notice, make=make,
    )  # fmt: skip
    audio.start()
    await _speak(audio, tone(400) + silence(400))
    await asyncio.sleep(0.05)
    await audio.stop()
    assert made == ["primary", "backup"]
    assert "switching to the backup" in notices[0]
    assert turns == ["backup heard it."]


# --- key test: speech vendors and edge cases ----------------------------------------------


class _OneShotSTT:
    provider = "deepgram"
    model = "m"

    def __init__(self, fail: bool) -> None:
        self._fail = fail

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        async for _ in audio:
            if self._fail:
                raise STTError("deepgram: closed with code 4001 bad key k-123456789")
        nothing: tuple[TranscriptEvent, ...] = ()  # an async generator that yields nothing
        for event in nothing:
            yield event

    async def finalize(self) -> bool:
        return False


@pytest.mark.parametrize("fail", [False, True])
async def test_stt_key_test_opens_a_session(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    import sotto_worker.server.keytest as keytest

    monkeypatch.setattr(keytest, "make_stt", lambda route, env: _OneShotSTT(fail))
    monkeypatch.setattr(keytest, "_silence", lambda: _frames(3))
    result = await check_key(CATALOG.providers["deepgram"], "k-123456789")
    assert result.ok is not fail
    assert "k-123456789" not in result.detail


async def _frames(n: int) -> AsyncIterator[bytes]:
    for _ in range(n):
        yield b"\x00\x00" * 320


async def test_llm_key_test_handles_odd_answers() -> None:
    seen: list[httpx.Request] = []
    groq = CATALOG.providers["groq"]
    assert not (await check_key(groq, "k", client=_client(500, {}, seen))).ok
    weird = await check_key(groq, "k", client=_client(200, {"data": ["x", {"id": "m1"}]}, seen))
    assert weird.models == ("m1",)
    no_url = dataclasses.replace(CATALOG.providers["groq"], route={"provider": "x"}, test_url=None)
    assert "no models endpoint" in (await check_key(no_url, "k")).detail
    moved = dataclasses.replace(
        groq, route={**groq.route, "base_url": "https://evil.example/v1"}, test_url=None
    )
    assert not (await check_key(moved, "k", client=_client(200, {}, seen))).ok  # D-016
    assert all(r.url.host == "api.groq.com" for r in seen)


# --- server start-up ----------------------------------------------------------------------


def test_build_wires_a_local_server(tmp_path: Path, static_dir: Path) -> None:
    from starlette.testclient import TestClient

    from sotto_worker.server.__main__ import build, parser

    args = parser().parse_args(["--fake", "--static", str(static_dir)])
    config, app = build(args, {"SOTTO_DATA_DIR": str(tmp_path / "data")})
    assert config.access_code is None
    assert (tmp_path / "data" / "secret.key").exists()
    with TestClient(app) as client:
        assert client.get("/api/me").json() == {"auth_required": False, "signed_in": True}
        with client.websocket_connect("/ws") as ws:
            assert json.loads(ws.receive_text())["mode"] == "fake"


def test_main_refuses_hosted_mode_without_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    from sotto_worker.server.__main__ import main

    for name in ("SOTTO_ACCESS_CODE", "SOTTO_SECRET_KEY", "SOTTO_PUBLIC_ORIGIN"):
        monkeypatch.delenv(name, raising=False)
    assert main(["--host", "0.0.0.0"]) == 2  # noqa: S104 - the case under test


async def test_unfinished_sentence_waits_for_its_tail_and_late_tails_never_join_the_next_turn() -> (
    None
):
    """Deepgram answers Finalize with the sentence split in two finals; the tail must stay with
    its own turn, and a tail that arrives after the turn went out is dropped, not prepended."""
    clock = RealClock()
    turns: list[str] = []

    class SplitFinals(ScriptedSTT):
        def __init__(self) -> None:
            super().__init__()
            self.forced_n = 0

        async def transcribe(
            self, audio: AsyncIterator[bytes], opts: STTOptions
        ) -> AsyncIterator[TranscriptEvent]:
            reader = asyncio.ensure_future(self._drain(audio))
            await self._forced.wait()
            yield TranscriptEvent(opts.speaker, "is parking included with the", True, 0, 600)
            await asyncio.sleep(0.2)  # the tail comes 200 ms later: past SETTLE, inside TAIL
            yield TranscriptEvent(opts.speaker, "apartment?", True, 600, 700)
            await asyncio.sleep(0.8)  # a stray late tail of the same audio after the turn went
            yield TranscriptEvent(opts.speaker, "apartment", True, 650, 1100)  # end has silence
            await reader

    async def on_turn(event: TranscriptEvent, _t0: int) -> None:
        turns.append(event.text)

    async def nothing(_t: str) -> None:
        pass

    audio = CustomerAudio(
        routes=[StageRoute("scripted", "m")], clock=clock, on_turn=on_turn,
        on_partial=nothing, on_notice=nothing, make=lambda _r: SplitFinals(),
    )  # fmt: skip
    audio.start()
    await _speak(audio, tone(700) + silence(1800))
    await asyncio.sleep(0.05)
    await audio.stop()
    assert turns == ["is parking included with the apartment?"]


async def test_a_live_call_rewarms_its_model_connections(monkeypatch: pytest.MonkeyPatch) -> None:
    from sotto_worker.server import calls as calls_module
    from tests.server.conftest import fast_runtime

    monkeypatch.setattr(calls_module, "KEEP_WARM_EVERY_S", 0.01)
    sent: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    call = calls_module.Call(
        runtime=fast_runtime(), send=send, store=None, title="t", log=lambda _s: None
    )
    warmed = 0

    async def warm() -> None:
        nonlocal warmed
        warmed += 1

    monkeypatch.setattr(call.session, "warm", warm)
    await call.begin()
    await asyncio.sleep(0.08)
    await call.end()
    assert warmed >= 3  # the start-up warm plus repeats
    assert call.keep_warm is not None
    assert call.keep_warm.done()
