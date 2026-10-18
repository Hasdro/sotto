#!/usr/bin/env bash
# Architecture boundary checks (ENGINEERING §3, CLAUDE.md hard rules). Runs in CI and `pnpm lint`.
# Usage: scripts/check-boundaries.sh [root]   (default: the repository root)
# The rules live in check_boundaries.py; fixture tests: scripts/tests/run.sh.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/check_boundaries.py" "${1:-$here/..}"
