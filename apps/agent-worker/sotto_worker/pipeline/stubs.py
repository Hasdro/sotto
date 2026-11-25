"""Cross-agent integration stubs for Round 4 Agent 1 (live-cards).

`get_game_plan` stays stubbed until `round4/voice-coach` (Agent 3) merges into `main`.
`get_style_memory` and `log_event` now use the real Agent 2 / Agent 4 implementations.
"""

from __future__ import annotations


def get_game_plan(company_id: str, call_id: str) -> str | None:
    """STUB(agent-3): replaced at merge with sotto_worker.cloud.coach.api.get_game_plan.

    Returns rendered game plan text <= 150 words, or None.
    """
    _ = (company_id, call_id)
    return None
