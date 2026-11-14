"""Gallabox delivery status (INT-10, D-071): status only, never message text (D-033).

/api/v1/company/gallabox/webhook   admin: create or rotate the org's webhook URL + secret (shown
                                   once, to paste into Gallabox > Settings > Webhooks)
/api/hooks/gallabox/{hook}         Gallabox → us: HMAC-verified `Message.WA.Status.*` events
/api/v1/whatsapp/status?keys=…     the agent's own sends: sent | delivered | read | failed

Signature: `x-gallabox-signature` = base64(HMAC-SHA256(secret, raw body)) per Gallabox's docs.
Their wording ("your secret (base64-encoded)") is ambiguous, so the key is tried as the secret's
bytes and, if it decodes, as the base64-decoded secret. The status payload is not documented
[verify in Gallabox > Webhooks > Logs]: the id and status are looked up in a few known places and
the event name (header `x-event-name`) decides `failed`. Nothing else from the body is kept.

Behind the `whatsapp_status` feature, default off until AGN confirms the plan has webhooks."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import secrets
import weakref
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.gallabox import data
from sotto_worker.cloud.store import CloudStore, Principal, now_ms
from sotto_worker.server.vault import VaultError

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
MAX_HOOK_BODY = 64 * 1024
STATUSES = ("sent", "delivered", "read", "failed")
RANK = {"sent": 0, "delivered": 1, "read": 2, "failed": 3}
HOOK_ID = re.compile(r"^[A-Za-z0-9_-]{20,64}$")
MESSAGE_ID = re.compile(r"^[A-Za-z0-9_.:=+/-]{1,200}$")
SCHEMA = """
CREATE TABLE IF NOT EXISTS gallabox_hooks (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  hook_id TEXT NOT NULL UNIQUE,
  ciphertext BLOB NOT NULL,          -- the HMAC secret
  created_at INTEGER NOT NULL
);
-- One row per sent message: its delivery status. No text, no phone, no template values.
CREATE TABLE IF NOT EXISTS whatsapp_status (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- sent | delivered | read | failed
  error_code TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, message_id)
);
"""
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    data.ensure(store)
    with store._lock:
        store._db.executescript(SCHEMA)
        have = {r["name"] for r in store._db.execute("PRAGMA table_info(whatsapp_sends)")}
        if "message_id" not in have:  # migrate cloud.db in place
            store._db.execute("ALTER TABLE whatsapp_sends ADD COLUMN message_id TEXT")
    _ready.add(store)


def remember_message(store: CloudStore, company_id: str, idem: str, message_id: str) -> None:
    """Called after a send: links the send log row to Gallabox's message id."""
    if not message_id or not MESSAGE_ID.match(message_id):
        return
    ensure(store)
    with store._tx() as db:
        db.execute(
            "UPDATE whatsapp_sends SET message_id = ? WHERE company_id = ? AND idem = ?",
            (message_id, company_id, idem),
        )
        db.execute(
            "INSERT OR IGNORE INTO whatsapp_status(company_id, message_id, status, at)"
            " VALUES (?,?,?,?)",
            (company_id, message_id, "sent", now_ms()),
        )


def signature_ok(secret: str, raw: bytes, given: str) -> bool:
    keys = [secret.encode()]
    try:
        decoded = base64.b64decode(secret, validate=True)
        if decoded:
            keys.append(decoded)
    except (binascii.Error, ValueError):
        pass
    got = given.strip().encode("latin-1", "ignore")  # bytes: a non-ASCII header is just wrong
    ok = False
    for k in keys:
        want = base64.b64encode(hmac.new(k, raw, hashlib.sha256).digest())
        ok |= hmac.compare_digest(want, got)
    return ok


def _dig(d: Any, *path: str) -> Any:
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def parse_status(event: str, payload: Any) -> tuple[str, str, str | None] | None:
    """(message_id, status, error_code) or None. Only these three values leave the body."""
    if not isinstance(payload, dict):
        return None
    candidates = [
        _dig(payload, "whatsapp", "id"),
        _dig(payload, "message", "id"),
        payload.get("messageId"),
        payload.get("message_id"),
        payload.get("id"),
    ]
    mid = next((str(c) for c in candidates if isinstance(c, str | int) and str(c)), "")
    if not MESSAGE_ID.match(mid):
        return None
    raw = (
        _dig(payload, "whatsapp", "status")
        or _dig(payload, "message", "status")
        or payload.get("status")
        or ""
    )
    status = str(raw).strip().lower()
    if event.endswith(".Failed"):
        status = "failed"
    if status not in STATUSES:
        return None
    code = (
        _dig(payload, "whatsapp", "error", "code")
        or _dig(payload, "error", "code")
        or payload.get("errorCode")
    )
    error = str(code)[:20] if code is not None and status == "failed" else None
    return mid, status, error


def make_routes(
    *,
    store: CloudStore,
    app_route: Wrap,
    handle: Wrap,
    ip_of: Callable[[Request], str],
    origin_of: Callable[[Request], str],
    bad_secret_limit: Callable[[str], bool] = lambda _key: False,
    bad_secret_record: Callable[[str], None] = lambda _key: None,
    log: Callable[[str], None] = lambda _l: None,
) -> list[Route]:
    ensure(store)

    def hook_of(hook_id: str) -> tuple[str, str] | None:
        rows = store._q("SELECT * FROM gallabox_hooks WHERE hook_id = ?", (hook_id,))
        if not rows:
            return None
        cid = str(rows[0]["company_id"])
        try:
            return cid, store._vault.decrypt(f"gallabox-hook:{cid}", rows[0]["ciphertext"])
        except VaultError:
            return None

    def url_for(r: Request, hook_id: str) -> str:
        return f"{origin_of(r).rstrip('/')}/api/hooks/gallabox/{hook_id}"

    @app_route
    async def hook_get(r: Request, who: Principal) -> Response:
        who.require("admin")
        rows = store._q("SELECT hook_id FROM gallabox_hooks WHERE company_id = ?", (who.company,))
        return JSONResponse(
            {
                "configured": bool(rows),
                "url": url_for(r, str(rows[0]["hook_id"])) if rows else None,
                "events": ["Message.WA.Status.Received", "Message.WA.Status.Failed"],
                "state": store.feature_state(who, "whatsapp_status").out(),
            },
            headers=NO_STORE,
        )

    @app_route
    async def hook_rotate(r: Request, who: Principal) -> Response:
        """A new URL and secret; the secret is shown this once (paste it into Gallabox)."""
        who.require("admin")
        store.require_feature(who, "whatsapp_status")
        hook_id, secret = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
        blob = store._vault.encrypt(f"gallabox-hook:{who.company}", secret)
        with store._tx() as db:
            db.execute(
                "INSERT INTO gallabox_hooks(company_id, hook_id, ciphertext, created_at)"
                " VALUES (?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET"
                " hook_id = excluded.hook_id, ciphertext = excluded.ciphertext,"
                " created_at = excluded.created_at",
                (who.company, hook_id, blob, now_ms()),
            )
            store.audit(
                db,
                "gallabox.webhook",
                "webhook URL and secret replaced",
                company_id=who.company,
                actor=who,
                ip=ip_of(r),
            )
        return JSONResponse({"url": url_for(r, hook_id), "secret": secret}, headers=NO_STORE)

    @handle
    async def receive(r: Request) -> Response:
        ip = ip_of(r)
        hook_id = r.path_params["hook"]
        if bad_secret_limit(ip):
            return PlainTextResponse("too many attempts\n", status_code=429)
        found = hook_of(hook_id) if HOOK_ID.match(hook_id) else None
        if found is None or not store.org_feature_on(found[0], "whatsapp_status"):
            return PlainTextResponse("not found\n", status_code=404)
        company_id, secret = found
        raw = b""
        async for chunk in r.stream():
            raw += chunk
            if len(raw) > MAX_HOOK_BODY:
                return PlainTextResponse("too large\n", status_code=413)
        if not signature_ok(secret, raw, r.headers.get("x-gallabox-signature", "")):
            bad_secret_record(ip)
            return PlainTextResponse("bad signature\n", status_code=401)
        event = r.headers.get("x-event-name", "")
        if not event.startswith("Message.WA.Status."):
            return JSONResponse({"ok": True, "stored": False})  # other events: ignored, unread
        try:
            parsed = parse_status(event, json.loads(raw or b"{}"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            parsed = None
        if parsed is None:
            log(f"gallabox: status event for company {company_id} not understood")
            return JSONResponse({"ok": True, "stored": False})
        mid, status, code = parsed
        with store._tx() as db:
            known = db.execute(
                "SELECT 1 FROM whatsapp_sends WHERE company_id = ? AND message_id = ?",
                (company_id, mid),
            ).fetchone()
            if known is None:  # only messages this org sent through us
                return JSONResponse({"ok": True, "stored": False})
            old = db.execute(
                "SELECT status FROM whatsapp_status WHERE company_id = ? AND message_id = ?",
                (company_id, mid),
            ).fetchone()
            if old is None or RANK[status] > RANK[str(old["status"])]:
                db.execute(
                    "INSERT INTO whatsapp_status(company_id, message_id, status, error_code, at)"
                    " VALUES (?,?,?,?,?) ON CONFLICT(company_id, message_id) DO UPDATE SET"
                    " status = excluded.status, error_code = excluded.error_code, at = excluded.at",
                    (company_id, mid, status, code, now_ms()),
                )
        return JSONResponse({"ok": True, "stored": True})

    @app_route
    async def status(r: Request, who: Principal) -> Response:
        """Statuses of the caller's own sends (by their idempotency keys); admins and managers
        see their company's."""
        store.require_feature(who, "whatsapp_status")
        keys = [k for k in r.query_params.get("keys", "").split(",") if k][:50]
        if not keys:
            return JSONResponse({"status": {}}, headers=NO_STORE)
        mine = who.user_id if who.role == "agent" else None
        rows = store._q(
            "SELECT s.idem, st.status, st.error_code, st.at FROM whatsapp_sends s"
            " JOIN whatsapp_status st ON st.company_id = s.company_id"
            " AND st.message_id = s.message_id"
            " WHERE s.company_id = ? AND s.idem IN (SELECT value FROM json_each(?))"
            " AND (? IS NULL OR s.user_id = ?)",
            (who.company, json.dumps(keys), mine, mine),
        )
        return JSONResponse(
            {
                "status": {
                    str(x["idem"]): {
                        "status": x["status"],
                        "at": x["at"],
                        **({"error_code": x["error_code"]} if x["error_code"] else {}),
                    }
                    for x in rows
                }
            },
            headers=NO_STORE,
        )

    return [
        Route("/api/v1/company/gallabox/webhook", hook_get),
        Route("/api/v1/company/gallabox/webhook", hook_rotate, methods=["POST"]),
        Route("/api/hooks/gallabox/{hook}", receive, methods=["POST"]),
        Route("/api/v1/whatsapp/status", status),
    ]
