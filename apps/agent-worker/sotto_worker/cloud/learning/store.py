"""Ratings and learned instructions on the management server (R11, D-034).

Ratings are per person and per org and carry no words from the call: card id, type, source,
up/down and reason chips. The card text and the customer turns stay on the agent's device; the
device builds the minimised packet and runs the learning prompt itself (D-022), then sends only
the resulting instructions here.

Learned instructions are one list per org, versioned. Every change (a learning run, an admin edit,
a revert) is a new version; a version from a learning run waits for approval when the org turned
on "review before apply". The active list reaches clients in the call bundle, so a call that is
already running never changes (the bundle is not swapped during a call)."""

from __future__ import annotations

import json
import secrets
import sqlite3
from typing import Any

from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

MAX_ITEMS = 8
MAX_WORDS = 25
MAX_CHARS = 220
MIN_RATINGS = 3
REASONS = ("wrong", "too_long", "not_our_style", "good_phrasing")
# Only AI advice cards are rateable: playbook, holding and system cards are not (D-034).
RATEABLE_SOURCES = ("ai", "backup")
RATEABLE_TYPES = ("answer", "question", "objection", "signal", "warning")
KEPT_VERSIONS = 50

SCHEMA = """
CREATE TABLE IF NOT EXISTS card_ratings (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  card_type TEXT NOT NULL,
  card_source TEXT NOT NULL,
  rating INTEGER NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, card_id)
);
CREATE INDEX IF NOT EXISTS card_ratings_call ON card_ratings(company_id, call_id);
CREATE INDEX IF NOT EXISTS card_ratings_at ON card_ratings(company_id, at);
CREATE TABLE IF NOT EXISTS learned_versions (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  items TEXT NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  source_call TEXT,
  actor_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, version)
);
CREATE TABLE IF NOT EXISTS learning_state (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  active_version INTEGER NOT NULL DEFAULT 0,
  review_before_apply INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS learning_seen (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id)
);
"""


def clean_instruction(text: object) -> str:
    """One instruction: plain text, one line, 1 to 25 words."""
    if not isinstance(text, str):
        raise CloudError("invalid", "each instruction must be text")
    out = " ".join(text.split())
    if not out:
        raise CloudError("invalid", "an instruction cannot be empty")
    if len(out.split(" ")) > MAX_WORDS or len(out) > MAX_CHARS:
        raise CloudError("invalid", f"an instruction has at most {MAX_WORDS} words")
    return out


def _call_id(value: object) -> str:
    if not isinstance(value, str) or not 0 < len(value) <= 80:
        raise CloudError("invalid", "call_id is required")
    return value


class LearningStore:
    def __init__(self, store: CloudStore) -> None:
        self.s = store
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- ratings -------------------------------------------------------------------------------
    def rate(self, who: Principal, data: dict[str, Any]) -> dict[str, Any]:
        self.s.require_feature(who, "card_ratings")
        call_id = _call_id(data.get("call_id"))
        card_id = data.get("card_id")
        if not isinstance(card_id, str) or not 0 < len(card_id) <= 80:
            raise CloudError("invalid", "card_id is required")
        card_type, source = data.get("card_type"), data.get("card_source")
        if card_type not in RATEABLE_TYPES or source not in RATEABLE_SOURCES:
            raise CloudError("not_rateable", "only AI advice cards can be rated")
        rating = data.get("rating")
        reasons = data.get("reasons") or []
        if not isinstance(reasons, list) or any(r not in REASONS for r in reasons):
            raise CloudError("invalid", "unknown reason")
        with self.s._tx() as db:
            if rating is None:
                db.execute(
                    "DELETE FROM card_ratings WHERE company_id=? AND user_id=? AND card_id=?",
                    (who.company, who.user_id, card_id),
                )
                return {"rating": None}
            if rating not in ("up", "down"):
                raise CloudError("invalid", "rating must be up, down or null")
            db.execute(
                "INSERT INTO card_ratings(company_id, user_id, call_id, card_id, card_type,"
                " card_source, rating, reasons, at) VALUES (?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(company_id, user_id, card_id) DO UPDATE SET rating=excluded.rating,"
                " reasons=excluded.reasons, at=excluded.at",
                (
                    who.company,
                    who.user_id,
                    call_id,
                    card_id,
                    card_type,
                    source,
                    1 if rating == "up" else -1,
                    json.dumps(sorted(set(reasons))),
                    now_ms(),
                ),
            )
        return {"rating": rating, "reasons": sorted(set(reasons))}

    def ratings_in_call(self, who: Principal, call_id: str) -> int:
        row = self.s._q(
            "SELECT COUNT(*) AS n FROM card_ratings WHERE company_id=? AND user_id=? AND call_id=?",
            (who.company, who.user_id, call_id),
        )
        return int(row[0]["n"])

    def summary(self, who: Principal, days: int = 30) -> dict[str, Any]:
        """Aggregates for admins: totals, reasons, card types and people. No call words."""
        who.require("admin")
        since = now_ms() - max(1, min(days, 365)) * 86_400_000
        rows = self.s._q(
            "SELECT r.*, u.name AS person FROM card_ratings r LEFT JOIN users u ON u.id = r.user_id"
            " WHERE r.company_id=? AND r.at>=?",
            (who.company, since),
        )
        reasons = dict.fromkeys(REASONS, 0)
        by_type: dict[str, dict[str, int]] = {}
        people: dict[str, dict[str, Any]] = {}
        calls: set[str] = set()
        up = 0
        for r in rows:
            good = r["rating"] > 0
            up += good
            calls.add(r["call_id"])
            for reason in json.loads(r["reasons"]):
                reasons[reason] = reasons.get(reason, 0) + 1
            t = by_type.setdefault(r["card_type"], {"up": 0, "down": 0})
            t["up" if good else "down"] += 1
            p = people.setdefault(r["user_id"], {"name": r["person"] or "", "up": 0, "down": 0})
            p["up" if good else "down"] += 1
        return {
            "days": days,
            "total": len(rows),
            "up": up,
            "down": len(rows) - up,
            "calls": len(calls),
            "reasons": reasons,
            "by_type": by_type,
            "people": sorted(people.values(), key=lambda p: -(p["up"] + p["down"])),
        }

    # --- learned instructions ------------------------------------------------------------------
    def _state(self, company_id: str) -> sqlite3.Row | None:
        rows = self.s._q("SELECT * FROM learning_state WHERE company_id=?", (company_id,))
        return rows[0] if rows else None

    def _version(self, company_id: str, version: int) -> sqlite3.Row | None:
        rows = self.s._q(
            "SELECT * FROM learned_versions WHERE company_id=? AND version=?",
            (company_id, version),
        )
        return rows[0] if rows else None

    def _active_items(self, company_id: str) -> list[dict[str, Any]]:
        st = self._state(company_id)
        if not st or not st["active_version"]:
            return []
        row = self._version(company_id, int(st["active_version"]))
        return list(json.loads(row["items"])) if row else []

    def version_of(self, who: Principal) -> int | None:
        """The active version number for the feature check (None when unavailable)."""
        if who.company_id is None:
            return None
        if self.s.feature_state(who, "learned_instructions").state != "available":
            return None
        st = self._state(who.company)
        return int(st["active_version"]) if st else 0

    def active_for_call(self, who: Principal) -> dict[str, Any] | None:
        """What the bundle carries: the enabled instructions of the active version, in order.
        None when the feature is not available to this person (D-036: withheld, not hidden)."""
        if self.s.feature_state(who, "learned_instructions").state != "available":
            return None
        st = self._state(who.company)
        version = int(st["active_version"]) if st else 0
        items = [i["text"] for i in self._active_items(who.company) if i.get("enabled", True)]
        return {"version": version, "instructions": items}

    def _write_version(
        self,
        db: sqlite3.Connection,
        company_id: str,
        items: list[dict[str, Any]],
        *,
        origin: str,
        status: str,
        actor: Principal,
        source_call: str | None = None,
    ) -> int:
        last = db.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM learned_versions WHERE company_id=?",
            (company_id,),
        ).fetchone()["v"]
        version = int(last) + 1
        db.execute(
            "INSERT INTO learned_versions(company_id, version, items, status, origin, source_call,"
            " actor_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                company_id,
                version,
                json.dumps(items),
                status,
                origin,
                source_call,
                actor.user_id,
                now_ms(),
            ),
        )
        if status == "applied":
            self._activate(db, company_id, version)
        db.execute(
            "DELETE FROM learned_versions WHERE company_id=? AND version<=?",
            (company_id, version - KEPT_VERSIONS),
        )
        return version

    @staticmethod
    def _activate(db: sqlite3.Connection, company_id: str, version: int) -> None:
        db.execute(
            "INSERT INTO learning_state(company_id, active_version) VALUES (?,?)"
            " ON CONFLICT(company_id) DO UPDATE SET active_version=excluded.active_version",
            (company_id, version),
        )

    def propose(self, who: Principal, data: dict[str, Any], *, ip: str = "") -> dict[str, Any]:
        """A learning run's result from the agent's device: the full new list (≤ 8). Allowed once
        per call, and only after that person rated at least three cards in it."""
        self.s.require_feature(who, "learned_instructions")
        call_id = _call_id(data.get("call_id"))
        if self.ratings_in_call(who, call_id) < MIN_RATINGS:
            raise CloudError("too_few_ratings", f"rate at least {MIN_RATINGS} cards first")
        raw = data.get("instructions")
        if not isinstance(raw, list):
            raise CloudError("invalid", "instructions must be a list")
        texts: list[str] = []
        for t in raw:
            c = clean_instruction(t)
            if c not in texts:
                texts.append(c)
        current = self._active_items(who.company)
        kept_off = [i for i in current if not i.get("enabled", True)]
        if len(texts) > MAX_ITEMS - len(kept_off):
            raise CloudError("invalid", f"at most {MAX_ITEMS} instructions")
        known = {i["text"]: i for i in current if i.get("enabled", True)}
        t = now_ms()
        # UX-06c: who the call was with, as the agent's device names it ("From the call with
        # Sara, 12 Nov"); a name only, like an escalation's customer.
        label = " ".join(str(data.get("source_label") or "").split())[:60]
        items = [
            known.get(text)
            or {
                "id": secrets.token_hex(6),
                "text": text,
                "enabled": True,
                "source_call": call_id,
                "added_at": t,
                **({"source_label": label} if label else {}),
            }
            for text in texts
        ] + kept_off
        st = self._state(who.company)
        review = bool(st and st["review_before_apply"])
        with self.s._tx() as db:
            done = db.execute(
                "SELECT version, status FROM learned_versions WHERE company_id=?"
                " AND origin='learning' AND source_call=?",
                (who.company, call_id),
            ).fetchone()
            if done:  # a retried upload never makes a second version
                return {"version": int(done["version"]), "status": done["status"]}
            status = "pending" if review else "applied"
            version = self._write_version(
                db,
                who.company,
                items,
                origin="learning",
                status=status,
                actor=who,
                source_call=call_id,
            )
            self.s.audit(
                db,
                "learning.proposed" if review else "learning.applied",
                f"v{version} from call {call_id}: {len(texts)} instructions",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"version": version, "status": status}

    def overview(self, who: Principal) -> dict[str, Any]:
        """The editor's view: the active list, the review switch, every kept version and the
        number of versions this admin has not seen yet (the "New instructions" badge)."""
        who.require("admin")
        self.s.require_feature(who, "learned_instructions")
        st = self._state(who.company)
        active = int(st["active_version"]) if st else 0
        rows = self.s._q(
            "SELECT v.*, u.name AS actor FROM learned_versions v LEFT JOIN users u"
            " ON u.id = v.actor_id WHERE v.company_id=? ORDER BY v.version DESC",
            (who.company,),
        )
        seen = self.s._q(
            "SELECT version FROM learning_seen WHERE company_id=? AND user_id=?",
            (who.company, who.user_id),
        )
        seen_v = int(seen[0]["version"]) if seen else 0
        versions = [
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
        return {
            "active_version": active,
            "review_before_apply": bool(st and st["review_before_apply"]),
            "items": self._active_items(who.company),
            "versions": versions,
            "pending": [v["version"] for v in versions if v["status"] == "pending"],
            "new": sum(1 for v in versions if v["origin"] == "learning" and v["version"] > seen_v),
            "limits": {"items": MAX_ITEMS, "words": MAX_WORDS},
        }

    def save(self, who: Principal, data: dict[str, Any], *, ip: str = "") -> dict[str, Any]:
        """An admin edit (text, order, on/off, delete) of the active list: a new version."""
        who.require("admin")
        self.s.require_feature(who, "learned_instructions")
        raw = data.get("items")
        if not isinstance(raw, list) or len(raw) > MAX_ITEMS:
            raise CloudError("invalid", f"at most {MAX_ITEMS} instructions")
        old = {i["id"]: i for i in self._active_items(who.company)}
        t = now_ms()
        items: list[dict[str, Any]] = []
        for entry in raw:
            if not isinstance(entry, dict):
                raise CloudError("invalid", "each instruction must be an object")
            prev = old.get(str(entry.get("id", "")))
            items.append(
                {
                    "id": prev["id"] if prev else secrets.token_hex(6),
                    "text": clean_instruction(entry.get("text")),
                    "enabled": entry.get("enabled", True) is not False,
                    "source_call": prev.get("source_call") if prev else None,
                    "added_at": prev.get("added_at", t) if prev else t,
                    **(
                        {"source_label": prev["source_label"]}
                        if prev and prev.get("source_label")
                        else {}
                    ),
                }
            )
        with self.s._tx() as db:
            version = self._write_version(
                db, who.company, items, origin="edit", status="applied", actor=who
            )
            self.s.audit(
                db,
                "learning.edited",
                f"v{version}: {len(items)} instructions",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.overview(who)

    def revert(self, who: Principal, version: int, *, ip: str = "") -> dict[str, Any]:
        """Back to an earlier list: copied into a new version, so the revert can be undone."""
        who.require("admin")
        self.s.require_feature(who, "learned_instructions")
        row = self._version(who.company, version)
        if row is None:
            raise CloudError("not_found", "no such version")
        with self.s._tx() as db:
            new = self._write_version(
                db,
                who.company,
                json.loads(row["items"]),
                origin="revert",
                status="applied",
                actor=who,
                source_call=row["source_call"],
            )
            self.s.audit(
                db,
                "learning.reverted",
                f"v{new} = v{version}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.overview(who)

    def decide(
        self, who: Principal, version: int, approve: bool, *, ip: str = ""
    ) -> dict[str, Any]:
        """Approve or reject a version waiting for review."""
        who.require("admin")
        self.s.require_feature(who, "learned_instructions")
        row = self._version(who.company, version)
        if row is None or row["status"] != "pending":
            raise CloudError("not_found", "no such version waiting for review")
        with self.s._tx() as db:
            db.execute(
                "UPDATE learned_versions SET status=? WHERE company_id=? AND version=?",
                ("applied" if approve else "rejected", who.company, version),
            )
            if approve:
                self._activate(db, who.company, version)
            self.s.audit(
                db,
                "learning.approved" if approve else "learning.rejected",
                f"v{version}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.overview(who)

    def set_review(self, who: Principal, on: object, *, ip: str = "") -> dict[str, Any]:
        who.require("admin")
        self.s.require_feature(who, "learned_instructions")
        if not isinstance(on, bool):
            raise CloudError("invalid", "review_before_apply must be true or false")
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO learning_state(company_id, review_before_apply) VALUES (?,?)"
                " ON CONFLICT(company_id) DO UPDATE SET"
                " review_before_apply=excluded.review_before_apply",
                (who.company, int(on)),
            )
            self.s.audit(
                db,
                "learning.review_switch",
                "on" if on else "off",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.overview(who)

    def mark_seen(self, who: Principal) -> None:
        who.require("admin")
        with self.s._tx() as db:
            last = db.execute(
                "SELECT COALESCE(MAX(version), 0) AS v FROM learned_versions WHERE company_id=?",
                (who.company,),
            ).fetchone()["v"]
            db.execute(
                "INSERT INTO learning_seen(company_id, user_id, version) VALUES (?,?,?)"
                " ON CONFLICT(company_id, user_id) DO UPDATE SET version=excluded.version",
                (who.company, who.user_id, int(last)),
            )
