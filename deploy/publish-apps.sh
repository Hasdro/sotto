#!/usr/bin/env bash
# Builds the desktop installers and the Chrome extension on the Mac and puts them on the server
# at https://<server>/downloads/ (D-022). Android and iPhone builds are added when they exist.
#   deploy/publish-apps.sh root@104.168.48.116
set -euo pipefail
TARGET=${1:?usage: deploy/publish-apps.sh user@host}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
echo "==> Desktop (Windows, Mac, Linux)"
(cd apps/desktop && npm ci --no-audit --no-fund >/dev/null && npm run web >/dev/null && rm -rf release && npm run dist >/dev/null)
echo "==> Launch smoke test (S3 — blocks publish on failure)"
if [ "$(uname -s)" = "Darwin" ]; then
  node apps/desktop/test/launch.mac.mjs
fi
echo "==> Chrome extension"
bash apps/extension/build.sh >/dev/null
files=(apps/desktop/release/*.dmg apps/desktop/release/*.exe apps/desktop/release/*.AppImage apps/extension/release/*.zip)
shopt -s nullglob
files+=(apps/mobile-builds/*.apk)
echo "==> Uploading ${#files[@]} files"
ssh "$TARGET" "rm -rf /var/www/downloads.new && mkdir -p /var/www/downloads.new"
scp -q "${files[@]}" "$TARGET:/var/www/downloads.new/"
ssh "$TARGET" "chmod 644 /var/www/downloads.new/* && rm -rf /var/www/downloads && mv /var/www/downloads.new /var/www/downloads"
echo "==> Done: https://$(ssh "$TARGET" '. /etc/sotto/cloud.env && echo $SOTTO_DOMAIN')/downloads/"
