"""Reads the leading verdict the suggest prompt asks for ("SAY: …", "TIP: …", "ANSWER: …", or
"NO_SAFE_ANSWER") with optional "WHY: …" insight, and enforces the hard C2 checks in code:
- strip banned openers (English + Arabic + custom company/platform list);
- cut main card text to <= 18 words at the last full sentence boundary (else word 18);
- cap optional WHY insight to <= 12 words;
- count and log every cut/strip without ever re-asking the model (D-094, C1, C2).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Literal

from sotto_worker.cloud.obs.log import log_event

SAY = "SAY:"
TIP = "TIP:"
ANSWER = "ANSWER:"
WHY_MARKER = "WHY:"
NO_ANSWER = "NO_SAFE_ANSWER"

MAX_CARD_WORDS = 18
MAX_WHY_WORDS = 12
MAX_BUFFER_CHARS = 4096

PREFIXES = (SAY, TIP, ANSWER)

# Starter banned openers (C3, D-094); full defaults also live in seed/cards/tone_defaults.yaml.
DEFAULT_BANNED_OPENERS: tuple[str, ...] = (
    "I hear you",
    "I understand your concern",
    "Great question",
    "That's a great question",
    "I completely understand",
    "أفهمك تماماً",
    "أتفهم قلقك",
    "سؤال رائع",
    "هذا سؤال رائع",
    "أفهم قلقك",
)

Verdict = Literal["pending", "answer", "no_answer"]
CardKind = Literal["say", "tip", "answer"]

_SENTENCE_END = re.compile(r"[.!?؟](?:[\"'”\u2019\)]*)$")
_LEADING_SEP = re.compile(r"^[\s,.:;!\-—\u2013،؛\"'“”\u2018\u2019•]+")
_WHY_SPLIT_RE = re.compile(r"(?:^|\n)\s*WHY:\s*", flags=re.IGNORECASE)
_WHY_TAIL_RE = re.compile(r"\n[^\S\n]*(?:W(?:H(?:Y:?)?)?)?$", flags=re.IGNORECASE)


def _words(text: str) -> list[str]:
    return [w for w in text.strip().split() if w]


def strip_banned_opener(
    text: str, banned: Iterable[str] = DEFAULT_BANNED_OPENERS
) -> tuple[str, bool]:
    """Strip any matching banned opener from the start of `text` (case-insensitive).

    Returns `(cleaned_text, was_stripped)`. Loops in case multiple openers stack.
    """
    cleaned = _LEADING_SEP.sub("", text.lstrip()) if text else ""
    original = text.lstrip()
    work = original
    stripped = False
    # Check longest phrases first so "That's a great question" matches before "Great question".
    ordered = sorted({p.strip() for p in banned if p and p.strip()}, key=len, reverse=True)
    patterns = [
        re.compile(rf"^\s*{re.escape(phrase)}(?=$|[^0-9A-Za-z_])", flags=re.IGNORECASE)
        for phrase in ordered
    ]
    changed = True
    while changed and work:
        changed = False
        # Skip leading bullets/quotes when testing opener phrases cleanly.
        probe = re.sub(r'^[-*\u2022"\'“\u2018\s]+', "", work)
        for pat in patterns:
            m = pat.match(probe)
            if m:
                work = _LEADING_SEP.sub("", probe[m.end() :])
                stripped = True
                changed = True
                break
    cleaned = work if stripped else original
    if stripped and cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned, stripped


def enforce_word_limit(text: str, max_words: int = MAX_CARD_WORDS) -> tuple[str, bool]:
    """Cut `text` to <= `max_words`.

    If over limit, cuts at the last full sentence within `max_words`; else cuts at `max_words`.
    """
    tokens = _words(text)
    if len(tokens) <= max_words:
        return " ".join(tokens), False
    window = tokens[:max_words]
    last_sentence_idx = -1
    for i, tok in enumerate(window):
        if _SENTENCE_END.search(tok):
            last_sentence_idx = i
    if last_sentence_idx >= 0:
        return " ".join(window[: last_sentence_idx + 1]), True
    return " ".join(window), True


def split_why(text: str) -> tuple[str, str | None]:
    """Split optional `WHY:` section from card text."""
    m = _WHY_SPLIT_RE.search(text)
    if not m:
        return text.strip(), None
    main = text[: m.start()].strip()
    why = text[m.end() :].strip()
    return main, (why or None)


def sanitize_card(
    raw_body: str,
    *,
    banned: Iterable[str] = DEFAULT_BANNED_OPENERS,
    max_words: int = MAX_CARD_WORDS,
    max_why_words: int = MAX_WHY_WORDS,
) -> tuple[str, str | None, int, int]:
    """Apply C2 opener strip + word limit to main body and optional WHY insight.

    Returns `(main_text, why_text, cuts, strips)`.
    """
    main_raw, why_raw = split_why(raw_body)
    cuts = 0
    strips = 0
    main_clean, was_stripped = strip_banned_opener(main_raw, banned)
    if was_stripped:
        strips += 1
    main_limited, was_cut = enforce_word_limit(main_clean, max_words=max_words)
    if was_cut:
        cuts += 1
    why_out: str | None = None
    if why_raw:
        why_limited, why_cut = enforce_word_limit(why_raw, max_words=max_why_words)
        if why_cut:
            cuts += 1
        why_out = why_limited or None
    return main_limited, why_out, cuts, strips


class VerdictParser:
    """Streaming-friendly verdict parser + C2 length/opener guard.

    Optional `WHY:` insights are appended at `finish()` as `\\nWHY: <insight>` (D-100) so the
    shared wire schema stays backwards-compatible; `CardStack.tsx` splits and collapses them.
    """

    def __init__(
        self,
        *,
        banned: Iterable[str] = DEFAULT_BANNED_OPENERS,
        max_words: int = MAX_CARD_WORDS,
        call_id: str | None = None,
    ) -> None:
        self.verdict: Verdict = "pending"
        self.kind: CardKind | None = None
        self.why: str | None = None
        self.cuts = 0
        self.strips = 0
        self._banned = tuple(p.strip() for p in banned if p and p.strip())
        self._max_banned_len = max((len(p) for p in self._banned), default=0)
        self._max_words = max_words
        self._call_id = call_id
        self._buffer = ""
        self._body_buf = ""
        self._emitted = ""
        self._in_why = False
        self._why_buf = ""
        self._opener_resolved = False
        self._word_limit_hit = False
        self._capitalize_next = False

    def _could_be_prefix(self, head: str) -> bool:
        upper = head.upper()
        return any(p.startswith(upper) for p in PREFIXES) or NO_ANSWER.startswith(upper)

    def _could_be_banned(self, text: str) -> bool:
        if not self._banned:
            return False
        low = re.sub(r'^[-*\u2022"\'“\u2018\s]+', "", text.lstrip()).casefold()
        if not low:
            return True
        if len(low) > self._max_banned_len + 2:
            return False
        return any(p.casefold().startswith(low) for p in self._banned)

    def _emit_safe_delta(self, incoming: str) -> str:
        """Buffer briefly until opener check resolves, then stream words up to max_words."""
        if self._in_why:
            if len(self._why_buf) < MAX_BUFFER_CHARS:
                self._why_buf += incoming[: MAX_BUFFER_CHARS - len(self._why_buf)]
            return ""
        if self._capitalize_next and incoming:
            trimmed = _LEADING_SEP.sub("", incoming)
            if trimmed:
                if trimmed[0].islower():
                    trimmed = trimmed[0].upper() + trimmed[1:]
                self._capitalize_next = False
            incoming = trimmed
        if incoming and len(self._body_buf) < MAX_BUFFER_CHARS:
            self._body_buf += incoming[: MAX_BUFFER_CHARS - len(self._body_buf)]

        why_match = _WHY_SPLIT_RE.search(self._body_buf)
        if why_match:
            self._in_why = True
            self._why_buf = self._body_buf[why_match.end() :][:MAX_BUFFER_CHARS]
            self._body_buf = self._body_buf[: why_match.start()]
            return self._flush_main(final=True)

        if not self._opener_resolved:
            if self._could_be_banned(self._body_buf):
                return ""
            cleaned, stripped = strip_banned_opener(self._body_buf, self._banned)
            if stripped:
                self.strips += 1
                log_event("verdict", "banned_opener_stripped", call_id=self._call_id, count=1)
                if not cleaned:
                    self._capitalize_next = True
            self._body_buf = cleaned
            self._opener_resolved = True

        return self._flush_main(final=False)

    def _flush_main(self, *, final: bool) -> str:
        if self._word_limit_hit:
            return ""
        if not self._opener_resolved:
            cleaned, stripped = strip_banned_opener(self._body_buf, self._banned)
            if stripped:
                self.strips += 1
                log_event("verdict", "banned_opener_stripped", call_id=self._call_id, count=1)
            self._body_buf = cleaned
            self._opener_resolved = True

        candidate = self._body_buf
        candidate = candidate.rstrip("\r\n") if final else _WHY_TAIL_RE.sub("", candidate)

        tokens = _words(candidate)
        if len(tokens) > self._max_words:
            limited, _ = enforce_word_limit(candidate, max_words=self._max_words)
            self.cuts += 1
            self._word_limit_hit = True
            log_event("verdict", "card_word_cut", call_id=self._call_id, max_words=self._max_words)
            target = limited
        else:
            target = candidate.lstrip() if not self._emitted else candidate

        if target.startswith(self._emitted):
            delta = target[len(self._emitted) :]
            self._emitted = target
            return delta
        return ""

    def feed(self, text: str) -> str:
        """Return the card text that may be shown now (empty while verdict/opener is pending)."""
        if self.verdict == "answer":
            return self._emit_safe_delta(text)
        if self.verdict == "no_answer":
            return ""
        if len(self._buffer) < MAX_BUFFER_CHARS:
            self._buffer += text[: MAX_BUFFER_CHARS - len(self._buffer)]
        head = self._buffer.lstrip()
        head_upper = head.upper()
        if head_upper.startswith(NO_ANSWER):
            self.verdict = "no_answer"
            return ""
        prefixes: tuple[tuple[str, CardKind], ...] = (
            (SAY, "say"),
            (TIP, "tip"),
            (ANSWER, "answer"),
        )
        for prefix, kind in prefixes:
            if head_upper.startswith(prefix):
                self.verdict = "answer"
                self.kind = kind
                return self._emit_safe_delta(head[len(prefix) :])
        if len(head) >= len(NO_ANSWER) or not self._could_be_prefix(head):
            # Model ignored the format: treat its words as SAY/answer (still guarded by C2).
            self.verdict = "answer"
            self.kind = "answer"
            return self._emit_safe_delta(head)
        return ""

    def finish(self) -> str:
        """End of stream: flush remaining main text and append optional `WHY:` insight."""
        out = ""
        if self.verdict == "pending":
            head = self._buffer.strip()
            if not head or self._could_be_prefix(head):
                self.verdict = "no_answer"
                return ""
            self.verdict = "answer"
            self.kind = "answer"
            out += self._emit_safe_delta(head)
        if self.verdict != "answer":
            return ""
        out += self._flush_main(final=True)
        # Never emit a standalone WHY: line when main text was stripped away or empty.
        if not self._emitted.strip():
            self.verdict = "no_answer"
            return ""
        if self._why_buf.strip():
            why_limited, why_cut = enforce_word_limit(self._why_buf, max_words=MAX_WHY_WORDS)
            if why_cut:
                self.cuts += 1
                log_event("verdict", "why_word_cut", call_id=self._call_id, max_words=MAX_WHY_WORDS)
            self.why = why_limited or None
            if self.why:
                out += f"\nWHY: {self.why}"
        return out
