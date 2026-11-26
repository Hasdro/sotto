"""Public cross-agent contract for Agent 3 (00-master.md §3.4).

Agent 1's live suggestion prompt calls `get_game_plan(company_id, call_id)` to populate
`{{call.game_plan}}`. The returned text is pre-rendered and strictly <= 150 words so it adds
zero live-path latency (R1).
"""

from __future__ import annotations

from typing import Any

from sotto_worker.cloud.coach.store import CoachStore

MAX_GAME_PLAN_WORDS = 150
_DEFAULT_STORE: CoachStore | None = None


def register_coach_store(store: CoachStore | None) -> None:
    """Register the process's CoachStore for 2-argument `get_game_plan(company_id, call_id)`."""
    global _DEFAULT_STORE
    _DEFAULT_STORE = store


def render_game_plan(
    *,
    goals: list[str],
    objections: list[dict[str, str]],
    questions: list[str],
    avoid: list[str],
) -> str:
    """Render structured game-plan fields into a compact text block <= 150 words."""
    parts: list[str] = []
    clean_goals = [g.strip() for g in goals if g and g.strip()][:3]
    if clean_goals:
        parts.append("Goals: " + "; ".join(clean_goals) + ".")
    clean_obj = [
        f"{str(o.get('objection', '')).strip()} -> {str(o.get('answer', '')).strip()}"
        for o in objections
        if isinstance(o, dict) and str(o.get("objection", "")).strip()
    ][:3]
    if clean_obj:
        parts.append("Objections: " + "; ".join(clean_obj) + ".")
    clean_q = [q.strip() for q in questions if q and q.strip()][:3]
    if clean_q:
        parts.append("Questions: " + "; ".join(clean_q) + ".")
    clean_avoid = [a.strip() for a in avoid if a and a.strip()][:3]
    if clean_avoid:
        parts.append("Avoid: " + "; ".join(clean_avoid) + ".")
    text = " ".join(parts).strip()
    words = text.split()
    if len(words) > MAX_GAME_PLAN_WORDS:
        text = " ".join(words[:MAX_GAME_PLAN_WORDS])
    return text


def get_game_plan(company_id: str, call_id: str) -> str | None:
    """Return the rendered game plan (<= 150 words) for `(company_id, call_id)`, or None."""
    if _DEFAULT_STORE is None:
        return None
    if not _DEFAULT_STORE.s.org_feature_on(company_id, "prep_coach"):
        return None
    row: dict[str, Any] | None = _DEFAULT_STORE.get_game_plan_raw(company_id, call_id)
    if not row:
        return None
    rendered = str(row.get("rendered_text") or "").strip()
    if not rendered:
        return None
    words = rendered.split()
    return " ".join(words[:MAX_GAME_PLAN_WORDS]) if len(words) > MAX_GAME_PLAN_WORDS else rendered
