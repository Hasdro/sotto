import pytest

from sotto_worker.pipeline.verdict import VerdictParser


def feed_all(chunks: list[str]) -> tuple[str, str]:
    parser = VerdictParser()
    shown = "".join(parser.feed(c) for c in chunks) + parser.finish()
    return parser.verdict, shown


@pytest.mark.parametrize(
    ("chunks", "verdict", "shown"),
    [
        (["ANSWER:", " Ten", " percent."], "answer", "Ten percent."),
        (["ANS", "WER: Yes", " it is."], "answer", "Yes it is."),
        (["  ANSWER:Yes"], "answer", "Yes"),
        (["NO_SAFE", "_ANSWER"], "no_answer", ""),
        (["NO_SAFE_ANSWER", " because"], "no_answer", ""),
        (["Sure, ", "ten percent."], "answer", "Sure, ten percent."),
        (["AN"], "no_answer", ""),
        ([], "no_answer", ""),
        (["Yes"], "answer", "Yes"),
    ],
)
def test_verdicts(chunks: list[str], verdict: str, shown: str) -> None:
    assert feed_all(chunks) == (verdict, shown)


def test_nothing_is_shown_while_the_verdict_is_pending() -> None:
    parser = VerdictParser()
    assert parser.feed("NO_") == ""
    assert parser.verdict == "pending"
