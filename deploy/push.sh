#!/usr/bin/env bash
# From the Mac: build the web app, copy the COMMITTED code plus that build to the server, then
# install or update the Sotto management server there (D-022). Nothing from .env is copied.
#
#   deploy/push.sh root@104.168.48.116                       # https://104-168-48-116.sslip.io
#   deploy/push.sh root@104.168.48.116 sotto.example.com     # your own domain (DNS A record first)
#   SOTTO_OWNER_EMAIL=you@example.com deploy/push.sh root@…  # first install: create the owner
set -euo pipefail

TARGET=${1:?usage: deploy/push.sh user@host [domain]}
HOST=${TARGET#*@}
if [[ $HOST =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then HOST_IP=$HOST; else HOST_IP=""; fi
DOMAIN=${2:-}
if [ -n "$DOMAIN" ]; then ORIGIN="https://$DOMAIN"; elif [ -n "$HOST_IP" ]; then ORIGIN="https://${HOST_IP//./-}.sslip.io"; else ORIGIN=""; fi
REMOTE_DIR=/opt/sotto
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "note: uncommitted changes are not deployed (only the last commit is)"
fi

echo "==> Building the web app (talks to $ORIGIN; runs calls in the browser)"
CI=1 EXPO_PUBLIC_SOTTO_SERVER="$ORIGIN" EXPO_PUBLIC_DEMO_BRIDGE_URL= pnpm --filter @sotto/app export:web >/dev/null

echo "==> Packing $(git rev-parse --short HEAD)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git archive --format=tar -o "$tmp/sotto.tar" HEAD apps/agent-worker seed deploy
tar -rf "$tmp/sotto.tar" apps/app/dist
gzip "$tmp/sotto.tar"

echo "==> Copying to $TARGET:$REMOTE_DIR (the Python environment is kept)"
ssh -o ServerAliveInterval=60 "$TARGET" "set -e
  rm -rf $REMOTE_DIR.new && mkdir -p $REMOTE_DIR.new && tar -xzf - -C $REMOTE_DIR.new
  if [ -d $REMOTE_DIR/apps/agent-worker/.venv ]; then mv $REMOTE_DIR/apps/agent-worker/.venv $REMOTE_DIR.new/apps/agent-worker/.venv; fi
  rm -rf $REMOTE_DIR && mv $REMOTE_DIR.new $REMOTE_DIR" <"$tmp/sotto.tar.gz"

echo "==> Installing"
ssh -o ServerAliveInterval=60 "$TARGET" \
  "SOTTO_HOST_IP='$HOST_IP' SOTTO_DOMAIN='$DOMAIN' SOTTO_OWNER_EMAIL='${SOTTO_OWNER_EMAIL:-}' bash $REMOTE_DIR/deploy/install.sh"
