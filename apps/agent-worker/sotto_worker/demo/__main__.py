"""`python -m sotto_worker.demo`: the local demo server (D-013). Normally started by `pnpm demo`."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import os
import sys
from pathlib import Path

from sotto_worker.clock import RealClock
from sotto_worker.demo.server import DemoServer
from sotto_worker.runtime import REPO_ROOT, Runtime, build_demo_runtime

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


async def _run(args: argparse.Namespace) -> None:
    def runtime() -> Runtime:
        return build_demo_runtime(RealClock(), os.environ, force_fake=args.fake)

    first = runtime()
    server = DemoServer(
        runtime_factory=runtime,
        static_dir=args.static,
        speed=args.speed,
        log=lambda s: print(s, flush=True),
    )
    port = await server.start(args.host, args.port)
    print(f"\n  Sotto demo · {first.company.name} · {first.mode} models", flush=True)
    for note in first.notes:
        print(f"  note: {note}", flush=True)
    print(f"\n  Open http://{args.host}:{port}  (Ctrl+C to stop)\n", flush=True)
    await asyncio.Future()


def main() -> int:
    parser = argparse.ArgumentParser(prog="sotto-demo")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--static", type=Path, default=REPO_ROOT / "apps" / "app" / "dist")
    parser.add_argument(
        "--speed", type=float, default=1.0, help="scenario pacing; 0.5 = twice as fast"
    )
    parser.add_argument("--fake", action="store_true", help="fake models even if a key is set")
    args = parser.parse_args()
    if args.host not in LOOPBACK:
        print("The demo bridge is dev-only and binds to localhost only (D-013).", file=sys.stderr)
        return 2
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(_run(args))
    return 0


if __name__ == "__main__":
    sys.exit(main())
