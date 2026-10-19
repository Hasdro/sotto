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
