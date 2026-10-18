"""Trigger rules: does this customer turn need a card, and which kind?

Rules first (ARCHITECTURE §4: cheap and instant); an LLM classifier for ambiguous turns can be
added behind the same function later. R4: only final customer turns can trigger.
"""

from __future__ import annotations

import re
from typing import Literal

from sotto_worker.contracts import TranscriptEvent

TurnKind = Literal["question", "objection"]

OBJECTION = re.compile(
    r"\b(too expensive|expensive|cheaper|quoted|quote|less than|discount|think about it|"
    r"think it over|not interested|no thanks|send me|whatsapp|call me later|not sure|"
    r"another company|other company|competitor|out of (?:my|our) budget|risky|too much)\b"
    r"|غالي|أرخص|ارخص|مو مهتم|مش مهتم|خصم|أفكر|افكر|ارسل|أرسل|واتساب",
    re.IGNORECASE,
)
QUESTION_START = re.compile(
    r"^\s*(what|what's|whats|how|when|where|why|which|who|whose|do|does|did|is|are|can|could|"
    r"will|would|should|shall|have|has|may|any)\b"
    r"|^\s*(هل|كم|متى|كيف|وين|أين|اين|شو|ماذا|ليش|لماذا|ايش|إيش)",
    re.IGNORECASE,
)


def classify(event: TranscriptEvent) -> TurnKind | None:
    if event.speaker != "customer" or not event.final:
        return None
    text = event.text.strip()
    if OBJECTION.search(text):
        return "objection"
    if text.endswith(("?", "؟")) or QUESTION_START.search(text):
        return "question"
    return None
