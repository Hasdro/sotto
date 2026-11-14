"""Manager coaching and playbook suggestions on the management server (INT-05, INT-15).

Coaching reads what the team already does: card ratings (learning store), the six review-skill
scores (usage.review_json), objection themes and learned instructions. Who sees whom:
- an agent sees only themselves;
- a manager sees their team: the agents an admin assigned to them, or every agent of the company
  while none are assigned (one team until teams exist), plus themselves;
- an admin sees the company.
People are listed by name, never ranked (HR-sensitive data, INT-05).

The device sends signals after a call (D-022: call words stay on the device): the objection
themes of the call, and for each AI card the agent marked "not helpful", the customer's question
before it (one line, like an escalation). When one question comes up on SUGGEST_AFTER different
calls, it becomes one playbook suggestion. A manager's answer to an escalation that was not added
to the playbook becomes one too. Nothing reaches the playbook until a manager approves it (R2
step 5); a rejection is recorded and the same topic is not suggested again."""

from __future__ import annotations

import json
import re
import secrets
import sqlite3
from collections.abc import Callable
from typing import Any

from sotto_worker.cloud.mail import render_escalation
from sotto_worker.cloud.store import REVIEW_DIMENSIONS, CloudError, CloudStore, Principal, now_ms

DAY_MS = 86_400_000
SUGGEST_AFTER = 3  # different calls with the same question → one suggestion
WINDOW_DAYS = 30
SAME_TOPIC = 0.6  # word overlap (Jaccard) for two questions to count as one topic
MAX_SIGNALS = 20
QUESTION_CHARS = 300
SAMPLES = 3
OBJECTION_THEMES = ("price", "timing", "think", "competitor", "trust", "other")
DIGEST_EVERY_MS = 7 * DAY_MS
# Common English words that say nothing about a question's topic (short words drop anyway).
STOP = frozenset(
    {
        *("and", "are", "can", "could", "does", "for", "from", "have", "how", "our"),
        *("please", "that", "the", "this", "what", "when", "where", "which", "who", "why"),
        *("will", "with", "would", "you", "your"),
    }
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS coaching_signals (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  question TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, call_id, topic_key)
);
CREATE INDEX IF NOT EXISTS coaching_signals_topic ON coaching_signals(company_id, topic_key, at);
CREATE TABLE IF NOT EXISTS coaching_objections (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, user_id, call_id, theme)
);
CREATE TABLE IF NOT EXISTS playbook_suggestions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  samples TEXT NOT NULL DEFAULT '[]',
  calls INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  escalation_id TEXT,
  playbook_id TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  UNIQUE (company_id, source, topic_key)
);
CREATE TABLE IF NOT EXISTS coaching_team (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  manager_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (company_id, manager_id, agent_id)
);
CREATE TABLE IF NOT EXISTS coaching_digest (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  weekly INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER,
  PRIMARY KEY (company_id, user_id)
);
"""


def topic_words(text: str) -> frozenset[str]:
    """The words that make a question's topic: lower case, letters and digits only (Arabic kept),
    without short and common words."""
    words = re.findall(r"[^\W_]+", text.lower())
    return frozenset(w for w in words if len(w) > 2 and w not in STOP)


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _clip(value: object, n: int) -> str:
    return " ".join(str(value or "").split())[:n]


class CoachingStore:
    def __init__(self, store: CloudStore) -> None:
        self.s = store
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- who sees whom ---------------------------------------------------------------------------
    def _people(self, who: Principal) -> list[sqlite3.Row]:
        company = who.company
        if who.role == "agent":
            return self.s._q(
                "SELECT id, name, role FROM users WHERE company_id=? AND id=?",
                (company, who.user_id),
            )
        if who.role == "admin":
            return self.s._q(
                "SELECT id, name, role FROM users WHERE company_id=? AND active=1 ORDER BY name",
                (company,),
            )
        who.require("manager")
        assigned = self.s._q(
            "SELECT agent_id FROM coaching_team WHERE company_id=? AND manager_id=?",
            (company, who.user_id),
        )
        if assigned:
            ids = {str(r["agent_id"]) for r in assigned} | {who.user_id}
            rows = self.s._q(
                "SELECT id, name, role FROM users WHERE company_id=? AND active=1 ORDER BY name",
                (company,),
            )
            return [r for r in rows if str(r["id"]) in ids]
        return self.s._q(
            "SELECT id, name, role FROM users WHERE company_id=? AND active=1"
            " AND (role='agent' OR id=?) ORDER BY name",
            (company, who.user_id),
        )

    def set_team(
        self, who: Principal, manager_id: str, agents: object, *, ip: str = ""
    ) -> dict[str, Any]:
        """An admin assigns agents to a manager; an empty list = the whole company again."""
        who.require("admin")
        if not isinstance(agents, list) or not all(isinstance(a, str) for a in agents):
            raise CloudError("invalid", "agents must be a list of user ids")
        ids = set(agents)
        known = {
            str(r["id"]): str(r["role"])
            for r in self.s._q("SELECT id, role FROM users WHERE company_id=?", (who.company,))
        }
        if known.get(manager_id) != "manager":
            raise CloudError("not_found", "no such manager")
        if any(known.get(a) != "agent" for a in ids):
            raise CloudError("not_found", "no such agent")
        with self.s._tx() as db:
            db.execute(
                "DELETE FROM coaching_team WHERE company_id=? AND manager_id=?",
                (who.company, manager_id),
            )
            for a in sorted(ids):
                db.execute(
                    "INSERT INTO coaching_team(company_id, manager_id, agent_id) VALUES (?,?,?)",
                    (who.company, manager_id, a),
                )
            self.s.audit(
                db,
                "coaching.team",
                f"{manager_id}: {len(ids)} agents",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"manager_id": manager_id, "agents": sorted(ids)}

    # --- signals from the device -----------------------------------------------------------------
    def signals(self, who: Principal, data: dict[str, Any]) -> dict[str, Any]:
        """One call's signals from the agent's device. A retry adds nothing twice."""
        call_id = data.get("call_id")
        if not isinstance(call_id, str) or not 0 < len(call_id) <= 80:
            raise CloudError("invalid", "call_id is required")
        raw_q = data.get("not_helpful") or []
        raw_o = data.get("objections") or []
        if not isinstance(raw_q, list) or not isinstance(raw_o, list):
            raise CloudError("invalid", "not_helpful and objections must be lists")
        if len(raw_q) > MAX_SIGNALS or len(raw_o) > len(OBJECTION_THEMES):
            raise CloudError("invalid", "too many signals")
        if any(o not in OBJECTION_THEMES for o in raw_o):
            raise CloudError("invalid", "unknown objection theme")
        t = now_ms()
        since = t - WINDOW_DAYS * DAY_MS
        company = who.company
        known = [
            (str(r["topic_key"]), frozenset(str(r["topic_key"]).split()))
            for r in self.s._q(
                "SELECT DISTINCT topic_key FROM coaching_signals WHERE company_id=? AND at>=?",
                (company, since),
            )
        ]
        touched: set[str] = set()
        with self.s._tx() as db:
            for theme in set(raw_o):
                db.execute(
                    "INSERT OR IGNORE INTO coaching_objections(company_id, user_id, call_id, theme,"
                    " at) VALUES (?,?,?,?,?)",
                    (company, who.user_id, call_id, theme, t),
                )
            for item in raw_q:
                question = _clip(item.get("question") if isinstance(item, dict) else item, 300)
                words = topic_words(question)
                if not words:
                    continue
                best = max(known, key=lambda k: _jaccard(words, k[1]), default=None)
                if best and _jaccard(words, best[1]) >= SAME_TOPIC:
                    key = best[0]
                else:
                    key = " ".join(sorted(words))[:200]
                    known.append((key, frozenset(key.split())))
                db.execute(
                    "INSERT OR IGNORE INTO coaching_signals(company_id, user_id, call_id,"
                    " topic_key, question, at) VALUES (?,?,?,?,?,?)",
                    (company, who.user_id, call_id, key, question, t),
                )
                touched.add(key)
            made = [self._maybe_suggest(db, company, key, since, t) for key in sorted(touched)]
        return {"ok": True, "suggestions": [m for m in made if m]}

    def _maybe_suggest(
        self, db: sqlite3.Connection, company: str, key: str, since: int, t: int
    ) -> str | None:
        rows = db.execute(
            "SELECT call_id, question FROM coaching_signals WHERE company_id=? AND topic_key=?"
            " AND at>=? ORDER BY at DESC",
            (company, key, since),
        ).fetchall()
        calls = {r["call_id"] for r in rows}
        samples: list[str] = []
        for r in rows:
            if r["question"] not in samples:
                samples.append(r["question"])
        existing = db.execute(
            "SELECT id, status FROM playbook_suggestions WHERE company_id=? AND source='ratings'"
            " AND topic_key=?",
            (company, key),
        ).fetchone()
        if existing:
            if existing["status"] == "open":  # keep the count and examples current
                db.execute(
                    "UPDATE playbook_suggestions SET calls=?, samples=? WHERE id=?",
                    (len(calls), json.dumps(samples[:SAMPLES]), existing["id"]),
                )
            return None
        if len(calls) < SUGGEST_AFTER:
            return None
        sid = secrets.token_hex(8)
        db.execute(
            "INSERT INTO playbook_suggestions(id, company_id, source, topic_key, question,"
            " samples, calls, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                sid,
                company,
                "ratings",
                key,
                samples[0],
                json.dumps(samples[:SAMPLES]),
                len(calls),
                t,
            ),
        )
        return sid

    # --- playbook suggestions (INT-15) -----------------------------------------------------------
    def _from_escalations(self, company: str) -> None:
        """A manager's answer that was not added to the playbook becomes one suggestion."""
        rows = self.s._q(
            "SELECT e.id, e.question, e.answer FROM escalations e WHERE e.company_id=?"
            " AND e.status='answered' AND e.answer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM"
            " playbook_suggestions s WHERE s.company_id=e.company_id AND s.source='escalation'"
            " AND s.topic_key=e.id)",
            (company,),
        )
        if not rows:
            return
        t = now_ms()
        with self.s._tx() as db:
            for r in rows:
                db.execute(
                    "INSERT OR IGNORE INTO playbook_suggestions(id, company_id, source, topic_key,"
                    " question, answer, samples, calls, escalation_id, created_at)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        secrets.token_hex(8),
                        company,
                        "escalation",
                        r["id"],
                        r["question"],
                        r["answer"] or "",
                        json.dumps([r["question"]]),
                        1,
                        r["id"],
                        t,
                    ),
                )

    def suggestions(self, who: Principal, reason: Callable[[int], str]) -> dict[str, Any]:
        who.require("admin", "manager")
        self._from_escalations(who.company)
        rows = self.s._q(
            "SELECT * FROM playbook_suggestions WHERE company_id=? AND (status='open' OR"
            " decided_at>=?) ORDER BY status='open' DESC, created_at DESC LIMIT 100",
            (who.company, now_ms() - WINDOW_DAYS * DAY_MS),
        )
        items = [
            {
                "id": r["id"],
                "source": r["source"],
                "question": r["question"],
                "answer": r["answer"],
                "samples": json.loads(r["samples"]),
                "calls": int(r["calls"]),
                "reason": reason(int(r["calls"])),
                "status": r["status"],
                "created_at": int(r["created_at"]),
                "playbook_id": r["playbook_id"],
            }
            for r in rows
        ]
        return {"items": items, "open": sum(1 for i in items if i["status"] == "open")}

    def open_count(self, who: Principal) -> int:
        self._from_escalations(who.company)
        row = self.s._q(
            "SELECT COUNT(*) AS n FROM playbook_suggestions WHERE company_id=? AND status='open'",
            (who.company,),
        )
        return int(row[0]["n"])

    def _open(self, who: Principal, sid: str) -> sqlite3.Row:
        rows = self.s._q(
            "SELECT * FROM playbook_suggestions WHERE company_id=? AND id=?", (who.company, sid)
        )
        if not rows or rows[0]["status"] != "open":
            raise CloudError("not_found", "no such open suggestion")
        return rows[0]

    def approve(
        self, who: Principal, sid: str, data: dict[str, Any], *, ip: str = ""
    ) -> dict[str, Any]:
        """The manager's approval: the (edited) question and answer become one playbook entry."""
        who.require("admin", "manager")
        row = self._open(who, sid)
        question = data.get("question") or row["question"]
        answer = data.get("answer") or row["answer"]
        entry = self.s.add_entry(who, {"question": question, "answer": answer}, ip=ip)
        with self.s._tx() as db:
            db.execute(
                "UPDATE playbook_suggestions SET status='approved', answer=?, playbook_id=?,"
                " decided_at=?, decided_by=? WHERE id=? AND company_id=?",
                (str(answer), entry, now_ms(), who.user_id, sid, who.company),
            )
            if row["escalation_id"]:
                db.execute(
                    "UPDATE escalations SET status='added', updated_at=? WHERE id=?"
                    " AND company_id=?",
                    (now_ms(), row["escalation_id"], who.company),
                )
            self.s.audit(
                db,
                "playbook_suggestion.approved",
                str(question)[:300],
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"id": sid, "status": "approved", "playbook_id": entry}

    def reject(self, who: Principal, sid: str, *, ip: str = "") -> dict[str, Any]:
        who.require("admin", "manager")
        row = self._open(who, sid)
        with self.s._tx() as db:
            db.execute(
                "UPDATE playbook_suggestions SET status='rejected', decided_at=?, decided_by=?"
                " WHERE id=? AND company_id=?",
                (now_ms(), who.user_id, sid, who.company),
            )
            self.s.audit(
                db,
                "playbook_suggestion.rejected",
                str(row["question"])[:300],
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"id": sid, "status": "rejected"}

    # --- the coaching view (INT-05) --------------------------------------------------------------
    def view(
        self, who: Principal, days: int = WINDOW_DAYS, learned: list[str] | None = None
    ) -> dict[str, Any]:
        """Per person: rated cards, "not helpful" by card type and reason, objection themes, the
        average of the six review skills and the weakest one. Sorted by name: no ranking."""
        days = max(1, min(days, 90))
        since = now_ms() - days * DAY_MS
        company = who.company
        people = self._people(who)
        ids = [str(p["id"]) for p in people]
        out: dict[str, dict[str, Any]] = {
            str(p["id"]): {
                "user_id": str(p["id"]),
                "name": str(p["name"] or ""),
                "role": str(p["role"]),
                "me": str(p["id"]) == who.user_id,
                "calls": 0,
                "rated": 0,
                "not_helpful": 0,
                "rejected": {},
                "reasons": {},
                "objections": {},
                "skills": {},
                "weakest": None,
            }
            for p in people
        }
        if not ids:
            return {"scope": who.role, "days": days, "people": [], "objections": {}}
        for r in self.s._q(
            "SELECT user_id, card_type, rating, reasons FROM card_ratings WHERE company_id=?"
            " AND at>=?",
            (company, since),
        ):
            if str(r["user_id"]) not in out:
                continue
            p = out[str(r["user_id"])]
            p["rated"] += 1
            if r["rating"] < 0:
                p["not_helpful"] += 1
                p["rejected"][r["card_type"]] = p["rejected"].get(r["card_type"], 0) + 1
                for reason in json.loads(r["reasons"]):
                    p["reasons"][reason] = p["reasons"].get(reason, 0) + 1
        team_objections: dict[str, int] = {}
        for r in self.s._q(
            "SELECT user_id, theme, COUNT(*) AS n FROM coaching_objections WHERE company_id=?"
            " AND at>=? GROUP BY user_id, theme",
            (company, since),
        ):
            if str(r["user_id"]) not in out:
                continue
            out[str(r["user_id"])]["objections"][r["theme"]] = int(r["n"])
            team_objections[r["theme"]] = team_objections.get(r["theme"], 0) + int(r["n"])
        sums: dict[str, dict[str, list[int]]] = {}
        for r in self.s._q(
            "SELECT user_id, review_json FROM usage WHERE company_id=? AND started_at>=?",
            (company, since),
        ):
            if str(r["user_id"]) not in out:
                continue
            p = out[str(r["user_id"])]
            p["calls"] += 1
            review = json.loads(r["review_json"]) if r["review_json"] else None
            if not review:
                continue
            per = sums.setdefault(str(r["user_id"]), {})
            for k in REVIEW_DIMENSIONS:
                v = review.get("scores", {}).get(k)
                if isinstance(v, int):
                    per.setdefault(k, []).append(v)
        for uid, per in sums.items():
            skills = {k: round(sum(v) / len(v), 1) for k, v in per.items() if v}
            out[uid]["skills"] = skills
            if skills:
                out[uid]["weakest"] = min(REVIEW_DIMENSIONS, key=lambda k: skills.get(k, 99))
        listed = sorted(out.values(), key=lambda p: (not p["me"], p["name"].lower()))
        return {
            "scope": "self"
            if who.role == "agent"
            else ("team" if who.role == "manager" else "company"),
            "days": days,
            "ranking": False,
            "people": listed,
            "objections": dict(sorted(team_objections.items(), key=lambda kv: -kv[1])),
            "learned": learned or [],
        }

    # --- weekly email (INT-05) -------------------------------------------------------------------
    def digest_setting(self, who: Principal) -> dict[str, Any]:
        who.require("admin", "manager")
        rows = self.s._q(
            "SELECT weekly, last_sent_at FROM coaching_digest WHERE company_id=? AND user_id=?",
            (who.company, who.user_id),
        )
        return {
            "weekly": bool(rows and rows[0]["weekly"]),
            "last_sent_at": rows[0]["last_sent_at"] if rows else None,
        }

    def set_digest(self, who: Principal, weekly: object, *, ip: str = "") -> dict[str, Any]:
        who.require("admin", "manager")
        if not isinstance(weekly, bool):
            raise CloudError("invalid", "weekly must be true or false")
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coaching_digest(company_id, user_id, weekly) VALUES (?,?,?)"
                " ON CONFLICT(company_id, user_id) DO UPDATE SET weekly=excluded.weekly",
                (who.company, who.user_id, int(weekly)),
            )
            self.s.audit(
                db,
                "coaching.digest",
                "on" if weekly else "off",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.digest_setting(who)

    def due_digests(self, t: int) -> list[tuple[str, str]]:
        """(company_id, user_id) of everyone opted in whose last email is a week old or more."""
        rows = self.s._q(
            "SELECT d.company_id, d.user_id FROM coaching_digest d JOIN users u ON u.id=d.user_id"
            " AND u.company_id=d.company_id WHERE d.weekly=1 AND u.active=1"
            " AND u.role IN ('admin','manager') AND (d.last_sent_at IS NULL OR d.last_sent_at<=?)",
            (t - DIGEST_EVERY_MS,),
        )
        return [(str(r["company_id"]), str(r["user_id"])) for r in rows]

    def mark_sent(self, company_id: str, user_id: str, t: int) -> None:
        with self.s._tx() as db:
            db.execute(
                "UPDATE coaching_digest SET last_sent_at=? WHERE company_id=? AND user_id=?",
                (t, company_id, user_id),
            )

    def digest(
        self, who: Principal, template: str, link: str, learned: list[str]
    ) -> tuple[str, str]:
        """The weekly email (subject, text) from the seed's coaching_digest template."""
        view = self.view(who, 7, learned)
        people = view["people"]
        objections = "\n".join(f"- {k}: {n}" for k, n in list(view["objections"].items())[:5])
        skills = "\n".join(
            f"- {p['name'] or '?'}: {p['weakest'].replace('_', ' ')}"
            for p in people
            if p["weakest"]
        )
        msg = render_escalation(
            template,
            {
                "company.name": str(self.s.company_row(who.company)["name"]),
                "digest.reader": who.name or who.email,
                "digest.scope": "team" if who.role == "manager" else "company",
                "digest.days": "7",
                "digest.calls": str(sum(p["calls"] for p in people)),
                "digest.not_helpful": str(sum(p["not_helpful"] for p in people)),
                "digest.objections": objections or "- none",
                "digest.skills": skills or "- no reviewed calls",
                "digest.instructions": "\n".join(f"- {i}" for i in learned) or "- nothing yet",
                "digest.suggestions": str(self.open_count(who)),
                "digest.link": link,
            },
        )
        return msg.subject, msg.text
