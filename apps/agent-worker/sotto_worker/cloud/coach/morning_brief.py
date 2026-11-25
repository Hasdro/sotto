"""Daily 08:00 local morning brief generator and scheduler job (V5).

- Runs at 08:00 local time per user (using their saved timezone offset).
- Text by default; voice mode enabled ONLY when voice_coach is active and under cap.
- Users can turn it off via `set_morning_brief_prefs(enabled=False)`.
- With Zoho: today's meetings + one sales tip + pending reviews.
- Without Zoho: one sales tip + pending reviews. Never empty.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sotto_worker.cloud.coach.engine import load_prompt_body, render_template
from sotto_worker.cloud.coach.store import CoachStore
from sotto_worker.cloud.coach.stubs import log_event
from sotto_worker.cloud.store import Principal
from sotto_worker.contracts import LLMAdapter, LLMRequest, Message

MeetingsFetcher = Callable[[str, str, str], Awaitable[list[dict[str, Any]]]]
# (company_id, user_id, local_day_iso) -> list of {title, start, contact?}

FALLBACK_TIPS = (
    "Open with one concrete question about what changed since your last touchpoint.",
    "Pause two seconds after stating price so the buyer can share their real concern.",
    "Confirm the exact next step and date before wrapping up the call.",
    "Mirror the buyer's exact words when summarizing their top priority.",
)


def _local_dt(now_ms_val: int, tz_offset_min: int) -> datetime:
    return datetime.fromtimestamp(now_ms_val / 1000, UTC) + timedelta(minutes=tz_offset_min)


def _daily_tip(day_iso: str, user_id: str) -> str:
    idx = (sum(ord(c) for c in f"{day_iso}:{user_id}")) % len(FALLBACK_TIPS)
    return FALLBACK_TIPS[idx]


async def generate_morning_brief(
    store: CoachStore,
    who: Principal,
    *,
    meetings: list[dict[str, Any]] | None = None,
    prompts: dict[str, dict[str, Any]] | None = None,
    llm: LLMAdapter | None = None,
    now: int | None = None,
) -> dict[str, Any]:
    t = store.clock() if now is None else now
    prefs = store.get_morning_brief_prefs(who)
    local = _local_dt(t, int(prefs["timezone_offset_min"]))
    day_iso = local.strftime("%Y-%m-%d")

    pending = [
        r for r in store.list_reviews(who, include_closed=False, now=t) if r["status"] == "pending"
    ]
    meeting_list = list(meetings or [])
    tip = _daily_tip(day_iso, who.user_id)

    cap = store.cap_status(who.company, now=t)
    mode: Literal["text", "voice"] = "voice" if cap["available"] else "text"

    meetings_text = (
        "\n".join(
            f"- {m.get('start', '')} {m.get('title', 'Call')}".strip() for m in meeting_list[:6]
        )
        if meeting_list
        else ""
    )
    reviews_text = (
        f"{len(pending)} pending call review(s)" if pending else "No pending call reviews."
    )

    if llm is not None:
        system = render_template(
            load_prompt_body("morning_brief", prompts=prompts),
            {
                "brief.meetings": meetings_text or "None (Zoho not connected or no meetings today)",
                "brief.pending_reviews": reviews_text,
                "brief.recent_tip_context": tip,
            },
        )
        chunks: list[str] = []
        async for chunk in llm.stream(
            LLMRequest(
                system=system,
                messages=[Message(role="user", content="Write today's morning brief.")],
                max_tokens=220,
                temperature=0.4,
            )
        ):
            chunks.append(chunk.text)
        summary_text = "".join(chunks).strip()
    else:
        parts: list[str] = []
        if meeting_list:
            parts.append(f"Today's meetings ({len(meeting_list)}): " + ", ".join(
                str(m.get("title", "Call")) for m in meeting_list[:4]
            ) + ".")
        parts.append(f"Tip for today: {tip}")
        if pending:
            parts.append(f"You have {len(pending)} pending call review(s) in your queue.")
        summary_text = " ".join(parts).strip()

    # Guarantee the brief is never empty (V5).
    if not summary_text:
        summary_text = f"Tip for today: {tip}"

    content = {
        "day": day_iso,
        "has_zoho_meetings": bool(meeting_list),
        "meetings": meeting_list[:6],
        "tip": tip,
        "pending_reviews_count": len(pending),
        "summary_text": summary_text,
    }
    saved = store.save_morning_brief(who.company, who.user_id, day_iso, mode, content, now=t)
    log_event(
        "morning_brief",
        "generated",
        mode=mode,
        meetings=len(meeting_list),
        pending_reviews=len(pending),
    )
    return saved


async def morning_brief_job(
    store: CoachStore,
    *,
    fetch_meetings: MeetingsFetcher | None = None,
    prompts: dict[str, dict[str, Any]] | None = None,
    llm: LLMAdapter | None = None,
    now: int | None = None,
) -> int:
    """Scheduler hook (V5): delivers one morning brief per user after 08:00 local time.

    Skips users who turned morning_brief off. Safe to run repeatedly (idempotent per day).
    """
    t = store.clock() if now is None else now
    users = store.s._q(
        "SELECT id, company_id, email, name, role FROM users WHERE active=1"
    )
    delivered = 0
    for u in users:
        who = Principal(
            user_id=str(u["id"]),
            company_id=str(u["company_id"]),
            role=str(u["role"]),
            device_id=None,
            email=str(u["email"]),
            name=str(u["name"]),
        )
        prefs = store.get_morning_brief_prefs(who)
        if not prefs["enabled"]:
            continue
        local = _local_dt(t, int(prefs["timezone_offset_min"]))
        if local.hour < 8:
            continue
        day_iso = local.strftime("%Y-%m-%d")
        if prefs["last_sent_day"] == day_iso:
            continue
        meetings: list[dict[str, Any]] = []
        if fetch_meetings is not None:
            meetings = await fetch_meetings(who.company, who.user_id, day_iso)
        await generate_morning_brief(
            store, who, meetings=meetings, prompts=prompts, llm=llm, now=t
        )
        delivered += 1
    return delivered
