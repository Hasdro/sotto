import pytest

from sotto_worker.playbook import PlaybookIndex, parse_playbook
from tests.conftest import REPO_ROOT

DEMO = REPO_ROOT / "seed" / "demo" / "playbook"


@pytest.fixture(scope="module")
def index() -> PlaybookIndex:
    return PlaybookIndex.from_directory(DEMO)


def test_parses_the_readme_entry_format() -> None:
    entries = parse_playbook(
        "## Q: Do you include furniture?\n"
        "- Short answer (≤ 25 words, what the agent can say): Yes, fully furnished.\n"
        "- Details (for the agent's eyes): Kitchen and wardrobes.\n"
        "- Follow-up question to ask: Which room matters most?\n"
        "- Tags: furniture, package\n",
        source="faq.md",
    )
    assert len(entries) == 1
    e = entries[0]
    assert (e.id, e.question, e.short_answer) == (
        "faq.md#do-you-include-furniture",
        "Do you include furniture?",
        "Yes, fully furnished.",
    )
    assert e.follow_up == "Which room matters most?"
    assert e.tags == ("furniture", "package")
    assert e.kind == "faq"


def test_every_demo_short_answer_fits_on_a_card(index: PlaybookIndex) -> None:
    assert len(index.entries) >= 16
    for entry in index.entries:
        assert len(entry.short_answer.split()) <= 25, entry.id


@pytest.mark.parametrize(
    ("utterance", "expected"),
    [
        ("What's the payment plan like?", "faq.md#what-is-the-payment-plan"),
        ("when will it be ready for handover", "faq.md#when-is-handover"),
        ("How much is a two bedroom?", "faq.md#how-much-is-a-two-bedroom-apartment"),
        ("Another company quoted us 20% less.", "objections.md#another-company-quoted-us-less"),
        ("Honestly it's too expensive for us.", "objections.md#its-too-expensive"),
        (
            "Just send me the details on WhatsApp",
            "objections.md#just-send-me-the-details-on-whatsapp",
        ),
    ],
)
def test_finds_the_right_entry(index: PlaybookIndex, utterance: str, expected: str) -> None:
    hit = index.lookup(utterance)
    assert hit is not None, utterance
    assert hit.entry.id == expected


@pytest.mark.parametrize(
    "utterance", ["Do you allow pets in the building?", "Is there a school nearby?"]
)
def test_returns_nothing_without_a_confident_match(index: PlaybookIndex, utterance: str) -> None:
    assert index.lookup(utterance) is None


def test_ranks_the_nearest_entries_best_first(index: PlaybookIndex) -> None:
    top = index.ranked("Is there covered parking for two cars?", 3)
    assert len(top) == 3
    assert [h.score for h in top] == sorted((h.score for h in top), reverse=True)
    best = index.nearest("Is there covered parking for two cars?")
    assert best is not None
    assert top[0].entry.id == best.entry.id
    assert index.lookup("Is there covered parking for two cars?") is not None


def test_match_text_gives_the_model_the_near_entries_within_600_characters(
    index: PlaybookIndex,
) -> None:
    """Same as the engine's matchText (T-032): best first, capped so the prompt stays small."""
    from sotto_worker.playbook.index import match_text

    top = index.ranked("How do the payments work for the flat?", 3)
    text = match_text(top)
    assert len(text) <= 600
    assert text.startswith(top[0].entry.question)
