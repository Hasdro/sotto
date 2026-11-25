"""Tests for Round 4 Agent 1: C1/C2 verdict parser, C5 call state, C6 style memory, C7 quality judge."""

from __future__ import annotations

import asyncio
from pathlib import Path

from replay.quality import (
    QUALITY_COHERENCE_MIN,
    QUALITY_PASS_RATE_MIN,
    QualityReport,
    judge_card_stub,
)
from sotto_worker.pipeline.verdict import (
    DEFAULT_BANNED_OPENERS,
    VerdictParser,
    enforce_word_limit,
    sanitize_card,
    strip_banned_opener,
)


def test_strip_banned_opener_english_and_arabic() -> None:
    cleaned, stripped = strip_banned_opener("I hear you, let's check the monthly option today.")
    assert stripped is True
    assert cleaned == "Let's check the monthly option today."

    cleaned2, stripped2 = strip_banned_opener("That's a great question! We cover onboarding in week one.")
    assert stripped2 is True
    assert cleaned2 == "We cover onboarding in week one."

    cleaned_ar, stripped_ar = strip_banned_opener("أفهمك تماماً، نقدر نبدأ بخطة شهرية مرنة.")
    assert stripped_ar is True
    assert cleaned_ar == "نقدر نبدأ بخطة شهرية مرنة."

    clean_ok, stripped_ok = strip_banned_opener("Start with the 14-day pilot and review Friday.")
    assert stripped_ok is False
    assert clean_ok == "Start with the 14-day pilot and review Friday."


def test_enforce_word_limit_cuts_at_last_full_sentence_or_word_18() -> None:
    # 21 words total; first sentence ends at word 9 -> cuts at sentence end.
    text = (
        "We include onboarding and live setup in week one. "
        "Plus we give your team extra coaching calls and a full custom report later."
    )
    out, cut = enforce_word_limit(text, max_words=18)
    assert cut is True
    assert out == "We include onboarding and live setup in week one."
    assert len(out.split()) <= 18

    # 22 words with no sentence boundary -> cuts cleanly at word 18.
    run_on = " ".join(f"word{i}" for i in range(1, 23))
    out2, cut2 = enforce_word_limit(run_on, max_words=18)
    assert cut2 is True
    assert len(out2.split()) == 18

    # Arabic sentence boundary with Arabic question mark `؟`
    ar_text = (
        "هل يناسبك نبدأ بتجربة أسبوعين؟ "
        "كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة"
    )
    out_ar, cut_ar = enforce_word_limit(ar_text, max_words=18)
    assert cut_ar is True
    assert out_ar == "هل يناسبك نبدأ بتجربة أسبوعين؟"


def test_verdict_parser_streams_say_tip_and_captures_why() -> None:
    p = VerdictParser(banned=DEFAULT_BANNED_OPENERS)
    chunks = [
        "SAY: ",
        "I hear you, ",
        "let's start with a ",
        "two-week pilot so ",
        "your team sees value fast.\n",
        "WHY: Lowers risk and keeps momentum toward a close.",
    ]
    out = "".join(p.feed(c) for c in chunks) + p.finish()
    assert p.verdict == "answer"
    assert p.kind == "say"
    assert p.strips == 1
    assert p.why == "Lowers risk and keeps momentum toward a close."
    assert out.startswith("Let's start with a two-week pilot")
    assert "\nWHY: Lowers risk and keeps momentum toward a close." in out


def test_verdict_parser_tip_and_no_safe_answer() -> None:
    p_tip = VerdictParser()
    out = p_tip.feed("TIP: Pause 2 seconds after naming the price.") + p_tip.finish()
    assert p_tip.verdict == "answer"
    assert p_tip.kind == "tip"
    assert out == "Pause 2 seconds after naming the price."

    p_no = VerdictParser()
    out_no = p_no.feed("NO_SAFE_ANSWER") + p_no.finish()
    assert p_no.verdict == "no_answer"
    assert out_no == ""


def test_sanitize_card_counts_cuts_and_strips() -> None:
    raw = (
        "Great question! We can book a quick Friday demo so you see it live. "
        "And we also add five extra onboarding sessions for free next month.\n"
        "WHY: Keeps the buyer focused on a concrete next step instead of debating features endlessly."
    )
    main, why, cuts, strips = sanitize_card(raw)
    assert strips == 1
    assert cuts == 2  # main cut + why cut
    assert len(main.split()) <= 18
    assert why is not None and len(why.split()) <= 12


def test_suggest_v5_prompt_includes_style_memory_game_plan_and_state() -> None:
    prompt_text = (Path(__file__).resolve().parents[4] / "seed" / "prompts" / "suggest.md").read_text(
        encoding="utf-8"
    )
    for var in (
        "{{agent.style_memory}}",
        "{{call.game_plan}}",
        "{{call.state}}",
        "{{agent.tone}}",
        "{{tone.banned}}",
    ):
        assert var in prompt_text, f"missing {var} in suggest.md v5"
    assert "Playbook answer" in prompt_text
    assert "SAY:" in prompt_text and "TIP:" in prompt_text and "WHY:" in prompt_text


def test_quality_judge_thresholds() -> None:
    good = judge_card_stub(
        card_id="c1",
        card_text="Let's lock in a 15-minute demo Thursday so your team tests the pricing.\nWHY: Anchors next step.",
        turn_text="Can we see how pricing works for our team?",
        history=["customer: Can we see how pricing works for our team?"],
    )
    assert good.passed_hard_checks is True
    assert good.coherence >= QUALITY_COHERENCE_MIN

    bad = judge_card_stub(
        card_id="c2",
        card_text="I hear you, " + " ".join(["extra"] * 20),
        turn_text="Too expensive",
        history=["customer: Too expensive"],
    )
    assert bad.passed_hard_checks is False
    assert bad.banned_hit is True
    assert bad.length_ok is False

    rep_ok = QualityReport(scores=[good])
    assert rep_ok.pass_rate >= QUALITY_PASS_RATE_MIN
    assert rep_ok.passed is True

    rep_fail = QualityReport(scores=[good, bad])
    assert rep_fail.passed is False


def test_call_state_background_update_does_not_block() -> None:
    """Proves CallStateUpdater runs asynchronously and never blocks the caller (0 ms)."""
    from sotto_worker.pipeline.call_state import CallStateUpdater

    class _SlowRouter:
        async def stream(self, *_args: object, **_kwargs: object):
            await asyncio.sleep(0.05)

            class _Chunk:
                text = "Customer wants annual pricing. Stage: discovery."

            yield _Chunk()

    class _Prompts:
        def render(self, *_args: object, **_kwargs: object):
            class _R:
                text = "sys---turn---usr"

            return _R()

    async def _run() -> None:
        seen: list[str] = []

        async def on_update(s: str) -> None:
            seen.append(s)

        updater = CallStateUpdater(
            call_id="call-1",
            company_id="co-1",
            router=_SlowRouter(),
            routing=None,
            prompts=_Prompts(),
            on_update=on_update,
        )
        # schedule_update returns immediately before the slow router finishes (0 ms on card path)
        updater.schedule_update("Customer: What is the annual price?")
        assert updater.current == ""
        await updater.drain()
        assert "annual pricing" in updater.current
        assert seen == [updater.current]
        await updater.close()

    asyncio.run(_run())
