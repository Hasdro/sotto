"""Who is on the call, from Zoho (R10, D-031): up to three candidates with the field that matched,
then, for the one the agent confirms, a capped brief (contact, account, open deals, recent notes).
Nothing is attached without the agent's pick; this module only reads."""

from __future__ import annotations

import asyncio
import functools
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import yaml

from sotto_worker.adapters.crm.zoho import (
    ACCOUNT_FIELDS,
    DEAL_DETAIL_FIELDS,
    DEAL_FIELDS,
    EVENT_FIELDS,
    NOTE_FIELDS,
    PERSON_FIELDS,
    ZohoCRMReader,
    ZohoError,
)
from sotto_worker.runtime import SEED

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
SOURCE_CHARS = 80


@functools.cache
def _stage_seed() -> tuple[str, dict[str, str]]:
    """INT-03 (D-048): the stage label and guidance lines from seed/prompts/crm_brief.md."""
    _, front, _ = (SEED / "prompts" / "crm_brief.md").read_text(encoding="utf-8").split("---\n", 2)
    meta = yaml.safe_load(front) or {}
    table = {str(k).lower(): str(v) for k, v in (meta.get("stage_guidance") or {}).items()}
    return str(meta.get("stage_label") or "{stage}"), table


def _norm(stage: str) -> str:
    return " ".join(stage.lower().replace("-", " ").split())


def stage_guidance(stage: str) -> str | None:
    """The guidance line for a Deal stage (longest matching start), or None."""
    label, table = _stage_seed()
    s = _norm(stage)
    if not s:
        return None
    keys = sorted((k for k in table if s.startswith(_norm(k))), key=len, reverse=True)
    if not keys:
        return None
    return f"{label.replace('{stage}', stage.strip())}: {table[keys[0]]}"


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
        "source": _s(rec.get("Lead_Source"))[:SOURCE_CHARS],
        "campaign": _s(rec.get("Campaign_Source"))[:SOURCE_CHARS],
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
                "id": _s(d.get("id")),
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
    p = brief.get("person")
    lines: list[str] = []
    m = brief.get("meeting")
    if m:
        when = f"{m['start'][:16].replace('T', ' ')} to {m['end'][11:16]}" if m.get("start") else ""
        lines.append(f"Meeting: {m['title']}" + (f", {when}" if when else ""))
        rel = m.get("related")
        if rel and rel.get("name"):
            lines.append(f"Related {rel['module'].rstrip('s').lower()}: {rel['name']}")
        if m.get("participants"):
            lines.append("Attendees: " + ", ".join(m["participants"]))
        if m.get("agenda"):
            lines.append(f"Agenda: {m['agenda']}")
    if p:
        head = ", ".join(x for x in (p["name"], p["title"]) if x)
        lines.append(f"{'Lead' if p['module'] == 'Leads' else 'Contact'}: {head}")
        origin = [
            p.get("source") and f"source {p['source']}",
            p.get("campaign") and f"campaign {p['campaign']}",
        ]
        if any(origin):
            lines.append("Came from: " + ", ".join(o for o in origin if o))
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
    deals = brief.get("deals") or []
    guide = stage_guidance(deals[0]["stage"]) if deals else None
    if guide:
        lines.append(guide)
    notes = [
        f"Note {n['date']}: {n['title'] + ' — ' if n['title'] else ''}{n['text']}"
        for n in brief.get("notes") or []
    ]
    while notes and len("\n".join(lines + notes)) > BRIEF_CHARS:
        notes.pop()
    return "\n".join(lines + notes)[:BRIEF_CHARS]


# --- Meetings (Zoho module `Events`, label "Meetings"; REFERENCES § Zoho) ---------------------
UPCOMING_DAYS = 14
UPCOMING_PAGE = 20
UPCOMING_MAX_ROWS = 600  # three Zoho pages of 200: enough for two weeks of one person's meetings
AGENDA_CHARS = 300
DETAIL_CHARS = 2000
URL = re.compile(r"https://[^\s<>\"']{4,300}")
RELATED_MODULES = ("Deals", "Accounts", "Contacts", "Leads")


def _iso(t: datetime) -> str:
    return t.astimezone(UTC).replace(microsecond=0).isoformat()


def _when(rec: dict[str, Any], field: str) -> datetime | None:
    try:
        t = datetime.fromisoformat(_s(rec.get(field)))
    except ValueError:
        return None
    return t if t.tzinfo else None


def _owner_id(rec: dict[str, Any]) -> str:
    owner = rec.get("Owner")
    return _s(owner.get("id")) if isinstance(owner, dict) else ""


def owned_by(rec: dict[str, Any], user_id: str) -> bool:
    """Only meetings this person owns are ever shown (owner request, 14 Nov 2026)."""
    return bool(user_id) and _owner_id(rec) == user_id


def _participants(rec: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for p in rec.get("Participants") or []:
        if isinstance(p, dict):
            name = _s(p.get("name")) or _s(p.get("Email"))
            if name and name not in out:
                out.append(name)
    return out[:8]


def _related(rec: dict[str, Any]) -> dict[str, str] | None:
    what = rec.get("What_Id")
    module = _s(rec.get("$se_module"))
    if isinstance(what, dict) and module in RELATED_MODULES:
        return {"module": module, "id": _s(what.get("id")), "name": _s(what.get("name"))}
    return None


def _link(rec: dict[str, Any]) -> str:
    details = rec.get("$meeting_details")
    if isinstance(details, dict):
        for key in ("link", "meeting_link", "join_link"):
            if _s(details.get(key)).startswith("https://"):
                return _s(details.get(key))[:300]
    for field in ("Venue", "Description"):
        m = URL.search(_s(rec.get(field)))
        if m:
            return m.group(0)
    return ""


def _meeting(rec: dict[str, Any]) -> dict[str, Any]:
    who = rec.get("Who_Id") if isinstance(rec.get("Who_Id"), dict) else None
    return {
        "id": _s(rec.get("id")),
        "title": _s(rec.get("Event_Title")),
        "start": _s(rec.get("Start_DateTime")),
        "end": _s(rec.get("End_DateTime")),
        "agenda": " ".join(_s(rec.get("Description")).split())[:AGENDA_CHARS],
        "participants": _participants(rec),
        "related": _related(rec),
        "contact": {"id": _s(who.get("id")), "name": _s(who.get("name"))} if who else None,
    }


async def current_user_id(reader: ZohoCRMReader) -> str:
    user = await reader.current_user()
    uid = _s(user.get("id")) if user else ""
    if not RECORD_ID.match(uid):
        raise ValueError("Zoho did not say who the connected user is")
    return uid


async def upcoming_meetings(
    reader: ZohoCRMReader,
    user_id: str,
    *,
    page: int = 1,
    now: datetime | None = None,
    days: int = UPCOMING_DAYS,
) -> dict[str, Any]:
    """This person's meetings that have not ended yet, up to `days` ahead, soonest first,
    UPCOMING_PAGE per page. The owner filter is in the Zoho query and checked again here."""
    t = now or datetime.now(UTC)
    criteria = (
        f"((Owner:equals:{user_id})"
        f"and(Start_DateTime:greater_equal:{_iso(t - timedelta(hours=8))})"
        f"and(Start_DateTime:less_equal:{_iso(t + timedelta(days=days))}))"
    )
    rows: list[dict[str, Any]] = []
    zoho_page = 1
    while len(rows) < UPCOMING_MAX_ROWS:
        batch, more = await reader.search_page("Events", criteria, EVENT_FIELDS, zoho_page)
        rows.extend(batch)
        if not more:
            break
        zoho_page += 1
    mine = []
    for r in rows:
        start, end = _when(r, "Start_DateTime"), _when(r, "End_DateTime")
        if start is None or not owned_by(r, user_id):
            continue
        if (end or start) < t:  # already over
            continue
        mine.append((start, r))
    mine.sort(key=lambda x: x[0])
    first = (max(1, page) - 1) * UPCOMING_PAGE
    chunk = mine[first : first + UPCOMING_PAGE]
    out = []
    for _, r in chunk:
        m = _meeting(r)
        m.pop("contact")
        out.append({**m, "evidence": {"field": "time", "value": m["start"]}})
    return {"meetings": out, "page": max(1, page), "more": first + UPCOMING_PAGE < len(mine)}


async def meeting_detail(
    reader: ZohoCRMReader, user_id: str, event_id: str
) -> dict[str, Any] | None:
    """View-only detail of one of this person's meetings; None for anyone else's."""
    if not RECORD_ID.match(event_id):
        raise ValueError("unknown meeting")
    rec = await reader.record("Events", event_id, EVENT_FIELDS)
    if rec is None or not owned_by(rec, user_id):
        return None
    people = []
    for p in rec.get("Participants") or []:
        if isinstance(p, dict):
            people.append(
                {
                    "name": _s(p.get("name")),
                    "email": _s(p.get("Email")),
                    "type": _s(p.get("type")),
                }
            )
    who = rec.get("Who_Id") if isinstance(rec.get("Who_Id"), dict) else None
    return {
        "id": event_id,
        "title": _s(rec.get("Event_Title")),
        "start": _s(rec.get("Start_DateTime")),
        "end": _s(rec.get("End_DateTime")),
        "participants": people[:50],
        "related": _related(rec),
        "contact": {"id": _s(who.get("id")), "name": _s(who.get("name"))} if who else None,
        "description": _s(rec.get("Description"))[:DETAIL_CHARS],
        "venue": _s(rec.get("Venue"))[:300],
        "link": _link(rec),
    }


async def build_meeting_brief(
    reader: ZohoCRMReader, event_id: str, user_id: str, *, now: datetime | None = None
) -> dict[str, Any] | None:
    """The brief for a picked meeting: the meeting, its Contact (Who_Id, else the first contact
    or lead participant), the related Deal (What_Id) and its Account, and recent notes."""
    if not RECORD_ID.match(event_id):
        raise ValueError("unknown meeting")
    rec = await reader.record("Events", event_id, EVENT_FIELDS)
    if rec is None or not owned_by(rec, user_id):
        return None
    meeting = _meeting(rec)
    contact = meeting.pop("contact")
    related = meeting.get("related")
    person: tuple[str, str] | None = None
    if contact and RECORD_ID.match(contact["id"]):
        person = ("Contacts", contact["id"])
    elif related and related["module"] in PERSON_MODULES and RECORD_ID.match(related["id"]):
        person = (related["module"], related["id"])
    else:
        for p in rec.get("Participants") or []:
            if not isinstance(p, dict):
                continue
            kind, pid = _s(p.get("type")).lower(), _s(p.get("participant"))
            if kind in ("contact", "lead") and RECORD_ID.match(pid):
                person = ("Contacts" if kind == "contact" else "Leads", pid)
                break
    brief: dict[str, Any] | None = None
    if person:
        try:
            brief = await build_brief(reader, person[0], person[1], now=now)
        except ZohoError:  # a deleted or unreadable contact must not hide the meeting
            brief = None
    if brief is None:
        brief = {"person": None, "account": None, "deals": [], "notes": []}
    if related and related["module"] == "Deals" and RECORD_ID.match(related["id"]):
        deal = await reader.record("Deals", related["id"], DEAL_DETAIL_FIELDS)
        if deal:
            row = {
                "id": related["id"],
                "name": _s(deal.get("Deal_Name")),
                "stage": _s(deal.get("Stage")),
                "amount": _s(deal.get("Amount")),
                "close_date": _s(deal.get("Closing_Date")),
                "owner": _s(deal.get("Owner")),
            }
            brief["deals"] = [row, *[d for d in brief["deals"] if d.get("id") != row["id"]]][
                :MAX_DEALS
            ]
            acct = deal.get("Account_Name")
            if (
                not brief.get("account")
                and isinstance(acct, dict)
                and RECORD_ID.match(_s(acct.get("id")))
            ):
                a = await reader.record("Accounts", _s(acct.get("id")), ACCOUNT_FIELDS)
                if a:
                    brief["account"] = {
                        "name": _s(a.get("Account_Name")),
                        "industry": _s(a.get("Industry")),
                    }
    elif (
        related
        and related["module"] == "Accounts"
        and not brief.get("account")
        and RECORD_ID.match(related["id"])
    ):
        a = await reader.record("Accounts", related["id"], ACCOUNT_FIELDS)
        if a:
            brief["account"] = {
                "name": _s(a.get("Account_Name")),
                "industry": _s(a.get("Industry")),
            }
    brief["meeting"] = meeting
    brief["text"] = brief_text(brief)
    return brief
