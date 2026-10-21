"""Scripted calls (seed/demo/calls/*.json): demo playback and the synthetic replay. Text only;
real golden calls with audio live outside git (test-calls/README.md)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sotto_worker.contracts import Speaker

# "any": a plain statement may get a card (real models usually write one) or not (owner, 21 Oct:
# a card for every customer sentence when the model has something useful to say).
Expect = Literal["no_card", "playbook", "ai_or_holding", "any"]


@dataclass(frozen=True)
class ScriptLine:
    speaker: Speaker
    text: str
    gap_ms: int
    duration_ms: int
    expect: Expect


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    language: str
    lines: tuple[ScriptLine, ...]

    @classmethod
    def load(cls, path: Path) -> Scenario:
        raw = json.loads(path.read_text(encoding="utf-8"))
        lines = tuple(
            ScriptLine(
                speaker=line["speaker"],
                text=line["text"],
                gap_ms=int(line["gap_ms"]),
                duration_ms=int(line["duration_ms"]),
                expect=line["expect"],
            )
            for line in raw["lines"]
        )
        return cls(id=raw["id"], title=raw["title"], language=raw["language"], lines=lines)


def load_all(directory: Path) -> list[Scenario]:
    return [Scenario.load(p) for p in sorted(directory.glob("*.json"))]
