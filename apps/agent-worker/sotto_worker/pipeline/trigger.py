"""Trigger rules: does this customer turn need a card, and which kind?

Rules first (ARCHITECTURE §4: cheap and instant); an LLM classifier for ambiguous turns can be
added behind the same function later. R4: only final customer turns can trigger.
"""

from __future__ import annotations

import re
from typing import Literal

from sotto_worker.contracts import TranscriptEvent

# statement: anything else the customer says; signal: buying interest (owner, 21 Oct).
TurnKind = Literal["question", "objection", "signal", "statement"]

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


SIGNAL = re.compile(
    r"\b(sounds (good|great)|let'?s (do it|go ahead|proceed)|"
    r"how do (i|we) (sign|pay|buy|order|start)|"
    r"when can (we|i) start|send (me )?the (contract|invoice|agreement|proposal)|where do i sign|"
    r"i'?m interested|we'?re interested|ready to (buy|sign|start|go)|book it|count me in)\b"
    r"|متى نبدأ|كيف أدفع|كيف ادفع|ارسل العقد|أرسل العقد|موافق|نبدأ|مهتم",
    re.IGNORECASE,
)
# Acknowledgements that carry nothing to answer: no card for these.
FILLER = re.compile(
    r"^(ok(ay)?|yes|yeah|yep|no|right|sure|uh+ ?huh|mm+-?hmm+|hmm+|i see|got it|thanks?|thank you"
    r"|تمام|طيب|اي|ايوه|نعم|لا|اوكي|ماشي)$",
    re.IGNORECASE,
)
MIN_STATEMENT_WORDS = 3


def classify(event: TranscriptEvent) -> TurnKind | None:
    if event.speaker != "customer" or not event.final:
        return None
    text = event.text.strip()
    if OBJECTION.search(text):
        return "objection"
    if SIGNAL.search(text):
        return "signal"
    if text.endswith(("?", "؟")) or QUESTION_START.search(text):
        return "question"
    words = re.sub(r"[^\w'\s-]", " ", text).split()
    if len(words) < MIN_STATEMENT_WORDS or FILLER.match(" ".join(words).lower()):
        return None
    return "statement"


def needs_answer(kind: TurnKind) -> bool:
    """Questions and objections must never go unanswered: holding line, then the manager (R2)."""
    return kind in ("question", "objection")
