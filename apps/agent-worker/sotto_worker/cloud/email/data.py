"""Email storage (D-032, D-039): SMTP accounts (org and platform), formats, and the send log
that makes a retried send a no-op. Tables live beside CloudStore's, created on first use.

Write-only: the username and password are encrypted together (vault name binds them to their
scope) and no method that answers an API request returns either."""

from __future__ import annotations

import json
import re
import sqlite3
import weakref
from pathlib import Path
from typing import Any

from sotto_worker.adapters.email.smtp import SmtpAccount
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms
from sotto_worker.server.vault import VaultError

SCHEMA = """
CREATE TABLE IF NOT EXISTS smtp_accounts (
  scope TEXT PRIMARY KEY,            -- 'platform' or the company id
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,  -- NULL for the platform
  ciphertext BLOB NOT NULL,          -- {username, password}
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  from_name TEXT NOT NULL,
  from_address TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Round 2 (D-078): one mailbox per user, set by the vendor on the owner console. A user's own
-- mailbox wins over the org's; the org's wins over the platform fallback.
CREATE TABLE IF NOT EXISTS smtp_user_accounts (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext BLOB NOT NULL,          -- {username, password}
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  from_name TEXT NOT NULL,
  from_address TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
);
CREATE TABLE IF NOT EXISTS email_formats (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  formats TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_sends (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  idem TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- sending | sent | failed
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, idem)
);
"""
PLATFORM = "platform"
PORTS = {465: "ssl", 587: "starttls"}
EMAIL = re.compile(r"^[^@\s,;<>\"]+@[^@\s,;<>\"]+\.[^@\s,;<>\"]+$")
HOST = re.compile(
    r"^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$"
)
PLACEHOLDER = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")
PLACEHOLDERS = ("agent.name", "agent.email", "company.name", "customer.name")
FORMAT_ID = re.compile(r"^[a-z0-9_-]{1,40}$")
KINDS = ("follow_up", "meeting_confirmation", "custom")
DEFAULTS = json.loads((Path(__file__).parent / "defaults.json").read_text(encoding="utf-8"))
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    with store._lock:
        store._db.executescript(SCHEMA)
        # Round 3 (D-089): when a mailbox was last tested, and whether it worked.
        for table in ("smtp_accounts", "smtp_user_accounts"):
            have = {r["name"] for r in store._db.execute(f"PRAGMA table_info({table})")}
            for column, kind in (("tested_at", "INTEGER"), ("test_ok", "INTEGER")):
                if column not in have:
                    store._db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
    _ready.add(store)


def record_test(store: CloudStore, scope: str, ok: bool) -> None:
    """Remembers a 'Send test email' result, so the sender read model can show it. The scope
    is 'platform', a company id, or 'user:<company_id>:<user_id>'."""
    ensure(store)
    t = now_ms()
    with store._lock:
        if scope.startswith("user:"):
            _tag, company_id, user_id = scope.split(":", 2)
            store._db.execute(
                "UPDATE smtp_user_accounts SET tested_at = ?, test_ok = ?"
                " WHERE company_id = ? AND user_id = ?",
                (t, int(ok), company_id, user_id),
            )
        else:
            store._db.execute(
                "UPDATE smtp_accounts SET tested_at = ?, test_ok = ? WHERE scope = ?",
                (t, int(ok), scope),
            )


def _one_line(value: object, what: str, limit: int, *, required: bool = True) -> str:
    text = str(value if value is not None else "").strip()
    if "\r" in text or "\n" in text:
        raise CloudError("invalid", f"{what} must be one line")
    if required and not text:
        raise CloudError("invalid", f"{what} is required")
    if len(text) > limit:
        raise CloudError("invalid", f"{what} is too long (max {limit})")
    return text


def clean_address(value: object, what: str = "email address") -> str:
    text = _one_line(value, what, 254)
    if not EMAIL.match(text):
        raise CloudError("invalid", f"{text[:60]} is not an email address")
    return text


# --- SMTP accounts --------------------------------------------------------------------------------
def _scope(who: Principal | None) -> str:
    return PLATFORM if who is None else who.company


def _clean_account(
    data: dict[str, Any], old: SmtpAccount | None
) -> tuple[str, int, str, str, str, str]:
    """Validates a mailbox form. A blank login keeps the saved one (it is never shown)."""
    host = _one_line(data.get("host"), "host", 253).lower()
    if not HOST.match(host):
        raise CloudError("invalid", "that does not look like a mail server name")
    try:
        port = int(data.get("port", 465))
    except (TypeError, ValueError):
        raise CloudError("invalid", "port must be 465 or 587") from None
    if port not in PORTS:
        raise CloudError("invalid", "port must be 465 (SSL) or 587 (STARTTLS)")
    username = _one_line(data.get("username"), "username", 254, required=False)
    password = str(data.get("password") or "")
    from_name = _one_line(data.get("from_name"), "from name", 100)
    from_address = clean_address(data.get("from_address"), "from address")
    if not password or not username:
        # Editing the other fields keeps the saved login: it is never shown, so never retyped.
        if old is None:
            raise CloudError("invalid", "username and password are required")
        username, password = username or old.username, password or old.password
    if len(password) > 500 or "\n" in password:
        raise CloudError("invalid", "that does not look like a password")
    return host, port, username, password, from_name, from_address


def save_account(
    store: CloudStore,
    who: Principal,
    data: dict[str, Any],
    *,
    platform: bool,
    company_id: str | None = None,
    ip: str = "",
) -> None:
    ensure(store)
    if platform and not who.is_owner:
        raise CloudError("forbidden", "only the platform owner can do this")
    if platform:
        scope = PLATFORM
    elif company_id is not None:
        # Round 2 (D-078): the vendor sets an org's mailbox from the company profile.
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
        scope = company_id
    else:
        who.require("admin")
        scope = who.company
    host, port, username, password, from_name, from_address = _clean_account(
        data, account(store, scope)
    )
    blob = store._vault.encrypt(
        f"smtp:{scope}", json.dumps({"username": username, "password": password})
    )
    with store._tx() as db:
        db.execute(
            "INSERT INTO smtp_accounts(scope, company_id, ciphertext, host, port, from_name,"
            " from_address, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET"
            " ciphertext = excluded.ciphertext, host = excluded.host, port = excluded.port,"
            " from_name = excluded.from_name, from_address = excluded.from_address,"
            " updated_at = excluded.updated_at",
            (
                scope,
                None if platform else scope,
                blob,
                host,
                port,
                from_name,
                from_address,
                now_ms(),
            ),
        )
        store.audit(
            db,
            "owner.smtp.set" if platform else "smtp.set",
            f"{host}:{port} from {from_address}",
            company_id=None if platform else scope,
            actor=who,
            ip=ip,
        )


def delete_account(
    store: CloudStore,
    who: Principal,
    *,
    platform: bool,
    company_id: str | None = None,
    ip: str = "",
) -> None:
    ensure(store)
    if platform and not who.is_owner:
        raise CloudError("forbidden", "only the platform owner can do this")
    if platform:
        scope = PLATFORM
    elif company_id is not None:
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
        scope = company_id
    else:
        who.require("admin")
        scope = who.company
    with store._tx() as db:
        db.execute("DELETE FROM smtp_accounts WHERE scope = ?", (scope,))
        store.audit(
            db,
            "owner.smtp.deleted" if platform else "smtp.deleted",
            "",
            company_id=None if platform else scope,
            actor=who,
            ip=ip,
        )


# --- one mailbox per user (vendor only) ---------------------------------------------------------
def _user_row(store: CloudStore, company_id: str, user_id: str) -> sqlite3.Row | None:
    rows = store._q(
        "SELECT * FROM smtp_user_accounts WHERE company_id = ? AND user_id = ?",
        (company_id, user_id),
    )
    return rows[0] if rows else None


def _user_vault(company_id: str, user_id: str) -> str:
    return f"smtp:user:{company_id}:{user_id}"


def save_user_account(
    store: CloudStore,
    owner: Principal,
    company_id: str,
    user_id: str,
    data: dict[str, Any],
    *,
    ip: str = "",
) -> None:
    """The vendor sets one user's mailbox from the company profile (D-078)."""
    ensure(store)
    if not owner.is_owner:
        raise CloudError("forbidden", "only the platform owner can do this")
    store.company_row(company_id)
    if not store._q("SELECT 1 FROM users WHERE id = ? AND company_id = ?", (user_id, company_id)):
        raise CloudError("not_found", "no such user in this company")
    host, port, username, password, from_name, from_address = _clean_account(
        data, user_account(store, company_id, user_id)
    )
    blob = store._vault.encrypt(
        _user_vault(company_id, user_id), json.dumps({"username": username, "password": password})
    )
    with store._tx() as db:
        db.execute(
            "INSERT INTO smtp_user_accounts(company_id, user_id, ciphertext, host, port,"
            " from_name, from_address, updated_at) VALUES (?,?,?,?,?,?,?,?)"
            " ON CONFLICT(company_id, user_id) DO UPDATE SET ciphertext = excluded.ciphertext,"
            " host = excluded.host, port = excluded.port, from_name = excluded.from_name,"
            " from_address = excluded.from_address, updated_at = excluded.updated_at",
            (company_id, user_id, blob, host, port, from_name, from_address, now_ms()),
        )
        store.audit(
            db,
            "owner.smtp.user.set",
            f"{host}:{port} from {from_address}",
            company_id=company_id,
            actor=owner,
            ip=ip,
        )


def delete_user_account(
    store: CloudStore, owner: Principal, company_id: str, user_id: str, *, ip: str = ""
) -> None:
    ensure(store)
    if not owner.is_owner:
        raise CloudError("forbidden", "only the platform owner can do this")
    store.company_row(company_id)
    with store._tx() as db:
        db.execute(
            "DELETE FROM smtp_user_accounts WHERE company_id = ? AND user_id = ?",
            (company_id, user_id),
        )
        store.audit(db, "owner.smtp.user.deleted", "", company_id=company_id, actor=owner, ip=ip)


def user_account(store: CloudStore, company_id: str, user_id: str) -> SmtpAccount | None:
    """Server-side only: the decrypted mailbox for one user."""
    ensure(store)
    row = _user_row(store, company_id, user_id)
    if row is None:
        return None
    try:
        login = json.loads(
            store._vault.decrypt(_user_vault(company_id, user_id), row["ciphertext"])
        )
    except VaultError:
        return None
    return SmtpAccount(
        host=str(row["host"]),
        port=int(row["port"]),
        username=str(login["username"]),
        password=str(login["password"]),
        from_name=str(row["from_name"]),
        from_address=str(row["from_address"]),
        security=PORTS.get(int(row["port"]), "ssl"),
    )


def _public(row: sqlite3.Row | None) -> dict[str, Any]:
    if row is None:
        return {"configured": False}
    return {
        "configured": True,
        "host": row["host"],
        "port": int(row["port"]),
        "from_name": row["from_name"],
        "from_address": row["from_address"],
        "updated_at": int(row["updated_at"]),
        # Round 3 (D-089): the last 'Send test email' result, None when never tested.
        "tested_at": int(row["tested_at"]) if row["tested_at"] is not None else None,
        "test_ok": bool(row["test_ok"]) if row["test_ok"] is not None else None,
    }


def _row(store: CloudStore, scope: str) -> sqlite3.Row | None:
    rows = store._q("SELECT * FROM smtp_accounts WHERE scope = ?", (scope,))
    return rows[0] if rows else None


def status(store: CloudStore, company_id: str | None, user_id: str | None = None) -> dict[str, Any]:
    """What screens may know: host, port and sender of each account; never the login."""
    ensure(store)
    out: dict[str, Any] = {"platform": _public(_row(store, PLATFORM))}
    if company_id is not None:
        out["org"] = _public(_row(store, company_id))
        if user_id is not None:
            out["user"] = _public(_user_row(store, company_id, user_id))
        out["active"] = (
            "user"
            if user_id is not None and out["user"]["configured"]
            else "org"
            if out["org"]["configured"]
            else "platform"
            if out["platform"]["configured"]
            else None
        )
    return out


def account(store: CloudStore, scope: str) -> SmtpAccount | None:
    """Server-side only: the decrypted account for one scope. A user scope is
    "user:<company_id>:<user_id>"."""
    ensure(store)
    if scope.startswith("user:"):
        _tag, company_id, user_id = scope.split(":", 2)
        return user_account(store, company_id, user_id)
    row = _row(store, scope)
    if row is None:
        return None
    try:
        login = json.loads(store._vault.decrypt(f"smtp:{scope}", row["ciphertext"]))
    except VaultError:
        return None
    return SmtpAccount(
        host=str(row["host"]),
        port=int(row["port"]),
        username=str(login["username"]),
        password=str(login["password"]),
        from_name=str(row["from_name"]),
        from_address=str(row["from_address"]),
        security=PORTS.get(int(row["port"]), "ssl"),
    )


def active_scope(store: CloudStore, company_id: str, user_id: str | None = None) -> str | None:
    """The mailbox a send uses: the sender's own, then the org's, then the platform's."""
    ensure(store)
    if user_id is not None and _user_row(store, company_id, user_id) is not None:
        return f"user:{company_id}:{user_id}"
    for scope in (company_id, PLATFORM):
        if _row(store, scope) is not None:
            return scope
    return None


def has_sender(store: CloudStore, company_id: str) -> bool:
    return active_scope(store, company_id) is not None


def senders(store: CloudStore, company_id: str, user_id: str | None = None) -> list[dict[str, Any]]:
    """The approved sender the agent can pick from: their own mailbox, else the org's, else the
    platform's. One entry, the active one — the choice is the vendor's, not the agent's."""
    scope = active_scope(store, company_id, user_id)
    if scope is None:
        return []
    if scope.startswith("user:"):
        row = _user_row(store, company_id, user_id or "")
        assert row is not None  # noqa: S101 — active_scope just found it
        sender_id = "user"
    else:
        row = _row(store, scope)
        assert row is not None  # noqa: S101 — active_scope just found it
        sender_id = "org" if scope != PLATFORM else "platform"
    return [
        {
            "id": sender_id,
            "from_name": row["from_name"],
            "from_address": row["from_address"],
        }
    ]


# --- formats ------------------------------------------------------------------------------------
def _clean_block(value: object, what: str, limit: int) -> str:
    text = str(value if value is not None else "").replace("\r\n", "\n").strip()
    if len(text) > limit:
        raise CloudError("invalid", f"{what} is too long (max {limit})")
    for name in PLACEHOLDER.findall(text):
        if name not in PLACEHOLDERS:
            raise CloudError(
                "invalid",
                f"unknown placeholder {{{{{name}}}}} in {what}; use {', '.join(PLACEHOLDERS)}",
            )
    return text


def clean_format(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise CloudError("invalid", "each format is an object")
    fid = str(raw.get("id", "")).strip()
    if not FORMAT_ID.match(fid):
        raise CloudError("invalid", "format id: lowercase letters, digits, _ or -")
    kind = str(raw.get("kind", "custom"))
    if kind not in KINDS:
        raise CloudError("invalid", "unknown format kind")
    return {
        "id": fid,
        "name": _one_line(raw.get("name"), "format name", 80),
        "kind": kind,
        "subject": _clean_block(_one_line(raw.get("subject"), "subject", 200), "subject", 200),
        "opening": _clean_block(raw.get("opening"), "opening", 1000),
        "body": _clean_block(raw.get("body"), "example body", 5000),
        "signature": _clean_block(raw.get("signature"), "signature", 2000),
    }


def formats(store: CloudStore, company_id: str) -> list[dict[str, str]]:
    ensure(store)
    rows = store._q("SELECT formats FROM email_formats WHERE company_id = ?", (company_id,))
    if rows:
        return list(json.loads(rows[0]["formats"]))
    return [dict(f) for f in DEFAULTS["formats"]]


def save_formats(
    store: CloudStore, who: Principal, raw: Any, *, ip: str = ""
) -> list[dict[str, str]]:
    ensure(store)
    who.require("admin")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 20:
        raise CloudError("invalid", "send 1 to 20 formats")
    cleaned = [clean_format(f) for f in raw]
    if len({f["id"] for f in cleaned}) != len(cleaned):
        raise CloudError("invalid", "format ids must be unique")
    with store._tx() as db:
        db.execute(
            "INSERT INTO email_formats(company_id, formats, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(company_id) DO UPDATE SET formats = excluded.formats,"
            " updated_at = excluded.updated_at",
            (who.company, json.dumps(cleaned), now_ms()),
        )
        store.audit(
            db,
            "email.formats.set",
            f"{len(cleaned)} formats",
            company_id=who.company,
            actor=who,
            ip=ip,
        )
    return cleaned


# --- sends --------------------------------------------------------------------------------------
def claim_send(store: CloudStore, who: Principal, idem: str) -> str:
    """'new' (go ahead), 'sent' (already done: do nothing) or 'sending' (in flight)."""
    ensure(store)
    with store._tx() as db:
        rows = list(
            db.execute(
                "SELECT status FROM email_sends WHERE company_id = ? AND idem = ?",
                (who.company, idem),
            )
        )
        if rows and rows[0]["status"] in ("sent", "sending"):
            return str(rows[0]["status"])
        db.execute(
            "INSERT INTO email_sends(company_id, idem, user_id, status, at) VALUES (?,?,?,?,?)"
            " ON CONFLICT(company_id, idem) DO UPDATE SET status = 'sending', at = excluded.at",
            (who.company, idem, who.user_id, "sending", now_ms()),
        )
    return "new"


def finish_send(
    store: CloudStore, who: Principal, idem: str, *, ok: bool, detail: str, ip: str = ""
) -> None:
    with store._tx() as db:
        db.execute(
            "UPDATE email_sends SET status = ?, at = ? WHERE company_id = ? AND idem = ?",
            ("sent" if ok else "failed", now_ms(), who.company, idem),
        )
        store.audit(
            db,
            "email.sent" if ok else "email.failed",
            detail,
            company_id=who.company,
            actor=who,
            ip=ip,
        )


def company_name(store: CloudStore, company_id: str) -> str:
    rows = store._q("SELECT name FROM companies WHERE id = ?", (company_id,))
    return str(rows[0]["name"]) if rows else ""
