"""Enforce the worker coverage floors from CONSTRAINTS.md on a coverage.py JSON report.

Usage: python scripts/check_coverage.py [coverage.json]
Coverage counts statements and branches together. A floor for a directory that has no code yet
does not fail; it starts to bite with the first file there.
"""

import json
import sys
from pathlib import Path
from typing import Any

OVERALL_FLOOR = 90
FLOORS = {
    "sotto_worker/pipeline/": 90,
    "sotto_worker/router/": 90,
    "sotto_worker/adapters/": 90,
}


def _percent(summaries: list[dict[str, int]]) -> float | None:
    covered = sum(s["covered_lines"] + s["covered_branches"] for s in summaries)
    total = sum(s["num_statements"] + s["num_branches"] for s in summaries)
    return None if total == 0 else round(100 * covered / total, 1)


def failures(report: dict[str, Any]) -> list[str]:
    files: dict[str, dict[str, Any]] = report["files"]
    found: list[str] = []
    for prefix, floor in FLOORS.items():
        pct = _percent([f["summary"] for p, f in files.items() if p.startswith(prefix)])
        if pct is not None and pct < floor:
            found.append(f"{prefix}: {pct}% < {floor}%")
    overall = _percent([f["summary"] for f in files.values()])
    if overall is not None and overall < OVERALL_FLOOR:
        found.append(f"overall: {overall}% < {OVERALL_FLOOR}%")
    return found


def main(argv: list[str]) -> int:
    path = Path(argv[1] if len(argv) > 1 else "coverage.json")
    found = failures(json.loads(path.read_text()))
    for line in found:
        print(f"coverage floor: {line}")
    if not found:
        print("coverage floors: ok")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
