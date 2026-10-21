from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

HEADING = re.compile(r"^##\s+(?:Q|Objection):\s*(.+?)\s*$")
FIELD = re.compile(r"^-\s+([^:(]+?)\s*(?:\([^)]*\))?\s*:\s*(.*)$")
WORD = re.compile(r"[a-z0-9]+|[\u0600-\u06ff]+")
STOPWORDS = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "but",
        "by",
        "can",
        "could",
        "do",
        "does",
        "for",
        "from",
        "had",
        "has",
        "have",
        "how",
        "i",
        "i'm",
        "if",
        "in",
        "is",
        "it",
        "it's",
        "its",
        "just",
        "like",
        "me",
        "my",
        "of",
        "on",
        "or",
        "our",
        "so",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "they",
        "this",
        "to",
        "us",
        "was",
        "we",
        "what",
        "what's",
        "when",
        "where",
        "which",
        "who",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "honestly",
        "really",
        "actually",
        "please",
        "okay",
        "ok",
        "well",
    ]
)
KIND_BY_FILE = {"faq.md": "faq", "objections.md": "objection", "products.md": "product"}
# Minimum cosine similarity for a "high-confidence" playbook answer (R2 step 1). Tuned on the
# demo playbook tests; re-tune on the owner's playbook + golden calls in P2.8.
CONFIDENT = 0.42


@dataclass(frozen=True)
class PlaybookEntry:
    id: str
    kind: str
    question: str
    short_answer: str
    details: str = ""
    follow_up: str = ""
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlaybookHit:
    entry: PlaybookEntry
    score: float


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("'", "")).strip("-")


def _tokens(text: str) -> list[str]:
    out = []
    for word in WORD.findall(text.lower().replace("'", "")):
        if word in STOPWORDS:
            continue
        if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]
        out.append(word)
    return out


def parse_playbook(text: str, *, source: str) -> list[PlaybookEntry]:
    entries: list[PlaybookEntry] = []
    current: dict[str, str] | None = None

    def flush() -> None:
        if current and current.get("short answer"):
            tags = tuple(t.strip() for t in current.get("tags", "").split(",") if t.strip())
            entries.append(
                PlaybookEntry(
                    id=f"{source}#{_slug(current['question'])}",
                    kind=KIND_BY_FILE.get(source, "faq"),
                    question=current["question"],
                    short_answer=current["short answer"],
                    details=current.get("details", ""),
                    follow_up=current.get("follow-up question to ask", ""),
                    tags=tags,
                )
            )

    for line in text.splitlines():
        heading = HEADING.match(line)
        if heading:
            flush()
            current = {"question": heading.group(1)}
            continue
        field = FIELD.match(line)
        if field and current is not None:
            current[field.group(1).strip().lower()] = field.group(2).strip()
    flush()
    return entries


class PlaybookIndex:
    def __init__(self, entries: list[PlaybookEntry]) -> None:
        self.entries = entries
        docs = [_tokens(e.question) + _tokens(" ".join(e.tags)) * 2 for e in entries]
        df = Counter(token for doc in docs for token in set(doc))
        n = max(len(docs), 1)
        self._idf = {t: math.log((1 + n) / (1 + c)) + 1 for t, c in df.items()}
        self._vectors = [self._vector(doc) for doc in docs]

    @classmethod
    def from_directory(cls, directory: Path) -> PlaybookIndex:
        entries: list[PlaybookEntry] = []
        for path in sorted(directory.glob("*.md")):
            if path.name in {"README.md", "never-promise.md"}:
                continue
            entries += parse_playbook(path.read_text(encoding="utf-8"), source=path.name)
        return cls(entries)

    def _vector(self, tokens: list[str]) -> dict[str, float]:
        counts = Counter(tokens)
        vec = {t: c * self._idf.get(t, 0.0) for t, c in counts.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    def ranked(self, text: str, n: int) -> list[PlaybookHit]:
        """The `n` best-scoring entries, best first, whatever their confidence."""
        query = self._vector(_tokens(text))
        hits = [
            PlaybookHit(entry, sum(w * vec.get(t, 0.0) for t, w in query.items()))
            for entry, vec in zip(self.entries, self._vectors, strict=True)
        ]
        # Stable sort: on a tie the earlier entry wins, as the single-best scan did.
        return sorted(hits, key=lambda h: -h.score)[:n]

    def nearest(self, text: str) -> PlaybookHit | None:
        """Best match regardless of confidence (None only for an empty playbook)."""
        top = self.ranked(text, 1)
        return top[0] if top else None

    def lookup(self, text: str) -> PlaybookHit | None:
        best = self.nearest(text)
        return best if best is not None and best.score >= CONFIDENT else None
