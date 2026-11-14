"""INT-12 (D-072): one CSV row per call of one ISO week, for Zoho Analytics.

Numbers, fixed categories and Zoho record ids only; never transcript text, questions, notes,
summaries or the CRM brief text. One company per file (the caller's), built from:
`usage` (counts, delay, review scores), `coaching_objections` (fixed themes), `call_briefs`
(the Zoho person, deal and meeting the agent attached) and `zoho_writes` (the Task and AGN-field
writes of that call).

Columns (COLUMNS, in this order):
call_id, started_at_utc, iso_week, agent_email, duration_s, cards, playbook_cards, ai_cards,
holding_lines, escalations, p95_ms, score_opening, score_discovery, score_listening,
score_objections, score_clarity, score_next_step, call_score, chance_to_close, sentiment,
objection_categories, zoho_person_module, zoho_person_id, zoho_deal_id, zoho_meeting_id,
zoho_task_id

`call_score` is the mean of the six skill scores times 10 (0 to 100), as AGN_Call_Score."""

from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sotto_worker.cloud.store import REVIEW_DIMENSIONS, CloudError, CloudStore

COLUMNS = (
    "call_id",
    "started_at_utc",
    "iso_week",
    "agent_email",
    "duration_s",
    "cards",
    "playbook_cards",
    "ai_cards",
    "holding_lines",
    "escalations",
    "p95_ms",
    *(f"score_{k}" for k in REVIEW_DIMENSIONS),
    "call_score",
    "chance_to_close",
    "sentiment",
    "objection_categories",
    "zoho_person_module",
    "zoho_person_id",
    "zoho_deal_id",
    "zoho_meeting_id",
    "zoho_task_id",
)
WEEK = re.compile(r"^(\d{4})-W(\d{2})$")
ZOHO_ID = re.compile(r"^\d{5,25}$")
PERSON_MODULES = ("Contacts", "Leads")
MAX_ROWS = 20_000
DAY_MS = 86_400_000


def week_range(week: str | None, now: datetime | None = None) -> tuple[str, int, int]:
    """(label, start ms, end ms) of an ISO week, UTC; default the last full week."""
    if week:
        m = WEEK.match(week)
        if not m:
            raise CloudError("invalid", "week must look like 2026-W46")
        try:
            monday = date.fromisocalendar(int(m[1]), int(m[2]), 1)
        except ValueError:
            raise CloudError("invalid", "that week does not exist") from None
    else:
        today = (now or datetime.now(UTC)).date()
        monday = today - timedelta(days=today.weekday() + 7)
    start = datetime(monday.year, monday.month, monday.day, tzinfo=UTC)
    y, w, _ = monday.isocalendar()
    ms = int(start.timestamp() * 1000)
    return f"{y}-W{w:02d}", ms, ms + 7 * DAY_MS


def _zid(value: Any) -> str:
    v = "" if value is None else str(value)
    return v if ZOHO_ID.match(v) else ""


def _rows(store: CloudStore, company_id: str, start: int, end: int) -> list[sqlite3.Row]:
    return store._q(
        "SELECT u.id, u.started_at, u.duration_s, u.cards, u.playbook_cards, u.ai_cards,"
        " u.holding_lines, u.escalations, u.p95_ms, u.review_json, us.email"
        " FROM usage u JOIN users us ON us.id = u.user_id AND us.company_id = u.company_id"
        " WHERE u.company_id = ? AND u.started_at >= ? AND u.started_at < ?"
        " ORDER BY u.started_at LIMIT ?",
        (company_id, start, end, MAX_ROWS),
    )


def _by_call(store: CloudStore, sql: str, company_id: str, *args: Any) -> list[sqlite3.Row]:
    try:
        return store._q(sql, (company_id, *args))
    except sqlite3.OperationalError:  # that module never ran on this server
        return []


def build_csv(store: CloudStore, company_id: str, week: str | None = None) -> tuple[str, str]:
    """(week label, CSV text) for one company. The caller has checked the role."""
    label, start, end = week_range(week)
    calls = _rows(store, company_id, start, end)
    prefix = f"{company_id}:"
    ids = [str(r["id"]).removeprefix(prefix) for r in calls]
    themes: dict[str, set[str]] = {}
    briefs: dict[str, dict[str, Any]] = {}
    writes: dict[str, str] = {}
    if ids:
        id_list = json.dumps(ids)
        for r in _by_call(
            store,
            "SELECT call_id, theme FROM coaching_objections WHERE company_id = ?"
            " AND call_id IN (SELECT value FROM json_each(?))",
            company_id,
            id_list,
        ):
            themes.setdefault(str(r["call_id"]), set()).add(str(r["theme"]))
        for r in _by_call(
            store,
            "SELECT call_id, brief_json FROM call_briefs WHERE company_id = ?"
            " AND call_id IN (SELECT value FROM json_each(?))",
            company_id,
            id_list,
        ):
            try:
                crm = json.loads(r["brief_json"]).get("crm")
            except (ValueError, AttributeError):
                crm = None
            if isinstance(crm, dict):
                briefs[str(r["call_id"])] = crm
        keys = [f"task-{i}" for i in ids] + [f"agn_fields-{i}" for i in ids]
        for r in _by_call(
            store,
            "SELECT idem_key, zoho_id FROM zoho_writes WHERE company_id = ? AND status = 'done'"
            " AND idem_key IN (SELECT value FROM json_each(?))",
            company_id,
            json.dumps(keys),
        ):
            writes[str(r["idem_key"])] = _zid(r["zoho_id"])
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(COLUMNS)
    for r, call_id in zip(calls, ids, strict=True):
        review: dict[str, Any] = {}
        if r["review_json"]:
            try:
                loaded = json.loads(r["review_json"])
            except ValueError:
                loaded = None
            review = loaded if isinstance(loaded, dict) else {}
        raw_scores = review.get("scores")
        scores: dict[str, Any] = raw_scores if isinstance(raw_scores, dict) else {}
        vals = [scores.get(k) for k in REVIEW_DIMENSIONS]
        nums = [v for v in vals if isinstance(v, int)]
        call_score = round(sum(nums) * 10 / len(nums)) if len(nums) == len(vals) else ""
        success = review.get("success")
        sentiment = review.get("sentiment")
        crm = briefs.get(call_id, {})
        raw_person = crm.get("person")
        person: dict[str, Any] = raw_person if isinstance(raw_person, dict) else {}
        module = str(person.get("module") or "")
        module = module if module in PERSON_MODULES else ""
        w.writerow(
            [
                call_id,
                datetime.fromtimestamp(int(r["started_at"]) / 1000, UTC).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                label,
                str(r["email"]),
                int(r["duration_s"]),
                int(r["cards"]),
                int(r["playbook_cards"]),
                int(r["ai_cards"]),
                int(r["holding_lines"]),
                int(r["escalations"]),
                "" if r["p95_ms"] is None else int(r["p95_ms"]),
                *("" if v is None else int(v) for v in vals),
                call_score,
                success if isinstance(success, int) else "",
                sentiment if sentiment in ("positive", "neutral", "negative") else "",
                ";".join(sorted(themes.get(call_id, set()))),
                module,
                _zid(person.get("id")) if module else "",
                writes.get(f"agn_fields-{call_id}") or _zid(crm.get("deal_id")),
                _zid(crm.get("meeting_id")),
                writes.get(f"task-{call_id}", ""),
            ]
        )
    return label, out.getvalue()
