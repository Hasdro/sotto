"""Stub for Agent 4's structured event logger (master §3.4).

// STUB(agent-4): replaced at merge with `from sotto_worker.cloud.obs.log import log_event`.
"""

from __future__ import annotations

from typing import Literal

_events: list[dict[str, object]] = []


def log_event(
    stage: str,
    event: str,
    *,
    call_id: str | None = None,
    level: Literal["info", "warn", "error"] = "info",
    duration_ms: int | None = None,
    **meta: str | int | bool,
) -> None:
    """STUB(agent-4): replaced at merge. Records metadata-only events in memory for tests."""
    _events.append(
        {
            "stage": stage,
            "event": event,
            "call_id": call_id,
            "level": level,
            "duration_ms": duration_ms,
            **meta,
        }
    )


def recent_events() -> list[dict[str, object]]:
    """Tests only: inspect recorded stub events."""
    return list(_events)


def clear_events() -> None:
    """Tests only: reset recorded stub events."""
    _events.clear()
