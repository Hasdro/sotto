"""Company profile defaults (BRIEF; D-018: English-only cards by default)."""

from __future__ import annotations

from pathlib import Path

from sotto_worker.company import CompanyProfile


def _profile(tmp_path: Path, extra: str = "") -> CompanyProfile:
    path = tmp_path / "company.yaml"
    path.write_text(
        "company_id: c1\nname: Acme\ntone: brief\ncall_goal: close the sale\n"
        "holding_line: {en: Let me confirm.}\nescalation_label: {en: Not in playbook}\n" + extra,
        encoding="utf-8",
    )
    return CompanyProfile.load(path)


def test_cards_default_to_english_even_for_arabic_speech(tmp_path: Path) -> None:
    profile = _profile(tmp_path)
    assert profile.card_language == "en"
    assert profile.language_for("كم السعر؟") == "en"


def test_company_can_still_follow_the_customer_language(tmp_path: Path) -> None:
    profile = _profile(tmp_path, "card_language: auto\n")
    assert profile.language_for("كم السعر؟") == "ar"
    assert profile.language_for("What is the price?") == "en"


def test_admin_settings_switch_ai_answers_and_backups() -> None:
    from sotto_worker.runtime import DEMO, apply_settings

    base = CompanyProfile.load(DEMO / "company.yaml")
    off = apply_settings(base, {"ai_answers_allowed": False, "backup_allowed": False})
    assert off.ai_answers_allowed is False
    assert {"suggest_backup", "stt_backup"} <= set(off.backup_disabled)
    back = apply_settings(off, {"backup_allowed": True, "card_language": "en"})
    assert not {"suggest_backup", "stt_backup"} & set(back.backup_disabled)
    assert back.card_language == "en"
    assert apply_settings(base, {}) is base


def test_agent_track_context_is_a_platform_default_not_a_company_setting() -> None:
    """D-062 (DD-5): AGN sets it; behaviour unchanged; the agent track never triggers (R4)."""
    from sotto_worker.company import COMPANY_SETTINGS, PLATFORM_DEFAULTS
    from sotto_worker.runtime import DEMO

    assert "agent_context" not in COMPANY_SETTINGS
    assert PLATFORM_DEFAULTS["agent_context"] is True
    assert CompanyProfile.load(DEMO / "company.yaml").agent_context is True
