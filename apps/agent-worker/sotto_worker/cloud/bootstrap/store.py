"""Playbook bootstrap drafts (ZC-04, D-066).

A manager or admin collects material (Zoho won deals and their notes, read-only; one page of the
company website; a pasted document). The device runs the `playbook_bootstrap` prompt on it through
the router (D-022, like learning in `features/learning/learn.ts`) and sends back question/answer
pairs. They land here as "needs review": a table of its own, so the call bundle (built from
`playbook` only) can never carry a draft. A manager's approval turns one draft into one playbook
entry, audited. Nothing runs before the company's consent record exists (D-063)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

SOURCES = ("zoho", "website", "document")
MAX_PER_RUN = 50
MAX_OPEN = 200
MAX_Q = 300
MAX_A = 600
MAX_ANSWER_WORDS = 40  # the playbook's own limit (store._entry)
# Free-mail domains never count as "the company's own website".
FREE_MAIL = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "yahoo.com",
        "icloud.com",
        "me.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "gmx.com",
        "mail.com",
        "yandex.com",
        "zoho.com",
    }
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS bootstrap_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'needs_review',
  playbook_id TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS bootstrap_drafts_company ON bootstrap_drafts(company_id, status)
"""


def _text(value: object, name: str, limit: int) -> str:
    if not isinstance(value, str):
        raise CloudError("invalid", f"{name} must be text")
    out = " ".join(value.split())
    if not out:
        raise CloudError("invalid", f"{name} cannot be empty")
    return out[:limit]


class BootstrapStore:
    def __init__(self, store: CloudStore) -> None:
        self.s = store
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- gates -----------------------------------------------------------------------------------
    def consent(self, company_id: str) -> dict[str, Any] | None:
        record = self.s._defaults_raw(company_id).get("consent")
        return record if isinstance(record, dict) and record.get("accepted_at") else None

    def require(self, who: Principal) -> None:
        who.require("admin", "manager")
        if self.consent(who.company) is None:
            raise CloudError(
                "consent_required",
                "an admin must first confirm who processes your data (Settings > AI vendors)",
            )

    def domains(self, company_id: str) -> list[str]:
        """The company's own web domains: its admins' and managers' email domains, no free mail."""
        rows = self.s._q(
            "SELECT email FROM users WHERE company_id = ? AND active = 1"
            " AND role IN ('admin', 'manager')",
            (company_id,),
        )
        out = {str(r["email"]).rsplit("@", 1)[-1].lower() for r in rows if "@" in r["email"]}
        return sorted(d for d in out if d not in FREE_MAIL)

    # --- drafts ----------------------------------------------------------------------------------
    def add(self, who: Principal, source: object, items: object, *, ip: str = "") -> dict[str, Any]:
        self.require(who)
        if source not in SOURCES:
            raise CloudError("invalid", f"source must be one of {', '.join(SOURCES)}")
        if not isinstance(items, list) or not items:
            raise CloudError("invalid", "send items as a list of {question, answer}")
        if len(items) > MAX_PER_RUN:
            raise CloudError("invalid", f"send at most {MAX_PER_RUN} drafts at a time")
        rows: list[tuple[Any, ...]] = []
        t = now_ms()
        for item in items:
            if not isinstance(item, dict):
                raise CloudError("invalid", "each draft is {question, answer, tags?}")
            q = _text(item.get("question"), "question", MAX_Q)
            a = _text(item.get("answer"), "answer", MAX_A)
            if len(a.split()) > MAX_ANSWER_WORDS:
                a = " ".join(a.split()[:MAX_ANSWER_WORDS])
            raw_tags = item.get("tags") or []
            tags = (
                [str(x)[:30] for x in raw_tags if isinstance(x, str)][:5]
                if isinstance(raw_tags, list)
                else []
            )
            rows.append(
                (str(uuid.uuid4()), who.company, source, q, a, json.dumps(tags), t, who.user_id)
            )
        with self.s._tx() as db:
            (open_now,) = db.execute(
                "SELECT COUNT(*) FROM bootstrap_drafts WHERE company_id = ?"
                " AND status = 'needs_review'",
                (who.company,),
            ).fetchone()
            if open_now + len(rows) > MAX_OPEN:
                raise CloudError(
                    "too_many", f"review the open drafts first (at most {MAX_OPEN} wait)"
                )
            db.executemany(
                "INSERT INTO bootstrap_drafts(id, company_id, source, question, answer, tags_json,"
                " created_at, created_by) VALUES (?,?,?,?,?,?,?,?)",
                rows,
            )
            self.s.audit(
                db,
                "playbook.bootstrap.drafted",
                f"{source}: {len(rows)}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"added": len(rows)}

    def list(self, who: Principal) -> list[dict[str, Any]]:
        who.require("admin", "manager")
        rows = self.s._q(
            "SELECT * FROM bootstrap_drafts WHERE company_id = ? AND status = 'needs_review'"
            " ORDER BY created_at, rowid",
            (who.company,),
        )
        return [
            {
                "id": r["id"],
                "source": r["source"],
                "question": r["question"],
                "answer": r["answer"],
                "tags": json.loads(r["tags_json"]),
                "status": r["status"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def _open(self, who: Principal, draft_id: str) -> Any:
        rows = self.s._q(
            "SELECT * FROM bootstrap_drafts WHERE company_id = ? AND id = ?",
            (who.company, draft_id),
        )
        if not rows or rows[0]["status"] != "needs_review":
            raise CloudError("not_found", "no such draft waiting for review")
        return rows[0]

    def approve(
        self, who: Principal, draft_id: str, data: dict[str, Any], *, ip: str = ""
    ) -> dict[str, Any]:
        """The manager's approval: the (edited) draft becomes one playbook entry."""
        who.require("admin", "manager")
        row = self._open(who, draft_id)
        entry = self.s.add_entry(
            who,
            {
                "question": data.get("question") or row["question"],
                "answer": data.get("answer") or row["answer"],
                "tags": data.get("tags") if "tags" in data else json.loads(row["tags_json"]),
            },
            ip=ip,
        )
        with self.s._tx() as db:
            db.execute(
                "UPDATE bootstrap_drafts SET status = 'approved', playbook_id = ?, decided_at = ?,"
                " decided_by = ? WHERE id = ? AND company_id = ?",
                (entry, now_ms(), who.user_id, draft_id, who.company),
            )
            self.s.audit(
                db,
                "playbook.bootstrap.approved",
                str(row["question"])[:300],
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"id": draft_id, "status": "approved", "playbook_id": entry}

    def reject(self, who: Principal, draft_id: str, *, ip: str = "") -> dict[str, Any]:
        who.require("admin", "manager")
        row = self._open(who, draft_id)
        with self.s._tx() as db:
            db.execute(
                "UPDATE bootstrap_drafts SET status = 'rejected', decided_at = ?, decided_by = ?"
                " WHERE id = ? AND company_id = ?",
                (now_ms(), who.user_id, draft_id, who.company),
            )
            self.s.audit(
                db,
                "playbook.bootstrap.rejected",
                str(row["question"])[:300],
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"id": draft_id, "status": "rejected"}
