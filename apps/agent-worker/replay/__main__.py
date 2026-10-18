"""`pnpm replay`: R1 latency, R4 separation and expectations (P2.8).

- Golden calls (test-calls/*.json + audio outside git) need the audio replay with real STT,
  which is not built yet: if any exist this exits 1 rather than pretend.
- Until then `--all` runs the SYNTHETIC replay over seed/demo/calls and gates on its results.
"""

import argparse
import asyncio
import sys
from pathlib import Path

from replay.synthetic import LatencyProfile, format_report, replay_synthetic
from sotto_worker.runtime import DEMO
from sotto_worker.scenarios import load_all

DEFAULT_CALLS_DIR = Path(__file__).resolve().parents[3] / "test-calls"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pnpm replay")
    parser.add_argument(
        "--all", action="store_true", help="golden calls (if any) + synthetic calls"
    )
    parser.add_argument("--calls-dir", type=Path, default=DEFAULT_CALLS_DIR)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    labels = sorted(args.calls_dir.glob("*.json"))
    if labels:
        print(
            f"replay: {len(labels)} golden call(s) found, but the audio replay (real STT on the "
            "customer track) is not built yet (P2.8 follow-up). Failing rather than pretending."
        )
        return 1
    print("replay: no golden calls yet (P0.5); running the synthetic replay only.\n")
    calls = load_all(DEMO / "calls")
    profile = LatencyProfile(seed=args.seed)
    report = asyncio.run(replay_synthetic(calls, profile))
    print(format_report(report, profile))
    # R2 drill: every provider down. Each turn that needs a card must still show one by 1500 ms.
    outage = asyncio.run(
        replay_synthetic(calls, LatencyProfile(seed=args.seed, providers_down=True))
    )
    outage_ok = outage.summary.p95_ms <= 1500 and not outage.unmet_expectations
    holding = sum(1 for r in outage.records if r.source == "holding")
    print(
        f"\nR2 drill, all providers down: {outage.cards} cards, p95 {outage.summary.p95_ms} ms, "
        f"holding {holding}: {'PASS' if outage_ok else 'FAIL'}"
    )
    return 0 if report.passed and outage_ok else 1


if __name__ == "__main__":
    sys.exit(main())
