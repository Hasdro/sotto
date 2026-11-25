"""Cross-agent integration stubs for Round 4 Agent 1 (live-cards).

Each stub matches the exact contract in `00-master.md` §3.4 and is replaced by the merger
after merging `round4/platform` (Agent 4), `round4/wizard-memory` (Agent 2), and
`round4/voice-coach` (Agent 3).
"""

from __future__ import annotations

from typing import Literal


def get_style_memory(company_id: str, user_id: str) -> list[str]:
    """STUB(agent-2): replaced at merge with sotto_worker.cloud.memory.api.get_style_memory.
    Returns <= 12 rules, company rules first."""
    _ = (company_id, user_id)
    return []


def get_game_plan(company_id: str, call_id: str) -> str | None:
    """STUB(agent-3): replaced at merge with sotto_worker.cloud.coach.api.get_game_plan.
    Returns rendered game plan text <= 150 words, or None."""
    _ = (company_id, call_id)
    return None


def log_event(
    stage: str,
    event: str,
    *,
    call_id: str | None = None,
    level: Literal["info", "warn", "error"] = "info",
    duration_ms: int | None = None,
    **meta: str | int | bool,
) -> None:
    """STUB(agent-4): replaced at merge with sotto_worker.cloud.obs.log.log_event.
    Metadata only: never transcript text, names, phones, emails, or keys."""
    _ = (stage, event, call_id, level, duration_ms, meta)
