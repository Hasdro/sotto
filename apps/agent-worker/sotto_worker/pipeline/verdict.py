"""Reads the leading verdict the suggest prompt asks for ("ANSWER: …" or "NO_SAFE_ANSWER") before
anything is streamed to the agent, so a card is never retracted halfway (ARCHITECTURE §5)."""

from __future__ import annotations

from typing import Literal

ANSWER = "ANSWER:"
NO_ANSWER = "NO_SAFE_ANSWER"
Verdict = Literal["pending", "answer", "no_answer"]


class VerdictParser:
    def __init__(self) -> None:
        self.verdict: Verdict = "pending"
        self._buffer = ""
        self._shown = False

    def _show(self, text: str) -> str:
        if not self._shown:
            text = text.lstrip()
            self._shown = bool(text)
        return text

    def feed(self, text: str) -> str:
        """Returns the card text that may be shown now (empty while the verdict is pending)."""
        if self.verdict == "answer":
            return self._show(text)
        if self.verdict == "no_answer":
            return ""
        self._buffer += text
        head = self._buffer.lstrip()
        if head.startswith(NO_ANSWER):
            self.verdict = "no_answer"
            return ""
        if head.startswith(ANSWER):
            self.verdict = "answer"
            return self._show(head[len(ANSWER) :])
        if len(head) >= len(NO_ANSWER) or not (
            ANSWER.startswith(head) or NO_ANSWER.startswith(head)
        ):
            # The model ignored the format: treat its words as the answer (still labelled AI).
            self.verdict = "answer"
            return self._show(head)
        return ""

    def finish(self) -> str:
        """End of stream: anything buffered that is not a verdict prefix becomes the answer."""
        if self.verdict != "pending":
            return ""
        head = self._buffer.strip()
        if not head or ANSWER.startswith(head) or NO_ANSWER.startswith(head):
            self.verdict = "no_answer"
            return ""
        self.verdict = "answer"
        return self._show(head)
