"""Gallabox storage (D-033, D-039): the org's credentials (write-only, encrypted), its template
allow-list with each template's cached parameters, and the send log that makes a retried send
a no-op. No message text or history is stored: only which template went to whom, and when."""

from __future__ import annotations

import json
import re
import weakref
from typing import Any

from sotto_worker.adapters.whatsapp.gallabox import Param, Template
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms
from sotto_worker.server.vault import VaultError

SCHEMA = """
CREATE TABLE IF NOT EXISTS company_gallabox (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  ciphertext BLOB NOT NULL,          -- {api_key, api_secret, account_id, channel_id, channel_label}
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gallabox_templates (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,
  params TEXT NOT NULL,              -- [{name, component, type, example}]
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, name, language)
);
CREATE TABLE IF NOT EXISTS whatsapp_sends (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  idem TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- sending | sent | failed
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, idem)
);
"""
FIELDS = ("api_key", "api_secret", "account_id", "channel_id")
# ZC-07: the channel can be picked from what Gallabox returns after the key is saved.
OPTIONAL = frozenset({"channel_id"})
TOKEN = re.compile(r"^[A-Za-z0-9_.:\-]{4,300}$")
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    with store._lock:
        store._db.executescript(SCHEMA)
    _ready.add(store)


def credentials(store: CloudStore, company_id: str) -> dict[str, str] | None:
    """Server-side only."""
    ensure(store)
    rows = store._q("SELECT ciphertext FROM company_gallabox WHERE company_id = ?", (company_id,))
    if not rows:
        return None
    try:
        return dict(
            json.loads(store._vault.decrypt(f"gallabox:{company_id}", rows[0]["ciphertext"]))
        )
    except VaultError:
        return None


def save(
    store: CloudStore,
    who: Principal,
    raw: dict[str, Any],
    *,
    company_id: str | None = None,
    ip: str = "",
) -> None:
    """Blank fields keep the saved value, so the admin can replace one without retyping all.
    Round 2 (D-078): with `company_id` the platform owner sets another company's keys."""
    ensure(store)
    if company_id is not None:
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
    else:
        who.require("admin")
        company_id = who.company
    old = credentials(store, company_id) or {}
    creds: dict[str, str] = {}
    for f in FIELDS:
        value = str(raw.get(f) or "").strip() or old.get(f, "")
        if not value and f in OPTIONAL:
            creds[f] = ""
            continue
        if not value:
            raise CloudError("invalid", f"{f.replace('_', ' ')} is required")
        if not TOKEN.match(value):
            raise CloudError("invalid", f"that does not look like a Gallabox {f.replace('_', ' ')}")
        creds[f] = value
    if creds["channel_id"] and creds["channel_id"] == old.get("channel_id"):
        creds["channel_label"] = old.get("channel_label", "")
    _write(store, who, creds, old, company_id=company_id, ip=ip)


def save_channel(
    store: CloudStore,
    who: Principal,
    channel_id: str,
    label: str,
    *,
    company_id: str | None = None,
    ip: str = "",
) -> None:
    """The WhatsApp number picked from the discovered list (the id never left the server)."""
    ensure(store)
    if company_id is not None:
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
    else:
        who.require("admin")
        company_id = who.company
    old = credentials(store, company_id)
    if old is None:
        raise CloudError("gallabox_no_credentials", "add the Gallabox keys first")
    _write(
        store,
        who,
        {**old, "channel_id": channel_id, "channel_label": label},
        old,
        company_id=company_id,
        ip=ip,
    )


def _write(
    store: CloudStore,
    who: Principal,
    creds: dict[str, str],
    old: dict[str, str],
    *,
    company_id: str,
    ip: str,
) -> None:
    blob = store._vault.encrypt(f"gallabox:{company_id}", json.dumps(creds))
    with store._tx() as db:
        db.execute(
            "INSERT INTO company_gallabox(company_id, ciphertext, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(company_id) DO UPDATE SET ciphertext = excluded.ciphertext,"
            " updated_at = excluded.updated_at",
            (company_id, blob, now_ms()),
        )
        changed = [f for f in FIELDS if creds[f] != old.get(f)]
        store.audit(
            db,
            "gallabox.set",
            "changed " + ", ".join(changed or ["nothing"]),
            company_id=company_id,
            actor=who,
            ip=ip,
        )


def delete(
    store: CloudStore, who: Principal, *, company_id: str | None = None, ip: str = ""
) -> None:
    ensure(store)
    if company_id is not None:
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
    else:
        who.require("admin")
        company_id = who.company
    with store._tx() as db:
        db.execute("DELETE FROM company_gallabox WHERE company_id = ?", (company_id,))
        db.execute("DELETE FROM gallabox_templates WHERE company_id = ?", (company_id,))
        store.audit(db, "gallabox.deleted", "", company_id=company_id, actor=who, ip=ip)


def configured(store: CloudStore, company_id: str) -> bool:
    ensure(store)
    return bool(store._q("SELECT 1 FROM company_gallabox WHERE company_id = ?", (company_id,)))


def status(store: CloudStore, company_id: str) -> dict[str, Any]:
    ensure(store)
    rows = store._q("SELECT updated_at FROM company_gallabox WHERE company_id = ?", (company_id,))
    creds = credentials(store, company_id) if rows else None
    return {
        "configured": bool(rows),
        **({"updated_at": int(rows[0]["updated_at"])} if rows else {}),
        # Whether a WhatsApp number is chosen, and its display name (never its id).
        "channel": {
            "set": bool(creds and creds.get("channel_id")),
            "label": (creds or {}).get("channel_label", ""),
        },
        "templates": [t.out() for t in allowed(store, company_id)],
    }


def allowed(store: CloudStore, company_id: str) -> list[Template]:
    ensure(store)
    rows = store._q(
        "SELECT * FROM gallabox_templates WHERE company_id = ? ORDER BY name, language",
        (company_id,),
    )
    return [
        Template(
            name=str(r["name"]),
            language=str(r["language"]),
            category=str(r["category"]),
            status="APPROVED",
            body=str(r["body"]),
            params=tuple(Param(**p) for p in json.loads(r["params"])),
        )
        for r in rows
    ]


def save_allowed(
    store: CloudStore,
    who: Principal,
    chosen: list[Template],
    *,
    company_id: str | None = None,
    ip: str = "",
) -> None:
    ensure(store)
    if company_id is not None:
        if not who.is_owner:
            raise CloudError("forbidden", "only the platform owner can do this")
        store.company_row(company_id)
    else:
        who.require("admin")
        company_id = who.company
    t = now_ms()
    with store._tx() as db:
        db.execute("DELETE FROM gallabox_templates WHERE company_id = ?", (company_id,))
        for tpl in chosen:
            db.execute(
                "INSERT INTO gallabox_templates(company_id, name, language, category, body,"
                " params, updated_at) VALUES (?,?,?,?,?,?,?)",
                (
                    company_id,
                    tpl.name,
                    tpl.language,
                    tpl.category,
                    tpl.body,
                    json.dumps([p.out() for p in tpl.params]),
                    t,
                ),
            )
        store.audit(
            db,
            "gallabox.templates.set",
            ", ".join(f"{x.name}/{x.language}" for x in chosen) or "none",
            company_id=company_id,
            actor=who,
            ip=ip,
        )


def claim_send(store: CloudStore, who: Principal, idem: str) -> str:
    ensure(store)
    with store._tx() as db:
        rows = list(
            db.execute(
                "SELECT status FROM whatsapp_sends WHERE company_id = ? AND idem = ?",
                (who.company, idem),
            )
        )
        if rows and rows[0]["status"] in ("sent", "sending"):
            return str(rows[0]["status"])
        db.execute(
            "INSERT INTO whatsapp_sends(company_id, idem, user_id, status, at) VALUES (?,?,?,?,?)"
            " ON CONFLICT(company_id, idem) DO UPDATE SET status = 'sending', at = excluded.at",
            (who.company, idem, who.user_id, "sending", now_ms()),
        )
    return "new"


def finish_send(
    store: CloudStore, who: Principal, idem: str, *, ok: bool, detail: str, ip: str = ""
) -> None:
    with store._tx() as db:
        db.execute(
            "UPDATE whatsapp_sends SET status = ?, at = ? WHERE company_id = ? AND idem = ?",
            ("sent" if ok else "failed", now_ms(), who.company, idem),
        )
        store.audit(
            db,
            "whatsapp.sent" if ok else "whatsapp.failed",
            detail,
            company_id=who.company,
            actor=who,
            ip=ip,
        )
