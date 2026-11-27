"""Web bundle budget (CONSTRAINTS.md): total gzipped JS of the exported web app.

Usage: python3 scripts/check_bundle_size.py <dist-dir> [budget-kb]
Run after `pnpm --filter @sotto/app export:web` (CI does).
"""

import gzip
import sys
from pathlib import Path

BUDGET_KB = 700


def gzipped_js_kb(dist: Path) -> float:
    files = sorted(dist.glob("_expo/static/js/web/*.js"))
    if not files:
        raise SystemExit(f"bundle-size: no web JS found under {dist}; run export:web first")
    return sum(len(gzip.compress(f.read_bytes(), 9)) for f in files) / 1024


def main(argv: list[str]) -> int:
    dist = Path(argv[1])
    budget = float(argv[2]) if len(argv) > 2 else BUDGET_KB
    size = gzipped_js_kb(dist)
    verdict = "ok" if size <= budget else "OVER BUDGET"
    print(f"bundle-size: {size:.0f} KB gzipped JS, budget {budget:.0f} KB: {verdict}")
    return 0 if size <= budget else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
