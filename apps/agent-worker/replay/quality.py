"""Card quality judge pass for replay (C7, CONSTRAINTS.md).

Evaluates every AI-generated card on:
- word_count <= 18 (excluding optional WHY: line)
- banned_hit == False (EN + AR banned openers)
- formal == False (stub heuristic offline; LLM judge in live mode)
- coherence (1-5) against earlier conversation turns

Thresholds (CONSTRAINTS.md):
- >= 95% of AI cards pass length + banned-phrase checks
- mean coherence >= 4.0 / 5.0
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from sotto_worker.pipeline.verdict import (
    DEFAULT_BANNED_OPENERS,
    MAX_CARD_WORDS,
    split_why,
)

QUALITY_PASS_RATE_MIN = 0.95
QUALITY_COHERENCE_MIN = 4.0

_FORMAL_MARKERS = (
    "pursuant to",
    "kindly be advised",
    "please be informed",
    "we regret to inform",
    "as per our policy",
    "dear valued",
    "furthermore,",
    "therefore, we recommend",
)


@dataclass(frozen=True)
class CardQualityScore:
    card_id: str
    word_count: int
    length_ok: bool
    banned_hit: bool
    formal: bool
    coherence: float
    reason: str = ""

    @property
    def passed_hard_checks(self) -> bool:
        return self.length_ok and not self.banned_hit


@dataclass
class QualityReport:
    scores: list[CardQualityScore] = field(default_factory=list)
    mode: str = "stub"

    @property
    def total(self) -> int:
        return len(self.scores)

    @property
    def pass_rate(self) -> float:
        if not self.scores:
            return 1.0
        return sum(1 for s in self.scores if s.passed_hard_checks) / len(self.scores)

    @property
    def mean_coherence(self) -> float:
        if not self.scores:
            return 5.0
        return sum(s.coherence for s in self.scores) / len(self.scores)

    @property
    def passed(self) -> bool:
        return (
            self.pass_rate >= QUALITY_PASS_RATE_MIN and self.mean_coherence >= QUALITY_COHERENCE_MIN
        )


def _contains_banned(text: str, banned: Iterable[str]) -> bool:
    low = text.casefold()
    for phrase in banned:
        p = phrase.strip().casefold()
        if p and p in low:
            return True
    return False


def _stub_coherence(card_main: str, history: Sequence[str], turn_text: str) -> float:
    """Deterministic offline coherence scorer (1-5).
    Live judge (`quality_judge` stage + `seed/prompts/quality_judge.md`) runs with real keys."""
    if not card_main.strip():
        return 1.0
    words = [w for w in card_main.split() if w]
    score = 4.5
    if len(words) > MAX_CARD_WORDS:
        score -= 1.0
    if any(m in card_main.casefold() for m in _FORMAL_MARKERS):
        score -= 0.75
    # Reward contextual overlap with the customer turn or recent history
    context_tokens = {
        tok
        for line in (*history[-6:], turn_text)
        for tok in re.findall(r"[a-zA-Z\u0600-\u06FF]{4,}", line.casefold())
    }
    card_tokens = set(re.findall(r"[a-zA-Z\u0600-\u06FF]{4,}", card_main.casefold()))
    if context_tokens and (context_tokens & card_tokens):
        score = min(5.0, score + 0.3)
    return round(max(1.0, min(5.0, score)), 2)


def judge_card_stub(
    *,
    card_id: str,
    card_text: str,
    turn_text: str,
    history: Sequence[str] = (),
    banned: Iterable[str] = DEFAULT_BANNED_OPENERS,
) -> CardQualityScore:
    """Evaluate one card offline using deterministic hard checks + stub coherence/formality."""
    main, _why = split_why(card_text)
    wc = len([w for w in main.split() if w])
    length_ok = wc <= MAX_CARD_WORDS
    banned_hit = _contains_banned(main, banned)
    formal = any(m in main.casefold() for m in _FORMAL_MARKERS)
    coherence = _stub_coherence(main, history, turn_text)
    reasons: list[str] = []
    if not length_ok:
        reasons.append(f"{wc} words > {MAX_CARD_WORDS}")
    if banned_hit:
        reasons.append("banned phrase")
    if formal:
        reasons.append("formal phrasing")
    return CardQualityScore(
        card_id=card_id,
        word_count=wc,
        length_ok=length_ok,
        banned_hit=banned_hit,
        formal=formal,
        coherence=coherence,
        reason=", ".join(reasons) or "ok",
    )


def format_quality_report(report: QualityReport) -> str:
    status = "PASS" if report.passed else "FAIL"
    return (
        f"Quality judge ({report.mode}): {report.total} cards · "
        f"length+banned pass {report.pass_rate * 100:.1f}% "
        f"(min {QUALITY_PASS_RATE_MIN * 100:.0f}%) · "
        f"coherence {report.mean_coherence:.2f}/5 (min {QUALITY_COHERENCE_MIN:.1f}) · {status}"
    )
