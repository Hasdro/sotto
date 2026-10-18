"""Enforce the worker coverage floors from CONSTRAINTS.md on a coverage.py JSON report.

Usage: python scripts/check_coverage.py [coverage.json]
Coverage counts statements and branches together and is compared unrounded. A floor for a
directory that has no code yet does not fail; it starts to bite with the first file there, and
a directory with code that the report does not mention fails (it was never imported by a test).
"""

import json
import sys
from pathlib import Path
from typing import Any

WORKER_ROOT = Path(__file__).resolve().parents[1]
OVERALL_FLOOR = 90
FLOORS = {
    "sotto_worker/pipeline/": 90,
    "sotto_worker/router/": 90,
    "sotto_worker/adapters/": 90,
}


def _percent(summaries: list[dict[str, int]]) -> float | None:
    covered = sum(s["covered_lines"] + s["covered_branches"] for s in summaries)
    total = sum(s["num_statements"] + s["num_branches"] for s in summaries)
    return None if total == 0 else 100 * covered / total


def failures(report: dict[str, Any], worker_root: Path = WORKER_ROOT) -> list[str]:
    files: dict[str, dict[str, Any]] = report["files"]
    found: list[str] = []
    for prefix, floor in FLOORS.items():
        pct = _percent([f["summary"] for p, f in files.items() if p.startswith(prefix)])
        if pct is None:
            if any((worker_root / prefix).rglob("*.py")):
                found.append(f"{prefix}: has Python files but none are in the coverage report")
        elif pct < floor:
            found.append(f"{prefix}: {pct:.2f}% < {floor}%")
    overall = _percent([f["summary"] for f in files.values()])
    if overall is not None and overall < OVERALL_FLOOR:
        found.append(f"overall: {overall:.2f}% < {OVERALL_FLOOR}%")
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
