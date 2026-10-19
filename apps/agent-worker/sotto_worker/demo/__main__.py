"""`python -m sotto_worker.demo`: the local demo (`pnpm demo`). Since D-020 this is the Sotto
server in local mode (sotto_worker/server): localhost only, no access code."""

from __future__ import annotations

import sys

from sotto_worker.server.__main__ import LOOPBACK, main, parser

if __name__ == "__main__":
    args = sys.argv[1:]
    host = parser().parse_args(args).host
    if host not in LOOPBACK:
        print(
            "`pnpm demo` is local only; for a hosted server see deploy/README.md.", file=sys.stderr
        )
        sys.exit(2)
    sys.exit(main(args))
