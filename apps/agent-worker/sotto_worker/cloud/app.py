"""HTTP API of the management server (D-022).

/api/v1/*    the client apps: bearer token per device, CORS open (no cookies, so no CSRF).
/api/owner/* the owner dashboard: HttpOnly SameSite=Strict cookie, same origin only.
/owner       the dashboard page; everything else serves the web app (the same client, D-022).
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from http import HTTPStatus
from pathlib import Path
from typing import Any

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from sotto_worker.cloud.bundle import Seed, build_bundle
from sotto_worker.cloud.mail import render_escalation, send_with_retries
from sotto_worker.cloud.recordings import Recordings
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, plan_state
from sotto_worker.outbox import EmailMessage, EmailSender
from sotto_worker.server.catalog import apply_overrides

MAX_BODY = 16 * 1024
OWNER_COOKIE = "sotto_owner"
OWNER_DIR = Path(__file__).parent / "owner"
STT_TOKEN_TTL_S = 300
# The web app calls AI and speech vendors directly from the browser (D-022), so its pages may
# connect to any https/wss host. The owner dashboard only talks to this server.
APP_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; "
    "media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
)
OWNER_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; "
    "frame-ancestors 'none'; form-action 'self'"
)
COMMON_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}
MODEL_KEY = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}
FIRST_PASSWORD_PATHS = {"/api/v1/me", "/api/v1/auth/password", "/api/v1/auth/logout"}
OWNER_FIRST_PASSWORD_PATHS = {"/api/owner/me", "/api/owner/password", "/api/owner/logout"}
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Sotto-Platform",
    "Access-Control-Max-Age": "600",
}


class RateLimit:
    """Sliding-window counter per key, plus a global cap (address spraying)."""

    def __init__(self, per_key: int, total: int, window_s: float) -> None:
        self.per_key, self.total, self.window = per_key, total, window_s
        self._keys: OrderedDict[str, deque[float]] = OrderedDict()
        self._all: deque[float] = deque()

    def blocked(self, key: str, now: float | None = None) -> bool:
        """True when this key (or everyone together) is over the limit; counts nothing."""
        t = now if now is not None else time.monotonic()
        recent = self._keys.get(key)
        for q in (self._all, recent):
            while q and q[0] < t - self.window:
                q.popleft()
        return bool(recent and len(recent) >= self.per_key) or len(self._all) >= self.total

    def record(self, key: str, now: float | None = None) -> None:
        """Counts one failure for this key."""
        t = now if now is not None else time.monotonic()
        recent = self._keys.setdefault(key, deque())
        self._keys.move_to_end(key)
        while len(self._keys) > 10_000:
            self._keys.popitem(last=False)
        recent.append(t)
        self._all.append(t)

    def hit(self, key: str, now: float | None = None) -> bool:
        t = now if now is not None else time.monotonic()
        for q in (self._all, self._keys.get(key)):
            while q and q[0] < t - self.window:
                q.popleft()
        recent = self._keys.setdefault(key, deque())
        self._keys.move_to_end(key)
        while len(self._keys) > 10_000:
            self._keys.popitem(last=False)
        if len(recent) >= self.per_key or len(self._all) >= self.total:
            return False
        recent.append(t)
        self._all.append(t)
        return True


@dataclass
class CloudConfig:
    public_origin: str | None  # https://… in production; None = local (http://localhost)
    static_dir: Path | None
    owner_origin: str | None = None  # the owner console's own origin, e.g. https://owner.…
    secure_cookies: bool = False
    stt_minter: Callable[[str, str], Awaitable[dict[str, Any]]] | None = None
    key_tester: Callable[[str, str, str], Awaitable[list[str]]] | None = None
    log: Callable[[str], None] = field(default=lambda _line: None)
    recordings: Recordings | None = None  # None: recordings are not kept on this server
    mailer: EmailSender | None = None  # None: manager emails are off (Inbox only)


async def mint_stt_token(vendor: str, key: str) -> dict[str, Any]:
    """A short-lived streaming token, so the vendor key never has to reach the browser (D-022).
    AssemblyAI v3 and Speechmatics both accept these on the WebSocket URL."""
    async with httpx.AsyncClient(timeout=8) as client:
        if vendor == "assemblyai":
            r = await client.get(
                "https://streaming.assemblyai.com/v3/token",
                params={"expires_in_seconds": 60, "max_session_duration_seconds": 3 * 3600},
                headers={"Authorization": key},
            )
            r.raise_for_status()
            return {"token": r.json()["token"], "param": "token", "ttl_s": 60}
        if vendor == "speechmatics":
            r = await client.post(
                "https://mp.speechmatics.com/v1/api_keys",
                params={"type": "rt"},
                headers={"Authorization": f"Bearer {key}"},
                json={"ttl": STT_TOKEN_TTL_S},
            )
            r.raise_for_status()
            return {"token": r.json()["key_value"], "param": "jwt", "ttl_s": STT_TOKEN_TTL_S}
    raise CloudError("invalid", f"no short-lived tokens for {vendor}")


async def list_models(provider_id: str, url: str, key: str) -> list[str]:
    """ "Test" for a model key, run here so devices never need keys they do not use. The URL is
    the vendor's own models endpoint from the seed catalogue, never from the request."""
    headers = (
        {"x-api-key": key, "anthropic-version": "2023-06-01"}
        if provider_id == "anthropic"
        else {"Authorization": f"Bearer {key}"}
    )
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        data = r.json().get("data") or []
        return [str(m.get("id", "")).removeprefix("models/") for m in data][:80]


def create_cloud_app(config: CloudConfig, store: CloudStore, seed: Seed) -> ASGIApp:
    # Only FAILED sign-ins count, so real users cannot be locked out by volume alone; the owner
    # has a limiter of its own, so a flood on the app login never locks the owner out.
    login_limit = RateLimit(per_key=10, total=300, window_s=600)
    owner_limit = RateLimit(per_key=10, total=50, window_s=600)
    password_limit = RateLimit(per_key=5, total=500, window_s=600)
    escalation_limit = RateLimit(per_key=60, total=5000, window_s=3600)
    signup_limit = RateLimit(per_key=5, total=60, window_s=3600)
    token_limit = RateLimit(per_key=60, total=2000, window_s=3600)
    minter = config.stt_minter or mint_stt_token
    tester = config.key_tester or list_models
    stt_key_env = {"assemblyai": "ASSEMBLYAI_API_KEY", "speechmatics": "SPEECHMATICS_API_KEY"}
    static_root = config.static_dir.resolve() if config.static_dir else None

    def ip_of(request: Request) -> str:
        return request.client.host if request.client else "?"

    def ip_key(request: Request) -> str:
        """Rate-limit key: the IPv4 address, or the /64 of an IPv6 address (one home or VM)."""
        ip = ip_of(request)
        if ":" in ip:
            return ":".join(ip.split(":")[:4]) + "::/64"
        return ip

    def fail(status: HTTPStatus, code: str, message: str) -> JSONResponse:
        return JSONResponse({"error": message, "code": code}, status_code=status)

    async def body(request: Request) -> dict[str, Any]:
        declared = request.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY):
            raise CloudError("too_large", "request too large")
        raw = b""
        async for chunk in request.stream():
            raw += chunk
            if len(raw) > MAX_BODY:
                raise CloudError("too_large", "request too large")
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            raise CloudError("invalid", "send a JSON object") from None
        if not isinstance(data, dict):
            raise CloudError("invalid", "send a JSON object")
        return data

    STATUS = {
        "forbidden": HTTPStatus.FORBIDDEN,
        "not_found": HTTPStatus.NOT_FOUND,
        "email_taken": HTTPStatus.CONFLICT,
        "too_large": HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        "no_seats": HTTPStatus.CONFLICT,
        "plan_blocked": HTTPStatus.PAYMENT_REQUIRED,
        "storage_full": HTTPStatus.INSUFFICIENT_STORAGE,
    }

    def handle(
        fn: Callable[[Request], Awaitable[Response]],
    ) -> Callable[[Request], Awaitable[Response]]:
        async def wrapped(request: Request) -> Response:
            try:
                return await fn(request)
            except CloudError as e:
                return fail(STATUS.get(e.code, HTTPStatus.BAD_REQUEST), e.code, str(e))

        return wrapped

    # --- app auth --------------------------------------------------------------------------------
    def bearer(request: Request) -> Principal | None:
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer "):
            return None
        return store.principal(header[7:].strip(), kind="app")

    def app_route(
        fn: Callable[[Request, Principal], Awaitable[Response]],
    ) -> Callable[[Request], Awaitable[Response]]:
        @handle
        async def wrapped(request: Request) -> Response:
            who = bearer(request)
            if who is None:
                return fail(HTTPStatus.UNAUTHORIZED, "signed_out", "sign in again")
            if who.must_change and request.url.path not in FIRST_PASSWORD_PATHS:
                return fail(
                    HTTPStatus.FORBIDDEN, "change_password", "choose your own password first"
                )
            return await fn(request, who)

        return wrapped

    def platform_of(request: Request) -> str:
        return request.headers.get("x-sotto-platform", "unknown")[:20]

    def session_out(token: str, who_row: Any) -> dict[str, Any]:
        principal = store.principal(token, kind="app")
        if principal is None:
            raise CloudError("signed_out", "sign in again")
        return {"token": token, **store.me(principal)}

    @handle
    async def signup(request: Request) -> Response:
        if not signup_limit.hit(ip_key(request)):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many sign-ups; wait")
        data = await body(request)
        store.signup(
            company=str(data.get("company", "")),
            name=str(data.get("name", "")),
            email=str(data.get("email", "")),
            password=str(data.get("password", "")),
            ip=ip_of(request),
            examples=seed.examples,
        )
        user = store.check_login(str(data.get("email", "")), str(data.get("password", "")))
        if user is None:
            raise CloudError("bad_login", "account created; sign in")
        device = data.get("device") if isinstance(data.get("device"), dict) else {}
        token = store.open_session(user, kind="app", device=device or {})
        return JSONResponse(session_out(token, user), status_code=HTTPStatus.CREATED)

    @handle
    async def login(request: Request) -> Response:
        data = await body(request)
        email = str(data.get("email", "")).strip().lower()
        keys = (ip_key(request), "email:" + email)
        if any(login_limit.blocked(k) for k in keys):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait 10 min")
        user = store.check_login(email, str(data.get("password", "")))
        if user is None or user["role"] == "owner":
            for k in keys:
                login_limit.record(k)
            return fail(HTTPStatus.UNAUTHORIZED, "bad_login", "wrong email or password")
        device = data.get("device") if isinstance(data.get("device"), dict) else {}
        token = store.open_session(user, kind="app", device=device or {})
        return JSONResponse(session_out(token, user))

    @app_route
    async def logout(request: Request, who: Principal) -> Response:
        store.close_session(request.headers["authorization"][7:].strip())
        return JSONResponse({"ok": True})

    @app_route
    async def me(_request: Request, who: Principal) -> Response:
        return JSONResponse(store.me(who))

    @app_route
    async def change_password(request: Request, who: Principal) -> Response:
        if password_limit.blocked(who.user_id):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait 10 min")
        data = await body(request)
        password_limit.record(who.user_id)
        store.change_password(who, str(data.get("current", "")), str(data.get("new", "")))
        return JSONResponse({"ok": True})

    def needed_keys(company_id: str) -> set[str]:
        """The model keys the company's current routes use. Speech keys never leave the server:
        devices get short-lived tokens for them instead (security review H1)."""
        routing = apply_overrides(seed.routing, seed.catalog, store.routes(company_id))
        names: set[str] = set()
        for stage in ("suggest", "suggest_backup", "summary"):
            route = routing.stages.get(stage)
            if route is None:
                continue
            if route.provider == "openai_compatible" and route.api_key_env:
                names.add(route.api_key_env)
            elif route.provider in MODEL_KEY:
                names.add(MODEL_KEY[route.provider])
        return names - set(stt_key_env.values())

    @app_route
    async def bundle(_request: Request, who: Principal) -> Response:
        company = store.company_row(who.company)
        state = plan_state(company, store.minutes_used(who.company), int(time.time() * 1000))
        out = build_bundle(
            seed,
            company_name=str(company["name"]),
            settings=store.settings(who.company),
            routes=store.routes(who.company),
            own_playbook=store.playbook(who.company),
            keys=(
                store.keys_for_call(who, needed_keys(who.company), ip=ip_of(_request))
                if state["can_call"]
                else None
            ),
        )
        out["plan"] = state
        out["key_status"] = store.key_status(who)
        return JSONResponse(out, headers={"Cache-Control": "no-store"})

    @app_route
    async def stt_token(request: Request, who: Principal) -> Response:
        vendor = request.path_params["vendor"]
        if vendor not in stt_key_env:
            raise CloudError("invalid", "this vendor does not use short-lived tokens")
        state = plan_state(
            store.company_row(who.company), store.minutes_used(who.company), int(time.time() * 1000)
        )
        if not state["can_call"]:
            raise CloudError("plan_blocked", state["blocked_reason"] or "calls are blocked")
        if not token_limit.hit(who.user_id):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many calls started")
        key = store.stored_key(who, stt_key_env[vendor])
        if not key:
            raise CloudError("no_key", f"add the {vendor} key in Keys & providers first")
        try:
            return JSONResponse(await minter(vendor, key), headers={"Cache-Control": "no-store"})
        except httpx.HTTPError as e:
            config.log(f"stt token {vendor}: {type(e).__name__}")
            return fail(HTTPStatus.BAD_GATEWAY, "vendor", f"{vendor} refused the key; test it")

    @app_route
    async def call_start(request: Request, who: Principal) -> Response:
        state = plan_state(
            store.company_row(who.company), store.minutes_used(who.company), int(time.time() * 1000)
        )
        if not state["can_call"]:
            raise CloudError("plan_blocked", state["blocked_reason"] or "calls are blocked")
        call_id = (await body(request)).get("call_id")
        if call_id:
            store.start_call(who, str(call_id))
        return JSONResponse({"ok": True, "plan": state})

    @app_route
    async def usage(request: Request, who: Principal) -> Response:
        call_id = store.report_usage(who, await body(request), platform_of(request))
        return JSONResponse({"ok": True, "id": call_id})

    def recordings_on() -> Recordings:
        if config.recordings is None:
            raise CloudError("not_found", "recordings are not kept on this server")
        return config.recordings

    @app_route
    async def review_post(request: Request, who: Principal) -> Response:
        review = store.set_review(who, request.path_params["call_id"], await body(request))
        return JSONResponse({"ok": True, "review": review})

    @app_route
    async def recording_put(request: Request, who: Principal) -> Response:
        rec = recordings_on()
        call_id = store.recording_call(who, request.path_params["call_id"], upload=True)
        size = await rec.save(who.company, call_id, request.stream())
        store.set_recording(who, call_id, size)
        rec.prune()
        return JSONResponse({"ok": True, "bytes": size})

    @app_route
    async def recording_get(request: Request, who: Principal) -> Response:
        rec = recordings_on()
        call_id = store.recording_call(who, request.path_params["call_id"], upload=False)
        path = rec.path(who.company, call_id)
        if not path.exists():
            raise CloudError("not_found", "no recording for this call")
        return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "private"})

    @app_route
    async def company_usage(request: Request, who: Principal) -> Response:
        days = request.query_params.get("days", "30")
        span = int(days) if days in ("7", "30", "90") else 30
        return JSONResponse({"calls": store.company_usage(who, span)})

    @app_route
    async def settings_get(_request: Request, who: Principal) -> Response:
        who.require("admin")
        return JSONResponse({"settings": store.settings(who.company)})

    @app_route
    async def settings_put(request: Request, who: Principal) -> Response:
        store.set_settings(who, await body(request), ip=ip_of(request))
        return JSONResponse({"settings": store.settings(who.company)})

    @app_route
    async def key_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        store.set_key(
            who, request.path_params["env"], str(data.get("value", "")), ip=ip_of(request)
        )
        return JSONResponse({"ok": True, "key_status": store.key_status(who)})

    @app_route
    async def key_test(request: Request, who: Principal) -> Response:
        who.require("admin")
        env = request.path_params["env"]
        provider = next((p for p in seed.catalog.providers.values() if p.key_env == env), None)
        if provider is None:
            raise CloudError("not_found", "unknown key")
        key = store.stored_key(who, env)
        if not key:
            raise CloudError("no_key", "save the key first")
        try:
            if provider.kind == "stt":
                if provider.id not in stt_key_env:
                    return JSONResponse({"ok": True, "detail": "saved (tested on the Mac demo)"})
                await minter(provider.id, key)
                return JSONResponse({"ok": True, "detail": "the vendor issued a streaming token"})
            url = provider.models_url()
            if not url:
                raise CloudError("invalid", "this vendor has no test address")
            models = await tester(provider.id, url, key)
        except httpx.HTTPStatusError as e:
            return JSONResponse(
                {"ok": False, "detail": f"{provider.name} answered {e.response.status_code}"}
            )
        except httpx.HTTPError as e:
            return JSONResponse(
                {"ok": False, "detail": f"{provider.name} unreachable ({type(e).__name__})"}
            )
        return JSONResponse(
            {"ok": True, "detail": f"{len(models)} models available", "models": models}
        )

    @app_route
    async def key_delete(request: Request, who: Principal) -> Response:
        store.delete_key(who, request.path_params["env"], ip=ip_of(request))
        return JSONResponse({"ok": True, "key_status": store.key_status(who)})

    @app_route
    async def route_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        stage = request.path_params["stage"]
        provider, model = str(data.get("provider", "")), str(data.get("model", ""))
        try:  # same validation as the worker's panel (kind match, model ID shape)
            seed.catalog.route_for(stage, provider, model, seed.routing.stages.get(stage))
        except ValueError as e:
            raise CloudError("invalid", str(e)) from None
        chosen = seed.catalog.providers.get(provider)
        if chosen is not None and not chosen.client:
            raise CloudError("invalid", f"{chosen.name} is not available in the app yet")
        store.set_route(who, stage, provider, model.strip(), ip=ip_of(request))
        return JSONResponse({"ok": True})

    @app_route
    async def route_delete(request: Request, who: Principal) -> Response:
        store.reset_route(who, request.path_params["stage"], ip=ip_of(request))
        return JSONResponse({"ok": True})

    @app_route
    async def playbook_get(_request: Request, who: Principal) -> Response:
        return JSONResponse({"entries": store.playbook(who.company)})

    @app_route
    async def playbook_post(request: Request, who: Principal) -> Response:
        entry_id = store.add_entry(who, await body(request), ip=ip_of(request))
        return JSONResponse({"id": entry_id}, status_code=HTTPStatus.CREATED)

    @app_route
    async def playbook_put(request: Request, who: Principal) -> Response:
        store.update_entry(who, request.path_params["id"], await body(request), ip=ip_of(request))
        return JSONResponse({"ok": True})

    @app_route
    async def playbook_delete(request: Request, who: Principal) -> Response:
        store.delete_entry(who, request.path_params["id"], ip=ip_of(request))
        return JSONResponse({"ok": True})

    @app_route
    async def escalation_post(request: Request, who: Principal) -> Response:
        if not escalation_limit.hit(who.user_id):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many questions sent")
        data = await body(request)
        excerpt = str(data.get("transcript_excerpt", ""))
        item = store.add_escalation(
            who, str(data.get("question", "")), excerpt, str(data.get("call_id", ""))
        )
        if config.mailer is not None and store.last_escalation_new:
            email_managers(who, item, str(data.get("question", ""))[:500], excerpt[-2000:])
        return JSONResponse({"id": item}, status_code=HTTPStatus.CREATED)

    pending_mail: set[asyncio.Task[bool]] = set()

    def email_managers(who: Principal, item: str, question: str, excerpt: str) -> None:
        """One email per new question to the company's managers, in the background (R2)."""
        mailer = config.mailer
        template = (seed.prompts.get("escalation_email") or {}).get("body", "")
        to = store.escalation_recipients(who.company)
        if mailer is None or not template or not to:
            return
        origin = config.public_origin or "http://localhost:8788"
        message = render_escalation(
            str(template),
            {
                "company.name": str(store.company_row(who.company)["name"]),
                "escalation.question": question,
                "escalation.transcript": excerpt or "(not available)",
                "escalation.agent": who.name or who.email,
                "escalation.customer": "the customer",
                "escalation.crm_link": "(not connected)",
                "escalation.inbox_link": f"{origin}/inbox",
            },
        )
        for address in to:
            msg = EmailMessage(to=address, subject=message.subject, text=message.text)
            task = asyncio.create_task(
                send_with_retries(mailer, msg, f"esc-{item}-{address}", log=config.log)
            )
            pending_mail.add(task)
            task.add_done_callback(pending_mail.discard)

    @app_route
    async def escalations_get(_request: Request, who: Principal) -> Response:
        return JSONResponse({"items": store.escalations(who)})

    @app_route
    async def escalation_answer(request: Request, who: Principal) -> Response:
        data = await body(request)
        store.answer_escalation(
            who,
            request.path_params["id"],
            str(data.get("answer", "")),
            add=bool(data.get("add_to_playbook")),
            ip=ip_of(request),
        )
        return JSONResponse({"ok": True})

    @app_route
    async def team_get(_request: Request, who: Principal) -> Response:
        return JSONResponse({"users": store.team(who)})

    @app_route
    async def team_post(request: Request, who: Principal) -> Response:
        data = await body(request)
        user_id, password = store.invite(
            who,
            str(data.get("email", "")),
            str(data.get("name", "")),
            str(data.get("role", "")),
            ip=ip_of(request),
        )
        return JSONResponse(
            {"id": user_id, "temporary_password": password}, status_code=HTTPStatus.CREATED
        )

    @app_route
    async def team_patch(request: Request, who: Principal) -> Response:
        store.set_member(who, request.path_params["id"], await body(request), ip=ip_of(request))
        return JSONResponse({"ok": True})

    @app_route
    async def devices_get(request: Request, who: Principal) -> Response:
        everyone = request.query_params.get("all") == "1"
        return JSONResponse({"devices": store.devices(who, all_users=everyone)})

    @app_route
    async def audit_get(_request: Request, who: Principal) -> Response:
        return JSONResponse({"items": store.company_audit(who)})

    @app_route
    async def device_delete(request: Request, who: Principal) -> Response:
        store.revoke_device(who, request.path_params["id"], ip=ip_of(request))
        return JSONResponse({"ok": True})

    # --- owner -----------------------------------------------------------------------------------
    def own_origin(request: Request) -> str:
        return f"{request.url.scheme}://{request.url.netloc}"

    def owner_host_ok(request: Request) -> bool:
        """The owner console lives on its own origin (security review M1), so a script on the
        app's origin can never use the owner's cookie."""
        if not config.owner_origin:
            return True
        return own_origin(request) == config.owner_origin.rstrip("/")

    def owner_origin_ok(request: Request) -> bool:
        origin = request.headers.get("origin")
        if origin is None:
            return True  # same-origin GETs and non-browser tools send none
        expected = (config.owner_origin or config.public_origin or own_origin(request)).rstrip("/")
        return origin.rstrip("/") == expected

    def owner_route(
        fn: Callable[[Request, Principal], Awaitable[Response]], *, mutating: bool = False
    ) -> Callable[[Request], Awaitable[Response]]:
        @handle
        async def wrapped(request: Request) -> Response:
            if not owner_host_ok(request):
                return fail(HTTPStatus.NOT_FOUND, "not_found", "not found")
            who = store.principal(request.cookies.get(OWNER_COOKIE), kind="owner")
            if who is None or not who.is_owner:
                return fail(HTTPStatus.UNAUTHORIZED, "signed_out", "sign in as the owner")
            if who.must_change and request.url.path not in OWNER_FIRST_PASSWORD_PATHS:
                return fail(HTTPStatus.FORBIDDEN, "change_password", "change your password first")
            if mutating:
                if not owner_origin_ok(request):
                    return fail(HTTPStatus.FORBIDDEN, "origin", "origin not allowed")
                if request.method != "DELETE" and not request.headers.get(
                    "content-type", ""
                ).startswith("application/json"):
                    return fail(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "json", "send JSON")
            return await fn(request, who)

        return wrapped

    @handle
    async def owner_login(request: Request) -> Response:
        if not owner_host_ok(request):
            return fail(HTTPStatus.NOT_FOUND, "not_found", "not found")
        if not owner_origin_ok(request):
            return fail(HTTPStatus.FORBIDDEN, "origin", "origin not allowed")
        data = await body(request)
        email = str(data.get("email", "")).strip().lower()
        keys = (ip_key(request), email)
        if any(owner_limit.blocked(k) for k in keys):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait 10 min")
        user = store.check_login(email, str(data.get("password", "")))
        if user is None or user["role"] != "owner":
            for k in keys:
                owner_limit.record(k)
            return fail(HTTPStatus.UNAUTHORIZED, "bad_login", "wrong email or password")
        token = store.open_session(user, kind="owner")
        response = JSONResponse({"ok": True})
        response.set_cookie(
            OWNER_COOKIE,
            token,
            max_age=12 * 3600,
            httponly=True,
            secure=config.secure_cookies,
            samesite="strict",
            path="/",
        )
        return response

    async def owner_logout(request: Request) -> Response:
        token = request.cookies.get(OWNER_COOKIE)
        if token:
            store.close_session(token)
        response = JSONResponse({"ok": True})
        response.delete_cookie(OWNER_COOKIE, path="/")
        return response

    async def o_me(_r: Request, who: Principal) -> Response:
        return JSONResponse({"email": who.email, "name": who.name, "must_change": who.must_change})

    async def o_stats(_r: Request, _who: Principal) -> Response:
        return JSONResponse(store.owner_stats())

    async def o_companies(_r: Request, _who: Principal) -> Response:
        return JSONResponse({"companies": store.owner_companies()})

    async def o_company(r: Request, _who: Principal) -> Response:
        return JSONResponse(store.owner_company(r.path_params["id"]))

    async def o_company_create(r: Request, who: Principal) -> Response:
        data = await body(r)
        company_id, password = store.owner_create_company(
            who,
            name=str(data.get("name", "")),
            admin_email=str(data.get("admin_email", "")),
            admin_name=str(data.get("admin_name", "")),
            plan=str(data.get("plan", "trial")),
            ip=ip_of(r),
        )
        return JSONResponse({"id": company_id, "temporary_password": password}, status_code=201)

    async def o_company_patch(r: Request, who: Principal) -> Response:
        store.owner_update_company(who, r.path_params["id"], await body(r), ip=ip_of(r))
        return JSONResponse(store.owner_company(r.path_params["id"]))

    async def o_company_delete(r: Request, who: Principal) -> Response:
        data = r.query_params.get("confirm", "")
        company = store.company_row(r.path_params["id"])
        if data != company["name"]:
            raise CloudError("invalid", "type the company name to confirm deletion")
        store.owner_delete_company(who, r.path_params["id"], ip=ip_of(r))
        return JSONResponse({"ok": True})

    async def o_reset(r: Request, who: Principal) -> Response:
        return JSONResponse(
            {
                "temporary_password": store.owner_reset_password(
                    who, r.path_params["id"], ip=ip_of(r)
                )
            }
        )

    async def o_user_active(r: Request, who: Principal) -> Response:
        active = (await body(r)).get("active")
        if not isinstance(active, bool):
            raise CloudError("invalid", "active must be true or false")
        store.owner_set_user_active(who, r.path_params["id"], active, ip=ip_of(r))
        return JSONResponse({"ok": True})

    async def o_device_delete(r: Request, who: Principal) -> Response:
        store.owner_revoke_device(who, r.path_params["id"], ip=ip_of(r))
        return JSONResponse({"ok": True})

    async def o_audit(_r: Request, _who: Principal) -> Response:
        return JSONResponse({"items": store.owner_audit()})

    async def o_password(r: Request, who: Principal) -> Response:
        data = await body(r)
        store.change_password(who, str(data.get("current", "")), str(data.get("new", "")))
        return JSONResponse({"ok": True})

    # --- pages -----------------------------------------------------------------------------------
    async def healthz(_r: Request) -> Response:
        return JSONResponse({"ok": True, "service": "sotto-cloud"})

    async def owner_page(request: Request) -> Response:
        if not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        name = request.path_params.get("file") or "index.html"
        if name not in {"index.html", "owner.js", "owner.css"}:
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            OWNER_DIR / name,
            media_type=mimetypes.guess_type(name)[0] or "text/plain",
            headers={"Content-Security-Policy": OWNER_CSP, "Cache-Control": "no-store"},
        )

    async def static(request: Request) -> Response:
        if config.owner_origin and owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)  # owner origin: console only
        if static_root is None or not (static_root / "index.html").exists():
            return PlainTextResponse("Sotto management server. The web app is not installed.\n")
        path = request.url.path
        if "%" in request.scope.get("raw_path", b"").decode("latin-1") or ".." in path:
            return PlainTextResponse("not found\n", status_code=404)
        target = (static_root / path.lstrip("/")).resolve()
        if not target.is_relative_to(static_root):
            return PlainTextResponse("not found\n", status_code=404)
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            if Path(path).suffix:
                return PlainTextResponse("not found\n", status_code=404)
            target = static_root / "index.html"
        hashed = "/_expo/static/" in path or "/assets/" in path
        return FileResponse(
            target,
            media_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream",
            headers={
                "Content-Security-Policy": APP_CSP,
                "Cache-Control": "public, max-age=31536000, immutable" if hashed else "no-store",
            },
        )

    api = "/api/v1"
    routes = [
        Route("/healthz", healthz),
        Route(f"{api}/auth/signup", signup, methods=["POST"]),
        Route(f"{api}/auth/login", login, methods=["POST"]),
        Route(f"{api}/auth/logout", logout, methods=["POST"]),
        Route(f"{api}/auth/password", change_password, methods=["POST"]),
        Route(f"{api}/me", me),
        Route(f"{api}/bundle", bundle),
        Route(f"{api}/stt-token/{{vendor}}", stt_token, methods=["POST"]),
        Route(f"{api}/calls/start", call_start, methods=["POST"]),
        Route(f"{api}/usage", usage, methods=["POST"]),
        Route(f"{api}/company/usage", company_usage),
        Route(f"{api}/calls/{{call_id}}/review", review_post, methods=["POST"]),
        Route(f"{api}/recordings/{{call_id}}", recording_put, methods=["PUT"]),
        Route(f"{api}/recordings/{{call_id}}", recording_get),
        Route(f"{api}/company/settings", settings_get),
        Route(f"{api}/company/settings", settings_put, methods=["PUT"]),
        Route(f"{api}/company/keys/{{env}}", key_put, methods=["PUT"]),
        Route(f"{api}/company/keys/{{env}}", key_delete, methods=["DELETE"]),
        Route(f"{api}/company/keys/{{env}}/test", key_test, methods=["POST"]),
        Route(f"{api}/company/routes/{{stage}}", route_put, methods=["PUT"]),
        Route(f"{api}/company/routes/{{stage}}", route_delete, methods=["DELETE"]),
        Route(f"{api}/playbook", playbook_get),
        Route(f"{api}/playbook", playbook_post, methods=["POST"]),
        Route(f"{api}/playbook/{{id}}", playbook_put, methods=["PUT"]),
        Route(f"{api}/playbook/{{id}}", playbook_delete, methods=["DELETE"]),
        Route(f"{api}/escalations", escalations_get),
        Route(f"{api}/escalations", escalation_post, methods=["POST"]),
        Route(f"{api}/escalations/{{id}}/answer", escalation_answer, methods=["POST"]),
        Route(f"{api}/team", team_get),
        Route(f"{api}/team", team_post, methods=["POST"]),
        Route(f"{api}/team/{{id}}", team_patch, methods=["PATCH"]),
        Route(f"{api}/devices", devices_get),
        Route(f"{api}/audit", audit_get),
        Route(f"{api}/devices/{{id}}", device_delete, methods=["DELETE"]),
        Route("/api/owner/login", owner_login, methods=["POST"]),
        Route("/api/owner/logout", owner_logout, methods=["POST"]),
        Route("/api/owner/me", owner_route(o_me)),
        Route("/api/owner/stats", owner_route(o_stats)),
        Route("/api/owner/audit", owner_route(o_audit)),
        Route("/api/owner/password", owner_route(o_password, mutating=True), methods=["POST"]),
        Route("/api/owner/companies", owner_route(o_companies)),
        Route(
            "/api/owner/companies", owner_route(o_company_create, mutating=True), methods=["POST"]
        ),
        Route("/api/owner/companies/{id}", owner_route(o_company)),
        Route(
            "/api/owner/companies/{id}",
            owner_route(o_company_patch, mutating=True),
            methods=["PATCH"],
        ),
        Route(
            "/api/owner/companies/{id}",
            owner_route(o_company_delete, mutating=True),
            methods=["DELETE"],
        ),
        Route("/api/owner/users/{id}/reset", owner_route(o_reset, mutating=True), methods=["POST"]),
        Route(
            "/api/owner/users/{id}/active",
            owner_route(o_user_active, mutating=True),
            methods=["POST"],
        ),
        Route(
            "/api/owner/devices/{id}",
            owner_route(o_device_delete, mutating=True),
            methods=["DELETE"],
        ),
        Route("/owner", owner_page),
        Route("/owner/{file}", owner_page),
        Route("/{path:path}", static),
    ]
    return Headers(Starlette(routes=routes))


class Headers:
    """Security headers everywhere; CORS (and preflight) on the app API only."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        cors = path.startswith("/api/v1/")
        if cors and scope["method"] == "OPTIONS":
            response = Response(status_code=204, headers=CORS_HEADERS)
            await response(scope, receive, send)
            return
        extra = dict(COMMON_HEADERS)
        if cors:
            extra.update(CORS_HEADERS)
        encoded = [(k.lower().encode(), v.encode()) for k, v in extra.items()]

        async def send_with(message: Any) -> None:
            if message["type"] == "http.response.start":
                present = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = [
                    *message.get("headers", []),
                    *[(k, v) for k, v in encoded if k not in present],
                ]
            await send(message)

        await self.app(scope, receive, send_with)
