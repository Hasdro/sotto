"""The spoken-call smoke test's matching and verdict (replay/spoken_live.py, D-020)."""

from __future__ import annotations

from typing import Any

from replay.spoken_live import PHRASES, Turn, match, ok, summarise


def card(source: str) -> dict[str, Any]:
    return {"type": "card", "card": {"seq": 0, "source": source}}


def test_each_sentence_is_matched_to_its_transcript_and_first_card() -> None:
    ends = [10.0 * (i + 1) for i in range(len(PHRASES))]
    events: list[tuple[float, dict[str, Any]]] = []
    for end in ends:
        events.append((end + 0.48, {"type": "transcript", "text": "heard"}))
        events.append((end + 0.5, card("playbook")))
    turns = match(events, ends)
    assert [t.transcript_ms for t in turns] == [480] * len(PHRASES)
    assert [t.card_ms for t in turns] == [500] * len(PHRASES)
    assert ok(turns)
    assert "worst 500 ms" in summarise(turns)


def test_a_missing_or_late_card_fails() -> None:
    assert not ok([Turn("q", "q", 400, None, None)])
    assert not ok([Turn("q", "q", 400, 1600, "ai")])
    assert "(nothing)" in summarise([Turn("q", None, None, None, None)])
