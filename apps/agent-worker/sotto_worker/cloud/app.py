"""HTTP API of the management server (D-022).

/api/v1/*    the client apps: bearer token per device, CORS open (no cookies, so no CSRF).
/api/owner/* the owner dashboard: HttpOnly SameSite=Strict cookie, same origin only.
/owner       the dashboard page; everything else serves the web app (the same client, D-022).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import mimetypes
import re
import secrets
import time
from collections import OrderedDict, deque
from collections.abc import AsyncIterator, Awaitable, Callable
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

from sotto_worker.adapters.email.smtp import Outgoing, send_mail
from sotto_worker.cloud import bugreports
from sotto_worker.cloud import github as github_mod
from sotto_worker.cloud.bundle import Seed, build_bundle
from sotto_worker.cloud.coaching import routes as coaching_routes
from sotto_worker.cloud.coaching.store import CoachingStore
from sotto_worker.cloud.email import attachments as email_attachments
from sotto_worker.cloud.email import data as email_data
from sotto_worker.cloud.email import routes as email_routes
from sotto_worker.cloud.export.routes import weekly_export_job
from sotto_worker.cloud.features import FeatureUnavailable
from sotto_worker.cloud.gallabox import routes as gallabox_routes
from sotto_worker.cloud.gallabox import webhook as gallabox_webhook
from sotto_worker.cloud.learning import routes as learning_routes
from sotto_worker.cloud.learning.store import LearningStore
from sotto_worker.cloud.mail import render_escalation, send_with_retries
from sotto_worker.cloud.metering.store import Metering
from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.owner import routes as owner_routes
from sotto_worker.cloud.recordings import KINDS, Recordings
from sotto_worker.cloud.routing.job import weekly as routing_weekly
from sotto_worker.cloud.scheduler import routes as followup_routes
from sotto_worker.cloud.scheduler.runner import DAY_MS, Scheduler
from sotto_worker.cloud.store import EMAIL as EMAIL_SHAPE
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms, plan_state
from sotto_worker.cloud.zoho import routes as zoho_routes
from sotto_worker.cloud.zoho import webhooks as zoho_webhooks
from sotto_worker.outbox import EmailMessage, EmailSender
from sotto_worker.server.catalog import apply_overrides

MAX_BODY = 16 * 1024
OWNER_COOKIE = "sotto_owner"
OWNER_DIR = Path(__file__).parent / "owner"
FONT_DIR = OWNER_DIR / "fonts"
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
RECORDING_FIELDS = ("id", "started_at", "duration_s", "recording_bytes", "source", "email", "name")
AFTER_CALL = ("call_review", "follow_up")  # features that use the after-call (summary) model
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
    zoho_transport: httpx.AsyncBaseTransport | None = None  # tests: a mocked Zoho
    smtp_sender: email_routes.Sender | None = None  # tests: a local fake SMTP server
    gallabox_transport: httpx.AsyncBaseTransport | None = None  # tests: a mocked Gallabox
    github_transport: httpx.AsyncBaseTransport | None = None  # tests: a mocked GitHub API
    run_scheduler: bool = False  # T-081: `serve` starts the in-process runner; tests tick by hand
    clock: Callable[[], int] = field(default=now_ms)  # ms; tests inject a fake clock


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


def create_cloud_app(config: CloudConfig, store: CloudStore, seed: Seed) -> Headers:
    # Only FAILED sign-ins count, so real users cannot be locked out by volume alone; the owner
    # has a limiter of its own, so a flood on the app login never locks the owner out.
    login_limit = RateLimit(per_key=10, total=300, window_s=600)
    owner_limit = RateLimit(per_key=10, total=50, window_s=600)
    password_limit = RateLimit(per_key=5, total=500, window_s=600)
    escalation_limit = RateLimit(per_key=60, total=5000, window_s=3600)
    signup_limit = RateLimit(per_key=5, total=60, window_s=3600)
    token_limit = RateLimit(per_key=60, total=2000, window_s=3600)
    refresh_limit = RateLimit(per_key=30, total=3000, window_s=600)  # failures only
    zoho_limit = RateLimit(per_key=60, total=6000, window_s=60)  # org's daily Zoho credits
    send_limit = RateLimit(per_key=10, total=600, window_s=60)  # email + WhatsApp sends
    # UX-39 (draft D-053 (backlog)): reset requests, per address and per client (counted on every
    # request).
    # No small global cap: it would let anyone switch resets off for everyone (security review).
    reset_limit = RateLimit(per_key=5, total=1_000_000, window_s=3600)  # per address
    reset_client_limit = RateLimit(per_key=20, total=1_000_000, window_s=3600)  # per client
    reset_guess_limit = RateLimit(per_key=5, total=1_000_000, window_s=3600)  # failed confirms
    # ZC-06: each person reports failures at most this often; ZC-10: Zoho Forms sign-ups per
    # client address and in total (abuse cap: the owner rotates the secret if it leaks).
    failure_report_limit = RateLimit(per_key=30, total=20_000, window_s=3600)
    hook_limit = RateLimit(per_key=10, total=200, window_s=3600)
    hook_secret_limit = RateLimit(per_key=10, total=1_000_000, window_s=3600)  # failures only
    zoho_notify_limit = RateLimit(per_key=60, total=100_000, window_s=60)  # per Zoho channel
    # Round 3 (D-087): OTP requests and guesses, per address and per client (counted on every
    # request, like the reset flow); the CRM's new-company calls, per client address.
    otp_limit = RateLimit(per_key=5, total=1_000_000, window_s=3600)  # per address
    otp_client_limit = RateLimit(per_key=20, total=1_000_000, window_s=3600)  # per client
    otp_guess_limit = RateLimit(per_key=5, total=1_000_000, window_s=3600)  # failed verifies
    crm_limit = RateLimit(per_key=10, total=200, window_s=3600)
    minter = config.stt_minter or mint_stt_token
    learning = LearningStore(store)
    tester = config.key_tester or list_models
    stt_key_env = {"assemblyai": "ASSEMBLYAI_API_KEY", "speechmatics": "SPEECHMATICS_API_KEY"}
    static_root = config.static_dir.resolve() if config.static_dir else None
    scheduler = Scheduler(store, clock=config.clock, log=config.log)
    coaching = CoachingStore(store)

    async def digest_job(now: int) -> None:
        await coaching_routes.weekly_digest_job(
            coaching,
            learning,
            prompts=seed.prompts,
            origin=config.public_origin or "http://localhost:8788",
            mailer=config.mailer,
            now=now,
        )

    # T-080's hook: safe to call more often than weekly, so once a day is enough.
    scheduler.register("coaching_weekly_digest", DAY_MS, digest_job)
    zoho_watch = zoho_webhooks.ZohoWatch(store, transport=config.zoho_transport, log=config.log)
    notify_url = (
        f"{(config.public_origin or 'http://localhost:8788').rstrip('/')}/api/hooks/zoho/notify"
    )

    async def zoho_watch_job(now: int) -> None:
        # INT-13: channels last at most a week; renew the ones that end within two days.
        await zoho_watch.renew_all(notify_url, now)

    scheduler.register("zoho_watch_renewal", 6 * 3600 * 1000, zoho_watch_job)
    # ZC-12 (T-083 hub lines 1-4): spend caps are enforced on key and STT-token delivery, and
    # the owner gets one email per company, month and level (80 %, 100 %).
    metering = Metering(store, seed)

    async def notify_owner(subject: str, text: str) -> None:
        if config.mailer is None:
            config.log(f"spend alert (no platform mailbox): {subject}")
            return
        key = hashlib.sha256(subject.encode()).hexdigest()[:16]
        for r in store._q("SELECT email FROM users WHERE role = 'owner'"):
            try:
                await config.mailer.send(
                    EmailMessage(to=str(r["email"]), subject=subject, text=text),
                    idempotency_key=f"spend-{key}",
                )
            except Exception as err:  # the alert row is recorded; the console shows the level
                config.log(f"spend alert email failed: {type(err).__name__}")

    def cap_withheld(company_id: str) -> bool:
        return metering.cap_reached(company_id)

    async def spend_check_job(now: int) -> None:
        await metering.check_all(notify_owner, now)

    async def routing_job(_now: int) -> None:
        # ZC-05: off (a no-op) until the owner sets routing.monthly_cap_usd and golden calls exist.
        await asyncio.to_thread(routing_weekly, store, seed)

    async def purge_keys_job(now: int) -> None:
        platform.purge_retired(store, now)  # ZC-12: retired keys go after their 20 minutes

    async def csv_export_job(_now: int) -> None:
        await asyncio.to_thread(weekly_export_job, store)  # INT-12 (T-082); safe to run daily

    # T-083 hub line 5: the bootstrap's Zoho source uses the Zoho module's own per-person reader.
    zoho_exposed: dict[str, Any] = {}

    async def bootstrap_zoho_call(who: Principal, fn: Callable[[Any], Awaitable[Any]]) -> Any:
        return await zoho_exposed["zoho_call"](who, fn)

    scheduler.register("spend_cap_check", DAY_MS, spend_check_job)
    scheduler.register("routing_weekly", 7 * DAY_MS, routing_job)
    scheduler.register("key_rotation_purge", 3600 * 1000, purge_keys_job)
    scheduler.register("zoho_csv_weekly", 7 * DAY_MS, csv_export_job)

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
        "zoho_no_client": HTTPStatus.CONFLICT,
        "zoho_not_connected": HTTPStatus.CONFLICT,
        "zoho_reconnect": HTTPStatus.CONFLICT,
        "zoho_unavailable": HTTPStatus.BAD_GATEWAY,
        "in_flight": HTTPStatus.CONFLICT,
        "zoho_unknown": HTTPStatus.CONFLICT,
        "taken": HTTPStatus.CONFLICT,
        "email_failed": HTTPStatus.BAD_GATEWAY,
        "in_progress": HTTPStatus.CONFLICT,
        "gallabox_no_credentials": HTTPStatus.CONFLICT,
        "gallabox_auth": HTTPStatus.BAD_GATEWAY,
        "gallabox_unavailable": HTTPStatus.BAD_GATEWAY,
        "whatsapp_blocked": HTTPStatus.BAD_GATEWAY,
        "freeform_disabled": HTTPStatus.FORBIDDEN,
        "rate_limited": HTTPStatus.TOO_MANY_REQUESTS,
        "too_few_ratings": HTTPStatus.CONFLICT,
        "not_rateable": HTTPStatus.UNPROCESSABLE_ENTITY,
        "benchmark_failed": HTTPStatus.CONFLICT,
        "untested": HTTPStatus.CONFLICT,
        "not_sent": HTTPStatus.CONFLICT,
        "otp_invalid": HTTPStatus.BAD_REQUEST,
        "otp_expired": HTTPStatus.BAD_REQUEST,
        "github_not_configured": HTTPStatus.CONFLICT,
        "github_auth": HTTPStatus.BAD_GATEWAY,
        "github_not_found": HTTPStatus.NOT_FOUND,
        "github_unavailable": HTTPStatus.BAD_GATEWAY,
        # ZC-04 bootstrap (T-083 hub line 6)
        "consent_required": HTTPStatus.CONFLICT,
        "off_domain": HTTPStatus.UNPROCESSABLE_ENTITY,
        "private_address": HTTPStatus.UNPROCESSABLE_ENTITY,
    }

    def handle(
        fn: Callable[[Request], Awaitable[Response]],
    ) -> Callable[[Request], Awaitable[Response]]:
        async def wrapped(request: Request) -> Response:
            try:
                return await fn(request)
            except CloudError as e:
                return fail(STATUS.get(e.code, HTTPStatus.BAD_REQUEST), e.code, str(e))
            except FeatureUnavailable as e:
                return JSONResponse(
                    {
                        "error": "feature_unavailable",
                        "code": "feature_unavailable",
                        "feature": e.feature,
                        **e.effective.out(),
                    },
                    status_code=HTTPStatus.FORBIDDEN,
                )

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
                header = request.headers.get("authorization", "")
                reason = store.ended_reason(
                    header[7:].strip() if header.startswith("Bearer ") else None
                )
                return fail(HTTPStatus.UNAUTHORIZED, reason, "sign in again")
            if who.must_change and request.url.path not in FIRST_PASSWORD_PATHS:
                return fail(
                    HTTPStatus.FORBIDDEN, "change_password", "choose your own password first"
                )
            return await fn(request, who)

        return wrapped

    def platform_of(request: Request) -> str:
        return request.headers.get("x-sotto-platform", "unknown")[:20]

    def session_out(tokens: dict[str, Any]) -> dict[str, Any]:
        principal = store.principal(str(tokens["token"]), kind="app")
        if principal is None:
            raise CloudError("signed_out", "sign in again")
        return {**tokens, **store.me(principal)}

    def open_app_session(user: Any, data: dict[str, Any]) -> dict[str, Any]:
        """0.3.0+ apps ask for a refresh-token pair (D-029); 0.2.0 apps, which send nothing,
        still get their one 30-day token so they keep working until they update."""
        device = data.get("device") if isinstance(data.get("device"), dict) else {}
        if data.get("session") == "pair":
            return session_out(store.open_pair(user, device=device or {}))
        return session_out({"token": store.open_session(user, kind="app", device=device or {})})

    @handle
    async def refresh(request: Request) -> Response:
        if refresh_limit.blocked(ip_key(request)):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        data = await body(request)
        pair = store.refresh(str(data.get("refresh_token", "")), ip=ip_of(request))
        if isinstance(pair, str):
            refresh_limit.record(ip_key(request))
            return fail(HTTPStatus.UNAUTHORIZED, pair, "sign in again")
        return JSONResponse(pair, headers={"Cache-Control": "no-store"})

    @handle
    async def migrate(request: Request) -> Response:
        # Not app_route: a repeat call comes with a 0.2.0 token whose session is a pair already.
        header = request.headers.get("authorization", "")
        token = header[7:].strip() if header.startswith("Bearer ") else ""
        if refresh_limit.blocked(ip_key(request)):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        pair = store.migrate_token(token)
        if isinstance(pair, str):
            refresh_limit.record(ip_key(request))
            return fail(HTTPStatus.UNAUTHORIZED, pair, "sign in again")
        return JSONResponse(pair, headers={"Cache-Control": "no-store"})

    @app_route
    async def features_get(_request: Request, who: Principal) -> Response:
        return JSONResponse(
            # learned_version: a changed list makes the app reload the bundle between calls.
            # health: ZC-14 (draft D-057 (backlog)), one org status refreshed on the same cycle as
            # the features.
            {
                "features": store.features_for(who),
                "learned_version": learning.version_of(who),
                "health": store.config_health(who),
                # ZC-06: vendors demoted for everyone; a change makes the app reload the bundle.
                "demoted": platform.demotions(store),
            },
            headers={"Cache-Control": "no-store"},
        )

    @app_route
    async def call_brief_put(request: Request, who: Principal) -> Response:
        """The structured pre-call brief, saved with the call (R10, T-056)."""
        store.require_feature(who, "prep")
        data = await body(request)
        brief = data.get("brief")
        if not isinstance(brief, dict):
            raise CloudError("invalid", "send the brief")
        store.save_call_brief(who, request.path_params["call_id"], brief)
        return JSONResponse({"ok": True})

    @app_route
    async def call_brief_get(request: Request, who: Principal) -> Response:
        store.require_feature(who, "prep")
        return JSONResponse({"brief": store.call_brief(who, request.path_params["call_id"])})

    @app_route
    async def company_defaults_get(_request: Request, who: Principal) -> Response:
        return JSONResponse(store.company_defaults(who), headers={"Cache-Control": "no-store"})

    @app_route
    async def company_defaults_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        return JSONResponse(store.set_company_defaults(who, data, ip=ip_of(request)))

    pending_resets: set[asyncio.Task[None]] = set()

    async def send_reset(user: Any, token: str, origin: str) -> None:
        """The reset email, from the org's mailbox, else the platform's (the existing path)."""
        link = f"{origin}/reset-password#token={token}"  # a fragment: never in server logs
        subject = "Reset your AGN Sales Shield password"
        text = (
            "Someone asked to reset the password for this AGN Sales Shield account.\n\n"
            f"Choose a new password here (the link works once, for 30 minutes):\n{link}\n\n"
            "If it was not you, ignore this email; your password stays the same."
        )
        try:
            scope = email_data.active_scope(store, str(user["company_id"]))
            account = email_data.account(store, scope) if scope else None
            if account is not None:
                await (config.smtp_sender or send_mail)(
                    account,
                    Outgoing(
                        to=(str(user["email"]),),
                        cc=(),
                        subject=subject,
                        text=text,
                        message_id_seed=f"reset-{token[:12]}",
                    ),
                )
            elif config.mailer is not None:
                await config.mailer.send(
                    EmailMessage(to=str(user["email"]), subject=subject, text=text),
                    idempotency_key=f"reset-{token[:12]}",
                )
            else:
                config.log("password reset: no mailbox is set up")
        except Exception as err:  # the person can ask again; never leak why
            config.log(f"password reset email failed: {type(err).__name__}")

    async def reset_in_background(email: str, ip: str) -> None:
        found = await asyncio.to_thread(store.reset_request, email, ip=ip)
        if found is not None:
            # The link uses the configured public origin, never the request's Host header.
            await send_reset(found[1], found[0], config.public_origin or "http://localhost:8788")

    # --- Round 3: platform mail (D-087/D-089) ----------------------------------------------------
    async def send_platform_mail(
        to_email: str, subject: str, text: str, *, idempotency_key: str
    ) -> bool:
        """Sends from the platform mailbox: the DB platform SMTP scope first (the canonical
        sender, D-089), else the legacy file-based mailer. Returns False when no mailbox is
        set up; never raises — a missing mailbox must not break a signup."""
        try:
            account = email_data.account(store, email_data.PLATFORM)
            if account is not None:
                await (config.smtp_sender or send_mail)(
                    account,
                    Outgoing(
                        to=(to_email,),
                        cc=(),
                        subject=subject,
                        text=text,
                        message_id_seed=idempotency_key[:60],
                    ),
                )
                return True
            if config.mailer is not None:
                await config.mailer.send(
                    EmailMessage(to=to_email, subject=subject, text=text),
                    idempotency_key=idempotency_key[:60],
                )
                return True
            config.log(f"platform mail (no mailbox): {subject} -> {to_email}")
            return False
        except Exception as err:  # the person can ask again; never leak why
            config.log(f"platform mail failed: {type(err).__name__}")
            return False

    async def send_otp_email(email: str, code: str) -> bool:
        """The 6-digit sign-in code, from the platform sender. The idempotency key is random:
        the code itself must never appear in a Message-ID or a mail log."""
        return await send_platform_mail(
            email,
            "Your AGN Sales Shield sign-in code",
            "Your AGN Sales Shield sign-in code is:\n\n"
            f"{code}\n\n"
            "It works once, for 10 minutes. Enter it in the app to sign in.\n\n"
            "If it was not you, ignore this email.",
            idempotency_key=f"otp-{secrets.token_hex(8)}",
        )

    def welcome_subject(language: str) -> str:
        return "مرحباً بك في AGN Sales Shield" if language == "ar" else "Welcome to AGN Sales Shield"

    def welcome_text(name: str, company: str, *, otp_code: str | None, language: str) -> str:
        """The welcome email (D-087): what the product is, how to sign in the first time, where
        the apps are. The support contact is the sender address itself — reply to the email —
        so no address is hardcoded here. The AR version is used when the CRM says the
        customer reads Arabic."""
        origin = (config.public_origin or "http://localhost:8788").rstrip("/")
        if language == "ar":
            sign_in = (
                f"رمز تسجيل الدخول الأول الخاص بك هو {otp_code}. يعمل مرة واحدة ولمدة 10 دقائق. "
                "أدخله في التطبيق ثم اختر كلمة المرور الخاصة بك."
                if otp_code
                else "سجّل الدخول باستخدام البريد الإلكتروني وكلمة المرور اللذين اخترتهما."
            )
            return (
                f"مرحباً {name or 'بك'}،\n\n"
                f"مرحباً بك في AGN Sales Shield — مساعدك الذكي لمكالمات المبيعات جاهز الآن "
                f"لشركة {company}.\n\n"
                f"{sign_in}\n\n"
                f"لتنزيل التطبيقات: {origin}/downloads/\n\n"
                "إذا لم تكن أنت من سجّل، تجاهل هذه الرسالة.\n\n"
                "للأسئلة، ما عليك سوى الرد على هذه الرسالة.\n\n"
                "— فريق AGN Sales Shield"
            )
        sign_in = (
            f"Your first sign-in code is {otp_code}. It works once, for 10 minutes. "
            "Enter it in the app, then choose your own password."
            if otp_code
            else "Sign in with the email address and password you chose."
        )
        return (
            f"Hello {name or 'there'},\n\n"
            f"Welcome to AGN Sales Shield — your AI copilot for sales calls is ready "
            f"for {company}.\n\n"
            f"{sign_in}\n\n"
            f"Get the apps: {origin}/downloads/\n\n"
            "If you did not sign up, ignore this email.\n\n"
            "Questions? Just reply to this email.\n\n"
            "— AGN Sales Shield"
        )

    pending_welcome: set[asyncio.Task[Any]] = set()

    async def send_welcome_in_background(
        email: str, name: str, company: str, *, otp_code: str | None, language: str
    ) -> None:
        await send_platform_mail(
            email,
            welcome_subject(language),
            welcome_text(name, company, otp_code=otp_code, language=language),
            idempotency_key=f"welcome-{email}",
        )

    def welcome_later(
        email: str, name: str, company: str, *, otp_code: str | None, language: str
    ) -> None:
        """Sends the welcome email in the background; a missing mailbox never blocks signup."""
        task = asyncio.create_task(
            send_welcome_in_background(email, name, company, otp_code=otp_code, language=language)
        )
        pending_welcome.add(task)
        task.add_done_callback(pending_welcome.discard)

    @handle
    async def reset_request(request: Request) -> Response:
        data = await body(request)
        email = str(data.get("email", "")).strip().lower()[:254]
        by_client = reset_client_limit.hit(ip_key(request))
        if not (reset_limit.hit("email:" + email) and by_client):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        if EMAIL_SHAPE.match(email):
            # Look-up, token and mail all happen in the background, so a known address answers
            # exactly like an unknown one (no timing difference; security review).
            task = asyncio.create_task(reset_in_background(email, ip_of(request)))
            pending_resets.add(task)
            task.add_done_callback(pending_resets.discard)
        return JSONResponse(
            {"ok": True, "message": "If that address has an account, we sent a reset link."},
            headers={"Cache-Control": "no-store"},
        )

    @handle
    async def reset_confirm(request: Request) -> Response:
        if reset_guess_limit.blocked(ip_key(request)):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        data = await body(request)
        try:
            store.reset_confirm(
                str(data.get("token", "")), str(data.get("password", "")), ip=ip_of(request)
            )
        except CloudError as e:
            if e.code == "reset_invalid":
                reset_guess_limit.record(ip_key(request))  # guessing tokens costs the client
            raise
        return JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})

    @app_route
    async def company_features_get(_request: Request, who: Principal) -> Response:
        return JSONResponse({"features": store.company_features(who)})

    @app_route
    async def company_feature_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        store.set_company_feature(
            who, request.path_params["id"], data.get("enabled"), ip=ip_of(request)
        )
        return JSONResponse({"features": store.company_features(who)})

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
        # Round 3 (D-087): the welcome email, in the background; a missing mailbox never
        # blocks the signup. Self-signup already has a password, so no OTP is mentioned.
        welcome_later(
            str(data.get("email", "")),
            str(data.get("name", "")),
            str(data.get("company", "")),
            otp_code=None,
            language="ar" if str(data.get("language", "")) == "ar" else "en",
        )
        return JSONResponse(open_app_session(user, data), status_code=HTTPStatus.CREATED)

    # --- Round 3: the CRM's new-company API + OTP (D-087) ---------------------------------------
    @handle
    async def crm_create_company(request: Request) -> Response:
        """The CRM calls this after a Zoho Billing signup: one shared secret, then the company
        + first admin are created and the welcome email + OTP go out in the background."""
        if not crm_limit.hit(ip_key(request)):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        if not store.crm_secret_ok(request.headers.get("x-agn-signup-secret")):
            return fail(HTTPStatus.UNAUTHORIZED, "bad_secret", "unknown caller")
        data = await body(request)
        email = str(data.get("admin_email", "")).strip().lower()
        language = "ar" if str(data.get("language", "")) == "ar" else "en"
        created = store.create_company_from_crm(
            company=str(data.get("company_name", "")),
            admin_name=str(data.get("admin_name", "")),
            admin_email=email,
            zoho_plan_code=str(data.get("zoho_plan_code", "")),
            trial=bool(data.get("trial", True)),
            ip=ip_of(request),
        )
        if created is None:
            # Duplicate address: no-op, like the Forms path (200, nothing new created).
            return JSONResponse(
                {
                    "company_id": None,
                    "admin_email": email,
                    "otp_sent": False,
                    "duplicate": True,
                }
            )
        company_id, _admin_id = created
        code = store.request_otp(email, "signup", ip=ip_of(request))
        sender_ready = (
            email_data.account(store, email_data.PLATFORM) is not None or config.mailer is not None
        )
        if code is not None and sender_ready:
            welcome_later(
                email,
                str(data.get("admin_name", "")),
                str(data.get("company_name", "")),
                otp_code=code,
                language=language,
            )
            task = asyncio.create_task(send_otp_email(email, code))
            pending_welcome.add(task)
            task.add_done_callback(pending_welcome.discard)
        return JSONResponse(
            {
                "company_id": company_id,
                "admin_email": email,
                "otp_sent": bool(code) and sender_ready,
            },
            status_code=HTTPStatus.CREATED,
        )

    async def otp_in_background(email: str, code: str) -> None:
        await send_otp_email(email, code)

    @handle
    async def otp_request(request: Request) -> Response:
        data = await body(request)
        email = str(data.get("email", "")).strip().lower()[:254]
        purpose = str(data.get("purpose", "login"))
        if purpose not in ("signup", "login"):
            purpose = "login"
        by_client = otp_client_limit.hit(ip_key(request))
        if not (otp_limit.hit("email:" + email) and by_client):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        if EMAIL_SHAPE.match(email):
            # The code is minted here, synchronously — like the CRM handler mints its
            # signup code — and only the mail goes to the background. Minting through
            # asyncio.to_thread loses a race in the test harness: the per-request
            # portal closes once the response body is read, and a task still waiting
            # on its worker thread never resumes, so the mail is never sent. (In
            # production the loop lives forever and either form works; the sync mint
            # is the shape that works in both.)
            code = store.request_otp(email, purpose, ip=ip_of(request))
            if code is not None:
                task = asyncio.create_task(otp_in_background(email, code))
                pending_resets.add(task)
                task.add_done_callback(pending_resets.discard)
        return JSONResponse(
            {"ok": True, "message": "If that address has an account, we sent a code."},
            headers={"Cache-Control": "no-store"},
        )

    @handle
    async def otp_verify(request: Request) -> Response:
        data = await body(request)
        email = str(data.get("email", "")).strip().lower()
        key = ip_key(request) + "|" + email
        if otp_guess_limit.blocked(key):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many tries; wait")
        try:
            user = store.verify_otp(
                email,
                str(data.get("code", "")),
                str(data.get("purpose", "login")),
                ip=ip_of(request),
            )
        except CloudError as e:
            if e.code == "otp_invalid":
                otp_guess_limit.record(key)  # guessing codes costs the client
            raise
        out = open_app_session(user, data)
        out["must_change"] = bool(user["must_change_pw"])
        return JSONResponse(out, headers={"Cache-Control": "no-store"})

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
        return JSONResponse(open_app_session(user, data))

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

    # --- Round 3: client billing + bug reports (D-086/D-090) -------------------------------------
    @app_route
    async def billing_get(_request: Request, who: Principal) -> Response:
        return JSONResponse(store.billing_info(who), headers={"Cache-Control": "no-store"})

    @app_route
    async def bug_report_post(request: Request, who: Principal) -> Response:
        data = await body(request)
        # The upload answers with an absolute URL; the store keeps the relative
        # path only (external hosts are rejected there), so strip our own origin.
        shot = str(data.get("screenshot_url", ""))
        origin = (config.public_origin or "http://localhost:8788").rstrip("/")
        if shot.startswith(origin + "/api/v1/issue-attachments/"):
            shot = shot[len(origin) :]
        report_id = store.create_bug_report(
            who,
            title=str(data.get("title", "")),
            description=str(data.get("description", "")),
            page_url=str(data.get("page_url", "")),
            screenshot_url=shot,
            ip=ip_of(request),
        )
        return JSONResponse({"id": report_id}, status_code=HTTPStatus.CREATED)

    # Screenshot uploads take a raw image body (not multipart: python-multipart is not a
    # dependency of this server, and the recordings upload already streams raw bytes the
    # same way). The client sends the Blob with Content-Type image/png (or jpeg/webp/gif).
    ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
    ATTACHMENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

    @handle
    async def attachment_upload(request: Request) -> Response:
        """A screenshot for an issue/bug report, from a signed-in app user or the owner. The
        answer is a public, unguessable URL — that is what goes into the GitHub issue."""
        who = bearer(request)
        if who is None:
            cookie = request.cookies.get(OWNER_COOKIE)
            owner = store.principal(cookie, kind="owner") if cookie else None
            if owner is None or not owner.is_owner:
                return fail(HTTPStatus.UNAUTHORIZED, "signed_out", "sign in again")
        content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
        if content_type not in ATTACHMENT_TYPES:
            raise CloudError("invalid", "send a PNG, JPEG, WebP or GIF image")
        data = b""
        async for chunk in request.stream():
            data += chunk
            if len(data) > ATTACHMENT_MAX_BYTES:
                raise CloudError("too_large", "screenshot is too large (max 5 MB)")
        if not data:
            raise CloudError("invalid", "send an image")
        token = secrets.token_hex(16)
        store.save_issue_attachment(token, content_type, data)
        origin = (config.public_origin or "http://localhost:8788").rstrip("/")
        return JSONResponse(
            {"url": f"{origin}/api/v1/issue-attachments/{token}"},
            status_code=HTTPStatus.CREATED,
        )

    @handle
    async def attachment_get(request: Request) -> Response:
        """Serves one attachment, no sign-in: the 32-hex token is the whole secret, and there
        is no listing. Image bytes only, immutable."""
        token = request.path_params["token"]
        if not re.fullmatch(r"[a-f0-9]{32}", token):
            return PlainTextResponse("not found\n", status_code=404)
        found = store.issue_attachment(token)
        if found is None:
            return PlainTextResponse("not found\n", status_code=404)
        content_type, blob = found
        return Response(
            content=blob,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    def needed_keys(who: Principal) -> set[str]:
        """The model keys the company's current routes use. Speech keys never leave the server:
        devices get short-lived tokens for them instead (security review H1). The after-call
        model's key goes only to people who may review or draft follow-ups (D-036)."""
        cseed = platform.company_seed(store, seed, who.company)
        routing = apply_overrides(
            cseed.routing, cseed.catalog, platform.effective_routes(store, who.company)
        )
        stages = ["suggest", "suggest_backup"]
        if any(store.feature_state(who, f).state == "available" for f in AFTER_CALL):
            stages.append("summary")
        names: set[str] = set()
        for stage in stages:
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
        settings = store.settings(who.company)
        if not store.org_feature_on(who.company, "ai_knowledge"):
            settings.pop("context", None)  # D-036: the knowledge is withheld, not just hidden
        settings.update(store.text_defaults(who.company))  # ZC-11c tone and call goal
        out = build_bundle(
            platform.company_seed(store, seed, who.company),
            company_name=str(company["name"]),
            settings=settings,
            routes=platform.effective_routes(store, who.company),
            prompts=platform.effective_prompts(store, seed, who.company),
            demoted=platform.demotions(store),
            own_playbook=store.playbook(who.company),
            keys=(
                store.keys_for_call(
                    who,
                    needed_keys(who),
                    ip=ip_of(_request),
                    platform_withheld=cap_withheld(who.company),
                )
                if state["can_call"]
                else None
            ),
        )
        out["plan"] = state
        out["key_status"] = store.key_status(who)
        out["features"] = store.features_for(who)
        out["learned"] = learning.active_for_call(who)  # R11: applies from the next call
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
        withheld = cap_withheld(who.company)
        if withheld and not platform.byo_on(store, who.company):
            raise CloudError("plan_blocked", "this month's AI budget is used up; AGN is notified")
        if not token_limit.hit(who.user_id):
            return fail(HTTPStatus.TOO_MANY_REQUESTS, "rate_limited", "too many calls started")
        key = store.effective_key(who, stt_key_env[vendor], platform_withheld=withheld)
        if not key:
            if withheld:
                raise CloudError("plan_blocked", "this month's AI budget is used up")
            raise CloudError("no_key", f"no {vendor} key is set up; ask AGN support")
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
        await metering.check(who.company, notify_owner)  # ZC-12: 80 % / 100 % alerts, once each
        return JSONResponse({"ok": True, "id": call_id})

    def recordings_on() -> Recordings:
        if config.recordings is None:
            raise CloudError("not_found", "recordings are not kept on this server")
        return config.recordings

    @app_route
    async def review_post(request: Request, who: Principal) -> Response:
        store.require_feature(who, "call_review")
        review = store.set_review(who, request.path_params["call_id"], await body(request))
        return JSONResponse({"ok": True, "review": review})

    @app_route
    async def recording_put(request: Request, who: Principal) -> Response:
        store.require_feature(who, "recordings")
        rec = recordings_on()
        call_id = store.recording_call(who, request.path_params["call_id"], upload=True)
        size = await rec.save(who.company, call_id, request.stream())
        store.set_recording(who, call_id, size)
        rec.prune()
        return JSONResponse({"ok": True, "bytes": size})

    @app_route
    async def recording_get(request: Request, who: Principal) -> Response:
        store.require_feature(who, "recordings")
        rec = recordings_on()
        call_id = store.recording_call(who, request.path_params["call_id"], upload=False)
        path = rec.path(who.company, call_id)
        if not path.exists():
            raise CloudError("not_found", "no recording for this call")
        return FileResponse(
            path, media_type=KINDS[path.suffix], headers={"Cache-Control": "private"}
        )

    @app_route
    async def company_usage(request: Request, who: Principal) -> Response:
        # The same call list serves Reports and Admin → Recordings; each needs its own feature.
        purpose = "recordings" if request.query_params.get("for") == "recordings" else "reports"
        store.require_feature(who, purpose)
        days = request.query_params.get("days", "30")
        span = int(days) if days in ("7", "30", "90") else 30
        calls = store.company_usage(who, span)
        if purpose == "recordings":  # only what the recordings list needs (security review M1)
            keep: tuple[str, ...] = RECORDING_FIELDS
            if store.feature_state(who, "reports").state == "available":
                keep = (*RECORDING_FIELDS, "review")
            calls = [
                {k: c[k] for k in keep if k in c}
                for c in calls
                if (c.get("recording_bytes") or 0) > 0
            ]
        return JSONResponse({"calls": calls})

    @app_route
    async def settings_get(_request: Request, who: Principal) -> Response:
        who.require("admin")
        settings = store.settings(who.company)
        if not store.org_feature_on(who.company, "ai_knowledge"):
            settings.pop("context", None)  # withheld, not just hidden (D-036)
        return JSONResponse({"settings": settings})

    @app_route
    async def settings_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        if "context" in data:
            store.require_feature(who, "ai_knowledge")
        store.set_settings(who, data, ip=ip_of(request))
        return JSONResponse({"settings": store.settings(who.company)})

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

    def public_origin_of(request: Request) -> str:
        """This request's origin, https when the server is public (behind Caddy). The Zoho
        callback answers on whichever host the app signed in to (sslip now, the domain later)."""
        origin = own_origin(request)
        if (config.public_origin or "").startswith("https://") and origin.startswith("http://"):
            origin = "https://" + origin[len("http://") :]
        return origin

    def hook_origin(request: Request) -> str:
        """Webhook URLs (Gallabox, Zoho) use the configured origin, never the Host header."""
        return config.public_origin or public_origin_of(request)

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

    async def o_features(_r: Request, _who: Principal) -> Response:
        return JSONResponse(store.owner_features())

    async def o_entitlements(r: Request, who: Principal) -> Response:
        store.owner_set_entitlements(who, r.path_params["id"], await body(r), ip=ip_of(r))
        return JSONResponse(store.owner_features())

    async def o_kill(r: Request, who: Principal) -> Response:
        killed = (await body(r)).get("killed")
        store.owner_set_kill(who, r.path_params["id"], killed, ip=ip_of(r))
        return JSONResponse(store.owner_features())

    async def o_audit(_r: Request, _who: Principal) -> Response:
        return JSONResponse({"items": store.owner_audit()})

    async def o_password(r: Request, who: Principal) -> Response:
        data = await body(r)
        store.change_password(who, str(data.get("current", "")), str(data.get("new", "")))
        return JSONResponse({"ok": True})

    async def send_invite(email: str, name: str, token: str) -> None:
        """ZC-10: the first admin's invite, from AGN's platform mailbox (D-065 fallback)."""
        origin = config.public_origin or "http://localhost:8788"
        link = f"{origin}/reset-password#token={token}"  # a fragment: never in server logs
        text = (
            f"Hello {name or 'there'},\n\nYour AGN Sales Shield trial is ready (14 days).\n\n"
            f"Choose your password here (the link works once, for 7 days):\n{link}\n\n"
            "Then sign in with this email address. If you did not sign up, ignore this email."
        )
        if config.mailer is None:
            config.log("signup invite: no platform mailbox is set up")
            return
        await config.mailer.send(
            EmailMessage(to=email, subject="Your AGN Sales Shield trial", text=text),
            idempotency_key=f"invite-{token[:12]}",
        )

    # --- Round 3 (owner): GitHub issues, CRM secret, sender, bug-report review ------------------
    async def o_github_get(_r: Request, _who: Principal) -> Response:
        return JSONResponse(store.github_status(), headers={"Cache-Control": "no-store"})

    async def o_github_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        return JSONResponse(
            store.github_save(
                who,
                repo=str(data.get("repo", "")),
                token=str(data.get("token", "")),
                ip=ip_of(r),
            ),
            headers={"Cache-Control": "no-store"},
        )

    async def o_github_delete(r: Request, who: Principal) -> Response:
        store.github_delete(who, ip=ip_of(r))
        return JSONResponse({"ok": True})

    async def o_github_test(_r: Request, _who: Principal) -> Response:
        return JSONResponse(
            await github_mod.test_repo(store, transport=config.github_transport),
            headers={"Cache-Control": "no-store"},
        )

    async def o_github_issue(r: Request, _who: Principal) -> Response:
        data = await body(r)
        return JSONResponse(
            await github_mod.create_issue(
                store,
                title=str(data.get("title", "")),
                body=str(data.get("body", "")),
                page_url=str(data.get("page_url", "")),
                screenshot_url=str(data.get("screenshot_url") or "") or None,
                transport=config.github_transport,
            ),
            status_code=HTTPStatus.CREATED,
        )

    async def o_crm_secret(r: Request, who: Principal) -> Response:
        """Rotates the CRM's shared secret; the secret is shown once, only its hash is kept."""
        return JSONResponse(
            {"secret": store.rotate_crm_secret(who, ip=ip_of(r))},
            headers={"Cache-Control": "no-store"},
        )

    async def o_sender(_r: Request, _who: Principal) -> Response:
        """The platform sender integration (D-089): the DB platform SMTP scope, with its last
        test result. The legacy file-based mailbox is the fallback for sends, not the sender
        the console shows."""
        return JSONResponse(
            email_data.status(store, None)["platform"], headers={"Cache-Control": "no-store"}
        )

    async def o_bug_reports(r: Request, _who: Principal) -> Response:
        return JSONResponse(
            {"reports": store.bug_reports(r.query_params.get("status"))},
            headers={"Cache-Control": "no-store"},
        )

    async def o_bug_report_patch(r: Request, who: Principal) -> Response:
        return JSONResponse(
            store.update_bug_report(who, r.path_params["id"], await body(r), ip=ip_of(r)),
            headers={"Cache-Control": "no-store"},
        )

    async def o_bug_report_submit(r: Request, _who: Principal) -> Response:
        report = store.bug_report(r.path_params["id"])
        # The store keeps the relative attachment path; GitHub needs the full URL.
        shot = str(report.get("screenshot_url") or "")
        if shot.startswith("/api/v1/issue-attachments/"):
            origin = (config.public_origin or "http://localhost:8788").rstrip("/")
            shot = origin + shot
        created = await github_mod.create_issue(
            store,
            title=bugreports.issue_title(report),
            body=bugreports.issue_body(report),
            page_url=str(report.get("page_url") or ""),
            screenshot_url=shot or None,
            transport=config.github_transport,
        )
        store.mark_bug_report_submitted(report["id"], str(created["issue_url"]))
        return JSONResponse(created, headers={"Cache-Control": "no-store"})

    # --- pages -----------------------------------------------------------------------------------
    async def healthz(_r: Request) -> Response:
        return JSONResponse({"ok": True, "service": "sotto-cloud"})

    async def font_file(request: Request) -> Response:
        # Self-hosted OFL fonts (Inter, IBM Plex Sans Arabic) for the server-rendered pages. Public,
        # immutable, no host guard: the Zoho result pages load them too.
        name = request.path_params["file"]
        target = FONT_DIR / name
        if not re.fullmatch(r"[A-Za-z0-9_.-]+\.woff", name) or not target.is_file():
            return PlainTextResponse("not found\n", status_code=404)
        return FileResponse(
            target,
            media_type="font/woff",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    async def owner_page(request: Request) -> Response:
        if not owner_host_ok(request):
            return PlainTextResponse("not found\n", status_code=404)
        name = request.path_params.get("file") or "index.html"
        if name not in {
            "index.html",
            "company.html",
            "company.js",
            "owner.js",
            "platform.js",
            "owner.css",
            "tokens.css",
            "components.css",
            "fonts.css",
            "favicon.svg",
        }:
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
        Route(f"{api}/companies", crm_create_company, methods=["POST"]),
        Route(f"{api}/auth/otp/request", otp_request, methods=["POST"]),
        Route(f"{api}/auth/otp/verify", otp_verify, methods=["POST"]),
        Route(f"{api}/auth/login", login, methods=["POST"]),
        Route(f"{api}/auth/logout", logout, methods=["POST"]),
        Route(f"{api}/auth/refresh", refresh, methods=["POST"]),
        Route(f"{api}/auth/migrate", migrate, methods=["POST"]),
        Route(f"{api}/auth/reset/request", reset_request, methods=["POST"]),
        Route(f"{api}/auth/reset/confirm", reset_confirm, methods=["POST"]),
        Route(f"{api}/billing", billing_get),
        Route(f"{api}/bug-reports", bug_report_post, methods=["POST"]),
        Route(f"{api}/issue-attachments", attachment_upload, methods=["POST"]),
        Route(f"{api}/issue-attachments/{{token}}", attachment_get),
        Route(f"{api}/company/defaults", company_defaults_get),
        Route(f"{api}/company/defaults", company_defaults_put, methods=["PUT"]),
        Route(f"{api}/features", features_get),
        Route(f"{api}/company/features", company_features_get),
        Route(f"{api}/company/features/{{id}}", company_feature_put, methods=["PUT"]),
        Route(f"{api}/auth/password", change_password, methods=["POST"]),
        Route(f"{api}/me", me),
        Route(f"{api}/bundle", bundle),
        Route(f"{api}/stt-token/{{vendor}}", stt_token, methods=["POST"]),
        Route(f"{api}/calls/start", call_start, methods=["POST"]),
        Route(f"{api}/usage", usage, methods=["POST"]),
        Route(f"{api}/company/usage", company_usage),
        Route(f"{api}/calls/{{call_id}}/review", review_post, methods=["POST"]),
        Route(f"{api}/calls/{{call_id}}/brief", call_brief_put, methods=["PUT"]),
        Route(f"{api}/calls/{{call_id}}/brief", call_brief_get),
        Route(f"{api}/recordings/{{call_id}}", recording_put, methods=["PUT"]),
        Route(f"{api}/recordings/{{call_id}}", recording_get),
        Route(f"{api}/company/settings", settings_get),
        Route(f"{api}/company/settings", settings_put, methods=["PUT"]),
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
        Route("/api/owner/features", owner_route(o_features)),
        Route(
            "/api/owner/features/{id}/kill",
            owner_route(o_kill, mutating=True),
            methods=["PUT"],
        ),
        Route(
            "/api/owner/companies/{id}/features",
            owner_route(o_entitlements, mutating=True),
            methods=["PATCH"],
        ),
        Route("/api/owner/password", owner_route(o_password, mutating=True), methods=["POST"]),
        Route("/api/owner/github", owner_route(o_github_get)),
        Route("/api/owner/github", owner_route(o_github_put, mutating=True), methods=["PUT"]),
        Route("/api/owner/github", owner_route(o_github_delete, mutating=True), methods=["DELETE"]),
        Route(
            "/api/owner/github/test",
            owner_route(o_github_test, mutating=True),
            methods=["POST"],
        ),
        Route(
            "/api/owner/github/issues",
            owner_route(o_github_issue, mutating=True),
            methods=["POST"],
        ),
        Route(
            "/api/owner/crm-secret",
            owner_route(o_crm_secret, mutating=True),
            methods=["POST"],
        ),
        Route("/api/owner/sender", owner_route(o_sender)),
        Route("/api/owner/bug-reports", owner_route(o_bug_reports)),
        Route(
            "/api/owner/bug-reports/{id}",
            owner_route(o_bug_report_patch, mutating=True),
            methods=["PATCH"],
        ),
        Route(
            "/api/owner/bug-reports/{id}/submit",
            owner_route(o_bug_report_submit, mutating=True),
            methods=["POST"],
        ),
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
        *learning_routes.make_routes(
            learning=learning, app_route=app_route, body=body, ip_of=ip_of
        ),
        *coaching_routes.make_routes(
            coaching=coaching,
            learning=learning,
            prompts=seed.prompts,
            app_route=app_route,
            body=body,
            ip_of=ip_of,
            origin=config.public_origin or "http://localhost:8788",
            mailer=config.mailer,
        ),
        *zoho_routes.make_routes(
            store=store,
            app_route=app_route,
            owner_route=owner_route,
            handle=handle,
            body=body,
            ip_of=ip_of,
            origin_of=public_origin_of,
            transport=config.zoho_transport,
            log=config.log,
            secure_cookies=config.secure_cookies,
            read_limit=lambda key: zoho_limit.hit(key),
            expose=zoho_exposed,
        ),
        *email_routes.make_routes(
            store=store,
            app_route=app_route,
            owner_route=owner_route,
            body=body,
            ip_of=ip_of,
            send_limit=lambda key: send_limit.hit(key),
            log=config.log,
            **({"sender": config.smtp_sender} if config.smtp_sender else {}),
        ),
        *gallabox_routes.make_routes(
            store=store,
            app_route=app_route,
            body=body,
            ip_of=ip_of,
            transport=config.gallabox_transport,
            send_limit=lambda key: send_limit.hit(key),
            log=config.log,
            owner_route=owner_route,
            origin_of=hook_origin,
        ),
        *owner_routes.make_routes(
            store=store,
            seed=seed,
            owner_route=owner_route,
            app_route=app_route,
            handle=handle,
            body=body,
            ip_of=ip_of,
            ip_key=ip_key,
            tester=tester,
            minter=minter,
            report_limit=lambda key: failure_report_limit.hit(key),
            signup_limit=lambda key: hook_limit.hit(key),
            bad_secret_limit=lambda key: hook_secret_limit.blocked(key),
            bad_secret_record=lambda key: hook_secret_limit.record(key),
            send_invite=send_invite,
            log=config.log,
            zoho_call=bootstrap_zoho_call,
        ),
        *gallabox_webhook.make_routes(
            store=store,
            app_route=app_route,
            handle=handle,
            ip_of=ip_of,
            bad_secret_limit=lambda key: hook_secret_limit.blocked(key),
            bad_secret_record=lambda key: hook_secret_limit.record(key),
            log=config.log,
        ),
        *zoho_webhooks.make_routes(
            watch=zoho_watch,
            app_route=app_route,
            handle=handle,
            origin_of=hook_origin,
            clock=config.clock,
            ip_of=ip_of,
            bad_token_limit=lambda key: hook_secret_limit.blocked(key),
            bad_token_record=lambda key: hook_secret_limit.record(key),
            channel_limit=lambda key: zoho_notify_limit.hit(key),
        ),
        *followup_routes.make_routes(
            store=store,
            plans=scheduler.plans,
            app_route=app_route,
            body=body,
            ip_of=ip_of,
            clock=config.clock,
            attachment_ids=lambda company: email_attachments.ids(store, company),
        ),
        Route("/assets/fonts/{file}", font_file),
        Route("/owner", owner_page),
        Route("/owner/{file}", owner_page),
        Route("/{path:path}", static),
    ]

    @contextlib.asynccontextmanager
    async def lifespan(_app: Starlette) -> AsyncIterator[None]:
        stop = asyncio.Event()
        task = asyncio.create_task(scheduler.run(stop)) if config.run_scheduler else None
        try:
            yield
        finally:
            stop.set()
            if task is not None:
                await task

    out = Headers(Starlette(routes=routes, lifespan=lifespan))
    out.scheduler = scheduler
    return out


class Headers:
    """Security headers everywhere; CORS (and preflight) on the app API only."""

    scheduler: Scheduler | None = None  # T-081: the server's one runner (tests call tick)

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
