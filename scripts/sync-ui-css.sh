#!/usr/bin/env bash
# Copies the design-system CSS (packages/ui/tokens.css + components.css, D-041) next to the HTML
# surfaces that cannot import from packages/ui at runtime: the owner console and the landing page.
# A worker test (tests/cloud/test_ui_css_copies.py) fails when a copy is stale.
set -euo pipefail
cd "$(dirname "$0")/.."
for dest in apps/agent-worker/sotto_worker/cloud/owner apps/landing; do
  cp packages/ui/tokens.css "$dest/tokens.css"
  cp packages/ui/components.css "$dest/components.css"
done
echo "design-system CSS copied"
