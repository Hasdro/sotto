"""Tests for CardToneStore: platform < company < agent precedence and multi-tenant isolation (C3)."""

from __future__ import annotations

import sqlite3

from sotto_worker.cloud.cards.store import (
    DEFAULT_BANNED_AR,
    DEFAULT_BANNED_EN,
    HOW_WE_TALK_MAX,
    CardToneStore,
)


def _store() -> CardToneStore:
    conn = sqlite3.connect(":memory:")
    return CardToneStore(conn)


def test_tone_precedence_platform_company_agent() -> None:
    s = _store()
    # 1. Platform default: casual + starter banned phrases
    eff0 = s.resolve("co-a", "user-1")
    assert eff0.tone == "casual"
    assert eff0.source == "platform"
    assert "I hear you" in eff0.banned_en
    assert DEFAULT_BANNED_AR[0] in eff0.banned_ar

    # 2. Company overrides platform default
    s.set_company_settings(
        "co-a",
        default_tone="direct",
        allowed_presets=["direct", "warm"],
        how_we_talk="Short, confident, numbers-first.",
        banned_en=["Actually"],
        banned_ar=["بصراحة"],
    )
    eff1 = s.resolve("co-a", "user-1")
    assert eff1.tone == "direct"
    assert eff1.source == "company"
    assert eff1.how_we_talk == "Short, confident, numbers-first."
    assert "Actually" in eff1.banned_en and DEFAULT_BANNED_EN[0] in eff1.banned_en
    assert "بصراحة" in eff1.banned_ar

    # 3. Agent overrides company within allowed presets
    s.set_agent_tone("co-a", "user-1", "warm")
    eff2 = s.resolve("co-a", "user-1")
    assert eff2.tone == "warm"
    assert eff2.source == "agent"

    # 4. Agent cannot pick a preset disallowed by company
    try:
        s.set_agent_tone("co-a", "user-1", "formal")
        raise AssertionError("expected PermissionError for disallowed preset")
    except PermissionError:
        pass

    # 5. If company later removes agent's preset, resolve falls back to company default
    s.set_company_settings("co-a", default_tone="direct", allowed_presets=["direct"])
    eff3 = s.resolve("co-a", "user-1")
    assert eff3.tone == "direct"
    assert eff3.source == "company"


def test_how_we_talk_length_limit() -> None:
    s = _store()
    try:
        s.set_company_settings("co-a", how_we_talk="x" * (HOW_WE_TALK_MAX + 1))
        raise AssertionError("expected ValueError for how_we_talk > 200 chars")
    except ValueError:
        pass


def test_company_isolation_a_cannot_see_or_affect_b() -> None:
    s = _store()
    s.set_company_settings(
        "co-a",
        default_tone="formal",
        allowed_presets=["formal"],
        how_we_talk="Executive boardroom style",
        banned_en=["yo"],
    )
    s.set_agent_tone("co-a", "shared-user-id", "formal")

    # Company B stays completely unaffected by Company A's settings and agent pick
    eff_b = s.resolve("co-b", "shared-user-id")
    assert eff_b.tone == "casual"
    assert eff_b.source == "platform"
    assert eff_b.how_we_talk == ""
    assert "yo" not in eff_b.banned_en

    # Platform banned update applies to both companies without leaking company-specific phrases
    s.set_platform_banned(en=["I hear you", "Trust me"], ar=["أفهمك تماماً"])
    assert "Trust me" in s.resolve("co-a").banned_en
    assert "Trust me" in s.resolve("co-b").banned_en
    assert "yo" in s.resolve("co-a").banned_en
    assert "yo" not in s.resolve("co-b").banned_en
