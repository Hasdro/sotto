#!/usr/bin/env bash
# Builds the Chrome extension (D-022) into apps/extension/dist and a zip in apps/extension/release.
#   SOTTO_SERVER=https://… bash apps/extension/build.sh   (default: the us3 server)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
server=${SOTTO_SERVER:-https://104-168-48-116.sslip.io}
rm -rf "$here/dist" && mkdir -p "$here/dist" "$here/release"
(cd "$here/../app" && CI=1 EXPO_PUBLIC_SOTTO_SERVER="$server" npx expo export --platform web --output-dir "$here/dist" >/dev/null)
cp "$here"/static/* "$here/dist/"
# The side panel page: the app's index.html with boot.js first.
sed 's|<head>|<head><script src="/boot.js"></script>|' "$here/dist/index.html" >"$here/dist/sidepanel.html"
for size in 16 48 128; do
  sips -z "$size" "$size" "$here/../app/assets/icon.png" --out "$here/dist/icon$size.png" >/dev/null
done
version=$(python3 -c "import json;print(json.load(open('$here/static/manifest.json'))['version'])")
rm -f "$here/release/sotto-extension-$version.zip"
(cd "$here/dist" && zip -qr "$here/release/sotto-extension-$version.zip" .)
echo "built $here/release/sotto-extension-$version.zip"
