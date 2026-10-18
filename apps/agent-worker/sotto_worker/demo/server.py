"""Dev-only demo bridge (D-013). One localhost port serves the exported web app over HTTP and the
demo protocol (packages/shared/src/demo.ts) over WebSocket. The customer side is typed or
scripted instead of telephony + STT; everything after the transcript is the real pipeline.

Never deploy this: it binds to 127.0.0.1 and refuses WebSocket origins other than localhost.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import mimetypes
import uuid
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response
from websockets.typing import Origin

from sotto_worker.clock import RealClock
from sotto_worker.contracts import Speaker, TranscriptEvent
from sotto_worker.pipeline.session import CallSession, Escalation
from sotto_worker.protocol import CardMessage
from sotto_worker.protocol.demo import DemoClientMessage
from sotto_worker.runtime import DEMO, Runtime
from sotto_worker.scenarios import Scenario, load_all
from sotto_worker.telemetry import CardTimingRecord, summarise

LOCAL_DEV_PORTS = (8081, 19006)  # Expo dev server ports, for `expo start --web` against the bridge


class _Call:
    def __init__(self, server: DemoServer, ws: ServerConnection, runtime: Runtime) -> None:
        self.call_id = str(uuid.uuid4())
        self._server = server
        self._ws = ws
        self._clock = RealClock()
        self._started_ms = self._clock.now_ms()
        self._lock = asyncio.Lock()
        self.timings: list[CardTimingRecord] = []
        self.playback: asyncio.Task[None] | None = None
        self.session = CallSession(
            call_id=self.call_id,
            company=runtime.company,
            router=runtime.router,
            prompts=runtime.prompts,
            playbook=runtime.playbook,
            clock=self._clock,
            on_card=self._card,
            on_escalation=self._escalation,
            on_timing=self._timing,
        )

    def _at(self) -> int:
        return self._clock.now_ms() - self._started_ms

    async def send(self, message: dict[str, Any]) -> None:
        async with self._lock:
            await self._ws.send(json.dumps(message, ensure_ascii=False))

    async def _card(self, card: CardMessage) -> None:
        await self.send({"type": "card", "card": json.loads(card.to_wire())})

    async def _escalation(self, escalation: Escalation) -> None:
        await self.send({"type": "escalation", "question": escalation.question})

    def _timing(self, record: CardTimingRecord) -> None:
        self.timings.append(record)
        self._server.log(
            f"card {record.source:<8} {record.turn_kind:<9} "
            f"first word {record.first_delta_ms:>5} ms"
            + (f"  ({record.fallback_reason})" if record.fallback_reason else "")
        )

    async def say(self, speaker: Speaker, text: str, duration_ms: int = 1500) -> None:
        now = self._clock.now_ms()
        at = self._at()
        await self.send({"type": "transcript", "speaker": speaker, "text": text, "at_ms": at})
        event = TranscriptEvent(
            speaker=speaker, text=text, final=True, start_ms=max(now - duration_ms, 0), end_ms=now
        )
        turn_id = await self.session.on_transcript(event, t0_ms=now)
        if speaker == "customer":
            # Sent before the turn's cards: the turn task only runs once this coroutine yields,
            # and the send lock orders the frames.
            await self.send({"type": "turn_end", "at_ms": at, "turn_id": turn_id})

    async def play(self, scenario: Scenario, speed: float) -> None:
        for line in scenario.lines:
            await self._clock.sleep((line.gap_ms + line.duration_ms) * speed)
            await self.say(line.speaker, line.text, line.duration_ms)

    async def end(self) -> None:
        if self.playback is not None:
            self.playback.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.playback
        await self.session.close()
        if self.timings:
            s = summarise(self.timings)
            self._server.log(
                f"call ended: {s.cards} cards, first word p50 {s.p50_ms} ms, p95 {s.p95_ms} ms"
            )
        with contextlib.suppress(ConnectionClosed):
            await self.send({"type": "call_ended", "call_id": self.call_id})


class DemoServer:
    def __init__(
        self,
        *,
        runtime_factory: Callable[[], Runtime],
        static_dir: Path | None,
        speed: float = 1.0,
        log: Callable[[str], None] = lambda _line: None,
    ) -> None:
        self._runtime_factory = runtime_factory
        self._static_dir = static_dir.resolve() if static_dir else None
        self._speed = speed
        self.log = log
        self._scenarios = {s.id: s for s in load_all(DEMO / "calls")}
        self._server: Server | None = None

    async def start(self, host: str, port: int) -> int:
        self._server = await serve(
            self._handle,
            host,
            port,
            process_request=self._http,
            origins=None,  # checked in _http so a fixed port is not required here
        )
        bound: int = self._server.sockets[0].getsockname()[1]
        self._port = bound
        return bound

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()

    def _allowed_origins(self) -> set[Origin]:
        ports = (self._port, *LOCAL_DEV_PORTS)
        return {Origin(f"http://{h}:{p}") for h in ("localhost", "127.0.0.1") for p in ports}

    def _http(self, connection: ServerConnection, request: Request) -> Response | None:
        if request.headers.get("Upgrade", "").lower() == "websocket":
            origin = request.headers.get("Origin")
            if origin is not None and Origin(origin) not in self._allowed_origins():
                return connection.respond(HTTPStatus.FORBIDDEN, "origin not allowed\n")
            return None
        return self._static(connection, request.path)

    def _static(self, connection: ServerConnection, raw_path: str) -> Response:
        if self._static_dir is None or not (self._static_dir / "index.html").exists():
            return connection.respond(
                HTTPStatus.NOT_FOUND, "Web app not built yet. Run `pnpm demo` from the repo root.\n"
            )
        path = raw_path.split("?", 1)[0].split("#", 1)[0]
        if "%" in path or ".." in path:
            return connection.respond(HTTPStatus.NOT_FOUND, "not found\n")
        target = (self._static_dir / path.lstrip("/")).resolve()
        if not target.is_relative_to(self._static_dir):
            return connection.respond(HTTPStatus.NOT_FOUND, "not found\n")
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            if Path(path).suffix:  # a missing asset is a real 404
                return connection.respond(HTTPStatus.NOT_FOUND, "not found\n")
            target = self._static_dir / "index.html"  # client-side route
        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        headers = Headers(
            [
                ("Content-Type", content_type),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
            ]
        )
        return Response(200, "OK", headers, body)

    async def _handle(self, ws: ServerConnection) -> None:
        runtime = self._runtime_factory()
        call: _Call | None = None
        await ws.send(
            json.dumps(
                {
                    "type": "hello",
                    "v": 1,
                    "company_name": runtime.company.name,
                    "mode": runtime.mode,
                    "scenarios": [{"id": s.id, "title": s.title} for s in self._scenarios.values()],
                },
                ensure_ascii=False,
            )
        )

        async def begin() -> _Call:
            new = _Call(self, ws, runtime)
            await new.send({"type": "call_started", "call_id": new.call_id})
            await new.session.warm()
            self.log(f"call started ({runtime.mode} models)")
            return new

        try:
            async for raw in ws:
                try:
                    msg = DemoClientMessage.model_validate_json(raw).root
                except ValidationError as err:
                    await ws.send(
                        json.dumps(
                            {
                                "type": "error",
                                "message": f"invalid message: {err.error_count()} error(s)",
                            }
                        )
                    )
                    continue
                if msg.type == "start":
                    if call is not None:
                        await call.end()
                    call = await begin()
                    scenario_id = msg.scenario_id.root if msg.scenario_id else None
                    if scenario_id:
                        scenario = self._scenarios.get(scenario_id)
                        if scenario is None:
                            await call.send(
                                {"type": "error", "message": f"unknown scenario {scenario_id}"}
                            )
                        else:
                            call.playback = asyncio.create_task(call.play(scenario, self._speed))
                elif msg.type == "say":
                    if call is None:
                        call = await begin()
                    await call.say(msg.speaker, msg.text)
                elif msg.type == "end" and call is not None:
                    await call.end()
                    call = None
        except ConnectionClosed:
            pass
        finally:
            if call is not None:
                await call.end()
