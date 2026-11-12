"""Who is on the call, from Zoho (R10, D-031): up to three candidates with the field that matched,
then, for the one the agent confirms, a capped brief (contact, account, open deals, recent notes).
Nothing is attached without the agent's pick; this module only reads."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from sotto_worker.adapters.crm.zoho import (
    ACCOUNT_FIELDS,
    DEAL_FIELDS,
    NOTE_FIELDS,
    PERSON_FIELDS,
    ZohoCRMReader,
)

MAX_CANDIDATES = 3
PERSON_MODULES = ("Contacts", "Leads")
MAX_DEALS = 5
MAX_NOTES = 5
NOTE_DAYS = 90
NOTE_CHARS = 280
# The brief goes into every live prompt of the call: about 300 tokens at most (R1 budget).
BRIEF_CHARS = 1200
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RECORD_ID = re.compile(r"^\d{5,25}$")


def classify(query: str) -> tuple[str, str] | None:
    """(search parameter, value): email, phone (≥ 6 digits) or word (a name, ≥ 2 letters)."""
    q = query.strip()[:100]
    if EMAIL.match(q):
        return "email", q.lower()
    digits = re.sub(r"\D", "", q)
    if len(digits) >= 6 and not re.search(r"[A-Za-z]", q):
        return "phone", digits
    words = re.sub(r"[^\w\s'.-]", " ", q, flags=re.UNICODE).strip()
    if len(words) >= 2:
        return "word", words
    return None


def _s(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or "")
    return "" if value is None else str(value).strip()


def _name(rec: dict[str, Any]) -> str:
    return _s(rec.get("Full_Name")) or " ".join(
        p for p in (_s(rec.get("First_Name")), _s(rec.get("Last_Name"))) if p
    )


def _candidate(module: str, rec: dict[str, Any], by: str, value: str) -> dict[str, Any]:
    phones = [_s(rec.get(f)) for f in ("Phone", "Mobile") if _s(rec.get(f))]
    email = _s(rec.get("Email"))
    name = _name(rec)
    if by == "email":
        evidence = {"field": "email", "value": email or value}
    elif by == "phone":
        tail = value[-6:]
        hit = next((p for p in phones if re.sub(r"\D", "", p).endswith(tail)), None)
        evidence = {"field": "phone", "value": hit or (phones[0] if phones else value)}
    else:
        evidence = {"field": "name", "value": name or value}
    return {
        "module": module,
        "id": str(rec.get("id", "")),
        "name": name,
        "title": _s(rec.get("Title") or rec.get("Designation")),
        "company": _s(rec.get("Account_Name") or rec.get("Company")),
        "email": email,
        "phone": phones[0] if phones else "",
        "evidence": evidence,
    }


async def find_candidates(reader: ZohoCRMReader, query: str) -> list[dict[str, Any]]:
    kind = classify(query)
    if kind is None:
        return []
    by, value = kind
    out: list[dict[str, Any]] = []
    attempts = [(by, value)]
    if by == "phone":  # numbers are stored in many formats: try the last digits as a word too
        attempts.append(("word", value[-9:]))
    for attempt_by, attempt_value in attempts:
        results = await asyncio.gather(
            *(reader.search(m, attempt_by, attempt_value) for m in PERSON_MODULES)
        )
        seen = {(c["module"], c["id"]) for c in out}
        for module, rows in zip(PERSON_MODULES, results, strict=True):
            for rec in rows:
                c = _candidate(module, rec, by, value)
                if c["id"] and (module, c["id"]) not in seen:
                    out.append(c)
                    seen.add((module, c["id"]))
        if out:
            break
    return out[:MAX_CANDIDATES]


def _open(deal: dict[str, Any]) -> bool:
    return not _s(deal.get("Stage")).lower().startswith("closed")


def _recent(note: dict[str, Any], since: datetime) -> bool:
    raw = _s(note.get("Created_Time"))
    try:
        return datetime.fromisoformat(raw) >= since
    except (ValueError, TypeError):  # no date, or one without an offset
        return False


async def build_brief(
    reader: ZohoCRMReader, module: str, record_id: str, *, now: datetime | None = None
) -> dict[str, Any] | None:
    if module not in PERSON_MODULES or not RECORD_ID.match(record_id):
        raise ValueError("pick a contact or lead")
    rec = await reader.record(module, record_id, PERSON_FIELDS[module])
    if rec is None:
        return None
    t = now or datetime.now(UTC)
    person = {
        "module": module,
        "id": record_id,
        "name": _name(rec),
        "title": _s(rec.get("Title") or rec.get("Designation")),
        "email": _s(rec.get("Email")),
        "phone": _s(rec.get("Phone") or rec.get("Mobile")),
    }
    account: dict[str, str] | None = None
    deals: list[dict[str, str]] = []
    acct_ref = rec.get("Account_Name")
    tasks: list[Any] = [
        reader.related(module, record_id, "Notes", NOTE_FIELDS, 20),
    ]
    if module == "Contacts":
        tasks.append(reader.related(module, record_id, "Deals", DEAL_FIELDS, 20))
        if isinstance(acct_ref, dict) and RECORD_ID.match(str(acct_ref.get("id", ""))):
            tasks.append(reader.record("Accounts", str(acct_ref["id"]), ACCOUNT_FIELDS))
    results = await asyncio.gather(*tasks)
    notes_raw: list[dict[str, Any]] = results[0]
    if module == "Contacts":
        deals = [
            {
                "name": _s(d.get("Deal_Name")),
                "stage": _s(d.get("Stage")),
                "amount": _s(d.get("Amount")),
                "close_date": _s(d.get("Closing_Date")),
                "owner": _s(d.get("Owner")),
            }
            for d in results[1]
            if _open(d)
        ][:MAX_DEALS]
        if len(results) > 2 and results[2]:
            account = {
                "name": _s(results[2].get("Account_Name")),
                "industry": _s(results[2].get("Industry")),
            }
        elif _s(acct_ref):
            account = {"name": _s(acct_ref), "industry": ""}
    elif _s(rec.get("Company")):
        account = {"name": _s(rec.get("Company")), "industry": _s(rec.get("Industry"))}
    since = t - timedelta(days=NOTE_DAYS)
    recent = sorted(
        (n for n in notes_raw if _recent(n, since)),
        key=lambda n: _s(n.get("Created_Time")),
        reverse=True,
    )[:MAX_NOTES]
    notes = [
        {
            "date": _s(n.get("Created_Time"))[:10],
            "title": _s(n.get("Note_Title"))[:80],
            "text": " ".join(_s(n.get("Note_Content")).split())[:NOTE_CHARS],
        }
        for n in recent
    ]
    brief: dict[str, Any] = {"person": person, "account": account, "deals": deals, "notes": notes}
    brief["text"] = brief_text(brief)
    return brief


def brief_text(brief: dict[str, Any]) -> str:
    """The compact text the live prompt's `crm.brief` variable carries (data, not instructions),
    capped at BRIEF_CHARS: notes are dropped from the oldest first, then the text is cut."""
    p = brief["person"]
    head = ", ".join(x for x in (p["name"], p["title"]) if x)
    lines = [f"{'Lead' if p['module'] == 'Leads' else 'Contact'}: {head}"]
    a = brief.get("account")
    if a and a.get("name"):
        lines.append("Account: " + a["name"] + (f" ({a['industry']})" if a.get("industry") else ""))
    for d in brief.get("deals") or []:
        bits = [
            d["stage"],
            d["amount"] and f"amount {d['amount']}",
            d["close_date"] and f"closes {d['close_date']}",
        ]
        lines.append(f"Open deal: {d['name']} — " + ", ".join(b for b in bits if b))
    notes = [
        f"Note {n['date']}: {n['title'] + ' — ' if n['title'] else ''}{n['text']}"
        for n in brief.get("notes") or []
    ]
    while notes and len("\n".join(lines + notes)) > BRIEF_CHARS:
        notes.pop()
    return "\n".join(lines + notes)[:BRIEF_CHARS]
