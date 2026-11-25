"""Tests for cloud/obs/log.py — contract (§3.4) and redaction guarantees (L3, L5, S2)."""

from __future__ import annotations

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


def test_log_event_records_metadata_and_calls_sink() -> None:
    clear_events()
    seen: list[ObsEvent] = []
    unsub = register_sink(seen.append)
    try:
        log_event(
            "router.suggest",
            "fallback",
            call_id="call-42",
            level="warn",
            duration_ms=712,
            provider="openai",
            status_code=503,
            used_backup=True,
        )
    finally:
        unsub()

    assert len(seen) == 1
    ev = seen[0]
    assert ev.stage == "router.suggest"
    assert ev.event == "fallback"
    assert ev.call_id == "call-42"
    assert ev.level == "warn"
    assert ev.duration_ms == 712
    assert ev.meta == {"provider": "openai", "status_code": 503, "used_backup": True}
    assert len(events_for_call("call-42")) == 1
    assert len(recent_events(10)) == 1


def test_redaction_strips_transcript_pii_and_keys() -> None:
    clear_events()
    log_event(
        "stt.turn",
        "received",
        call_id="call-99",
        level="info",
        transcript="Customer said my budget is 50k",
        customer_name="Jane Doe",
        phone="+1-555-234-5678",
        email="jane@acme.example",
        api_key="sk-secret1234567890abcdef",
        token="ghp_abcdefghijklmnopqrstuv",
        safe_count=4,
        detail="Contact jane@acme.example or +1 555 234 5678 with key sk-abcdef1234567890",
    )
    ev = recent_events(1)[0]
    # Sensitive keys are completely dropped
    for forbidden in ("transcript", "customer_name", "phone", "email", "api_key", "token"):
        assert forbidden not in ev.meta
    assert ev.meta["safe_count"] == 4
    detail = str(ev.meta["detail"])
    assert "jane@acme.example" not in detail
    assert "555 234 5678" not in detail
    assert "sk-abcdef1234567890" not in detail
    assert "[REDACTED_EMAIL]" in detail
    assert "[REDACTED_PHONE]" in detail
    assert "[REDACTED_KEY]" in detail


def test_redact_text_and_meta_handle_tokens_and_long_strings() -> None:
    s = redact_text("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload")
    assert "eyJhbGci" not in s
    assert "[REDACTED_KEY]" in s

    long_val = "x" * 400
    assert len(redact_text(long_val)) <= 257

    cleaned = redact_meta({"ok": True, "tokens_out": 42, "auth_header": "secret"})
    assert cleaned == {"ok": True, "tokens_out": 42}


def test_failing_sink_does_not_break_log_event() -> None:
    clear_events()

    def boom(_ev: ObsEvent) -> None:
        raise RuntimeError("sink failed")

    unsub = register_sink(boom)
    try:
        log_event("ui.test", "error_case", level="error", code=500)
    finally:
        unsub()
    assert len(recent_events(5)) == 1
    assert recent_events(0) == []
