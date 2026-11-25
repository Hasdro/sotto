"""Structured metadata-only event logging with strict PII and secret redaction (S2, L3, L5).

Contract (§3.4):
    def log_event(stage: str, event: str, *, call_id: str | None = None,
                  level: Literal["info", "warn", "error"] = "info",
                  duration_ms: int | None = None, **meta: str | int | bool) -> None
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
import time
from collections import deque
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Literal

logger = logging.getLogger("sotto.obs")

Level = Literal["info", "warn", "error"]
MetaValue = str | int | bool

# Keys that must never be logged (transcripts, customer PII, credentials, raw model text).
_BLOCKED_KEYS: frozenset[str] = frozenset(
    {
        "transcript",
        "transcript_text",
        "customer_text",
        "agent_text",
        "utterance",
        "speech",
        "prompt",
        "prompt_text",
        "response_text",
        "completion",
        "reply_text",
        "card_text",
        "body",
        "content",
        "message_text",
        "name",
        "customer_name",
        "full_name",
        "first_name",
        "last_name",
        "contact_name",
        "phone",
        "phone_number",
        "mobile",
        "tel",
        "email",
        "email_address",
        "customer_email",
        "api_key",
        "apikey",
        "key",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "password",
        "passwd",
        "authorization",
        "cookie",
        "set_cookie",
        "bearer",
        "private_key",
        "audio",
        "pcm",
    }
)

_BLOCKED_SUBSTRINGS: tuple[str, ...] = (
    "transcript",
    "secret",
    "access_token",
    "refresh_token",
    "auth_token",
    "password",
    "api_key",
    "apikey",
    "auth_header",
    "cookie",
    "customer_name",
    "phone",
    "email",
)

# Value-level patterns redacted even when passed under an innocuous key.
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")
_KEY_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{16,}|"
    r"gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{20,}|"
    r"xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b",
    re.IGNORECASE,
)

_MAX_STRING_LEN = 256
_MAX_BUFFER = 500


@dataclass(frozen=True)
class ObsEvent:
    ts_ms: int
    stage: str
    event: str
    level: Level
    call_id: str | None
    duration_ms: int | None
    meta: dict[str, MetaValue]


_buffer: deque[ObsEvent] = deque(maxlen=_MAX_BUFFER)
_sinks: list[Callable[[ObsEvent], None]] = []


def _is_blocked_key(key: str) -> bool:
    low = key.lower().strip()
    if low in _BLOCKED_KEYS:
        return True
    return any(sub in low for sub in _BLOCKED_SUBSTRINGS)


def redact_text(value: str) -> str:
    """Scrub emails, phone numbers, and API keys/tokens from a metadata string."""
    cleaned = _KEY_RE.sub("[REDACTED_KEY]", value)
    cleaned = _EMAIL_RE.sub("[REDACTED_EMAIL]", cleaned)
    cleaned = _PHONE_RE.sub("[REDACTED_PHONE]", cleaned)
    if len(cleaned) > _MAX_STRING_LEN:
        cleaned = cleaned[:_MAX_STRING_LEN] + "…"
    return cleaned


def redact_meta(meta: dict[str, MetaValue]) -> dict[str, MetaValue]:
    """Return a metadata-only copy with sensitive keys dropped and string values scrubbed."""
    out: dict[str, MetaValue] = {}
    for k, v in meta.items():
        if _is_blocked_key(k):
            continue
        if isinstance(v, bool | int):
            out[k] = v
        elif isinstance(v, str):
            out[k] = redact_text(v)
    return out


def register_sink(sink: Callable[[ObsEvent], None]) -> Callable[[], None]:
    """Attach a listener invoked on every logged event; returns an unsubscribe callback."""
    _sinks.append(sink)

    def _remove() -> None:
        if sink in _sinks:
            _sinks.remove(sink)

    return _remove


def recent_events(limit: int = 100) -> list[ObsEvent]:
    """Return up to `limit` most recent buffered events."""
    if limit <= 0:
        return []
    return list(_buffer)[-limit:]


def events_for_call(call_id: str) -> list[ObsEvent]:
    """Return all buffered events matching `call_id`."""
    return [ev for ev in _buffer if ev.call_id == call_id]


def clear_events() -> None:
    """Clear the in-memory event buffer (used in tests)."""
    _buffer.clear()


def log_event(
    stage: str,
    event: str,
    *,
    call_id: str | None = None,
    level: Level = "info",
    duration_ms: int | None = None,
    **meta: MetaValue,
) -> None:
    """Emit a structured, metadata-only observability event."""
    safe_meta = redact_meta(meta)
    entry = ObsEvent(
        ts_ms=int(time.time() * 1000),
        stage=redact_text(stage),
        event=redact_text(event),
        level=level,
        call_id=redact_text(call_id) if call_id is not None else None,
        duration_ms=duration_ms,
        meta=safe_meta,
    )
    _buffer.append(entry)
    payload = json.dumps(asdict(entry), separators=(",", ":"), sort_keys=True)
    if level == "error":
        logger.error(payload)
    elif level == "warn":
        logger.warning(payload)
    else:
        logger.info(payload)
    for sink in list(_sinks):
        with contextlib.suppress(Exception):
            sink(entry)
