"""End-to-end over a real localhost socket: the demo bridge (D-013)."""

from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus
from websockets.typing import Origin

from sotto_worker.adapters.llm.fake import FakeLLM
from sotto_worker.clock import RealClock
from sotto_worker.demo.server import DemoServer
from sotto_worker.protocol.demo import DemoServerMessage
from sotto_worker.router import ModelRouter, RoutingConfig, StageRoute
from sotto_worker.runtime import Runtime, build_demo_runtime


def _fast_runtime() -> Runtime:
    clock = RealClock()
    base = build_demo_runtime(clock, {}, force_fake=True)
    config = RoutingConfig(
        stages={"suggest": StageRoute(provider="fake", model="f", first_token_ms=700)}
    )
    llm = FakeLLM(clock=clock, text="NO_SAFE_ANSWER", first_token_ms=5, chunk_ms=1)
    return Runtime(
        company=base.company, playbook=base.playbook, prompts=base.prompts,
        router=ModelRouter(config, lambda _route: llm, clock), mode="fake",
    )  # fmt: skip


@pytest.fixture
async def server(tmp_path: Path) -> AsyncIterator[tuple[DemoServer, int, Path]]:
    (tmp_path / "index.html").write_text("<!doctype html><title>Sotto</title>")
    (tmp_path / "_expo").mkdir()
    (tmp_path / "_expo" / "app.js").write_text("console.log(1)")
    srv = DemoServer(runtime_factory=_fast_runtime, static_dir=tmp_path, speed=0.0)
    port = await srv.start("127.0.0.1", 0)
    yield srv, port, tmp_path
    await srv.stop()


async def _collect(ws: Any, until: int) -> list[dict[str, Any]]:
    """Receive until `until` closed cards (done=true) arrived."""
    got: list[dict[str, Any]] = []
    done_cards = 0

    async def loop() -> None:
        nonlocal done_cards
        async for raw in ws:
            msg = json.loads(raw)
            DemoServerMessage.model_validate(msg)  # every message obeys the shared protocol
            got.append(msg)
            if msg["type"] == "card" and msg["card"]["done"]:
                done_cards += 1
                if done_cards >= until:
                    return

    await asyncio.wait_for(loop(), 10.0)
    return got


async def test_hello_then_typed_question_gets_a_playbook_card(
    server: tuple[DemoServer, int, Path],
) -> None:
    _, port, _ = server
    async with connect(f"ws://127.0.0.1:{port}/ws") as ws:
        hello = json.loads(await ws.recv())
        assert hello["type"] == "hello"
        assert hello["mode"] == "fake"
        assert {s["id"] for s in hello["scenarios"]} >= {"price-objection", "hard-questions"}
        await ws.send(
            json.dumps({"type": "say", "speaker": "customer", "text": "What's the payment plan?"})
        )
        msgs = await _collect(ws, until=1)
    types = [m["type"] for m in msgs]
    assert types[:3] == ["call_started", "transcript", "turn_end"]
    cards = [m["card"] for m in msgs if m["type"] == "card"]
    assert cards[0]["source"] == "playbook"
    assert cards[0]["delta"].startswith("Ten percent on booking")


async def test_scenario_playback_never_carries_agent_cards(
    server: tuple[DemoServer, int, Path],
) -> None:
    _, port, _ = server
    async with connect(f"ws://127.0.0.1:{port}/ws") as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "start", "scenario_id": "price-objection"}))
        msgs = await _collect(ws, until=4)
        while not any(m["type"] == "escalation" for m in msgs):  # follows its holding card
            msgs.append(json.loads(await asyncio.wait_for(ws.recv(), 5)))
    sources = [m["card"]["source"] for m in msgs if m["type"] == "card" and m["card"]["seq"] == 0]
    assert sorted(sources) == [
        "holding",
        "playbook",
        "playbook",
        "playbook",
    ]  # zero gaps: any order
    assert any(m["type"] == "escalation" for m in msgs)


async def test_invalid_client_message_gets_an_error_not_a_crash(
    server: tuple[DemoServer, int, Path],
) -> None:
    _, port, _ = server
    async with connect(f"ws://127.0.0.1:{port}/ws") as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "say", "speaker": "manager", "text": "hi"}))
        err = json.loads(await ws.recv())
        assert err["type"] == "error"
        await ws.send(json.dumps({"type": "end"}))


async def test_foreign_origin_is_refused(server: tuple[DemoServer, int, Path]) -> None:
    _, port, _ = server
    with pytest.raises(InvalidStatus):
        async with connect(f"ws://127.0.0.1:{port}/ws", origin=Origin("https://evil.example")):
            pass


def _get(url: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:  # noqa: S310 - localhost test server
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as err:
        return err.code, ""


async def test_serves_the_web_app_with_spa_fallback_and_no_traversal(
    server: tuple[DemoServer, int, Path],
) -> None:
    _, port, _ = server
    base = f"http://127.0.0.1:{port}"
    assert await asyncio.to_thread(_get, f"{base}/") == (200, "<!doctype html><title>Sotto</title>")
    assert (await asyncio.to_thread(_get, f"{base}/_expo/app.js"))[1] == "console.log(1)"
    assert (await asyncio.to_thread(_get, f"{base}/call"))[0] == 200  # client-side route
    assert (await asyncio.to_thread(_get, f"{base}/..%2f..%2fetc/passwd"))[0] == 404
    assert (await asyncio.to_thread(_get, f"{base}/missing.js"))[0] == 404
