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
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.websockets import WebSocket, WebSocketDisconnect

from sotto_worker.company import CompanyProfile
from sotto_worker.playbook import PlaybookIndex
from sotto_worker.protocol.demo import DemoClientMessage
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import DEMO, Runtime
from sotto_worker.scenarios import Scenario, load_all
from sotto_worker.server.auth import COOKIE, SESSION_TTL_S, AccessGate
from sotto_worker.server.benchmark import LIVE_STAGES, R1_GUARD_P50_MS, benchmark
from sotto_worker.server.calls import Call
from sotto_worker.server.catalog import Catalog
from sotto_worker.server.keytest import check_key
from sotto_worker.server.store import EscalationError, Store

LOCAL_DEV_PORTS = (8081, 19006)  # Expo dev server, for `expo start --web` against this server
MAX_BODY = 8 * 1024
MAX_AUDIO_FRAME = 64 * 1024
MAX_LIVE_CALLS = 5  # open call sockets on this server (vendor spend, CPU)
# Pages and API: no framing, no sniffing, scripts and sockets from this origin only. React Native
# Web injects <style> tags, hence 'unsafe-inline' for styles only.
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
}


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
) -> ASGIApp:
    """`seed` is the default routing; `env` the process environment (server-level keys);
    `runtime_factory` builds a fresh runtime per call from seed + panel keys and choices."""
    scenarios: dict[str, Scenario] = {s.id: s for s in load_all(DEMO / "calls")}
    company = CompanyProfile.load(DEMO / "company.yaml")
    file_playbook = PlaybookIndex.from_directory(DEMO / "playbook").entries
    default_settings: dict[str, Any] = {
        "ai_answers_allowed": company.ai_answers_allowed,
        "backup_allowed": not company.backup_disabled,
        "agent_context": company.agent_context,
        "card_language": company.card_language if company.card_language in ("en", "ar") else "auto",
    }
    static_root = config.static_dir.resolve() if config.static_dir else None

    def origin_ok(origin: str | None) -> bool:
        # Non-browser clients send no Origin; browsers always do on cross-site requests.
        return origin is None or origin.rstrip("/") in config.allowed_origins()

    def client_of(request: Request | WebSocket) -> str:
        return request.client.host if request.client else "?"

    def signed_in(request: Request | WebSocket) -> bool:
        return gate.valid(request.cookies.get(COOKIE))

    def deny(status: HTTPStatus, message: str) -> JSONResponse:
        return JSONResponse({"error": message}, status_code=status)

    async def body(request: Request) -> dict[str, Any]:
        """The JSON body, read only up to MAX_BODY: a huge upload never reaches memory."""
        declared = request.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY):
            raise ValueError("request too large")
        raw = b""
        async for chunk in request.stream():
            raw += chunk
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
        client = client_of(request)
        # Counted before the body is read, so parallel guesses all count (rate limit).
        if not gate.begin_attempt(client):
            return deny(HTTPStatus.TOO_MANY_REQUESTS, "too many attempts; wait 10 minutes")
        try:
            code = str((await body(request)).get("code", ""))
        except (ValueError, json.JSONDecodeError):
            return deny(HTTPStatus.BAD_REQUEST, 'send {"code": "…"}')
        if not gate.check_code(code):
            await asyncio.sleep(0.5)  # slows guessing a little more
            return deny(HTTPStatus.UNAUTHORIZED, "wrong access code")
        gate.succeeded(client)
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

    async def sign_out(request: Request) -> Response:
        if not origin_ok(request.headers.get("origin")):
            return deny(HTTPStatus.FORBIDDEN, "origin not allowed")
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
            bench = (
                store.benchmark(str(current["provider_id"]), str(current["model"]))
                if current["provider_id"] and current["model"]
                else None
            )
            stages.append(
                {
                    "id": slot.id,
                    "label": slot.label,
                    "kind": slot.kind,
                    **current,
                    "deadline_ms": route.first_token_ms if route else None,
                    "live": slot.id in LIVE_STAGES,
                    "benchmark": bench,
                }
            )
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
        store.set_key(provider.key_env, key, actor=client_of(request))
        config.log(f"key saved for {provider.name}")
        return JSONResponse(providers_payload())

    async def delete_key(request: Request) -> Response:
        provider = provider_from(request)
        store.delete_key(provider.key_env, actor=client_of(request))
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
        bench = store.benchmark(provider_id, model.strip())
        if stage in LIVE_STAGES and bench and bench["ok"] and bench["p50_ms"] > R1_GUARD_P50_MS:
            raise ValueError(
                f"{model.strip()} answered in {bench['p50_ms']} ms typically (first word); a live "
                f"stage needs under {R1_GUARD_P50_MS} ms to show cards within 1.5 s (R1)"
            )
        store.set_stage(stage, provider_id, model.strip(), actor=client_of(request))
        return JSONResponse(providers_payload())

    async def measure_stage(request: Request) -> Response:
        stage = request.path_params["stage"]
        slot = catalog.stages.get(stage)
        if slot is None or slot.kind != "llm":
            raise ValueError("speed is measured for AI stages; for speech use pnpm stt:live")
        provider_id, model = store.stage_overrides().get(stage) or (None, None)
        if provider_id is None:
            route = seed.stages[stage]
            provider_id, model = catalog.provider_for_route(route), route.model
        if provider_id is None or model is None:
            raise ValueError("this stage uses a custom endpoint; measure it with pnpm replay:live")
        route = catalog.route_for(stage, provider_id, model, seed.stages.get(stage))
        result = await benchmark(route, store.env_overlay(env))
        store.record_benchmark(
            provider_id, model, ok=result.ok, p50_ms=result.p50_ms, worst_ms=result.worst_ms,
            samples=result.samples, detail=result.detail,
        )  # fmt: skip
        return JSONResponse(providers_payload())

    async def reset_stage(request: Request) -> Response:
        stage = request.path_params["stage"]
        if stage not in catalog.stages:
            raise ValueError("unknown stage")
        store.reset_stage(stage, actor=client_of(request))
        return JSONResponse(providers_payload())

    async def list_calls(_request: Request) -> Response:
        return JSONResponse({"calls": store.calls()})

    async def get_call(request: Request) -> Response:
        call = store.call(request.path_params["call_id"])
        if call is None:
            return deny(HTTPStatus.NOT_FOUND, "no such call")
        return JSONResponse(call)

    def settings_payload() -> dict[str, Any]:
        return {"settings": {**default_settings, **store.company_settings()}}

    async def get_settings(_request: Request) -> Response:
        return JSONResponse(settings_payload())

    async def put_settings(request: Request) -> Response:
        store.set_company_settings(await body(request), actor=client_of(request))
        return JSONResponse(settings_payload())

    async def list_escalations(_request: Request) -> Response:
        return JSONResponse({"escalations": store.escalations()})

    async def answer_escalation(request: Request) -> Response:
        answer = str((await body(request)).get("answer", ""))
        try:
            store.answer_escalation(
                request.path_params["item_id"], answer, actor=client_of(request)
            )
        except EscalationError as e:
            return deny(HTTPStatus.CONFLICT, str(e))
        return JSONResponse({"escalations": store.escalations()})

    async def add_escalation_to_playbook(request: Request) -> Response:
        answer = str((await body(request)).get("answer", ""))
        try:
            store.add_to_playbook(request.path_params["item_id"], answer, actor=client_of(request))
        except EscalationError as e:
            return deny(HTTPStatus.CONFLICT, str(e))
        return JSONResponse({"escalations": store.escalations()})

    def playbook_payload() -> dict[str, Any]:
        mine = store.editable_playbook()
        files = [
            {
                "id": f"file:{e.id}",
                "question": e.question,
                "answer": e.short_answer,
                "tags": list(e.tags),
                "source": "file",
                "updated_at": None,
            }
            for e in file_playbook
        ]
        return {"entries": [*mine, *files]}

    async def get_playbook(_request: Request) -> Response:
        return JSONResponse(playbook_payload())

    def entry_fields(data: dict[str, Any]) -> tuple[str, str, list[str]]:
        tags = data.get("tags") or []
        if not isinstance(tags, list):
            raise ValueError("tags must be a list")
        return str(data.get("question", "")), str(data.get("answer", "")), tags

    async def add_entry(request: Request) -> Response:
        question, answer, tags = entry_fields(await body(request))
        try:
            store.add_custom(question, answer, tags, actor=client_of(request))
        except EscalationError as e:
            return deny(HTTPStatus.CONFLICT, str(e))
        return JSONResponse(playbook_payload())

    async def edit_entry(request: Request) -> Response:
        question, answer, tags = entry_fields(await body(request))
        try:
            store.update_entry(
                request.path_params["entry_id"], question, answer, tags, actor=client_of(request)
            )
        except EscalationError as e:
            return deny(HTTPStatus.CONFLICT, str(e))
        return JSONResponse(playbook_payload())

    async def delete_entry(request: Request) -> Response:
        try:
            store.delete_entry(request.path_params["entry_id"], actor=client_of(request))
        except EscalationError as e:
            return deny(HTTPStatus.CONFLICT, str(e))
        return JSONResponse(playbook_payload())

    async def playbook_added(_request: Request) -> Response:
        return JSONResponse({"entries": store.playbook_added()})

    async def audit(_request: Request) -> Response:
        return JSONResponse({"entries": store.audit()})

    # --- calls over WebSocket ----------------------------------------------------------------
    async def ws_endpoint(ws: WebSocket) -> None:
        if not origin_ok(ws.headers.get("origin")) or not signed_in(ws):
            await ws.close(code=1008)
            return
        if live_calls[0] >= MAX_LIVE_CALLS:
            await ws.close(code=1013)  # try again later
            return
        live_calls[0] += 1
        try:
            await serve_call(ws)
        finally:
            live_calls[0] -= 1

    live_calls = [0]

    async def serve_call(ws: WebSocket) -> None:
        await ws.accept()

        async def send(message: dict[str, Any]) -> None:
            await ws.send_text(json.dumps(message, ensure_ascii=False))

        def hello_for(runtime: Runtime) -> dict[str, Any]:
            stt_id = runtime.stt_routes[0].provider if runtime.stt_routes else None
            vendor = catalog.providers.get(stt_id) if stt_id else None
            return {
                "type": "hello",
                "v": 1,
                "company_name": runtime.company.name,
                "mode": runtime.mode,
                "scenarios": [{"id": s.id, "title": s.title} for s in scenarios.values()],
                "stt_vendor": vendor.name if vendor else stt_id,  # display name
            }

        greeting = hello_for(await asyncio.to_thread(runtime_factory))
        await send(greeting)
        call: Call | None = None

        async def begin(title: str) -> Call:
            """Every call gets a fresh runtime: keys, stage choices, settings and playbook
            answers changed since the last call apply now (R6), on the same screen."""
            nonlocal call, greeting
            if call is not None:
                await call.end()
            runtime = await asyncio.to_thread(runtime_factory)
            fresh = hello_for(runtime)
            if fresh != greeting:  # vendor, mode or company changed: tell the app first
                greeting = fresh
                await send(fresh)
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
                "Cache-Control": "public, max-age=31536000, immutable" if hashed else "no-store"
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
        Route(
            "/api/stages/{stage}/benchmark",
            guarded(measure_stage, mutating=True),
            methods=["POST"],
        ),
        Route("/api/calls", guarded(list_calls)),
        Route("/api/calls/{call_id}", guarded(get_call)),
        Route("/api/audit", guarded(audit)),
        Route("/api/company/settings", guarded(get_settings)),
        Route("/api/company/settings", guarded(put_settings, mutating=True), methods=["PUT"]),
        Route("/api/escalations", guarded(list_escalations)),
        Route(
            "/api/escalations/{item_id}/answer",
            guarded(answer_escalation, mutating=True),
            methods=["PUT"],
        ),
        Route(
            "/api/escalations/{item_id}/playbook",
            guarded(add_escalation_to_playbook, mutating=True),
            methods=["POST"],
        ),
        Route("/api/playbook/added", guarded(playbook_added)),
        Route("/api/playbook", guarded(get_playbook)),
        Route("/api/playbook", guarded(add_entry, mutating=True), methods=["POST"]),
        Route("/api/playbook/{entry_id}", guarded(edit_entry, mutating=True), methods=["PUT"]),
        Route("/api/playbook/{entry_id}", guarded(delete_entry, mutating=True), methods=["DELETE"]),
        WebSocketRoute("/ws", ws_endpoint),
        WebSocketRoute("/", ws_endpoint),  # older builds connect to the bare origin
        Route("/{path:path}", static),
    ]
    app = Starlette(routes=routes, lifespan=lifespan)
    return SecurityHeaders(app)


class SecurityHeaders:
    """ASGI wrapper: SECURITY_HEADERS on every HTTP response (pages, API, errors)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = [(k.lower().encode(), v.encode()) for k, v in SECURITY_HEADERS.items()]

        async def send_with_headers(message: Any) -> None:
            if message["type"] == "http.response.start":
                present = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = [
                    *message.get("headers", []),
                    *[(k, v) for k, v in extra if k not in present],
                ]
            await send(message)

        await self.app(scope, receive, send_with_headers)
