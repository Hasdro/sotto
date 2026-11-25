"""Platform observability, redaction, local safety logs, and GitHub call logging (L3-L5, S2)."""

from sotto_worker.cloud.obs.log import (
    ObsEvent,
    clear_events,
    events_for_call,
    log_event,
    recent_events,
    redact_meta,
    redact_text,
    register_sink,
)

__all__ = [
    "ObsEvent",
    "clear_events",
    "events_for_call",
    "log_event",
    "recent_events",
    "redact_meta",
    "redact_text",
    "register_sink",
]
