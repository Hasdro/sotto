#!/usr/bin/env bash
# From the Mac: build the web app, copy the COMMITTED code plus that build to the server, then
# install or update Sotto there (D-020). Nothing from .env is ever copied.
#
#   deploy/push.sh root@104.168.48.116                    # https://104-168-48-116.sslip.io
#   deploy/push.sh root@104.168.48.116 sotto.example.com  # your own domain (DNS A record first)
set -euo pipefail

TARGET=${1:?usage: deploy/push.sh user@host [domain]}
HOST=${TARGET#*@}
DOMAIN=${2:-}
REMOTE_DIR=/opt/sotto
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "note: uncommitted changes are not deployed (only the last commit is)"
fi

echo "==> Building the web app"
# The hosted app talks to its own origin: an EXPO_PUBLIC_DEMO_BRIDGE_URL from a local .env must
# not be baked into the build.
CI=1 EXPO_PUBLIC_SOTTO_DEMO=1 EXPO_PUBLIC_DEMO_BRIDGE_URL= pnpm --filter @sotto/app export:web >/dev/null

echo "==> Packing $(git rev-parse --short HEAD)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git archive --format=tar -o "$tmp/sotto.tar" HEAD apps/agent-worker seed deploy
tar -rf "$tmp/sotto.tar" apps/app/dist
gzip "$tmp/sotto.tar"

echo "==> Copying to $TARGET:$REMOTE_DIR"
ssh -o ServerAliveInterval=60 "$TARGET" \
  "rm -rf $REMOTE_DIR.new && mkdir -p $REMOTE_DIR.new && tar -xzf - -C $REMOTE_DIR.new && rm -rf $REMOTE_DIR && mv $REMOTE_DIR.new $REMOTE_DIR" \
  <"$tmp/sotto.tar.gz"

echo "==> Installing"
ssh -t -o ServerAliveInterval=60 "$TARGET" \
  "SOTTO_HOST_IP='$HOST' SOTTO_DOMAIN='$DOMAIN' bash $REMOTE_DIR/deploy/install.sh"
