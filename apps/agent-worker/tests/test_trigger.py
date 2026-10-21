import pytest

from sotto_worker.contracts import Speaker, TranscriptEvent
from sotto_worker.pipeline.trigger import classify


def _ev(text: str, speaker: Speaker = "customer", final: bool = True) -> TranscriptEvent:
    return TranscriptEvent(speaker=speaker, text=text, final=final, start_ms=0, end_ms=1000)


@pytest.mark.parametrize(
    "text",
    [
        "What's the payment plan?",
        "how big is the balcony",
        "Can I bring my dog",
        "هل يوجد موقف سيارات؟",
        "كم السعر",
    ],
)
def test_questions(text: str) -> None:
    assert classify(_ev(text)) == "question"


@pytest.mark.parametrize(
    "text",
    [
        "Another company quoted us 20% less.",
        "Why is it so expensive?",
        "I need to think about it.",
        "Just send me the details on WhatsApp",
        "السعر غالي شوي",
    ],
)
def test_objections_win_over_questions(text: str) -> None:
    assert classify(_ev(text)) == "objection"


@pytest.mark.parametrize("text", ["Okay.", "Yes", "Uh huh", "I see.", "Hmm", "تمام"])
def test_fillers_do_not_trigger(text: str) -> None:
    assert classify(_ev(text)) is None


@pytest.mark.parametrize("text", ["Yes, that's right.", "My name is Sara.", "We saw your ad."])
def test_statements_get_a_card_owner_21_oct(text: str) -> None:
    assert classify(_ev(text)) == "statement"


@pytest.mark.parametrize(
    "text", ["Sounds good, how do I sign up?", "When can we start?", "متى نبدأ؟"]
)
def test_buying_signals(text: str) -> None:
    assert classify(_ev(text)) == "signal"


def test_agent_speech_never_triggers_r4() -> None:
    assert classify(_ev("What's the payment plan?", speaker="agent")) is None
    assert classify(_ev("Is it too expensive for you?", speaker="agent")) is None


def test_partials_do_not_trigger() -> None:
    assert classify(_ev("What's the payment", final=False)) is None
