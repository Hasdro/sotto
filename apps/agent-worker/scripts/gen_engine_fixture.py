"""Writes packages/engine/src/__tests__/bundle.json: a call bundle built from the seed (with no
keys) plus the worker's playbook answer for every demo customer line, so the TypeScript engine
is tested against the Python one (D-022). `--check` fails when the file is out of date."""

from __future__ import annotations

import json
import sys

from sotto_worker.cloud.bundle import Seed, build_bundle
from sotto_worker.playbook import PlaybookEntry, PlaybookIndex
from sotto_worker.runtime import REPO_ROOT

TARGET = REPO_ROOT / "packages" / "engine" / "src" / "__tests__" / "bundle.json"
EXTRA = [
    "How much is the down payment?",
    "Is there parking?",
    "Do you allow pets?",
    "What's the service charge per square foot?",
    "Can I see it this weekend?",
    "متى التسليم؟",
]


def build() -> str:
    seed = Seed.load()
    bundle = build_bundle(
        seed,
        company_name="Palm Grove Realty (demo)",
        settings={},
        routes={},
        own_playbook=[],
        keys=None,
        samples=True,
    )
    index = PlaybookIndex(
        [
            PlaybookEntry(
                id=e["id"],
                kind=e["kind"],
                question=e["question"],
                short_answer=e["short_answer"],
                details=e["details"],
                follow_up=e["follow_up"],
                tags=tuple(e["tags"]),
            )
            for e in bundle["playbook"]
        ]
    )
    lines = [ln["text"] for s in bundle["scenarios"] for ln in s["lines"]] + EXTRA
    lookups = {}
    for text in lines:
        hit = index.lookup(text)
        lookups[text] = hit.entry.id if hit else None
    return json.dumps({"bundle": bundle, "lookups": lookups}, ensure_ascii=False, indent=1) + "\n"


def main(argv: list[str]) -> int:
    text = build()
    if "--check" in argv:
        if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != text:
            print(f"{TARGET} is out of date: run `pnpm gen`", file=sys.stderr)
            return 1
        return 0
    TARGET.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
