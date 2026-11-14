"""Admin-curated attachments for follow-up emails (INT-14b). Agents pick from the list; they never
upload. Files live in SQLite per company (company_id on every row, every query scoped).

/api/v1/company/email/attachments          admin: list · PUT ?name=… raw body (upload)
/api/v1/company/email/attachments/{id}     admin: DELETE
/api/v1/email/attachments                  agent: the list to pick from (no bytes)

Allowed: PDF, PNG, JPEG and Office files (docx, xlsx, pptx), checked by extension, declared type
and the file's first bytes. At most 5 MB a file, 20 files and 25 MB per company."""

from __future__ import annotations

import hashlib
import re
import secrets
import weakref
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.features import FeatureUnavailable
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}
MAX_FILE = 5 * 1024 * 1024
MAX_FILES = 20
MAX_TOTAL = 25 * 1024 * 1024
MAX_PER_EMAIL = 5
ZIP = b"PK\x03\x04"
TYPES: dict[str, tuple[str, bytes]] = {  # extension → (MIME type, first bytes)
    "pdf": ("application/pdf", b"%PDF-"),
    "png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    "jpg": ("image/jpeg", b"\xff\xd8\xff"),
    "jpeg": ("image/jpeg", b"\xff\xd8\xff"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ZIP),
}
NAME = re.compile(r"^[\w][\w .()&+,-]{0,100}\.([A-Za-z]{3,4})$")
ID = re.compile(r"^[a-f0-9]{16}$")
SCHEMA = """
CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  data BLOB NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_attachments_company ON email_attachments(company_id);
"""
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    with store._lock:
        store._db.executescript(SCHEMA)
    _ready.add(store)


def check_file(name: str, declared: str, blob: bytes) -> str:
    """The MIME type to store, or CloudError. Extension, declared type and bytes must agree."""
    m = NAME.match(name)
    if not m or m.group(1).lower() not in TYPES:
        raise CloudError("invalid", "only PDF, PNG, JPEG, Word, Excel or PowerPoint files")
    mime, magic = TYPES[m.group(1).lower()]
    if declared.split(";")[0].strip().lower() not in (mime, "application/octet-stream"):
        raise CloudError("invalid", "the file type does not match its name")
    if not blob:
        raise CloudError("invalid", "the file is empty")
    if len(blob) > MAX_FILE:
        raise CloudError("too_large", "files can be at most 5 MB")
    if not blob.startswith(magic):
        raise CloudError("invalid", "the file's contents do not match its type")
    return mime


def listing(store: CloudStore, company_id: str) -> list[dict[str, Any]]:
    ensure(store)
    return [
        dict(r)
        for r in store._q(
            "SELECT id, name, mime, size, created_at FROM email_attachments"
            " WHERE company_id = ? ORDER BY name COLLATE NOCASE",
            (company_id,),
        )
    ]


def ids(store: CloudStore, company_id: str) -> set[str]:
    return {str(a["id"]) for a in listing(store, company_id)}


def _wanted(chosen: Any) -> list[str]:
    if not chosen:
        return []
    if not isinstance(chosen, list) or len(chosen) > MAX_PER_EMAIL:
        raise CloudError("invalid", f"attach at most {MAX_PER_EMAIL} files")
    wanted = list(dict.fromkeys(str(c) for c in chosen))
    if not all(ID.match(w) for w in wanted):
        raise CloudError("invalid", "pick attachments from your admin's list")
    return wanted


def describe(store: CloudStore, company_id: str, chosen: Any) -> list[dict[str, Any]]:
    """Id, name and size of the chosen files (no bytes), only from this company's list."""
    wanted = _wanted(chosen)
    ensure(store)
    known = {str(a["id"]): a for a in listing(store, company_id)}
    if any(w not in known for w in wanted):
        raise CloudError("invalid", "pick attachments from your admin's list")
    return [{"id": w, "name": known[w]["name"], "size": known[w]["size"]} for w in wanted]


def pick(store: CloudStore, company_id: str, chosen: Any) -> list[tuple[str, str, bytes]]:
    """The files for one email (with their bytes), only from this company's list."""
    wanted = _wanted(chosen)
    ensure(store)
    out = []
    for w in wanted:
        rows = store._q(
            "SELECT name, mime, data FROM email_attachments WHERE id = ? AND company_id = ?",
            (w, company_id),
        )
        if not rows:
            raise CloudError("invalid", "pick attachments from your admin's list")
        out.append((str(rows[0]["name"]), str(rows[0]["mime"]), bytes(rows[0]["data"])))
    return out


def make_routes(
    *,
    store: CloudStore,
    app_route: Wrap,
    ip_of: Callable[[Request], str],
) -> list[Route]:
    ensure(store)

    @app_route
    async def admin_list(_r: Request, who: Principal) -> Response:
        who.require("admin")
        return JSONResponse(
            {
                "attachments": listing(store, who.company),
                "limits": {"file": MAX_FILE, "files": MAX_FILES, "total": MAX_TOTAL},
                "types": sorted(TYPES),
            },
            headers=NO_STORE,
        )

    @app_route
    async def upload(r: Request, who: Principal) -> Response:
        who.require("admin")
        # The admin may curate the list before the mailbox is set up (needs_connection).
        state = store.feature_state(who, "email_attachments")
        if state.state not in ("available", "needs_connection"):
            raise FeatureUnavailable("email_attachments", state)
        name = " ".join(r.query_params.get("name", "").split())
        declared = r.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_FILE):
            raise CloudError("too_large", "files can be at most 5 MB")
        blob = b""
        async for chunk in r.stream():
            blob += chunk
            if len(blob) > MAX_FILE:
                raise CloudError("too_large", "files can be at most 5 MB")
        mime = check_file(name, r.headers.get("content-type", ""), blob)
        fid = secrets.token_hex(8)
        with store._tx() as db:
            used = db.execute(
                "SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM email_attachments"
                " WHERE company_id = ?",
                (who.company,),
            ).fetchone()
            if used["n"] >= MAX_FILES:
                raise CloudError("storage_full", f"at most {MAX_FILES} files; delete one first")
            if used["bytes"] + len(blob) > MAX_TOTAL:
                raise CloudError("storage_full", "the 25 MB for attachments is used up")
            db.execute(
                "INSERT INTO email_attachments(id, company_id, name, mime, size, sha256, data,"
                " created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    fid,
                    who.company,
                    name,
                    mime,
                    len(blob),
                    hashlib.sha256(blob).hexdigest(),
                    blob,
                    who.user_id,
                    now_ms(),
                ),
            )
            store.audit(
                db,
                "email.attachment.add",
                f"{name} ({len(blob)} bytes)",
                company_id=who.company,
                actor=who,
                ip=ip_of(r),
            )
        return JSONResponse({"attachments": listing(store, who.company)}, status_code=201)

    @app_route
    async def remove(r: Request, who: Principal) -> Response:
        who.require("admin")
        fid = r.path_params["id"]
        with store._tx() as db:
            row = db.execute(
                "SELECT name FROM email_attachments WHERE id = ? AND company_id = ?",
                (fid, who.company),
            ).fetchone()
            if row is None:
                raise CloudError("not_found", "no such attachment")
            db.execute(
                "DELETE FROM email_attachments WHERE id = ? AND company_id = ?", (fid, who.company)
            )
            store.audit(
                db,
                "email.attachment.delete",
                str(row["name"]),
                company_id=who.company,
                actor=who,
                ip=ip_of(r),
            )
        return JSONResponse({"attachments": listing(store, who.company)}, headers=NO_STORE)

    @app_route
    async def agent_list(_r: Request, who: Principal) -> Response:
        store.require_feature(who, "email_attachments")
        return JSONResponse(
            {
                "attachments": [
                    {k: a[k] for k in ("id", "name", "mime", "size")}
                    for a in listing(store, who.company)
                ]
            },
            headers=NO_STORE,
        )

    return [
        Route("/api/v1/company/email/attachments", admin_list),
        Route("/api/v1/company/email/attachments", upload, methods=["PUT"]),
        Route("/api/v1/company/email/attachments/{id}", remove, methods=["DELETE"]),
        Route("/api/v1/email/attachments", agent_list),
    ]
