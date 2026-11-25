"""`pnpm replay`: R1 latency, R4 separation and expectations (P2.8).

- Golden calls (test-calls/*.json + audio outside git) need the audio replay with real STT,
  which is not built yet: if any exist this exits 1 rather than pretend.
- Until then `--all` runs the SYNTHETIC replay over seed/demo/calls and gates on its results.
- `--live` (`pnpm replay:live`, keys from the Mac's `.env`): checks the model IDs against each
  provider's model list, then replays the demo calls through the real models (P2.3 smoke test).
"""

import argparse
import asyncio
import os
import sys
from collections.abc import Mapping
from pathlib import Path

import httpx

from replay.live import check_model_ids, format_checks, replay_live
from replay.synthetic import LatencyProfile, format_report, replay_local_stub, replay_synthetic
from sotto_worker.adapters.factory import has_credentials, key_env
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import DEMO, SEED
from sotto_worker.scenarios import load_all

DEFAULT_CALLS_DIR = Path(__file__).resolve().parents[3] / "test-calls"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pnpm replay")
    parser.add_argument(
        "--all", action="store_true", help="golden calls (if any) + synthetic calls"
    )
    parser.add_argument("--calls-dir", type=Path, default=DEFAULT_CALLS_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--live", action="store_true", help="real models from .env keys (P2.3 smoke test)"
    )
    args = parser.parse_args(argv)
    if args.live:
        return asyncio.run(run_live(os.environ))

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
    local_stub = asyncio.run(replay_local_stub())
    print(
        f"\nD-096 local stub drill: {'; '.join(local_stub.details)}: "
        f"{'PASS' if local_stub.passed else 'FAIL'}"
    )
    return 0 if report.passed and outage_ok and local_stub.passed else 1


LIVE_FINAL_AFTER_T0_MS = 350  # simulated end-of-turn 250 + final STT 100 (ARCHITECTURE §4)


async def run_live(env: Mapping[str, str]) -> int:
    config = RoutingConfig.load(SEED / "models" / "default.yaml")
    primary = config.stages["suggest"]
    if not has_credentials(primary, env):
        print(f"replay --live: {key_env(primary)} is not set. Put it in .env at the repo root.")
        return 1
    async with httpx.AsyncClient() as client:
        checks = await check_model_ids(config, env, client)
    print("Model IDs in seed/models/default.yaml vs each provider's live model list:\n")
    print(format_checks(checks) + "\n")
    if any(c.status not in ("ok", "no key") for c in checks):
        print("FAIL: fix the model IDs above before the live replay.")
        return 1
    report = await replay_live(
        load_all(DEMO / "calls"), env, final_after_t0_ms=LIVE_FINAL_AFTER_T0_MS
    )
    header = (
        "LIVE replay (scripted text calls, REAL models on a real clock, simulated end-of-turn "
        f"+ STT {LIVE_FINAL_AFTER_T0_MS} ms). A model-latency smoke test, not the golden-call "
        "R1 gate."
    )
    print(format_report(report, LatencyProfile(), header=header, kind="live smoke test"))
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
