"""Follow-up plans (INT-08, D-055): the steps an agent set once after a call, kept in SQLite.

A step moves `pending → due` exactly once, in one UPDATE, when its time comes (the runner's
tick); a due step is a notification for its agent, nothing more. It becomes `done` only after
the agent's own tap sent it through the usual email or WhatsApp route with the step's
idempotency key, and that route's send log says `sent` (R12, D-033). This module never sends.

What a step carries (`prepared`) is the draft the agent approved for later: recipients, the
format or template, and the text. It is cleared when the step is done, skipped or cancelled.
Meeting reminders (INT-09, D-070) are steps too: one tap each, UTILITY templates only."""

from __future__ import annotations

import json
import secrets
import sqlite3
import weakref
from typing import Any

from sotto_worker.cloud.store import CloudError, CloudStore, Principal

SCHEMA = """
CREATE TABLE IF NOT EXISTS followup_plans (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL,              -- active | paused | cancelled | done
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS followup_plans_owner ON followup_plans(company_id, user_id);
CREATE TABLE IF NOT EXISTS followup_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES followup_plans(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,                -- email | whatsapp | reminder | meeting_reminder
  due_at INTEGER NOT NULL,
  state TEXT NOT NULL,               -- pending | due | done | skipped | cancelled
  prepared TEXT,                     -- the approved draft; NULL once finished
  notified_at INTEGER,
  done_at INTEGER
);
CREATE INDEX IF NOT EXISTS followup_steps_due ON followup_steps(state, due_at);
"""
KINDS = ("email", "whatsapp", "reminder", "meeting_reminder")
SENDS = {"email": "email_sends", "whatsapp": "whatsapp_sends", "meeting_reminder": "whatsapp_sends"}
MAX_STEPS = 5
MAX_AHEAD_MS = 60 * 24 * 3600 * 1000
MAX_PREPARED = 24_000
DAY_MS = 24 * 3600 * 1000
_ready: weakref.WeakSet[CloudStore] = weakref.WeakSet()


def ensure(store: CloudStore) -> None:
    if store in _ready:
        return
    with store._lock:
        store._db.executescript(SCHEMA)
    _ready.add(store)


def step_idem(step_id: str) -> str:
    """The idempotency key the app must send the step with: a retried tap never sends twice."""
    return f"fu-{step_id}"


def _text(value: Any, what: str, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) > limit:
        raise CloudError("invalid", f"{what} is too long")
    return text


def _prepared(kind: str, raw: Any) -> dict[str, Any]:
    if kind == "reminder":
        note = _text((raw or {}).get("note") if isinstance(raw, dict) else "", "note", 200)
        return {"note": note}
    if not isinstance(raw, dict):
        raise CloudError("invalid", f"prepare the {kind} step first")
    blob = json.dumps(raw, ensure_ascii=False)
    if len(blob) > MAX_PREPARED:
        raise CloudError("too_large", "the prepared step is too long")
    return raw


class PlanStore:
    def __init__(self, store: CloudStore) -> None:
        self.s = store
        ensure(store)

    # --- creating ------------------------------------------------------------------------------
    def create(
        self,
        who: Principal,
        *,
        call_id: str,
        customer_name: str,
        steps: list[dict[str, Any]],
        now: int,
        check_step: Any = None,
        ip: str = "",
    ) -> dict[str, Any]:
        """`check_step(kind, prepared)` raises when a step is not allowed (templates, flags)."""
        who.require("admin", "manager", "agent")
        call = _text(call_id, "call id", 64)
        if not call:
            raise CloudError("invalid", "missing call id")
        name = _text(customer_name, "customer name", 100) or "Customer"
        if not isinstance(steps, list) or not 1 <= len(steps) <= MAX_STEPS:
            raise CloudError("invalid", f"a plan has 1 to {MAX_STEPS} steps")
        clean: list[tuple[str, int, dict[str, Any]]] = []
        for raw in steps:
            if not isinstance(raw, dict) or raw.get("kind") not in KINDS:
                raise CloudError("invalid", "unknown step kind")
            kind = str(raw["kind"])
            due = raw.get("due_at")
            if type(due) is not int or not now - DAY_MS <= due <= now + MAX_AHEAD_MS:
                raise CloudError("invalid", "pick a time within the next 60 days")
            prepared = _prepared(kind, raw.get("prepared"))
            if check_step is not None:
                check_step(kind, prepared)
            clean.append((kind, due, prepared))
        clean.sort(key=lambda s: s[1])
        plan_id = secrets.token_hex(8)
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO followup_plans(id, company_id, user_id, call_id, customer_name,"
                " status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (plan_id, who.company, who.user_id, call, name, "active", now, now),
            )
            for i, (kind, due, prepared) in enumerate(clean):
                db.execute(
                    "INSERT INTO followup_steps(id, plan_id, company_id, user_id, position, kind,"
                    " due_at, state, prepared) VALUES (?,?,?,?,?,?,?,?,?)",
                    (
                        secrets.token_hex(8),
                        plan_id,
                        who.company,
                        who.user_id,
                        i,
                        kind,
                        due,
                        "pending",
                        json.dumps(prepared, ensure_ascii=False),
                    ),
                )
            self.s.audit(
                db,
                "followup.plan",
                f"plan {plan_id} for call {call}: " + ", ".join(k for k, _, _ in clean),
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return self.plan(who, plan_id)

    # --- reading -------------------------------------------------------------------------------
    def _own_plan(self, db: sqlite3.Connection, who: Principal, plan_id: str) -> sqlite3.Row:
        row = db.execute(
            "SELECT * FROM followup_plans WHERE id = ? AND company_id = ? AND user_id = ?",
            (plan_id, who.company, who.user_id),
        ).fetchone()
        if row is None:
            raise CloudError("not_found", "no such plan")
        return row

    @staticmethod
    def _step_out(r: sqlite3.Row, *, with_draft: bool) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": r["id"],
            "plan_id": r["plan_id"],
            "position": r["position"],
            "kind": r["kind"],
            "due_at": r["due_at"],
            "state": r["state"],
            "idempotency_key": step_idem(str(r["id"])),
        }
        if with_draft and r["prepared"]:
            out["prepared"] = json.loads(r["prepared"])
        return out

    def plan(self, who: Principal, plan_id: str) -> dict[str, Any]:
        with self.s._lock:
            p = self._own_plan(self.s._db, who, plan_id)
            steps = list(
                self.s._db.execute(
                    "SELECT * FROM followup_steps WHERE plan_id = ? ORDER BY position", (plan_id,)
                )
            )
        return {
            "id": p["id"],
            "call_id": p["call_id"],
            "customer_name": p["customer_name"],
            "status": p["status"],
            "created_at": p["created_at"],
            "steps": [self._step_out(s, with_draft=False) for s in steps],
        }

    def plans(self, who: Principal, call_id: str | None = None) -> list[dict[str, Any]]:
        rows = self.s._q(
            "SELECT id FROM followup_plans WHERE company_id = ? AND user_id = ?"
            " AND (? IS NULL OR call_id = ?) AND status IN ('active', 'paused')"
            " ORDER BY created_at DESC LIMIT 50",
            (who.company, who.user_id, call_id, call_id),
        )
        return [self.plan(who, str(r["id"])) for r in rows]

    def due(self, who: Principal) -> list[dict[str, Any]]:
        """The agent's due steps: what the desktop notifies about and opens."""
        rows = self.s._q(
            "SELECT s.*, p.customer_name, p.call_id FROM followup_steps s"
            " JOIN followup_plans p ON p.id = s.plan_id"
            " WHERE s.company_id = ? AND s.user_id = ? AND s.state = 'due' AND p.status = 'active'"
            " ORDER BY s.due_at LIMIT 50",
            (who.company, who.user_id),
        )
        return [
            {
                **self._step_out(r, with_draft=False),
                "customer_name": r["customer_name"],
                "call_id": r["call_id"],
            }
            for r in rows
        ]

    def step(self, who: Principal, step_id: str) -> dict[str, Any]:
        """One step with its draft, for the screen the notification opens."""
        rows = self.s._q(
            "SELECT s.*, p.customer_name, p.call_id, p.status AS plan_status"
            " FROM followup_steps s JOIN followup_plans p ON p.id = s.plan_id"
            " WHERE s.id = ? AND s.company_id = ? AND s.user_id = ?",
            (step_id, who.company, who.user_id),
        )
        if not rows:
            raise CloudError("not_found", "no such step")
        r = rows[0]
        return {
            **self._step_out(r, with_draft=True),
            "customer_name": r["customer_name"],
            "call_id": r["call_id"],
            "plan_status": r["plan_status"],
        }

    # --- the agent's choices -------------------------------------------------------------------
    def set_status(self, who: Principal, plan_id: str, status: str, *, now: int, ip: str = "") -> None:
        if status not in ("active", "paused", "cancelled"):
            raise CloudError("invalid", "unknown plan status")
        with self.s._tx() as db:
            p = self._own_plan(db, who, plan_id)
            if p["status"] in ("cancelled", "done"):
                raise CloudError("invalid", "this plan has ended")
            db.execute(
                "UPDATE followup_plans SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, plan_id),
            )
            if status == "cancelled":
                db.execute(
                    "UPDATE followup_steps SET state = 'cancelled', prepared = NULL, done_at = ?"
                    " WHERE plan_id = ? AND state IN ('pending', 'due')",
                    (now, plan_id),
                )
            elif status == "paused":
                # A step that was due waits again; it is re-announced after resume.
                db.execute(
                    "UPDATE followup_steps SET state = 'pending' WHERE plan_id = ? AND state = 'due'",
                    (plan_id,),
                )
            self.s.audit(
                db, f"followup.{status}", f"plan {plan_id}", company_id=who.company, actor=who, ip=ip
            )

    def _finish(
        self, db: sqlite3.Connection, who: Principal, step: sqlite3.Row, state: str, now: int
    ) -> None:
        db.execute(
            "UPDATE followup_steps SET state = ?, prepared = NULL, done_at = ? WHERE id = ?",
            (state, now, step["id"]),
        )
        left = db.execute(
            "SELECT COUNT(*) AS n FROM followup_steps WHERE plan_id = ? AND state IN"
            " ('pending', 'due')",
            (step["plan_id"],),
        ).fetchone()["n"]
        if not left:
            db.execute(
                "UPDATE followup_plans SET status = 'done', updated_at = ? WHERE id = ?",
                (now, step["plan_id"]),
            )

    def _own_step(self, db: sqlite3.Connection, who: Principal, step_id: str) -> sqlite3.Row:
        row = db.execute(
            "SELECT * FROM followup_steps WHERE id = ? AND company_id = ? AND user_id = ?",
            (step_id, who.company, who.user_id),
        ).fetchone()
        if row is None:
            raise CloudError("not_found", "no such step")
        return row

    def skip(self, who: Principal, step_id: str, *, now: int, ip: str = "") -> None:
        with self.s._tx() as db:
            step = self._own_step(db, who, step_id)
            if step["state"] not in ("pending", "due"):
                raise CloudError("invalid", "this step is finished")
            self._finish(db, who, step, "skipped", now)
            self.s.audit(
                db, "followup.skip", f"step {step_id}", company_id=who.company, actor=who, ip=ip
            )

    def complete(self, who: Principal, step_id: str, *, now: int, ip: str = "") -> dict[str, Any]:
        """After the agent's tap sent the step through its usual route: the send log must say
        `sent` for this step's own key and this agent, or the step stays open."""
        with self.s._tx() as db:
            step = self._own_step(db, who, step_id)
            if step["state"] == "done":
                return {"status": "done", "duplicate": True}
            if step["state"] not in ("pending", "due"):
                raise CloudError("invalid", "this step is finished")
            table = SENDS.get(str(step["kind"]))
            if table is not None:
                sent = db.execute(
                    f"SELECT 1 FROM {table} WHERE company_id = ? AND idem = ? AND user_id = ?"  # noqa: S608
                    " AND status = 'sent'",
                    (who.company, step_idem(step_id), who.user_id),
                ).fetchone()
                if sent is None:
                    raise CloudError("not_sent", "send the step first")
            self._finish(db, who, step, "done", now)
            self.s.audit(
                db,
                "followup.done",
                f"step {step_id} ({step['kind']})",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"status": "done", "duplicate": False}

    # --- the runner's part ---------------------------------------------------------------------
    def tick(self, now: int) -> list[dict[str, str]]:
        """Pending steps of active plans whose time has come become due, each exactly once (the
        state change is the claim). Returns who to notify. Sends nothing."""
        with self.s._tx() as db:
            rows = list(
                db.execute(
                    "UPDATE followup_steps SET state = 'due', notified_at = ?"
                    " WHERE state = 'pending' AND due_at <= ? AND plan_id IN"
                    " (SELECT id FROM followup_plans WHERE status = 'active')"
                    " RETURNING id, company_id, user_id, kind",
                    (now, now),
                )
            )
        return [
            {"id": r["id"], "company_id": r["company_id"], "user_id": r["user_id"], "kind": r["kind"]}
            for r in rows
        ]
