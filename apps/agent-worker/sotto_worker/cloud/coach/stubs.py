"""Cross-agent stubs with exact signatures from 00-master.md §3.4.

Each stub is replaced at merge time (merge order: 4 -> 2 -> 1 -> 3).
"""

from __future__ import annotations

import secrets
from typing import Any, Literal

# In-memory capture for offline tests verifying contract calls.
STUB_FEEDBACK_LOG: list[dict[str, Any]] = []
STUB_OBS_LOG: list[dict[str, Any]] = []


# STUB(agent-2): replaced at merge
def add_feedback(
    company_id: str,
    user_id: str,
    call_id: str | None,
    source: Literal["card", "call_note", "coach_review"],
    rating: Literal["up", "down"] | None,
    reasons: list[str],
    note: str | None,
    card_id: str | None = None,
) -> str:
    """Stub for Agent 2's `sotto_worker.cloud.memory.api.add_feedback`."""
    fid = f"fb_{secrets.token_hex(6)}"
    STUB_FEEDBACK_LOG.append(
        {
            "id": fid,
            "company_id": company_id,
            "user_id": user_id,
            "call_id": call_id,
            "source": source,
            "rating": rating,
            "reasons": list(reasons),
            "note": note,
            "card_id": card_id,
        }
    )
    return fid


# STUB(agent-4): replaced at merge
def log_event(
    stage: str,
    event: str,
    *,
    call_id: str | None = None,
    level: Literal["info", "warn", "error"] = "info",
    duration_ms: int | None = None,
    **meta: str | int | bool,
) -> None:
    """Stub for Agent 4's `sotto_worker.cloud.obs.log.log_event`.

    meta is metadata only: never transcript text, names, phones, emails, keys.
    """
    STUB_OBS_LOG.append(
        {
            "stage": stage,
            "event": event,
            "call_id": call_id,
            "level": level,
            "duration_ms": duration_ms,
            "meta": dict(meta),
        }
    )
