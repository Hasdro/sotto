"""SQLite store for Round 4 Agent 3: prep chat, game plans, voice coach usage caps,
post-call review queue, and morning brief preferences/history.

Every table has `company_id`, enforces tenant scoping on every read/write, and is covered by
company-isolation tests (R3, 00-master.md §3.6).
"""

from __future__ import annotations

import json
import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sotto_worker.cloud.coach.stubs import log_event
from sotto_worker.cloud.metering.store import month_of, month_start
from sotto_worker.cloud.store import CloudError, CloudStore, Principal, now_ms

HOUR_MS = 3_600_000
DAY_MS = 24 * HOUR_MS
REVIEW_MIN_CALL_S = 30
REVIEW_REMINDER_MS = DAY_MS
REVIEW_EXPIRY_MS = 7 * DAY_MS
DEFAULT_COST_PER_MIN_USD = 0.04  # ASSUMPTION: blended STT + TTS + LLM per-minute estimate (see seed/models/prices.yaml)
MAX_CAP_USD = 1_000_000.0
REVIEW_STATES = ("pending", "done", "snoozed", "dismissed", "cancelled", "expired")
TERMINAL_REVIEW_STATES = frozenset({"done", "dismissed", "cancelled", "expired"})
SnoozePreset = Literal["1h", "tomorrow_morning", "custom"]
CapAlertSender = Callable[[str, str, str], Awaitable[None]]  # (to_email, subject, text)

SCHEMA = """
CREATE TABLE IF NOT EXISTS coach_game_plans (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  goals_json TEXT NOT NULL DEFAULT '[]',
  objections_json TEXT NOT NULL DEFAULT '[]',
  questions_json TEXT NOT NULL DEFAULT '[]',
  avoid_json TEXT NOT NULL DEFAULT '[]',
  rendered_text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_id, call_id)
);

CREATE TABLE IF NOT EXISTS coach_prep_messages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_prep_messages_call
  ON coach_prep_messages(company_id, call_id, created_at);

CREATE TABLE IF NOT EXISTS coach_caps (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  cap_usd REAL,
  cost_per_min_usd REAL NOT NULL DEFAULT 0.04,
  enabled INTEGER NOT NULL DEFAULT 0,
  stages_configured INTEGER NOT NULL DEFAULT 0,
  allow_admin_transcript INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_usage (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  session_kind TEXT NOT NULL,
  call_id TEXT,
  duration_s INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_usage_company_at
  ON coach_usage(company_id, created_at);

CREATE TABLE IF NOT EXISTS coach_cap_alerts (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  level INTEGER NOT NULL,
  spend_usd REAL NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (company_id, month, level)
);

CREATE TABLE IF NOT EXISTS coach_reviews (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  call_duration_s INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until INTEGER,
  reminded_at INTEGER,
  expires_at INTEGER NOT NULL,
  transcript_json TEXT NOT NULL DEFAULT '[]',
  feedback_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (company_id, call_id)
);
CREATE INDEX IF NOT EXISTS coach_reviews_user_status
  ON coach_reviews(company_id, user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS coach_morning_brief_prefs (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  timezone_offset_min INTEGER NOT NULL DEFAULT 0,
  last_sent_day TEXT,
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS coach_morning_briefs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  mode TEXT NOT NULL,
  content_json TEXT NOT NULL,
  delivered_at INTEGER NOT NULL,
  UNIQUE (company_id, user_id, day)
);
"""


def _tomorrow_morning_ms(now: int, tz_offset_min: int) -> int:
    """Return 08:00 local time tomorrow as UTC epoch milliseconds."""
    offset = timedelta(minutes=tz_offset_min)
    local_now = datetime.fromtimestamp(now / 1000, UTC) + offset
    tomorrow = (local_now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    utc_target = tomorrow - offset
    return int(utc_target.timestamp() * 1000)


class CoachStore:
    def __init__(self, store: CloudStore, *, clock: Callable[[], int] = now_ms) -> None:
        self.s = store
        self.clock = clock
        with store._tx() as db:
            for stmt in SCHEMA.split(";"):
                if stmt.strip():
                    db.execute(stmt)

    # --- Prep chat & Game plans (B2) -------------------------------------------------------------

    def add_prep_message(
        self,
        who: Principal,
        call_id: str,
        role: Literal["user", "assistant"],
        content: str,
        *,
        now: int | None = None,
    ) -> dict[str, Any]:
        clean = content.strip()
        if not call_id or not clean:
            raise CloudError("invalid", "call_id and content are required")
        t = self.clock() if now is None else now
        mid = f"pm_{secrets.token_hex(6)}"
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_prep_messages"
                "(id, company_id, call_id, user_id, role, content, created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (mid, who.company, call_id, who.user_id, role, clean[:4000], t),
            )
        return {
            "id": mid,
            "call_id": call_id,
            "role": role,
            "content": clean[:4000],
            "created_at": t,
        }

    def list_prep_messages(self, who: Principal, call_id: str) -> list[dict[str, Any]]:
        rows = self.s._q(
            "SELECT id, role, content, created_at FROM coach_prep_messages"
            " WHERE company_id=? AND call_id=? AND user_id=? ORDER BY created_at ASC, rowid ASC",
            (who.company, call_id, who.user_id),
        )
        return [
            {
                "id": str(r["id"]),
                "role": str(r["role"]),
                "content": str(r["content"]),
                "created_at": int(r["created_at"]),
            }
            for r in rows
        ]

    def save_game_plan(
        self,
        who: Principal,
        call_id: str,
        *,
        goals: list[str],
        objections: list[dict[str, str]],
        questions: list[str],
        avoid: list[str],
        rendered_text: str,
        now: int | None = None,
    ) -> dict[str, Any]:
        if not call_id:
            raise CloudError("invalid", "call_id is required")
        t = self.clock() if now is None else now
        clean_goals = [str(g).strip() for g in goals if str(g).strip()][:3]
        clean_obj = [
            {
                "objection": str(o.get("objection", "")).strip(),
                "answer": str(o.get("answer", "")).strip(),
            }
            for o in objections
            if isinstance(o, dict) and str(o.get("objection", "")).strip()
        ][:3]
        clean_q = [str(q).strip() for q in questions if str(q).strip()][:3]
        clean_avoid = [str(a).strip() for a in avoid if str(a).strip()][:3]
        rendered = " ".join(rendered_text.split()[:150])
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_game_plans"
                "(company_id, call_id, user_id, goals_json, objections_json, questions_json,"
                " avoid_json, rendered_text, updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(company_id, call_id) DO UPDATE SET"
                " goals_json=excluded.goals_json, objections_json=excluded.objections_json,"
                " questions_json=excluded.questions_json, avoid_json=excluded.avoid_json,"
                " rendered_text=excluded.rendered_text, updated_at=excluded.updated_at",
                (
                    who.company,
                    call_id,
                    who.user_id,
                    json.dumps(clean_goals),
                    json.dumps(clean_obj),
                    json.dumps(clean_q),
                    json.dumps(clean_avoid),
                    rendered,
                    t,
                ),
            )
        log_event("coach_prep", "game_plan_saved", call_id=call_id, words=len(rendered.split()))
        return {
            "call_id": call_id,
            "goals": clean_goals,
            "objections": clean_obj,
            "questions": clean_q,
            "avoid": clean_avoid,
            "rendered_text": rendered,
            "updated_at": t,
        }

    def get_game_plan_raw(self, company_id: str, call_id: str) -> dict[str, Any] | None:
        rows = self.s._q(
            "SELECT call_id, user_id, goals_json, objections_json, questions_json,"
            " avoid_json, rendered_text, updated_at"
            " FROM coach_game_plans WHERE company_id=? AND call_id=?",
            (company_id, call_id),
        )
        if not rows:
            return None
        r = rows[0]
        return {
            "call_id": str(r["call_id"]),
            "user_id": str(r["user_id"]),
            "goals": json.loads(str(r["goals_json"])),
            "objections": json.loads(str(r["objections_json"])),
            "questions": json.loads(str(r["questions_json"])),
            "avoid": json.loads(str(r["avoid_json"])),
            "rendered_text": str(r["rendered_text"]),
            "updated_at": int(r["updated_at"]),
        }

    def get_game_plan_for_user(self, who: Principal, call_id: str) -> dict[str, Any] | None:
        row = self.get_game_plan_raw(who.company, call_id)
        if row is None:
            return None
        if who.role == "agent" and row["user_id"] != who.user_id:
            return None
        return row

    # --- Voice Coach Config & Monthly USD Cap (V2) -----------------------------------------------

    def configure_company_coach(
        self,
        owner: Principal,
        company_id: str,
        *,
        cap_usd: float | None = None,
        cost_per_min_usd: float = DEFAULT_COST_PER_MIN_USD,
        enabled: bool | None = None,
        stages_configured: bool | None = None,
        clear_cap: bool = False,
        ip: str = "",
        now: int | None = None,
    ) -> dict[str, Any]:
        if owner.role != "owner":
            raise CloudError("forbidden", "only the platform owner configures voice coach")
        self.s.company_row(company_id)
        if not clear_cap and cap_usd is not None:
            if isinstance(cap_usd, bool) or not 0 < cap_usd <= MAX_CAP_USD:
                raise CloudError("invalid", "cap_usd must be a positive number")
        if isinstance(cost_per_min_usd, bool) or cost_per_min_usd <= 0:
            raise CloudError("invalid", "cost_per_min_usd must be positive")
        t = self.clock() if now is None else now
        existing = self.s._q(
            "SELECT cap_usd, cost_per_min_usd, enabled, stages_configured, allow_admin_transcript"
            " FROM coach_caps WHERE company_id=?",
            (company_id,),
        )
        cur = existing[0] if existing else None
        next_cap = None if clear_cap else (
            float(cap_usd) if cap_usd is not None else (
                float(cur["cap_usd"]) if cur and cur["cap_usd"] is not None else None
            )
        )
        next_enabled = int(enabled) if enabled is not None else (int(cur["enabled"]) if cur else 0)
        next_stages = (
            int(stages_configured)
            if stages_configured is not None
            else (int(cur["stages_configured"]) if cur else 0)
        )
        next_allow = int(cur["allow_admin_transcript"]) if cur else 0
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_caps"
                "(company_id, cap_usd, cost_per_min_usd, enabled, stages_configured,"
                " allow_admin_transcript, updated_at)"
                " VALUES (?,?,?,?,?,?,?)"
                " ON CONFLICT(company_id) DO UPDATE SET"
                " cap_usd=excluded.cap_usd, cost_per_min_usd=excluded.cost_per_min_usd,"
                " enabled=excluded.enabled, stages_configured=excluded.stages_configured,"
                " updated_at=excluded.updated_at",
                (
                    company_id,
                    next_cap,
                    float(cost_per_min_usd),
                    next_enabled,
                    next_stages,
                    next_allow,
                    t,
                ),
            )
            self.s.audit(
                db,
                "owner.voice_coach.configure",
                f"enabled={next_enabled} stages={next_stages} cap={next_cap}",
                company_id=company_id,
                actor=owner,
                ip=ip,
            )
        return self.cap_status(company_id, now=t)

    def set_admin_transcript_visibility(
        self,
        who: Principal,
        allow: bool,
        *,
        ip: str = "",
        now: int | None = None,
    ) -> dict[str, Any]:
        who.require("admin")
        t = self.clock() if now is None else now
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_caps(company_id, allow_admin_transcript, updated_at)"
                " VALUES (?,?,?)"
                " ON CONFLICT(company_id) DO UPDATE SET"
                " allow_admin_transcript=excluded.allow_admin_transcript,"
                " updated_at=excluded.updated_at",
                (who.company, int(bool(allow)), t),
            )
            self.s.audit(
                db,
                "coach.admin_transcript",
                f"allow={bool(allow)}",
                company_id=who.company,
                actor=who,
                ip=ip,
            )
        return {"allow_admin_transcript": bool(allow)}

    def monthly_spend_usd(self, company_id: str, *, now: int | None = None) -> float:
        t = self.clock() if now is None else now
        rows = self.s._q(
            "SELECT COALESCE(SUM(cost_usd), 0.0) AS total FROM coach_usage"
            " WHERE company_id=? AND created_at>=?",
            (company_id, month_start(t)),
        )
        return float(rows[0]["total"]) if rows else 0.0

    def cap_status(self, company_id: str, *, now: int | None = None) -> dict[str, Any]:
        t = self.clock() if now is None else now
        rows = self.s._q(
            "SELECT cap_usd, cost_per_min_usd, enabled, stages_configured, allow_admin_transcript"
            " FROM coach_caps WHERE company_id=?",
            (company_id,),
        )
        row = rows[0] if rows else None
        cap_usd = float(row["cap_usd"]) if row and row["cap_usd"] is not None else None
        cpm = float(row["cost_per_min_usd"]) if row else DEFAULT_COST_PER_MIN_USD
        enabled = bool(row["enabled"]) if row else False
        stages = bool(row["stages_configured"]) if row else False
        allow_admin = bool(row["allow_admin_transcript"]) if row else False
        spend = self.monthly_spend_usd(company_id, now=t)
        cap_minutes = round(cap_usd / cpm, 1) if cap_usd is not None and cpm > 0 else None
        used_minutes = round(spend / cpm, 1) if cpm > 0 else 0.0
        ratio = (spend / cap_usd) if cap_usd and cap_usd > 0 else None

        if not stages:
            available, reason = False, "not_configured"
        elif not enabled:
            available, reason = False, "off_by_platform"
        elif cap_usd is None or cap_usd <= 0:
            available, reason = False, "no_cap"
        elif spend >= cap_usd:
            available, reason = False, "cap_reached"
        else:
            available, reason = True, "ok"

        alerts = [
            int(r["level"])
            for r in self.s._q(
                "SELECT level FROM coach_cap_alerts WHERE company_id=? AND month=? ORDER BY level",
                (company_id, month_of(t)),
            )
        ]
        return {
            "company_id": company_id,
            "month": month_of(t),
            "enabled": enabled,
            "stages_configured": stages,
            "available": available,
            "reason": reason,
            "cap_usd": cap_usd,
            "cap_minutes": cap_minutes,
            "cost_per_min_usd": cpm,
            "spend_usd": round(spend, 4),
            "used_minutes": used_minutes,
            "ratio": round(ratio, 4) if ratio is not None else None,
            "allow_admin_transcript": allow_admin,
            "alerts": alerts,
        }

    def check_voice_cap(self, company_id: str, *, now: int | None = None) -> dict[str, Any]:
        """Must be called before every voice review and prep voice session (V2)."""
        status = self.cap_status(company_id, now=now)
        if not status["available"]:
            raise CloudError("voice_coach_unavailable", f"voice coach unavailable: {status['reason']}")
        return status

    async def record_voice_usage(
        self,
        company_id: str,
        user_id: str,
        session_kind: Literal["prep_voice", "review_voice", "morning_brief_voice"],
        duration_s: int,
        *,
        call_id: str | None = None,
        send_email: CapAlertSender | None = None,
        owner_email: str | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        t = self.clock() if now is None else now
        if duration_s < 0:
            raise CloudError("invalid", "duration_s must be non-negative")
        st_before = self.cap_status(company_id, now=t)
        cpm = float(st_before["cost_per_min_usd"])
        cost_usd = round((duration_s / 60.0) * cpm, 6)
        uid = f"cu_{secrets.token_hex(6)}"
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_usage"
                "(id, company_id, user_id, session_kind, call_id, duration_s, cost_usd, created_at)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (uid, company_id, user_id, session_kind, call_id, int(duration_s), cost_usd, t),
            )
        st_after = self.cap_status(company_id, now=t)
        cap_usd = st_after["cap_usd"]
        spend = float(st_after["spend_usd"])
        triggered: list[int] = []
        if cap_usd is not None and cap_usd > 0:
            month = month_of(t)
            for level in (80, 100):
                if spend >= cap_usd * (level / 100.0):
                    with self.s._tx() as db:
                        cur = db.execute(
                            "INSERT OR IGNORE INTO coach_cap_alerts"
                            "(company_id, month, level, spend_usd, at) VALUES (?,?,?,?,?)",
                            (company_id, month, level, spend, t),
                        )
                        if cur.rowcount:
                            triggered.append(level)
                            self.s.audit(
                                db,
                                "coach.cap_alert",
                                f"{level}% ({spend:.2f}/{cap_usd:.2f} USD)",
                                company_id=company_id,
                            )
            if triggered and send_email is not None:
                level = triggered[-1]
                admins = [
                    str(r["email"])
                    for r in self.s._q(
                        "SELECT email FROM users WHERE company_id=? AND role='admin' AND active=1",
                        (company_id,),
                    )
                ]
                recipients = list(dict.fromkeys([*admins, *([owner_email] if owner_email else [])]))
                subject = (
                    f"Voice coach reached {level}% of monthly cap"
                    if level < 100
                    else "Voice coach paused: 100% of monthly cap reached"
                )
                body = (
                    f"Voice coach spend for {month} reached ${spend:.2f} of the ${cap_usd:.2f} "
                    f"monthly cap ({st_after['used_minutes']} of {st_after['cap_minutes']} min). "
                    + (
                        "Voice coach is paused until the 1st of next month unless the owner raises the cap."
                        if level >= 100
                        else "Voice coach is still active; raise the cap if more minutes are needed."
                    )
                )
                for rcpt in recipients:
                    await send_email(rcpt, subject, body)
        log_event(
            "coach_metering",
            "voice_usage_recorded",
            call_id=call_id,
            duration_ms=duration_s * 1000,
        )
        return {**st_after, "new_alerts": triggered}

    # --- Post-call Review Queue (V3) -------------------------------------------------------------

    def enqueue_review(
        self,
        who: Principal,
        call_id: str,
        call_duration_s: int,
        *,
        now: int | None = None,
    ) -> dict[str, Any] | None:
        """Create a pending review for calls >= 30 s. Calls < 30 s create no review (A1, V3)."""
        if not call_id:
            raise CloudError("invalid", "call_id is required")
        if call_duration_s < REVIEW_MIN_CALL_S:
            return None
        t = self.clock() if now is None else now
        rid = f"rev_{secrets.token_hex(6)}"
        expires_at = t + REVIEW_EXPIRY_MS
        with self.s._tx() as db:
            existing = db.execute(
                "SELECT id FROM coach_reviews WHERE company_id=? AND call_id=?",
                (who.company, call_id),
            ).fetchone()
            if existing is not None:
                return self.get_review(who, str(existing["id"]), now=t)
            db.execute(
                "INSERT INTO coach_reviews"
                "(id, company_id, user_id, call_id, call_duration_s, status, snoozed_until,"
                " reminded_at, expires_at, transcript_json, feedback_note, created_at, updated_at)"
                " VALUES (?,?,?,?,?,'pending',NULL,NULL,?,'[]',NULL,?,?)",
                (rid, who.company, who.user_id, call_id, int(call_duration_s), expires_at, t, t),
            )
        return self.get_review(who, rid, now=t)

    def sweep_reviews(self, *, company_id: str | None = None, now: int | None = None) -> dict[str, int]:
        """Expire items past 7 days and wake snoozed items whose snooze time has arrived."""
        t = self.clock() if now is None else now
        with self.s._tx() as db:
            if company_id:
                exp = db.execute(
                    "UPDATE coach_reviews SET status='expired', updated_at=?"
                    " WHERE company_id=? AND status IN ('pending','snoozed') AND expires_at<=?",
                    (t, company_id, t),
                ).rowcount
                woke = db.execute(
                    "UPDATE coach_reviews SET status='pending', snoozed_until=NULL, updated_at=?"
                    " WHERE company_id=? AND status='snoozed' AND snoozed_until<=? AND expires_at>?",
                    (t, company_id, t, t),
                ).rowcount
            else:
                exp = db.execute(
                    "UPDATE coach_reviews SET status='expired', updated_at=?"
                    " WHERE status IN ('pending','snoozed') AND expires_at<=?",
                    (t, t),
                ).rowcount
                woke = db.execute(
                    "UPDATE coach_reviews SET status='pending', snoozed_until=NULL, updated_at=?"
                    " WHERE status='snoozed' AND snoozed_until<=? AND expires_at>?",
                    (t, t, t),
                ).rowcount
        return {"expired": int(exp), "woke": int(woke)}

    def _review_out(self, r: Any) -> dict[str, Any]:
        return {
            "id": str(r["id"]),
            "call_id": str(r["call_id"]),
            "user_id": str(r["user_id"]),
            "call_duration_s": int(r["call_duration_s"]),
            "status": str(r["status"]),
            "snoozed_until": int(r["snoozed_until"]) if r["snoozed_until"] is not None else None,
            "reminded_at": int(r["reminded_at"]) if r["reminded_at"] is not None else None,
            "expires_at": int(r["expires_at"]),
            "feedback_note": str(r["feedback_note"]) if r["feedback_note"] is not None else None,
            "created_at": int(r["created_at"]),
            "updated_at": int(r["updated_at"]),
        }

    def get_review(
        self, who: Principal, review_id: str, *, now: int | None = None
    ) -> dict[str, Any]:
        self.sweep_reviews(company_id=who.company, now=now)
        rows = self.s._q(
            "SELECT * FROM coach_reviews WHERE company_id=? AND id=?",
            (who.company, review_id),
        )
        if not rows:
            raise CloudError("not_found", "review not found")
        r = rows[0]
        if who.role == "agent" and str(r["user_id"]) != who.user_id:
            raise CloudError("not_found", "review not found")
        return self._review_out(r)

    def list_reviews(
        self,
        who: Principal,
        *,
        include_closed: bool = False,
        now: int | None = None,
    ) -> list[dict[str, Any]]:
        self.sweep_reviews(company_id=who.company, now=now)
        if include_closed:
            rows = self.s._q(
                "SELECT * FROM coach_reviews WHERE company_id=? AND user_id=?"
                " ORDER BY created_at DESC",
                (who.company, who.user_id),
            )
        else:
            rows = self.s._q(
                "SELECT * FROM coach_reviews WHERE company_id=? AND user_id=?"
                " AND status IN ('pending','snoozed') ORDER BY created_at DESC",
                (who.company, who.user_id),
            )
        return [self._review_out(r) for r in rows]

    def snooze_review(
        self,
        who: Principal,
        review_id: str,
        *,
        preset: SnoozePreset = "1h",
        until_ms: int | None = None,
        timezone_offset_min: int = 0,
        now: int | None = None,
    ) -> dict[str, Any]:
        t = self.clock() if now is None else now
        current = self.get_review(who, review_id, now=t)
        if current["status"] in TERMINAL_REVIEW_STATES:
            raise CloudError("invalid", f"cannot snooze review in state {current['status']}")
        if preset == "1h":
            target = t + HOUR_MS
        elif preset == "tomorrow_morning":
            target = _tomorrow_morning_ms(t, timezone_offset_min)
        elif preset == "custom":
            if until_ms is None or until_ms <= t:
                raise CloudError("invalid", "until_ms must be in the future")
            target = int(until_ms)
        else:
            raise CloudError("invalid", "unknown snooze preset")
        with self.s._tx() as db:
            db.execute(
                "UPDATE coach_reviews SET status='snoozed', snoozed_until=?, updated_at=?"
                " WHERE company_id=? AND id=? AND user_id=?",
                (target, t, who.company, review_id, who.user_id),
            )
        return self.get_review(who, review_id, now=t)

    def transition_review(
        self,
        who: Principal,
        review_id: str,
        new_status: Literal["done", "dismissed", "cancelled"],
        *,
        transcript: list[dict[str, str]] | None = None,
        feedback_note: str | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        t = self.clock() if now is None else now
        current = self.get_review(who, review_id, now=t)
        if current["status"] in TERMINAL_REVIEW_STATES:
            raise CloudError("invalid", f"review already in terminal state {current['status']}")
        with self.s._tx() as db:
            if transcript is not None:
                db.execute(
                    "UPDATE coach_reviews SET status=?, snoozed_until=NULL, transcript_json=?,"
                    " feedback_note=?, updated_at=?"
                    " WHERE company_id=? AND id=? AND user_id=?",
                    (
                        new_status,
                        json.dumps(transcript),
                        feedback_note,
                        t,
                        who.company,
                        review_id,
                        who.user_id,
                    ),
                )
            else:
                db.execute(
                    "UPDATE coach_reviews SET status=?, snoozed_until=NULL, updated_at=?"
                    " WHERE company_id=? AND id=? AND user_id=?",
                    (new_status, t, who.company, review_id, who.user_id),
                )
        return self.get_review(who, review_id, now=t)

    def due_reminders(self, *, now: int | None = None) -> list[dict[str, Any]]:
        """Return reviews needing their single 24 h reminder (never twice, never if expired)."""
        t = self.clock() if now is None else now
        self.sweep_reviews(now=t)
        rows = self.s._q(
            "SELECT * FROM coach_reviews"
            " WHERE status='pending' AND reminded_at IS NULL"
            " AND created_at<=? AND expires_at>?",
            (t - REVIEW_REMINDER_MS, t),
        )
        return [
            {**self._review_out(r), "company_id": str(r["company_id"])}
            for r in rows
        ]

    def mark_reminded(
        self, company_id: str, review_id: str, *, now: int | None = None
    ) -> bool:
        t = self.clock() if now is None else now
        with self.s._tx() as db:
            cur = db.execute(
                "UPDATE coach_reviews SET reminded_at=?, updated_at=?"
                " WHERE company_id=? AND id=? AND reminded_at IS NULL",
                (t, t, company_id, review_id),
            )
            return cur.rowcount > 0

    def get_review_transcript(self, who: Principal, review_id: str) -> list[dict[str, str]]:
        """Transcript is visible to the agent only, plus company admin if the company allows (V4)."""
        rows = self.s._q(
            "SELECT user_id, transcript_json FROM coach_reviews WHERE company_id=? AND id=?",
            (who.company, review_id),
        )
        if not rows:
            raise CloudError("not_found", "review not found")
        r = rows[0]
        owner_id = str(r["user_id"])
        if who.user_id == owner_id:
            return json.loads(str(r["transcript_json"]))
        if who.role == "admin":
            st = self.cap_status(who.company)
            if st["allow_admin_transcript"]:
                return json.loads(str(r["transcript_json"]))
            raise CloudError("forbidden", "admin transcript access is disabled for this company")
        raise CloudError("forbidden", "only the agent can view this review transcript")

    # --- Morning Brief Preferences & History (V5) ------------------------------------------------

    def get_morning_brief_prefs(self, who: Principal) -> dict[str, Any]:
        rows = self.s._q(
            "SELECT enabled, timezone_offset_min, last_sent_day"
            " FROM coach_morning_brief_prefs WHERE company_id=? AND user_id=?",
            (who.company, who.user_id),
        )
        if not rows:
            return {"enabled": True, "timezone_offset_min": 0, "last_sent_day": None}
        r = rows[0]
        return {
            "enabled": bool(r["enabled"]),
            "timezone_offset_min": int(r["timezone_offset_min"]),
            "last_sent_day": str(r["last_sent_day"]) if r["last_sent_day"] else None,
        }

    def set_morning_brief_prefs(
        self,
        who: Principal,
        *,
        enabled: bool,
        timezone_offset_min: int | None = None,
    ) -> dict[str, Any]:
        cur = self.get_morning_brief_prefs(who)
        tz = cur["timezone_offset_min"] if timezone_offset_min is None else int(timezone_offset_min)
        if not -720 <= tz <= 840:
            raise CloudError("invalid", "timezone_offset_min out of range")
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_morning_brief_prefs"
                "(company_id, user_id, enabled, timezone_offset_min, last_sent_day)"
                " VALUES (?,?,?,?,?)"
                " ON CONFLICT(company_id, user_id) DO UPDATE SET"
                " enabled=excluded.enabled, timezone_offset_min=excluded.timezone_offset_min",
                (who.company, who.user_id, int(bool(enabled)), tz, cur["last_sent_day"]),
            )
        return self.get_morning_brief_prefs(who)

    def save_morning_brief(
        self,
        company_id: str,
        user_id: str,
        day: str,
        mode: Literal["text", "voice"],
        content: dict[str, Any],
        *,
        now: int | None = None,
    ) -> dict[str, Any]:
        t = self.clock() if now is None else now
        bid = f"mb_{secrets.token_hex(6)}"
        with self.s._tx() as db:
            db.execute(
                "INSERT INTO coach_morning_briefs"
                "(id, company_id, user_id, day, mode, content_json, delivered_at)"
                " VALUES (?,?,?,?,?,?,?)"
                " ON CONFLICT(company_id, user_id, day) DO UPDATE SET"
                " mode=excluded.mode, content_json=excluded.content_json,"
                " delivered_at=excluded.delivered_at",
                (bid, company_id, user_id, day, mode, json.dumps(content), t),
            )
            db.execute(
                "INSERT INTO coach_morning_brief_prefs"
                "(company_id, user_id, enabled, timezone_offset_min, last_sent_day)"
                " VALUES (?,?,1,0,?)"
                " ON CONFLICT(company_id, user_id) DO UPDATE SET"
                " last_sent_day=excluded.last_sent_day",
                (company_id, user_id, day),
            )
        return {
            "id": bid,
            "day": day,
            "mode": mode,
            "content": content,
            "delivered_at": t,
        }

    def latest_morning_brief(self, who: Principal) -> dict[str, Any] | None:
        rows = self.s._q(
            "SELECT id, day, mode, content_json, delivered_at FROM coach_morning_briefs"
            " WHERE company_id=? AND user_id=? ORDER BY day DESC LIMIT 1",
            (who.company, who.user_id),
        )
        if not rows:
            return None
        r = rows[0]
        return {
            "id": str(r["id"]),
            "day": str(r["day"]),
            "mode": str(r["mode"]),
            "content": json.loads(str(r["content_json"])),
            "delivered_at": int(r["delivered_at"]),
        }
