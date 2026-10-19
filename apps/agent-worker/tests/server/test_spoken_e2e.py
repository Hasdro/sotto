"""Spoken call end to end over a real socket (D-020): `pnpm spoken:live` against a hosted-mode
server running in-process, with a scripted STT vendor instead of the network."""

from __future__ import annotations

import asyncio
import dataclasses
import math
import struct
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import uvicorn

import replay.spoken_live as spoken
from sotto_worker.contracts import STTOptions, TranscriptEvent
from sotto_worker.router import RoutingConfig, StageRoute
from sotto_worker.runtime import SEED, Runtime
from sotto_worker.server import audio as audio_module
from sotto_worker.server.app import ServerConfig, create_app
from sotto_worker.server.auth import AccessGate
from sotto_worker.server.catalog import Catalog
from sotto_worker.server.store import Store
from sotto_worker.server.vault import Vault
from tests.server.conftest import CODE, SECRET, fast_runtime


class ForcedFinals:
    """Answers every finalize() with one final, like a vendor's Finalize/ForceEndpoint."""

    provider = "deepgram"
    model = "scripted"

    def __init__(self) -> None:
        self._forced: asyncio.Queue[None] = asyncio.Queue()

    async def transcribe(
        self, audio: AsyncIterator[bytes], opts: STTOptions
    ) -> AsyncIterator[TranscriptEvent]:
        async def drain() -> None:
            async for _ in audio:
                pass

        reader = asyncio.ensure_future(drain())
        try:
            while not reader.done():
                waiter = asyncio.ensure_future(self._forced.get())
                done, _ = await asyncio.wait({waiter, reader}, return_when=asyncio.FIRST_COMPLETED)
                if waiter not in done:
                    waiter.cancel()
                    return
                yield TranscriptEvent(opts.speaker, "What is the payment plan?", True, 0, 100)
        finally:
            reader.cancel()

    async def finalize(self) -> bool:
        self._forced.put_nowait(None)
        return True


def spoken_clip(_phrase: str, _directory: Path, _index: int) -> bytes:
    tone = b"".join(
        struct.pack("<h", int(4000 * math.sin(2 * math.pi * 220 * i / 16000))) for i in range(8000)
    )
    return tone  # 0.5 s of "speech"


async def test_spoken_live_against_a_hosted_server(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(audio_module, "make_stt", lambda route, env: ForcedFinals())
    monkeypatch.setattr(spoken, "synthesize", spoken_clip)
    monkeypatch.setattr(spoken, "PHRASES", ("What is the payment plan?", "And the payment plan?"))
    monkeypatch.setattr(spoken, "SILENCE_S", 0.8)

    def runtime() -> Runtime:
        return dataclasses.replace(
            fast_runtime(), stt_routes=(StageRoute("deepgram", "nova-3"),), env={}
        )

    (tmp_path / "dist").mkdir()
    config = ServerConfig(static_dir=tmp_path / "dist", access_code=CODE, public_origin=None)
    store = Store(tmp_path / "s.db", Vault(SECRET))
    app = create_app(
        config,
        gate=AccessGate(CODE, SECRET),
        store=store,
        catalog=Catalog.load(SEED / "models" / "providers.yaml"),
        seed=RoutingConfig.load(SEED / "models" / "default.yaml"),
        env={},
        runtime_factory=runtime,
    )
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error"))
    serving = asyncio.create_task(server.serve())
    try:
        for _ in range(500):  # up to 5 s for uvicorn to bind
            if server.started:
                break
            await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        config.public_origin = url  # hosted mode: only this origin may open sockets
        with pytest.raises(OSError, match="401"):
            await asyncio.to_thread(spoken.sign_in, url, "wrong-code")
        turns = await spoken.run(url, CODE)
    finally:
        server.should_exit = True
        await serving
        store.close()
    assert [t.heard for t in turns] == ["What is the payment plan?"] * 2
    assert all(t.source == "playbook" for t in turns)
    assert spoken.ok(turns)
    calls = Store(tmp_path / "s.db", Vault(SECRET))
    try:
        [call] = calls.calls()
        assert call["title"] == "Spoken call"
        assert call["cards"] == 2
    finally:
        calls.close()


def test_sign_in_refuses_a_non_http_url() -> None:
    with pytest.raises(ValueError, match="http"):
        spoken.sign_in("file:///etc/passwd", "code")
