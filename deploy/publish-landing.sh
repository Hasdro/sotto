#!/usr/bin/env bash
# Publishes the landing page and the current desktop installers to us3 (T-067).
#   deploy/publish-landing.sh root@104.168.48.116            # DRY RUN: prints what it would do
#   deploy/publish-landing.sh root@104.168.48.116 --apply    # does it (master, after the owner approves DNS)
# Does not touch DNS. Run `node scripts/downloads-manifest.mjs` first so downloads.json matches the release folder.
set -euo pipefail
TARGET=${1:?usage: deploy/publish-landing.sh user@host [--apply]}
APPLY=${2:-}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
REL=apps/desktop/release
MANIFEST=apps/landing/downloads.json
[ -f "$MANIFEST" ] || { echo "missing $MANIFEST: run node scripts/downloads-manifest.mjs"; exit 1; }
INSTALLERS=(); while IFS= read -r l; do INSTALLERS+=("$l"); done < <(node -e 'const m=require("./'"$MANIFEST"'");for(const f of Object.values(m.files))console.log(f.file)')
for f in "${INSTALLERS[@]}"; do [ -f "$REL/$f" ] || { echo "missing installer $REL/$f"; exit 1; }; done
PATTERNS=(); while IFS= read -r l; do PATTERNS+=("$l"); done < <(grep -Ev '^[[:space:]]*(#|$)' deploy/downloads-cleanup.txt)

run() { if [ "$APPLY" = "--apply" ]; then ssh "$TARGET" "$@"; else echo "[dry-run] ssh $TARGET $*"; fi; }
echo "==> Landing files:"; ls apps/landing
echo "==> Installers:"; printf '   %s\n' "${INSTALLERS[@]}"
echo "==> Cleanup patterns (current installers are kept):"; printf '   %s\n' "${PATTERNS[@]}"

run "mkdir -p /var/www/salesshield /var/www/downloads /etc/caddy/sites"
if [ "$APPLY" = "--apply" ]; then
  rsync -a --delete apps/landing/ "$TARGET:/var/www/salesshield/"
  for f in "${INSTALLERS[@]}"; do rsync -a "$REL/$f" "$TARGET:/var/www/downloads/"; done
  scp -q deploy/caddy/salesshield.caddy "$TARGET:/etc/caddy/sites/salesshield.caddy"
else
  echo "[dry-run] rsync apps/landing/ -> $TARGET:/var/www/salesshield/ (and the installers, and the Caddy site block)"
fi
keep=$(printf ' ! -name %q' "${INSTALLERS[@]}")
for p in "${PATTERNS[@]}"; do
  run "find /var/www/downloads -maxdepth 1 -type f -name '$p' $keep $([ "$APPLY" = "--apply" ] && echo -delete || echo -print)"
done
# The main Caddyfile (written by deploy/install.sh) must import the sites folder once.
run "grep -q 'import /etc/caddy/sites' /etc/caddy/Caddyfile || echo 'import /etc/caddy/sites/*.caddy' >> /etc/caddy/Caddyfile"
run "caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"
[ "$APPLY" = "--apply" ] && echo "==> Done: https://salesshield.agncompu.com/" || echo "==> Dry run only. Add --apply to publish."
