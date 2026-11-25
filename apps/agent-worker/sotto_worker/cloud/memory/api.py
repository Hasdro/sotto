"""Public Python contract for Agent 2 Style Memory (master §3.4).

Other agents (Agent 1 live prompt, Agent 3 voice coach review) import these exact functions:
  from sotto_worker.cloud.memory.api import add_feedback, get_style_memory
"""

from __future__ import annotations

from typing import Literal

from sotto_worker.cloud.memory.store import MemoryStore

_default_store: MemoryStore | None = None


def configure(store: MemoryStore | None) -> None:
    """Register the process-wide MemoryStore (called by cloud/app.py at startup and by tests)."""
    global _default_store
    _default_store = store


def _require_store() -> MemoryStore:
    if _default_store is None:
        raise RuntimeError("sotto_worker.cloud.memory.api is not configured with a MemoryStore")
    return _default_store


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
    """Store PII-stripped feedback from card ratings, whole-call notes, or voice coach review."""
    return _require_store().add_feedback(
        company_id=company_id,
        user_id=user_id,
        call_id=call_id,
        source=source,
        rating=rating,
        reasons=reasons,
        note=note,
        card_id=card_id,
    )


def get_style_memory(company_id: str, user_id: str) -> list[str]:
    """Return <= 12 active style rules for the live prompt (company rules first, then agent)."""
    return _require_store().get_style_memory(company_id, user_id)
