"""Zoho writes the agent approves one by one (R12, D-031, T-062): a Meeting, a Lead, a Contact
update, a Note on a Deal, the call log, a next-step Task (INT-02t) and the AGN fields on a Deal
(INT-06, D-069). Each kind has a closed list of fields; anything else (a Deal stage or
amount, an owner, an arbitrary module) is refused before a request is built."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sotto_worker.adapters.crm.zoho import ZohoCRMReader
from sotto_worker.cloud.store import CloudError

RECORD_ID = re.compile(r"^\d{5,25}$")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")
KINDS = ("meeting", "lead", "contact_update", "deal_note", "call_log", "task", "agn_fields")
# W4-SCOPES (D-069): the scope group a kind needs beyond the base set (oauth.FEATURE_SCOPES).
KIND_FEATURE = {"task": "tasks", "agn_fields": "agn_fields"}
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# INT-06: the app's names for the AGN fields → Zoho API names (adapter AGN_DEAL_FIELDS).
AGN_MAP = {
    "score": "AGN_Call_Score",
    "chance_band": "AGN_Chance_Band",
    "top_objection": "AGN_Top_Objection",
    "last_call_date": "AGN_Last_Call_Date",
}
# INT-01 (draft D-047 (backlog)): the after-call log is the review's structured summary, never
# transcript text;
# the caps keep a pasted transcript out. Parent order: Deal, else Contact, else Lead.
CALL_LOG_PARENTS = (("deal_id", "Deals"), ("contact_id", "Contacts"), ("lead_id", "Leads"))
CHANCE_BANDS = ("low", "medium", "high")
CALL_ID = re.compile(r"^[A-Za-z0-9_-]{1,50}$")
# Fields each kind accepts from the app; `required` must be present and non-empty.
FIELDS: dict[str, dict[str, int]] = {
    "meeting": {
        "title": 255,
        "start": 40,
        "end": 40,
        "description": 2000,
        "contact_id": 25,
        "deal_id": 25,
    },
    "lead": {
        "first_name": 40,
        "last_name": 80,
        "company": 200,
        "email": 100,
        "phone": 30,
        "description": 2000,
    },
    "contact_update": {
        "contact_id": 25,
        "first_name": 40,
        "last_name": 80,
        "email": 100,
        "phone": 30,
        "description": 2000,
    },
    "deal_note": {"deal_id": 25, "title": 120, "content": 5000},
    "call_log": {
        "call_id": 50,
        "deal_id": 25,
        "contact_id": 25,
        "lead_id": 25,
        "summary": 800,
        "objections": 400,
        "commitments": 400,
        "next_step": 200,
        "chance_band": 6,
    },
    # INT-02t: the next-step Task, agent-confirmed (due date and owner both checked in the app).
    "task": {
        "call_id": 50,
        "subject": 255,
        "due_date": 10,
        "owner_id": 25,
        "deal_id": 25,
        "contact_id": 25,
        "lead_id": 25,
        "description": 2000,
    },
    # INT-06: only these four, and only on a Deal (D-069). There is no stage or amount field.
    "agn_fields": {
        "call_id": 50,
        "deal_id": 25,
        "score": 3,
        "chance_band": 6,
        "top_objection": 255,
        "last_call_date": 10,
    },
}
REQUIRED = {
    "meeting": ("title", "start", "end"),
    "lead": ("last_name", "company"),
    "contact_update": ("contact_id",),
    "deal_note": ("deal_id", "content"),
    "call_log": ("call_id", "summary"),
    "task": ("call_id", "subject", "due_date", "owner_id"),
    "agn_fields": ("call_id", "deal_id"),
}
MAX_MEETING = timedelta(hours=8)


@dataclass(frozen=True)
class Planned:
    kind: str
    summary: str  # for the audit row: what, never the content
    fields: dict[str, str]
    # Set by the server when the kind has a natural key (call_log: one per call), so a retry
    # from another device or a lost response never writes twice.
    idem_key: str | None = None


def plan(kind: str, raw: Any) -> Planned:
    """Validates the approved action; raises CloudError on any field outside the kind's list."""
    if kind not in KINDS:
        raise CloudError("forbidden", "that Zoho action is not allowed")
    if not isinstance(raw, dict):
        raise CloudError("invalid", "send the action's fields")
    allowed = FIELDS[kind]
    extra = sorted(set(raw) - set(allowed))
    if extra:
        raise CloudError("forbidden", f"field not allowed: {extra[0]}")
    fields: dict[str, str] = {}
    for name, limit in allowed.items():
        value = raw.get(name)
        if value is None:
            continue
        if not isinstance(value, str):
            raise CloudError("invalid", f"{name} must be text")
        value = value.strip()
        if len(value) > limit:
            raise CloudError("invalid", f"{name} is too long")
        if value:
            fields[name] = value
    for name in REQUIRED[kind]:
        if not fields.get(name):
            raise CloudError("invalid", f"{name} is required")
    for name in ("contact_id", "deal_id", "lead_id", "owner_id"):
        if name in fields and not RECORD_ID.match(fields[name]):
            raise CloudError("invalid", f"{name} is not a Zoho record id")
    if "email" in fields and not EMAIL.match(fields["email"]):
        raise CloudError("invalid", "that email does not look right")
    if kind == "meeting":
        start, end = _when(fields["start"]), _when(fields["end"])
        if not timedelta(0) < end - start <= MAX_MEETING:
            raise CloudError("invalid", "the meeting must end after it starts, within 8 hours")
    key = None
    if kind in ("call_log", "task", "agn_fields") and not CALL_ID.match(fields["call_id"]):
        raise CloudError("invalid", "call_id is not valid")
    if kind == "task":
        due = _day(fields["due_date"])
        if due < date.today() - timedelta(days=1):  # a day of slack for time zones
            raise CloudError("invalid", "the due date is in the past")
        return Planned(kind, "Tasks", fields, f"task-{fields['call_id']}")
    if kind == "agn_fields":
        if not set(fields) & set(AGN_MAP):
            raise CloudError("invalid", "pick at least one AGN field")
        if "score" in fields and not (fields["score"].isdigit() and int(fields["score"]) <= 100):
            raise CloudError("invalid", "score must be 0 to 100")
        if fields.get("chance_band", "medium") not in CHANCE_BANDS:
            raise CloudError("invalid", "chance_band must be low, medium or high")
        if "last_call_date" in fields:
            _day(fields["last_call_date"])
        return Planned(
            kind,
            f"AGN fields on Deals:{fields['deal_id']}",
            fields,
            f"agn_fields-{fields['call_id']}",
        )
    if kind == "call_log":
        if not CALL_ID.match(fields["call_id"]):
            raise CloudError("invalid", "call_id is not valid")
        if fields.get("chance_band", "medium") not in CHANCE_BANDS:
            raise CloudError("invalid", "chance_band must be low, medium or high")
        parent = next(((f, m) for f, m in CALL_LOG_PARENTS if fields.get(f)), None)
        if parent is None:
            raise CloudError("invalid", "link the call to a deal, contact or lead first")
        key = f"call_log-{fields['call_id']}"
        return Planned(kind, f"Notes on {parent[1]}:{fields[parent[0]]}", fields, key)
    summary = {
        "meeting": "Events",
        "lead": "Leads",
        "contact_update": f"Contacts:{fields.get('contact_id', '')}",
        "deal_note": f"Notes on Deals:{fields.get('deal_id', '')}",
    }[kind]
    return Planned(kind, summary, fields)


def _day(value: str) -> date:
    if not DAY.match(value):
        raise CloudError("invalid", "dates must be YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise CloudError("invalid", "that date does not exist") from None


def _when(value: str) -> datetime:
    try:
        t = datetime.fromisoformat(value)
    except ValueError:
        raise CloudError("invalid", "times must be ISO 8601 with an offset") from None
    if t.tzinfo is None:
        raise CloudError("invalid", "times need a UTC offset")
    return t


def _zoho_time(value: str) -> str:
    """Zoho wants yyyy-MM-ddTHH:mm:ss±HH:mm (no fractions, explicit offset)."""
    return _when(value).replace(microsecond=0).isoformat()


async def execute(writer: ZohoCRMReader, p: Planned) -> dict[str, Any]:
    f = p.fields
    if p.kind == "meeting":
        record: dict[str, Any] = {
            "Event_Title": f["title"],
            "Start_DateTime": _zoho_time(f["start"]),
            "End_DateTime": _zoho_time(f["end"]),
        }
        if f.get("description"):
            record["Description"] = f["description"]
        if f.get("contact_id"):
            record["Who_Id"] = {"id": f["contact_id"]}
            record["Participants"] = [{"type": "contact", "participant": f["contact_id"]}]
        if f.get("deal_id"):
            record["What_Id"] = {"id": f["deal_id"]}
            record["$se_module"] = "Deals"
        return await writer.create("Events", record)
    if p.kind == "lead":
        record = {"Last_Name": f["last_name"], "Company": f["company"]}
        for src, dst in (
            ("first_name", "First_Name"),
            ("email", "Email"),
            ("phone", "Phone"),
            ("description", "Description"),
        ):
            if f.get(src):
                record[dst] = f[src]
        # A plain create: approving "Create a lead" must never overwrite an existing one
        # (security review M1); retries are covered by the idempotency key.
        return await writer.create("Leads", record)
    if p.kind == "contact_update":
        record = {}
        for src, dst in (
            ("first_name", "First_Name"),
            ("last_name", "Last_Name"),
            ("email", "Email"),
            ("phone", "Phone"),
            ("description", "Description"),
        ):
            if f.get(src):
                record[dst] = f[src]
        if not record:
            raise CloudError("invalid", "change at least one field")
        return await writer.update("Contacts", f["contact_id"], record)
    if p.kind == "task":
        task: dict[str, Any] = {
            "Subject": f["subject"],
            "Due_Date": f["due_date"],
            "Owner": {"id": f["owner_id"]},
            "Status": "Not Started",
        }
        if f.get("description"):
            task["Description"] = f["description"]
        if f.get("contact_id"):
            task["Who_Id"] = {"id": f["contact_id"]}
        if f.get("deal_id"):
            task["What_Id"] = {"id": f["deal_id"]}
            task["$se_module"] = "Deals"
        elif f.get("lead_id"):
            task["What_Id"] = {"id": f["lead_id"]}
            task["$se_module"] = "Leads"
        return await writer.create("Tasks", task)
    if p.kind == "agn_fields":
        record = {AGN_MAP[k]: f[k] for k in AGN_MAP if f.get(k)}
        if "AGN_Call_Score" in record:
            record["AGN_Call_Score"] = int(record["AGN_Call_Score"])
        if "AGN_Chance_Band" in record:
            record["AGN_Chance_Band"] = record["AGN_Chance_Band"].capitalize()
        return await writer.update_deal_fields(f["deal_id"], record)
    if p.kind == "call_log":
        field, module = next((fl, m) for fl, m in CALL_LOG_PARENTS if f.get(fl))
        lines = [f"Summary: {f['summary']}"]
        for name, label in (
            ("objections", "Objections"),
            ("commitments", "Commitments"),
            ("next_step", "Next step"),
            ("chance_band", "Chance"),
        ):
            if f.get(name):
                lines.append(f"{label}: {f[name]}")
        return await writer.create(
            "Notes",
            {
                "Note_Title": "Call log (AGN Sales Shield)",
                "Note_Content": "\n".join(lines),
                "Parent_Id": {"module": {"api_name": module}, "id": f[field]},
            },
        )
    # deal_note: a Note whose parent is the Deal; the Deal record itself is never written.
    note: dict[str, Any] = {
        "Note_Content": f["content"],
        "Parent_Id": {"module": {"api_name": "Deals"}, "id": f["deal_id"]},
    }
    if f.get("title"):
        note["Note_Title"] = f["title"]
    return await writer.create("Notes", note)
