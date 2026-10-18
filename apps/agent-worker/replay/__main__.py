"""Golden-call replay: R1 latency, R4 separation and suggestion quality (P2.8).

Until the harness exists this is a stub. It exits 0 only when there is nothing to replay,
so CI cannot mistake "not built yet" for "passed".
"""

import argparse
import sys
from pathlib import Path

DEFAULT_CALLS_DIR = Path(__file__).resolve().parents[3] / "test-calls"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pnpm replay")
    parser.add_argument("--all", action="store_true", help="replay every golden call")
    parser.add_argument("--calls-dir", type=Path, default=DEFAULT_CALLS_DIR)
    args = parser.parse_args(argv)

    labels = sorted(args.calls_dir.glob("*.json"))
    if not labels:
        print("replay: no golden calls yet (P0.5); nothing to measure.")
        return 0
    print(f"replay: {len(labels)} golden call(s) found, but the harness is not built yet (P2.8).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
