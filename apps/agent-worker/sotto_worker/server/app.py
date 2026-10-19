"""The Sotto server (D-020): serves the web app, runs calls over `/ws` (demo protocol: typed,
scripted or spoken customer), and the admin API for the Keys & providers panel (P6.7).

Local mode (`pnpm demo`): bound to localhost, no access code. Hosted mode (`deploy/`): an access
code is required, cookies are Secure, and only the public origin may open sockets or change state.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import mimetypes
from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass, field
from http import HTTPStatus
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

from sotto_worker.protocol.demo import DemoClientMessage
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import DEMO, Runtime
from sotto_worker.scenarios import Scenario, load_all
from sotto_worker.server.auth import COOKIE, SESSION_TTL_S, AccessGate
from sotto_worker.server.calls import Call
from sotto_worker.server.catalog import Catalog
from sotto_worker.server.keytest import check_key
from sotto_worker.server.store import Store

LOCAL_DEV_PORTS = (8081, 19006)  # Expo dev server, for `expo start --web` against this server
MAX_BODY = 8 * 1024
MAX_AUDIO_FRAME = 64 * 1024


@dataclass
class ServerConfig:
    static_dir: Path | None
    access_code: str | None = None
    public_origin: str | None = None  # e.g. https://sotto.example.com (hosted mode)
    port: int = 8787
    speed: float = 1.0
    log: Callable[[str], None] = field(default=lambda _line: None)

    @property
    def secure_cookies(self) -> bool:
        return bool(self.public_origin and self.public_origin.startswith("https://"))

    def allowed_origins(self) -> set[str]:
        if self.public_origin:
            return {self.public_origin.rstrip("/")}
        ports = (self.port, *LOCAL_DEV_PORTS)
        return {f"http://{h}:{p}" for h in ("localhost", "127.0.0.1") for p in ports}


RuntimeFactory = Callable[[], Runtime]


def create_app(
    config: ServerConfig,
    *,
    gate: AccessGate,
    store: Store,
    catalog: Catalog,
    seed: RoutingConfig,
    env: Mapping[str, str],
    runtime_factory: RuntimeFactory,
) -> Starlette:
    """`seed` is the default routing; `env` the process environment (server-level keys);
    `runtime_factory` builds a fresh runtime per call from seed + panel keys and choices."""
    scenarios: dict[str, Scenario] = {s.id: s for s in load_all(DEMO / "calls")}
    static_root = config.static_dir.resolve() if config.static_dir else None

    def origin_ok(origin: str | None) -> bool:
        # Non-browser clients send no Origin; browsers always do on cross-site requests.
        return origin is None or origin.rstrip("/") in config.allowed_origins()

    def signed_in(request: Request | WebSocket) -> bool:
        return gate.valid(request.cookies.get(COOKIE))

    def deny(status: HTTPStatus, message: str) -> JSONResponse:
        return JSONResponse({"error": message}, status_code=status)

    async def body(request: Request) -> dict[str, Any]:
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise ValueError("request too large")
        data = json.loads(raw or b"{}")
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
        return data

    def guarded(
        handler: Callable[[Request], Any], *, mutating: bool = False
    ) -> Callable[[Request], Any]:
        async def wrapped(request: Request) -> Response:
            if not signed_in(request):
                return deny(HTTPStatus.UNAUTHORIZED, "sign in first")
            if mutating:
                if not origin_ok(request.headers.get("origin")):
                    return deny(HTTPStatus.FORBIDDEN, "origin not allowed")
                if (
                    request.method != "DELETE"
                    and request.headers.get("content-type", "").split(";")[0] != "application/json"
                ):
                    return deny(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "send JSON")
            try:
                response: Response = await handler(request)
            except (ValueError, json.JSONDecodeError) as e:
                return deny(HTTPStatus.BAD_REQUEST, str(e)[:300])
            return response

        return wrapped

    # --- session -----------------------------------------------------------------------------
    async def healthz(_request: Request) -> Response:
        return JSONResponse({"ok": True})

    async def me(request: Request) -> Response:
        return JSONResponse(
            {
                "auth_required": gate.required,
                "signed_in": signed_in(request),
            }
        )

    async def sign_in(request: Request) -> Response:
        if not origin_ok(request.headers.get("origin")):
            return deny(HTTPStatus.FORBIDDEN, "origin not allowed")
        client = request.client.host if request.client else "?"
        if gate.blocked(client):
            return deny(HTTPStatus.TOO_MANY_REQUESTS, "too many attempts; wait 10 minutes")
        try:
            code = str((await body(request)).get("code", ""))
        except (ValueError, json.JSONDecodeError):
            return deny(HTTPStatus.BAD_REQUEST, 'send {"code": "…"}')
        if not gate.check_code(client, code):
            await asyncio.sleep(0.5)  # slows guessing a little more
            return deny(HTTPStatus.UNAUTHORIZED, "wrong access code")
        response = JSONResponse({"signed_in": True})
        response.set_cookie(
            COOKIE,
            gate.issue(),
            max_age=SESSION_TTL_S,
            httponly=True,
            secure=config.secure_cookies,
            samesite="strict",
            path="/",
        )
        return response

    async def sign_out(_request: Request) -> Response:
        response = JSONResponse({"signed_in": False})
        response.delete_cookie(COOKIE, path="/")
        return response

    # --- keys & providers (P6.7) -------------------------------------------------------------
    def providers_payload() -> dict[str, Any]:
        statuses = store.key_statuses()
        overrides = store.stage_overrides()
        providers = []
        for p in catalog.providers.values():
            status = statuses.get(p.key_env)
            source = "panel" if status else ("server" if env.get(p.key_env) else None)
            providers.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "kind": p.kind,
                    "key_page": p.key_page,
                    "steps": p.steps,
                    "free": p.free,
                    "key_set": source is not None,
                    "key_source": source,
                    "updated_at": status.updated_at if status else None,
                    "test": None
                    if status is None or status.test_ok is None
                    else {"ok": status.test_ok, "at": status.test_at, "detail": status.test_detail},
                    "models": sorted(set(p.models) | set(status.models if status else ())),
                }
            )
        stages = []
        for slot in catalog.stages.values():
            route = seed.stages.get(slot.id)
            override = overrides.get(slot.id)
            current = (
                {"provider_id": override[0], "model": override[1], "source": "panel"}
                if override
                else {
                    "provider_id": catalog.provider_for_route(route) if route else None,
                    "model": route.model if route else None,
                    "source": "default",
                }
            )
            stages.append({"id": slot.id, "label": slot.label, "kind": slot.kind, **current})
        return {"providers": providers, "stages": stages}

    async def list_providers(_request: Request) -> Response:
        return JSONResponse(providers_payload())

    def provider_from(request: Request) -> Any:
        provider = catalog.providers.get(request.path_params["provider"])
        if provider is None:
            raise ValueError("unknown provider")
        return provider

    async def put_key(request: Request) -> Response:
        provider = provider_from(request)
        key = str((await body(request)).get("key", "")).strip()
        if not (8 <= len(key) <= 400) or not key.isascii() or any(c.isspace() for c in key):
            raise ValueError("that does not look like an API key (8 to 400 characters, no spaces)")
        store.set_key(provider.key_env, key)
        config.log(f"key saved for {provider.name}")
        return JSONResponse(providers_payload())

    async def delete_key(request: Request) -> Response:
        provider = provider_from(request)
        store.delete_key(provider.key_env)
        return JSONResponse(providers_payload())

    async def test_provider(request: Request) -> Response:
        provider = provider_from(request)
        key = store.env_overlay(env).get(provider.key_env, "")
        if not key:
            raise ValueError("no key saved for this vendor")
        result = await check_key(provider, key)
        if provider.key_env in store.key_statuses():
            store.record_test(provider.key_env, result.ok, result.detail, list(result.models))
        payload = providers_payload()
        payload["result"] = {"ok": result.ok, "detail": result.detail}
        return JSONResponse(payload)

    async def put_stage(request: Request) -> Response:
        stage = request.path_params["stage"]
        data = await body(request)
        provider_id, model = str(data.get("provider_id", "")), str(data.get("model", ""))
        catalog.route_for(stage, provider_id, model, seed.stages.get(stage))  # validates
        store.set_stage(stage, provider_id, model.strip())
        return JSONResponse(providers_payload())

    async def reset_stage(request: Request) -> Response:
        stage = request.path_params["stage"]
        if stage not in catalog.stages:
            raise ValueError("unknown stage")
        store.reset_stage(stage)
        return JSONResponse(providers_payload())

    async def list_calls(_request: Request) -> Response:
        return JSONResponse({"calls": store.calls()})

    async def get_call(request: Request) -> Response:
        call = store.call(request.path_params["call_id"])
        if call is None:
            return deny(HTTPStatus.NOT_FOUND, "no such call")
        return JSONResponse(call)

    async def audit(_request: Request) -> Response:
        return JSONResponse({"entries": store.audit()})

    # --- calls over WebSocket ----------------------------------------------------------------
    async def ws_endpoint(ws: WebSocket) -> None:
        if not origin_ok(ws.headers.get("origin")) or not signed_in(ws):
            await ws.close(code=1008)
            return
        await ws.accept()
        runtime = await asyncio.to_thread(runtime_factory)
        stt_id = runtime.stt_routes[0].provider if runtime.stt_routes else None
        vendor = catalog.providers.get(stt_id) if stt_id else None
        stt_vendor = vendor.name if vendor else stt_id  # display name, e.g. "AssemblyAI"
        await ws.send_text(
            json.dumps(
                {
                    "type": "hello",
                    "v": 1,
                    "company_name": runtime.company.name,
                    "mode": runtime.mode,
                    "scenarios": [{"id": s.id, "title": s.title} for s in scenarios.values()],
                    "stt_vendor": stt_vendor,
                },
                ensure_ascii=False,
            )
        )

        async def send(message: dict[str, Any]) -> None:
            await ws.send_text(json.dumps(message, ensure_ascii=False))

        call: Call | None = None

        async def begin(title: str) -> Call:
            nonlocal call
            if call is not None:
                await call.end()
            call = Call(runtime=runtime, send=send, store=store, title=title, log=config.log)
            await call.begin()
            return call

        try:
            while True:
                frame = await ws.receive()
                if frame["type"] == "websocket.disconnect":
                    break
                if frame.get("bytes") is not None:
                    if call is not None and len(frame["bytes"]) <= MAX_AUDIO_FRAME:
                        call.audio_frame(frame["bytes"])
                    continue
                raw = frame.get("text") or ""
                try:
                    msg = DemoClientMessage.model_validate_json(raw).root
                except ValidationError as err:
                    await send(
                        {
                            "type": "error",
                            "message": f"invalid message: {err.error_count()} error(s)",
                        }
                    )
                    continue
                if msg.type == "start":
                    scenario_id = msg.scenario_id.root if msg.scenario_id else None
                    scenario = scenarios.get(scenario_id) if scenario_id else None
                    current = await begin(scenario.title if scenario else "Live call")
                    if scenario_id and scenario is None:
                        await send({"type": "error", "message": f"unknown scenario {scenario_id}"})
                    elif scenario is not None:
                        current.playback = asyncio.create_task(current.play(scenario, config.speed))
                elif msg.type == "say":
                    current = call or await begin("Typed call")
                    await current.say(msg.speaker, msg.text)
                elif msg.type == "audio_start":
                    current = call or await begin("Spoken call")
                    await current.audio_start()
                elif msg.type == "audio_stop" and call is not None:
                    await call.audio_stop()
                elif msg.type == "end" and call is not None:
                    await call.end()
                    call = None
        except WebSocketDisconnect:
            pass
        finally:
            if call is not None:
                with contextlib.suppress(Exception):
                    await call.end()

    # --- the web app -------------------------------------------------------------------------
    async def static(request: Request) -> Response:
        if static_root is None or not (static_root / "index.html").exists():
            return PlainTextResponse(
                "Web app not built yet. Run `pnpm demo` from the repo root.\n", status_code=404
            )
        path = request.url.path
        if "%" in request.scope.get("raw_path", b"").decode("latin-1") or ".." in path:
            return PlainTextResponse("not found\n", status_code=404)
        target = (static_root / path.lstrip("/")).resolve()
        if not target.is_relative_to(static_root):
            return PlainTextResponse("not found\n", status_code=404)
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            if Path(path).suffix:  # a missing asset is a real 404
                return PlainTextResponse("not found\n", status_code=404)
            target = static_root / "index.html"  # client-side route
        hashed = "/_expo/static/" in path or "/assets/" in path
        return FileResponse(
            target,
            media_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable" if hashed else "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "same-origin",
                "X-Frame-Options": "DENY",
            },
        )

    @contextlib.asynccontextmanager
    async def lifespan(_app: Starlette) -> AsyncIterator[None]:
        yield
        store.close()

    routes = [
        Route("/healthz", healthz),
        Route("/api/me", me),
        Route("/api/session", sign_in, methods=["POST"]),
        Route("/api/session", sign_out, methods=["DELETE"]),
        Route("/api/providers", guarded(list_providers)),
        Route("/api/providers/{provider}/key", guarded(put_key, mutating=True), methods=["PUT"]),
        Route(
            "/api/providers/{provider}/key",
            guarded(delete_key, mutating=True),
            methods=["DELETE"],
        ),
        Route(
            "/api/providers/{provider}/test",
            guarded(test_provider, mutating=True),
            methods=["POST"],
        ),
        Route("/api/stages/{stage}", guarded(put_stage, mutating=True), methods=["PUT"]),
        Route("/api/stages/{stage}", guarded(reset_stage, mutating=True), methods=["DELETE"]),
        Route("/api/calls", guarded(list_calls)),
        Route("/api/calls/{call_id}", guarded(get_call)),
        Route("/api/audit", guarded(audit)),
        WebSocketRoute("/ws", ws_endpoint),
        WebSocketRoute("/", ws_endpoint),  # older builds connect to the bare origin
        Route("/{path:path}", static),
    ]
    return Starlette(routes=routes, lifespan=lifespan)
