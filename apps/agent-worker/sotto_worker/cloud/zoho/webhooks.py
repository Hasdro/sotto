"""Zoho Notifications watch (INT-13): when a Deal or a meeting changes in Zoho, the briefs saved
with that person's recent calls are rebuilt, so the next look at them is current.

Zoho CRM v8, checked against the official docs (14 Nov 2026, REFERENCES § Zoho):
- enable: `POST {api_domain}/crm/v8/actions/watch` {"watch": [{channel_id, events, notify_url,
  token (≤ 50 chars), channel_expiry (ISO 8601, at most one week; else one hour)}]}
- update/renew: `PATCH` the same path with the same channel_id and a new channel_expiry
- callback: POST to notify_url with {server_time, module, resource_uri, ids, operation,
  channel_id, token, …}; the token we chose is how we know it is Zoho
- scope: `ZohoCRM.notifications.ALL` (in the one scope bundle, D-069); without it on a person's
  connection the `zoho_watch` feature is `needs_connection`.

One channel per connection (per OAuth user). The renewal job extends every channel that expires
within two days to six days ahead. The brief refresh reads through `lookup.build_brief` only
(read-only; no Zoho write happens here)."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import weakref
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.crm.zoho import ZohoCRMReader, ZohoError
from sotto_worker.cloud.store import ZOHO_NOTIFY_SCOPE, CloudError, CloudStore, Principal, now_ms
from sotto_worker.cloud.zoho import lookup
from sotto_worker.cloud.zoho.oauth import AccessCache, Client, ZohoAuthError, refresh_access

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
EVENTS = ["Deals.edit", "Events.all"]
DAY_MS = 24 * 3600 * 1000
EXPIRY_MS = 6 * DAY_MS  # under Zoho's one-week maximum
RENEW_BEFORE_MS = 2 * DAY_MS
BRIEF_WINDOW_MS = 14 * DAY_MS
MAX_REFRESH = 5
MAX_HOOK_BODY = 64 * 1024
RECORD_ID = re.compile(r"^\d{5,25}$")
SCHEMA = """
CREATE TABLE IF NOT EXISTS zoho_watches (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
);
-- What changed, for the app's "changed in Zoho" line: module and record id only.
CREATE TABLE IF NOT EXISTS zoho_changes (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  record_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, module, record_id)
);
"""
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    with store._lock:
        store._db.executescript(SCHEMA)
    _ready.add(store)


def _hash(token: str) -> str:
    return hashlib.sha256(f"zoho-watch:{token}".encode()).hexdigest()


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, UTC).replace(microsecond=0).isoformat()


class ZohoWatch:
    def __init__(
        self,
        store: CloudStore,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        log: Callable[[str], None] = lambda _l: None,
    ) -> None:
        self.s = store
        self.transport = transport
        self.log = log
        self.cache = AccessCache()
        ensure(store)

    def http(self) -> httpx.AsyncClient:
        t = self.transport
        return httpx.AsyncClient(transport=t, timeout=10) if t else httpx.AsyncClient(timeout=10)

    def principal(self, company_id: str, user_id: str) -> Principal | None:
        rows = self.s._q(
            "SELECT id, email, name, role FROM users"
            " WHERE id = ? AND company_id = ? AND active = 1",
            (user_id, company_id),
        )
        if not rows:
            return None
        r = rows[0]
        return Principal(str(r["id"]), company_id, str(r["role"]), None, r["email"], r["name"])

    async def _token(self, h: httpx.AsyncClient, who: Principal) -> tuple[str, str]:
        conn = self.s.zoho_connection(who)
        c = self.s.zoho_client(who.company)
        if conn is None or c is None:
            raise CloudError("zoho_reconnect", "connect Zoho again")
        key = (who.company, who.user_id)
        token = self.cache.get(key)
        if token is None:
            try:
                token, ttl = await refresh_access(
                    h, Client.from_store(c), conn["accounts_server"], conn["refresh_token"]
                )
            except ZohoAuthError:
                raise CloudError("zoho_reconnect", "connect Zoho again") from None
            self.cache.put(key, token, ttl)
        return conn["api_domain"], token

    def status(self, who: Principal) -> dict[str, Any]:
        rows = self.s._q(
            "SELECT expires_at FROM zoho_watches WHERE company_id = ? AND user_id = ?",
            (who.company, who.user_id),
        )
        return {
            "state": self.s.feature_state(who, "zoho_watch").out(),
            "watching": bool(rows),
            "expires_at": int(rows[0]["expires_at"]) if rows else None,
        }

    async def watch(self, who: Principal, notify_url: str, now: int) -> dict[str, Any]:
        """Creates this person's channel, or renews it when it expires within two days."""
        self.s.require_feature(who, "zoho_watch")
        rows = self.s._q(
            "SELECT channel_id, expires_at FROM zoho_watches WHERE company_id = ? AND user_id = ?",
            (who.company, who.user_id),
        )
        if rows and int(rows[0]["expires_at"]) - now > RENEW_BEFORE_MS:
            return self.status(who)
        channel = str(rows[0]["channel_id"]) if rows else str(secrets.randbelow(10**15) + 10**15)
        token = secrets.token_urlsafe(30)[:40]
        expires = now + EXPIRY_MS
        item = {
            "channel_id": channel,
            "events": EVENTS,
            "notify_url": notify_url,
            "token": token,
            "channel_expiry": _iso(expires),
            "notify_on_related_action": False,
        }
        async with self.http() as h:
            domain, access = await self._token(h, who)
            url = f"{domain.rstrip('/')}/crm/v8/actions/watch"
            headers = {"Authorization": f"Zoho-oauthtoken {access}"}
            r = await h.request(
                "PATCH" if rows else "POST", url, json={"watch": [item]}, headers=headers
            )
            if rows and r.status_code >= 400:  # an expired channel cannot be patched: enable anew
                r = await h.post(url, json={"watch": [item]}, headers=headers)
        ok = r.status_code < 300 and _success(r)
        if not ok:
            self.log(f"zoho: watch failed for company {who.company}: {r.status_code}")
            raise CloudError("zoho_unavailable", "Zoho did not accept the change alerts")
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO zoho_watches(company_id, user_id, channel_id, token_hash, expires_at,"
                " created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(company_id, user_id) DO UPDATE SET"
                " channel_id = excluded.channel_id, token_hash = excluded.token_hash,"
                " expires_at = excluded.expires_at",
                (who.company, who.user_id, channel, _hash(token), expires, now),
            )
            self.s.audit(
                db,
                "zoho.watch",
                ("renewed" if rows else "started") + " change alerts (Deals, Meetings)",
                company_id=who.company,
                actor=who,
            )
        return self.status(who)

    async def renew_all(self, notify_url: str, now: int) -> int:
        """The scheduler job: every connection with the scope gets a live channel."""
        rows = self.s._q(
            "SELECT company_id, user_id FROM zoho_connections WHERE instr(scopes, ?) > 0",
            (ZOHO_NOTIFY_SCOPE,),
        )
        done = 0
        for r in rows:
            who = self.principal(str(r["company_id"]), str(r["user_id"]))
            if who is None or self.s.feature_state(who, "zoho_watch").state != "available":
                continue
            try:
                before = self.status(who)["expires_at"]
                after = (await self.watch(who, notify_url, now))["expires_at"]
                done += int(before != after)
            except CloudError as e:
                self.log(f"zoho: renewal skipped for company {who.company}: {e.code}")
        return done

    def owner_of(self, channel_id: str, token: str, now: int) -> tuple[str, str] | None:
        """The channel's owner if the token is ours and the channel has not expired."""
        rows = self.s._q(
            "SELECT company_id, user_id, token_hash, expires_at FROM zoho_watches"
            " WHERE channel_id = ? AND expires_at > ?",
            (channel_id, now),
        )
        if not rows or not hmac.compare_digest(str(rows[0]["token_hash"]), _hash(token)):
            return None
        return str(rows[0]["company_id"]), str(rows[0]["user_id"])

    async def changed(self, who: Principal, module: str, ids: list[str], now: int) -> int:
        """Records the change and rebuilds the briefs of recent calls that mention a record."""
        with self.s._tx() as db:
            for rid in ids:
                db.execute(
                    "INSERT INTO zoho_changes(company_id, user_id, module, record_id, at)"
                    " VALUES (?,?,?,?,?) ON CONFLICT(company_id, user_id, module, record_id)"
                    " DO UPDATE SET at = excluded.at",
                    (who.company, who.user_id, module, rid, now),
                )
        rows = self.s._q(
            "SELECT call_id, brief_json FROM call_briefs WHERE company_id = ? AND user_id = ?"
            " AND updated_at >= ? ORDER BY updated_at DESC LIMIT 50",
            (who.company, who.user_id, now - BRIEF_WINDOW_MS),
        )
        hit = [r for r in rows if any(f'"{rid}"' in str(r["brief_json"]) for rid in ids)]
        refreshed = 0
        if not hit:
            return 0
        async with self.http() as h:
            try:
                domain, access = await self._token(h, who)
            except CloudError:
                return 0
            reader = ZohoCRMReader(h, domain, access)
            for r in hit[:MAX_REFRESH]:
                old = json.loads(r["brief_json"])
                person = old.get("person") if isinstance(old, dict) else None
                if not isinstance(person, dict) or not person.get("id"):
                    continue
                try:
                    fresh = await lookup.build_brief(
                        reader, str(person.get("module", "")), str(person["id"])
                    )
                except (ZohoError, ValueError):
                    continue
                if fresh is None:
                    continue
                kept = {k: v for k, v in old.items() if k not in fresh}  # e.g. the meeting
                new = {**kept, **fresh, "refreshed_at": now, "changed": {"module": module}}
                self.s.save_call_brief(who, str(r["call_id"]), new)
                refreshed += 1
        return refreshed


def _success(r: httpx.Response) -> bool:
    try:
        items = r.json().get("watch") or []
    except (ValueError, AttributeError):
        return False
    return bool(items) and all(str(i.get("status", "")).lower() == "success" for i in items)


def make_routes(
    *,
    watch: ZohoWatch,
    app_route: Wrap,
    handle: Wrap,
    origin_of: Callable[[Request], str],
    clock: Callable[[], int] = now_ms,
    ip_of: Callable[[Request], str] = lambda _r: "",
    bad_token_limit: Callable[[str], bool] = lambda _key: False,
    bad_token_record: Callable[[str], None] = lambda _key: None,
    channel_limit: Callable[[str], bool] = lambda _key: True,
) -> list[Route]:
    def notify_url(r: Request) -> str:
        return f"{origin_of(r).rstrip('/')}/api/hooks/zoho/notify"

    @app_route
    async def status(_r: Request, who: Principal) -> Response:
        return JSONResponse(watch.status(who), headers=NO_STORE)

    @app_route
    async def start(r: Request, who: Principal) -> Response:
        return JSONResponse(await watch.watch(who, notify_url(r), clock()), headers=NO_STORE)

    @app_route
    async def changes(r: Request, who: Principal) -> Response:
        """Record ids changed in Zoho since `since` (ms): the app marks those briefs."""
        since = r.query_params.get("since", "0")
        rows = watch.s._q(
            "SELECT module, record_id, at FROM zoho_changes WHERE company_id = ? AND user_id = ?"
            " AND at >= ? ORDER BY at DESC LIMIT 100",
            (who.company, who.user_id, int(since) if since.isdigit() else 0),
        )
        return JSONResponse({"changes": [dict(x) for x in rows]}, headers=NO_STORE)

    @handle
    async def receive(r: Request) -> Response:
        ip = ip_of(r)
        if bad_token_limit(ip):
            return PlainTextResponse("too many attempts\n", status_code=429)
        raw = b""
        async for chunk in r.stream():
            raw += chunk
            if len(raw) > MAX_HOOK_BODY:
                return PlainTextResponse("too large\n", status_code=413)
        try:
            body = json.loads(raw or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return PlainTextResponse("bad request\n", status_code=400)
        if not isinstance(body, dict):
            return PlainTextResponse("bad request\n", status_code=400)
        channel = str(body.get("channel_id", ""))
        owner = watch.owner_of(channel, str(body.get("token", "")), clock())
        if owner is None:
            bad_token_record(ip)
            return PlainTextResponse("unknown channel\n", status_code=401)
        if not channel_limit(channel):  # a replayed callback cannot drain the org's Zoho credits
            return JSONResponse({"ok": True, "refreshed": 0})
        who = watch.principal(*owner)
        module = str(body.get("module", ""))
        ids = [str(i) for i in body.get("ids") or [] if RECORD_ID.match(str(i))][:20]
        if who is None or module not in ("Deals", "Events") or not ids:
            return JSONResponse({"ok": True, "refreshed": 0})
        if watch.s.feature_state(who, "zoho_watch").state != "available":
            return JSONResponse({"ok": True, "refreshed": 0})
        refreshed = await watch.changed(who, module, ids, clock())
        return JSONResponse({"ok": True, "refreshed": refreshed})

    return [
        Route("/api/v1/zoho/watch", status),
        Route("/api/v1/zoho/watch", start, methods=["POST"]),
        Route("/api/v1/zoho/changes", changes),
        Route("/api/hooks/zoho/notify", receive, methods=["POST"]),
    ]
