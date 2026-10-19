#!/usr/bin/env bash
# Installs or updates Sotto on this server (D-020). Run as root from the code folder that
# deploy/push.sh copied (default /opt/sotto). Safe to run again: secrets and data are kept.
#
#   SOTTO_DOMAIN=sotto.example.com bash deploy/install.sh   # optional custom domain
#
# Secrets live in /etc/sotto/sotto.env (mode 600), never in the code folder or git.
set -euo pipefail

CODE_DIR=$(cd "$(dirname "$0")/.." && pwd)
ENV_DIR=/etc/sotto
ENV_FILE=$ENV_DIR/sotto.env
COMPOSE=(docker compose --project-name sotto --env-file "$ENV_FILE" -f "$CODE_DIR/deploy/docker-compose.yml")

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo bash deploy/install.sh)"

# 1. Docker -----------------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq docker.io docker-compose-v2 >/dev/null 2>&1 \
      || apt-get install -y -qq docker.io docker-compose-plugin >/dev/null 2>&1 \
      || die "could not install Docker with apt; install Docker Engine + the compose plugin, then rerun"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q docker docker-compose-plugin || die "could not install Docker with dnf"
  else
    die "unknown package manager; install Docker Engine + the compose plugin, then rerun"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die "docker compose is missing"
command -v curl >/dev/null 2>&1 || { command -v apt-get >/dev/null 2>&1 && apt-get install -y -qq curl >/dev/null; }

# 2. Secrets (first run only) ----------------------------------------------------------------
mkdir -p "$ENV_DIR"
chmod 700 "$ENV_DIR"
FIRST_RUN=0
if [ ! -f "$ENV_FILE" ]; then
  FIRST_RUN=1
  ip=${SOTTO_HOST_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}
  domain=${SOTTO_DOMAIN:-${ip//./-}.sslip.io}
  code=$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)
  secret=$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)
  umask 077
  cat >"$ENV_FILE" <<ENV
# Sotto server secrets (D-020). Keep this file private. Losing SOTTO_SECRET_KEY means re-entering
# provider keys in Admin → Keys & providers. Changing SOTTO_ACCESS_CODE signs everyone out.
SOTTO_DOMAIN=$domain
SOTTO_PUBLIC_ORIGIN=https://$domain
SOTTO_ACCESS_CODE=$code
SOTTO_SECRET_KEY=$secret
ENV
  chmod 600 "$ENV_FILE"
elif [ -n "${SOTTO_DOMAIN:-}" ]; then
  sed -i "s|^SOTTO_DOMAIN=.*|SOTTO_DOMAIN=$SOTTO_DOMAIN|; s|^SOTTO_PUBLIC_ORIGIN=.*|SOTTO_PUBLIC_ORIGIN=https://$SOTTO_DOMAIN|" "$ENV_FILE"
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

# 3. Who owns ports 80/443? ------------------------------------------------------------------
busy_by_others() {
  ss -ltnpH "( sport = :80 or sport = :443 )" 2>/dev/null | grep -v -e docker-proxy -e caddy | grep -q .
}
if busy_by_others; then
  PROFILE=""
  say "Ports 80/443 are used by another web server here; Sotto will listen on 127.0.0.1:8787"
else
  PROFILE="caddy"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
  fi
fi

# 4. Build and start -------------------------------------------------------------------------
[ -f "$CODE_DIR/apps/app/dist/index.html" ] || die "web app build missing; deploy with deploy/push.sh"
say "Building and starting Sotto (first build takes a few minutes)"
COMPOSE_PROFILES=$PROFILE "${COMPOSE[@]}" up -d --build --remove-orphans
for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1 || {
  "${COMPOSE[@]}" logs --tail 50 sotto
  die "Sotto did not become healthy (logs above)"
}
docker image prune -f >/dev/null 2>&1 || true

# 5. Report ----------------------------------------------------------------------------------
say "Sotto is running"
if [ "$PROFILE" = "caddy" ]; then
  echo "  Open:        $SOTTO_PUBLIC_ORIGIN  (HTTPS certificate is issued on the first visit)"
else
  cat <<MSG
  Sotto listens on http://127.0.0.1:8787. Point your existing web server at it, for nginx:

    location / {
      proxy_pass http://127.0.0.1:8787;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_read_timeout 3600s;
    }

  and set SOTTO_DOMAIN / SOTTO_PUBLIC_ORIGIN in $ENV_FILE to that site's address.
MSG
fi
if [ "$FIRST_RUN" -eq 1 ]; then
  echo "  Access code: $SOTTO_ACCESS_CODE   (shown once; it is also in $ENV_FILE)"
else
  echo "  Access code: unchanged (see $ENV_FILE)"
fi
echo "  Then: Admin → Keys & providers to add your vendor keys."
