"""Per-agent and company-wide style memory + post-call wizard state (Round 4, A1-A4, R11).

Every table carries `company_id` and every query filters by `company_id`, ensuring strict
multi-tenant isolation (company A can never read, insert, update, or delete company B rows).
Builds on `cloud/learning/`: migrates existing learned instructions into company-wide style
memory rules on first read so nothing is lost.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
import uuid
from typing import Any, Literal

from sotto_worker.cloud.memory.redact import strip_personal_data
from sotto_worker.cloud.obs.log import log_event
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

MAX_RULES = 12
MAX_WORDS = 25
MAX_CHARS = 240
KEPT_VERSIONS = 50
RAW_FEEDBACK_RETENTION_DAYS = 90
RAW_FEEDBACK_RETENTION_MS = RAW_FEEDBACK_RETENTION_DAYS * 86_400_000
WIZARD_DRAFT_TTL_MS = 24 * 3600 * 1000
WIZARD_FEEDBACK_TTL_MS = 7 * 86_400_000
MERGE_MAX_RETRIES = 3

FeedbackSource = Literal["card", "call_note", "coach_review"]
FeedbackRating = Literal["up", "down"]
MemoryScope = Literal["company", "agent"]

SOURCES: tuple[str, ...] = ("card", "call_note", "coach_review")
# Canonical Round 4 reasons (A2) + backward-compatible good_phrasing; legacy `not_our_style`
# maps cleanly to `too_formal`.
CANONICAL_REASONS: tuple[str, ...] = (
    "too_long",
    "too_formal",
    "wrong",
    "not_relevant",
    "good_phrasing",
)
REASON_MIGRATION: dict[str, str] = {
    "not_our_style": "too_formal",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_feedback (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT,
  source TEXT NOT NULL,
  card_id TEXT,
  rating TEXT,
  reasons TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  merged INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_feedback_company_user
  ON memory_feedback(company_id, user_id, merged, created_at);
CREATE INDEX IF NOT EXISTS memory_feedback_created
  ON memory_feedback(created_at);

CREATE TABLE IF NOT EXISTS memory_versions (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  items TEXT NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  source_call TEXT,
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, scope, user_id, version)
);
CREATE INDEX IF NOT EXISTS memory_versions_company
  ON memory_versions(company_id, scope, user_id, status);

CREATE TABLE IF NOT EXISTS memory_state (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, scope, user_id)
);

CREATE TABLE IF NOT EXISTS memory_settings (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  review_before_apply INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS postcall_wizard_state (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  drafts_json TEXT NOT NULL DEFAULT '{}',
  completed_steps TEXT NOT NULL DEFAULT '[]',
  feedback_done INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  saved_at INTEGER NOT NULL,
  expires_drafts_at INTEGER NOT NULL,
  expires_feedback_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, call_id)
);
CREATE INDEX IF NOT EXISTS postcall_wizard_expiry
  ON postcall_wizard_state(expires_drafts_at, expires_feedback_at);
"""


def normalize_reason(reason: str) -> str:
    """Map legacy R11 reason names to Round 4 canonical reasons."""
    mapped = REASON_MIGRATION.get(reason, reason)
    if mapped not in CANONICAL_REASONS:
        raise CloudError("invalid", f"unknown feedback reason: {reason}")
    return mapped


def clean_rule(text: object) -> str:
    """Validate and normalize a single style memory rule (1..25 words, <= 240 chars)."""
    if not isinstance(text, str):
        raise CloudError("invalid", "each rule must be text")
    out = " ".join(text.split())
    if not out:
        raise CloudError("invalid", "rule cannot be empty")
    if len(out.split(" ")) > MAX_WORDS or len(out) > MAX_CHARS:
        raise CloudError("invalid", f"each rule must be at most {MAX_WORDS} words")
    return out


def _scope_key(scope: str, user_id: str | None) -> tuple[MemoryScope, str]:
    if scope == "company":
        return ("company", "")
    if scope == "agent":
        if not user_id or not isinstance(user_id, str):
            raise CloudError("invalid", "user_id is required for agent scope")
        return ("agent", user_id)
    raise CloudError("invalid", "scope must be 'company' or 'agent'")


class MemoryStore:
    def __init__(self, store: CloudStore) -> None:
        self.s = store
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- migration from cloud/learning/ ---------------------------------------------------------
    def migrate_from_learning(self, company_id: str) -> int:
        """Migrate active learned_versions (R11) into company-wide style memory once."""
        existing = self.s._q(
            "SELECT active_version FROM memory_state"
            " WHERE company_id=? AND scope='company' AND user_id=''",
            (company_id,),
        )
        if existing and int(existing[0]["active_version"]) > 0:
            return 0
        # Check if legacy learning tables exist in this database
        tbl = self.s._q(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='learning_state'"
        )
        if not tbl:
            return 0
        st_rows = self.s._q(
            "SELECT active_version, review_before_apply FROM learning_state WHERE company_id=?",
            (company_id,),
        )
        if not st_rows:
            return 0
        st = st_rows[0]
        active_v = int(st["active_version"])
        review_on = int(st["review_before_apply"])
        items: list[dict[str, Any]] = []
        if active_v > 0:
            v_rows = self.s._q(
                "SELECT items, source_call, actor_id FROM learned_versions"
                " WHERE company_id=? AND version=?",
                (company_id, active_v),
            )
            if v_rows:
                raw_items = json.loads(v_rows[0]["items"])
                now = now_ms()
                for entry in raw_items[:MAX_RULES]:
                    txt = str(entry.get("text", "")).strip()
                    if not txt:
                        continue
                    items.append(
                        {
                            "id": str(entry.get("id") or secrets.token_hex(6)),
                            "text": txt,
                            "enabled": entry.get("enabled", True) is not False,
                            "source_call": entry.get("source_call"),
                            "added_at": int(entry.get("added_at") or now),
                            "updated_at": now,
                        }
                    )
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO memory_settings(company_id, review_before_apply) VALUES (?,?)"
                " ON CONFLICT(company_id) DO NOTHING",
                (company_id, review_on),
            )
            if items:
                self._write_version(
                    db,
                    company_id,
                    "company",
                    "",
                    items,
                    origin="migration",
                    status="applied",
                    actor_id=None,
                )
        return len(items)

    # --- feedback (contract §3.4) ---------------------------------------------------------------
    def add_feedback(
        self,
        company_id: str,
        user_id: str,
        call_id: str | None,
        source: FeedbackSource,
        rating: FeedbackRating | None,
        reasons: list[str],
        note: str | None,
        card_id: str | None = None,
        *,
        known_names: tuple[str, ...] = (),
        now: int | None = None,
    ) -> str:
        """Store PII-stripped feedback for a user in a company. Returns the feedback row id."""
        if not company_id or not user_id:
            raise CloudError("invalid", "company_id and user_id are required")
        if call_id is not None and (not isinstance(call_id, str) or len(call_id) > 80):
            raise CloudError("invalid", "call_id must be a short string")
        if card_id is not None and (not isinstance(card_id, str) or len(card_id) > 80):
            raise CloudError("invalid", "card_id must be a short string")
        if note is not None and not isinstance(note, str):
            raise CloudError("invalid", "note must be text")
        if source not in SOURCES:
            raise CloudError("invalid", f"invalid feedback source: {source}")
        if rating is not None and rating not in ("up", "down"):
            raise CloudError("invalid", "rating must be 'up', 'down', or null")
        if not isinstance(reasons, list) or len(reasons) > 20:
            raise CloudError("invalid", "reasons must be a list of at most 20 entries")
        clean_reasons = sorted({normalize_reason(str(r)) for r in reasons})
        names = list(known_names)
        if not names and call_id:
            rows = self.s._q(
                "SELECT brief_json FROM call_briefs WHERE company_id=? AND call_id=?",
                (company_id, call_id),
            )
            if rows:
                try:
                    brief = json.loads(rows[0]["brief_json"])
                    person = brief.get("person") if isinstance(brief, dict) else None
                    if isinstance(person, dict) and isinstance(person.get("name"), str):
                        names.append(person["name"])
                except (TypeError, json.JSONDecodeError):
                    pass
        clean_note = strip_personal_data(note, known_names=tuple(names))
        if clean_note is not None and len(clean_note) > 1000:
            clean_note = clean_note[:1000]
        fid = str(uuid.uuid4())
        ts = now_ms() if now is None else now
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO memory_feedback(id, company_id, user_id, call_id, source, card_id,"
                " rating, reasons, note, merged, retry_count, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,0,0,?)",
                (
                    fid,
                    company_id,
                    user_id,
                    call_id,
                    source,
                    card_id,
                    rating,
                    json.dumps(clean_reasons),
                    clean_note,
                    ts,
                ),
            )
        log_event(
            "style_memory",
            "feedback_added",
            call_id=call_id,
            source=source,
            has_note=bool(clean_note),
            reason_count=len(clean_reasons),
        )
        return fid

    def pending_feedback(
        self,
        company_id: str,
        user_id: str,
        *,
        call_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Unmerged feedback rows for one user inside one company."""
        if call_id is not None:
            rows = self.s._q(
                "SELECT * FROM memory_feedback WHERE company_id=? AND user_id=? AND call_id=?"
                " AND merged=0 ORDER BY created_at ASC",
                (company_id, user_id, call_id),
            )
        else:
            rows = self.s._q(
                "SELECT * FROM memory_feedback WHERE company_id=? AND user_id=?"
                " AND merged=0 ORDER BY created_at ASC",
                (company_id, user_id),
            )
        return [
            {
                "id": r["id"],
                "call_id": r["call_id"],
                "source": r["source"],
                "card_id": r["card_id"],
                "rating": r["rating"],
                "reasons": json.loads(r["reasons"]),
                "note": r["note"],
                "retry_count": int(r["retry_count"]),
                "created_at": int(r["created_at"]),
            }
            for r in rows
        ]

    def mark_feedback_merged(self, company_id: str, feedback_ids: list[str]) -> None:
        if not feedback_ids:
            return
        with self.s._tx() as db:
            db.executemany(
                "UPDATE memory_feedback SET merged=1, last_error=NULL WHERE company_id=? AND id=?",
                [(company_id, fid) for fid in feedback_ids],
            )

    def record_merge_failure(self, company_id: str, feedback_ids: list[str], error: str) -> None:
        """Keep raw feedback unmerged and increment retry_count on merge failure (A3)."""
        if not feedback_ids:
            return
        truncated = error[:200]
        with self.s._tx() as db:
            db.executemany(
                "UPDATE memory_feedback SET retry_count=retry_count+1, last_error=?"
                " WHERE company_id=? AND id=?",
                [(truncated, company_id, fid) for fid in feedback_ids],
            )

    def purge_expired_feedback(self, now: int | None = None) -> int:
        """Delete raw feedback older than 90 days (A3 scheduled job)."""
        ts = now_ms() if now is None else now
        cutoff = ts - RAW_FEEDBACK_RETENTION_MS
        with self.s._tx() as db:
            cur = db.execute("DELETE FROM memory_feedback WHERE created_at <= ?", (cutoff,))
            deleted = cur.rowcount
        if deleted:
            log_event("style_memory", "feedback_purged", deleted=deleted)
        return deleted

    # --- versions & active rules ----------------------------------------------------------------
    def _active_version(self, company_id: str, scope: MemoryScope, user_id: str) -> int:
        rows = self.s._q(
            "SELECT active_version FROM memory_state WHERE company_id=? AND scope=? AND user_id=?",
            (company_id, scope, user_id),
        )
        return int(rows[0]["active_version"]) if rows else 0

    def _version_row(
        self, company_id: str, scope: MemoryScope, user_id: str, version: int
    ) -> sqlite3.Row | None:
        rows = self.s._q(
            "SELECT * FROM memory_versions"
            " WHERE company_id=? AND scope=? AND user_id=? AND version=?",
            (company_id, scope, user_id, version),
        )
        return rows[0] if rows else None

    def _active_items(
        self, company_id: str, scope: MemoryScope, user_id: str
    ) -> list[dict[str, Any]]:
        if scope == "company":
            self.migrate_from_learning(company_id)
        v = self._active_version(company_id, scope, user_id)
        if v <= 0:
            return []
        row = self._version_row(company_id, scope, user_id, v)
        return list(json.loads(row["items"])) if row else []

    def review_before_apply(self, company_id: str) -> bool:
        self.migrate_from_learning(company_id)
        rows = self.s._q(
            "SELECT review_before_apply FROM memory_settings WHERE company_id=?",
            (company_id,),
        )
        return bool(rows and rows[0]["review_before_apply"])

    def _write_version(
        self,
        db: sqlite3.Connection,
        company_id: str,
        scope: MemoryScope,
        user_id: str,
        items: list[dict[str, Any]],
        *,
        origin: str,
        status: str,
        actor_id: str | None,
        source_call: str | None = None,
        now: int | None = None,
    ) -> int:
        last = db.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM memory_versions"
            " WHERE company_id=? AND scope=? AND user_id=?",
            (company_id, scope, user_id),
        ).fetchone()["v"]
        version = int(last) + 1
        ts = now_ms() if now is None else now
        db.execute(
            "INSERT INTO memory_versions(company_id, scope, user_id, version, items, status,"
            " origin, source_call, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                company_id,
                scope,
                user_id,
                version,
                json.dumps(items),
                status,
                origin,
                source_call,
                actor_id,
                ts,
            ),
        )
        if status == "applied":
            db.execute(
                "INSERT INTO memory_state(company_id, scope, user_id, active_version)"
                " VALUES (?,?,?,?)"
                " ON CONFLICT(company_id, scope, user_id)"
                " DO UPDATE SET active_version=excluded.active_version",
                (company_id, scope, user_id, version),
            )
        db.execute(
            "DELETE FROM memory_versions WHERE company_id=? AND scope=? AND user_id=?"
            " AND version<=? AND status != 'pending'"
            " AND version != COALESCE((SELECT active_version FROM memory_state"
            " WHERE company_id=? AND scope=? AND user_id=?), 0)",
            (company_id, scope, user_id, version - KEPT_VERSIONS, company_id, scope, user_id),
        )
        return version

    # --- contract section 3.4 read --------------------------------------------------------------
    def get_style_memory(self, company_id: str, user_id: str) -> list[str]:
        """Return <= 12 enabled rules for live prompt injection: company then agent rules."""
        if not self.s.org_feature_on(company_id, "style_memory"):
            return []
        company_items = [
            i["text"]
            for i in self._active_items(company_id, "company", "")
            if i.get("enabled", True)
        ]
        agent_items = [
            i["text"]
            for i in self._active_items(company_id, "agent", user_id)
            if i.get("enabled", True)
        ]
        combined: list[str] = []
        seen: set[str] = set()
        for text in (*company_items, *agent_items):
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            combined.append(text)
            if len(combined) >= MAX_RULES:
                break
        return combined

    def save_merged_rules(
        self,
        company_id: str,
        user_id: str,
        merged_texts: list[str],
        *,
        source_call: str | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        """Persist output of the background merge job for an agent."""
        cleaned: list[str] = []
        for raw in merged_texts:
            c = clean_rule(raw)
            if c.casefold() not in {x.casefold() for x in cleaned}:
                cleaned.append(c)
            if len(cleaned) >= MAX_RULES:
                break
        current = self._active_items(company_id, "agent", user_id)
        kept_off = [i for i in current if not i.get("enabled", True)]
        max_enabled = max(0, MAX_RULES - len(kept_off))
        cleaned = cleaned[:max_enabled]
        known = {i["text"].casefold(): i for i in current if i.get("enabled", True)}
        ts = now_ms() if now is None else now
        new_items: list[dict[str, Any]] = []
        learned_count = 0
        for text in cleaned:
            prev = known.get(text.casefold())
            if prev:
                new_items.append({**prev, "text": text, "updated_at": ts})
            else:
                learned_count += 1
                new_items.append(
                    {
                        "id": secrets.token_hex(6),
                        "text": text,
                        "enabled": True,
                        "source_call": source_call,
                        "added_at": ts,
                        "updated_at": ts,
                    }
                )
        items = new_items + kept_off
        review = self.review_before_apply(company_id)
        status = "pending" if review else "applied"
        with self.s._tx() as db:
            version = self._write_version(
                db,
                company_id,
                "agent",
                user_id,
                items,
                origin="merge",
                status=status,
                actor_id=user_id,
                source_call=source_call,
                now=ts,
            )
        return {
            "version": version,
            "status": status,
            "learned_count": learned_count,
            "rules": [i["text"] for i in new_items],
        }

    # --- agent & admin views (A4) ---------------------------------------------------------------
    def _versions_out(
        self, company_id: str, scope: MemoryScope, user_id: str
    ) -> list[dict[str, Any]]:
        active = self._active_version(company_id, scope, user_id)
        rows = self.s._q(
            "SELECT v.*, u.name AS actor FROM memory_versions v LEFT JOIN users u"
            " ON u.id = v.actor_id WHERE v.company_id=? AND v.scope=? AND v.user_id=?"
            " ORDER BY v.version DESC",
            (company_id, scope, user_id),
        )
        return [
            {
                "version": int(r["version"]),
                "status": r["status"],
                "origin": r["origin"],
                "source_call": r["source_call"],
                "actor": r["actor"] or "",
                "created_at": int(r["created_at"]),
                "items": json.loads(r["items"]),
                "active": int(r["version"]) == active,
            }
            for r in rows
        ]

    def agent_view(self, who: Principal) -> dict[str, Any]:
        """Agent sees their own rules, company rules (read-only), and effective combined list."""
        self.s.require_feature(who, "style_memory")
        company_rules = self._active_items(who.company, "company", "")
        agent_rules = self._active_items(who.company, "agent", who.user_id)
        versions = self._versions_out(who.company, "agent", who.user_id)
        return {
            "user_id": who.user_id,
            "company_rules": company_rules,
            "agent_rules": agent_rules,
            "effective": self.get_style_memory(who.company, who.user_id),
            "pending": [v for v in versions if v["status"] == "pending"],
            "review_before_apply": self.review_before_apply(who.company),
            "limits": {"rules": MAX_RULES, "words": MAX_WORDS},
        }

    def admin_overview(self, who: Principal) -> dict[str, Any]:
        """Admin sees company roll-up + every agent's rules, versions, and pending items."""
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        self.migrate_from_learning(who.company)
        company_items = self._active_items(who.company, "company", "")
        company_versions = self._versions_out(who.company, "company", "")
        users = self.s._q(
            "SELECT id, name, email, role FROM users"
            " WHERE company_id=? AND active=1 ORDER BY name ASC",
            (who.company,),
        )
        agents: list[dict[str, Any]] = []
        for u in users:
            uid = str(u["id"])
            a_items = self._active_items(who.company, "agent", uid)
            a_versions = self._versions_out(who.company, "agent", uid)
            agents.append(
                {
                    "user_id": uid,
                    "name": u["name"],
                    "email": u["email"],
                    "role": u["role"],
                    "active_version": self._active_version(who.company, "agent", uid),
                    "items": a_items,
                    "versions": a_versions,
                    "pending": [v["version"] for v in a_versions if v["status"] == "pending"],
                    "effective": self.get_style_memory(who.company, uid),
                }
            )
        return {
            "review_before_apply": self.review_before_apply(who.company),
            "company": {
                "active_version": self._active_version(who.company, "company", ""),
                "items": company_items,
                "versions": company_versions,
                "pending": [v["version"] for v in company_versions if v["status"] == "pending"],
            },
            "agents": agents,
            "limits": {"rules": MAX_RULES, "words": MAX_WORDS},
        }

    def edit_rules(
        self,
        who: Principal,
        scope: str,
        user_id: str | None,
        raw_items: Any,
        *,
        ip: str = "",
    ) -> dict[str, Any]:
        """Admin edits company-wide or an agent's rules (audit logged, R3)."""
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        sc, uid = _scope_key(scope, user_id)
        if sc == "agent":
            self._require_company_user(who.company, uid)
        if not isinstance(raw_items, list) or len(raw_items) > MAX_RULES:
            raise CloudError("invalid", f"at most {MAX_RULES} rules")
        old = {i["id"]: i for i in self._active_items(who.company, sc, uid)}
        ts = now_ms()
        items: list[dict[str, Any]] = []
        for entry in raw_items:
            if not isinstance(entry, dict):
                raise CloudError("invalid", "each rule must be an object")
            prev = old.get(str(entry.get("id", "")))
            items.append(
                {
                    "id": prev["id"] if prev else secrets.token_hex(6),
                    "text": clean_rule(entry.get("text")),
                    "enabled": entry.get("enabled", True) is not False,
                    "source_call": prev.get("source_call") if prev else None,
                    "promoted_from": prev.get("promoted_from") if prev else None,
                    "added_at": prev.get("added_at", ts) if prev else ts,
                    "updated_at": ts,
                }
            )
        with self.s._tx() as db:
            version = self._write_version(
                db,
                who.company,
                sc,
                uid,
                items,
                origin="edit",
                status="applied",
                actor_id=who.user_id,
            )
            target = f"agent:{uid}" if sc == "agent" else "company"
            self.s.audit(
                db,
                "memory.edited",
                f"{target} v{version}: {len(items)} rules",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.admin_overview(who)

    def revert_version(
        self,
        who: Principal,
        scope: str,
        user_id: str | None,
        version: int,
        *,
        ip: str = "",
    ) -> dict[str, Any]:
        """Admin reverts company or agent rules to an earlier version (creates a new version)."""
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        sc, uid = _scope_key(scope, user_id)
        if sc == "agent":
            self._require_company_user(who.company, uid)
        row = self._version_row(who.company, sc, uid, version)
        if row is None:
            raise CloudError("not_found", "no such version")
        with self.s._tx() as db:
            new_v = self._write_version(
                db,
                who.company,
                sc,
                uid,
                json.loads(row["items"]),
                origin="revert",
                status="applied",
                actor_id=who.user_id,
                source_call=row["source_call"],
            )
            target = f"agent:{uid}" if sc == "agent" else "company"
            self.s.audit(
                db,
                "memory.reverted",
                f"{target} v{new_v} = v{version}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.admin_overview(who)

    def decide_version(
        self,
        who: Principal,
        scope: str,
        user_id: str | None,
        version: int,
        approve: bool,
        *,
        ip: str = "",
    ) -> dict[str, Any]:
        """Admin approves or rejects a pending merged version."""
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        sc, uid = _scope_key(scope, user_id)
        if sc == "agent":
            self._require_company_user(who.company, uid)
        row = self._version_row(who.company, sc, uid, version)
        if row is None or row["status"] != "pending":
            raise CloudError("not_found", "no such pending version")
        with self.s._tx() as db:
            db.execute(
                "UPDATE memory_versions SET status=?"
                " WHERE company_id=? AND scope=? AND user_id=? AND version=?",
                ("applied" if approve else "rejected", who.company, sc, uid, version),
            )
            if approve:
                db.execute(
                    "INSERT INTO memory_state(company_id, scope, user_id, active_version)"
                    " VALUES (?,?,?,?)"
                    " ON CONFLICT(company_id, scope, user_id)"
                    " DO UPDATE SET active_version=excluded.active_version",
                    (who.company, sc, uid, version),
                )
            target = f"agent:{uid}" if sc == "agent" else "company"
            self.s.audit(
                db,
                "memory.approved" if approve else "memory.rejected",
                f"{target} v{version}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.admin_overview(who)

    def promote_rule(
        self,
        who: Principal,
        from_user_id: str,
        rule_id: str,
        *,
        ip: str = "",
    ) -> dict[str, Any]:
        """Admin promotes an agent's rule to company-wide style memory (A4, audit logged)."""
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        self._require_company_user(who.company, from_user_id)
        agent_items = self._active_items(who.company, "agent", from_user_id)
        found = next((i for i in agent_items if i["id"] == rule_id), None)
        if found is None:
            raise CloudError("not_found", "rule not found for this agent")
        company_items = self._active_items(who.company, "company", "")
        if any(i["text"].casefold() == found["text"].casefold() for i in company_items):
            return self.admin_overview(who)
        if len(company_items) >= MAX_RULES:
            raise CloudError("invalid", f"company already has {MAX_RULES} rules")
        ts = now_ms()
        promoted = {
            "id": secrets.token_hex(6),
            "text": found["text"],
            "enabled": True,
            "source_call": found.get("source_call"),
            "promoted_from": from_user_id,
            "added_at": ts,
            "updated_at": ts,
        }
        with self.s._tx() as db:
            version = self._write_version(
                db,
                who.company,
                "company",
                "",
                [*company_items, promoted],
                origin="promote",
                status="applied",
                actor_id=who.user_id,
                source_call=found.get("source_call"),
            )
            self.s.audit(
                db,
                "memory.promoted",
                f"v{version} promoted rule {rule_id} from agent:{from_user_id}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.admin_overview(who)

    def set_review_before_apply(
        self, who: Principal, enabled: object, *, ip: str = ""
    ) -> dict[str, Any]:
        who.require("admin")
        self.s.require_feature(who, "style_memory")
        if not isinstance(enabled, bool):
            raise CloudError("invalid", "review_before_apply must be true or false")
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO memory_settings(company_id, review_before_apply) VALUES (?,?)"
                " ON CONFLICT(company_id)"
                " DO UPDATE SET review_before_apply=excluded.review_before_apply",
                (who.company, int(enabled)),
            )
            self.s.audit(
                db,
                "memory.review_switch",
                "on" if enabled else "off",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.admin_overview(who)

    def _require_company_user(self, company_id: str, user_id: str) -> None:
        rows = self.s._q(
            "SELECT id FROM users WHERE company_id=? AND id=?",
            (company_id, user_id),
        )
        if not rows:
            raise CloudError("not_found", "user not found in this company")

    # --- owner console read-only view (A4) ------------------------------------------------------
    def owner_overview(self) -> dict[str, Any]:
        """Read-only view of all companies' and agents' style memory for the platform owner."""
        companies = self.s._q("SELECT id, name, plan FROM companies ORDER BY name ASC")
        out: list[dict[str, Any]] = []
        for c in companies:
            cid = str(c["id"])
            self.migrate_from_learning(cid)
            company_rules = self._active_items(cid, "company", "")
            users = self.s._q(
                "SELECT id, name, email, role FROM users"
                " WHERE company_id=? AND active=1 ORDER BY name ASC",
                (cid,),
            )
            agents: list[dict[str, Any]] = []
            pending_total = 0
            for u in users:
                uid = str(u["id"])
                a_rules = self._active_items(cid, "agent", uid)
                a_versions = self._versions_out(cid, "agent", uid)
                p_count = sum(1 for v in a_versions if v["status"] == "pending")
                pending_total += p_count
                agents.append(
                    {
                        "user_id": uid,
                        "name": u["name"],
                        "email": u["email"],
                        "role": u["role"],
                        "rules": a_rules,
                        "pending_count": p_count,
                    }
                )
            out.append(
                {
                    "company_id": cid,
                    "name": c["name"],
                    "plan": c["plan"],
                    "review_before_apply": self.review_before_apply(cid),
                    "company_rules": company_rules,
                    "agents": agents,
                    "pending_total": pending_total,
                }
            )
        return {"companies": out, "read_only": True}

    # --- post-call wizard "Finish later" state (A1) ---------------------------------------------
    def save_wizard_state(
        self,
        who: Principal,
        call_id: str,
        data: dict[str, Any],
        *,
        now: int | None = None,
    ) -> dict[str, Any]:
        """Save the agent's place in the post-call wizard (24h drafts, 7d feedback queue)."""
        self.s.require_feature(who, "postcall_wizard")
        if not isinstance(call_id, str) or not call_id or len(call_id) > 80:
            raise CloudError("invalid", "call_id is required")
        step = data.get("current_step", 1)
        if isinstance(step, bool) or not isinstance(step, int) or not 1 <= step <= 5:
            raise CloudError("invalid", "current_step must be 1..5")
        drafts = data.get("drafts")
        if drafts is None:
            drafts = {}
        if not isinstance(drafts, dict) or len(json.dumps(drafts)) > 32_000:
            raise CloudError("invalid", "drafts must be a JSON object under 32 KB")
        completed = data.get("completed_steps") or []
        if not isinstance(completed, list) or any(
            isinstance(x, bool) or not isinstance(x, int) or not 1 <= x <= 5 for x in completed
        ):
            raise CloudError("invalid", "completed_steps must be step numbers 1..5")
        raw_done = data.get("feedback_done", False)
        if not isinstance(raw_done, bool):
            raise CloudError("invalid", "feedback_done must be true or false")
        feedback_done = raw_done
        ts = now_ms() if now is None else now
        existing = self.s._q(
            "SELECT saved_at, expires_drafts_at, expires_feedback_at FROM postcall_wizard_state"
            " WHERE company_id=? AND user_id=? AND call_id=?",
            (who.company, who.user_id, call_id),
        )
        if existing:
            exp_drafts = int(existing[0]["expires_drafts_at"])
            exp_feedback = int(existing[0]["expires_feedback_at"])
        else:
            exp_drafts = ts + WIZARD_DRAFT_TTL_MS
            exp_feedback = ts + WIZARD_FEEDBACK_TTL_MS
        status = (
            "done" if feedback_done else ("drafts_expired" if ts >= exp_drafts else "in_progress")
        )
        if status == "drafts_expired":
            drafts = {}
            step = 5
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO postcall_wizard_state(company_id, user_id, call_id, current_step,"
                " drafts_json, completed_steps, feedback_done, status, saved_at,"
                " expires_drafts_at, expires_feedback_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(company_id, user_id, call_id) DO UPDATE SET"
                " current_step=excluded.current_step, drafts_json=excluded.drafts_json,"
                " completed_steps=excluded.completed_steps, feedback_done=excluded.feedback_done,"
                " status=excluded.status, saved_at=excluded.saved_at",
                (
                    who.company,
                    who.user_id,
                    call_id,
                    step,
                    json.dumps(drafts),
                    json.dumps(sorted(set(completed))),
                    int(feedback_done),
                    status,
                    ts,
                    exp_drafts,
                    exp_feedback,
                ),
            )
        return self._format_wizard_row(
            {
                "call_id": call_id,
                "current_step": step,
                "drafts_json": json.dumps(drafts),
                "completed_steps": json.dumps(sorted(set(completed))),
                "feedback_done": int(feedback_done),
                "status": status,
                "saved_at": ts,
                "expires_drafts_at": exp_drafts,
                "expires_feedback_at": exp_feedback,
            },
            now=ts,
        )

    def get_wizard_state(
        self, who: Principal, call_id: str, *, now: int | None = None
    ) -> dict[str, Any] | None:
        self.s.require_feature(who, "postcall_wizard")
        ts = now_ms() if now is None else now
        self.expire_wizard_states(now=ts)
        rows = self.s._q(
            "SELECT * FROM postcall_wizard_state WHERE company_id=? AND user_id=? AND call_id=?",
            (who.company, who.user_id, call_id),
        )
        if not rows:
            return None
        return self._format_wizard_row(dict(rows[0]), now=ts)

    def list_wizard_queue(self, who: Principal, *, now: int | None = None) -> list[dict[str, Any]]:
        """List saved post-call wizards & pending feedback items for this user (within 7 days)."""
        self.s.require_feature(who, "postcall_wizard")
        ts = now_ms() if now is None else now
        self.expire_wizard_states(now=ts)
        rows = self.s._q(
            "SELECT * FROM postcall_wizard_state WHERE company_id=? AND user_id=?"
            " AND status != 'done' ORDER BY saved_at DESC",
            (who.company, who.user_id),
        )
        return [self._format_wizard_row(dict(r), now=ts) for r in rows]

    def delete_wizard_state(self, who: Principal, call_id: str) -> bool:
        self.s.require_feature(who, "postcall_wizard")
        with self.s._tx() as db:
            cur = db.execute(
                "DELETE FROM postcall_wizard_state WHERE company_id=? AND user_id=? AND call_id=?",
                (who.company, who.user_id, call_id),
            )
            return cur.rowcount > 0

    def expire_wizard_states(self, now: int | None = None) -> dict[str, int]:
        """After 24h delete unsent drafts (keep feedback step); after 7d remove from queue."""
        ts = now_ms() if now is None else now
        with self.s._tx() as db:
            expired_drafts = db.execute(
                "UPDATE postcall_wizard_state SET drafts_json='{}', status='drafts_expired',"
                " current_step=5 WHERE status='in_progress' AND expires_drafts_at <= ?",
                (ts,),
            ).rowcount
            expired_feedback = db.execute(
                "DELETE FROM postcall_wizard_state WHERE expires_feedback_at <= ?",
                (ts,),
            ).rowcount
        return {"drafts_expired": expired_drafts, "feedback_expired": expired_feedback}

    @staticmethod
    def _format_wizard_row(row: dict[str, Any], *, now: int) -> dict[str, Any]:
        return {
            "call_id": row["call_id"],
            "current_step": int(row["current_step"]),
            "drafts": json.loads(row["drafts_json"]),
            "completed_steps": json.loads(row["completed_steps"]),
            "feedback_done": bool(row["feedback_done"]),
            "status": row["status"],
            "saved_at": int(row["saved_at"]),
            "expires_drafts_at": int(row["expires_drafts_at"]),
            "expires_feedback_at": int(row["expires_feedback_at"]),
            "drafts_active": now < int(row["expires_drafts_at"]) and row["status"] == "in_progress",
        }
