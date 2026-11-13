#!/usr/bin/env bash
# Installs or updates the Sotto management server on this machine (D-022): accounts, companies,
# plans, usage and the owner console. Calls never pass through it. Run as root from the folder
# deploy/push.sh copied (default /opt/sotto). Safe to run again: secrets and data are kept.
#
#   SOTTO_DOMAIN=sotto.example.com bash deploy/install.sh   # optional custom domain
#   SOTTO_OWNER_EMAIL=you@example.com bash deploy/install.sh  # first run: create the owner
#
# Native install, no Docker (1 GB servers): uv-managed Python 3.13, a systemd service, Caddy for
# HTTPS, ufw, and a nightly SQLite backup. Secrets: /etc/sotto/cloud.env (root:sotto, 640).
set -euo pipefail

CODE_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORKER=$CODE_DIR/apps/agent-worker
ENV_DIR=/etc/sotto
ENV_FILE=$ENV_DIR/cloud.env
DATA_DIR=/var/lib/sotto
UV_VERSION=0.12.23
PORT=8788

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"
command -v apt-get >/dev/null 2>&1 || die "this installer supports Ubuntu/Debian (apt)"

# 1. System packages ----------------------------------------------------------------------------
say "System packages (Caddy, firewall, SQLite)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq caddy ufw sqlite3 curl ca-certificates >/dev/null

# 2. uv + Python (pinned) ----------------------------------------------------------------------
if ! /usr/local/bin/uv --version 2>/dev/null | grep -q " $UV_VERSION"; then
  say "Installing uv $UV_VERSION"
  curl -LsSf "https://astral.sh/uv/$UV_VERSION/install.sh" | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh >/dev/null
fi
export UV_PYTHON_INSTALL_DIR=/opt/uv-python UV_CACHE_DIR=/var/cache/uv
say "Python dependencies"
(cd "$WORKER" && /usr/local/bin/uv sync --frozen --no-dev --python 3.13 --quiet)

# 3. Service user, data folder, secrets (first run) ---------------------------------------------
id sotto >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin sotto
install -d -o sotto -g sotto -m 700 "$DATA_DIR"
install -d -o root -g sotto -m 750 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  ip=${SOTTO_HOST_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}
  if [ -z "${SOTTO_DOMAIN:-}" ] && ! [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "cannot tell this server's public IPv4 address; rerun with SOTTO_DOMAIN=your.domain"
  fi
  domain=${SOTTO_DOMAIN:-${ip//./-}.sslip.io}
  secret=$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)
  umask 027
  cat >"$ENV_FILE" <<ENV
# Sotto management server (D-022). Keep private. Losing SOTTO_SECRET_KEY means companies must
# re-enter their provider keys; accounts and plans are not affected.
SOTTO_DOMAIN=$domain
SOTTO_PUBLIC_ORIGIN=https://$domain
SOTTO_SECRET_KEY=$secret
SOTTO_DATA_DIR=$DATA_DIR
SOTTO_OWNER_ORIGIN=https://owner.$domain
ENV
  chown root:sotto "$ENV_FILE"
  chmod 640 "$ENV_FILE"
elif [ -n "${SOTTO_DOMAIN:-}" ]; then
  sed -i "s|^SOTTO_DOMAIN=.*|SOTTO_DOMAIN=$SOTTO_DOMAIN|; s|^SOTTO_PUBLIC_ORIGIN=.*|SOTTO_PUBLIC_ORIGIN=https://$SOTTO_DOMAIN|" "$ENV_FILE"
fi
# The owner console has its own origin (security review M1); older installs get it added.
if ! grep -q '^SOTTO_OWNER_ORIGIN=' "$ENV_FILE"; then
  d=$(grep '^SOTTO_DOMAIN=' "$ENV_FILE" | cut -d= -f2)
  echo "SOTTO_OWNER_ORIGIN=https://owner.$d" >>"$ENV_FILE"
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

# 4. systemd: the server and a nightly backup ----------------------------------------------------
say "Services"
cat >/etc/systemd/system/sotto-cloud.service <<UNIT
[Unit]
Description=Sotto management server (D-022)
After=network-online.target
Wants=network-online.target

[Service]
User=sotto
Group=sotto
WorkingDirectory=$WORKER
EnvironmentFile=$ENV_FILE
Environment=PYTHONUNBUFFERED=1
ExecStart=$WORKER/.venv/bin/python -m sotto_worker.cloud serve --host 127.0.0.1 --port $PORT --static $CODE_DIR/apps/app/dist
Restart=always
RestartSec=3
MemoryMax=400M
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
ReadWritePaths=$DATA_DIR
UMask=0077
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallFilter=@system-service
SystemCallArchitectures=native
ProtectProc=invisible
ProtectClock=yes
ProtectHostname=yes
RestrictNamespaces=yes
RestrictRealtime=yes

[Install]
WantedBy=multi-user.target
UNIT
cat >/etc/systemd/system/sotto-backup.service <<UNIT
[Unit]
Description=Sotto database backup (keeps 14)

[Service]
Type=oneshot
User=sotto
Group=sotto
WorkingDirectory=$WORKER
EnvironmentFile=$ENV_FILE
ExecStart=$WORKER/.venv/bin/python -m sotto_worker.cloud backup
UNIT
cat >/etc/systemd/system/sotto-backup.timer <<UNIT
[Unit]
Description=Nightly Sotto database backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# 5. Owner account (first run, when an email is given) -------------------------------------------
pwfile=/root/sotto-owner-password.txt
if [ -n "${SOTTO_OWNER_EMAIL:-}" ] && [ ! -f "$pwfile" ]; then
  (cd "$WORKER" && set -a && . "$ENV_FILE" && set +a && \
    .venv/bin/python -m sotto_worker.cloud create-owner --email "$SOTTO_OWNER_EMAIL" --name Owner \
      --password-file "$pwfile") || echo "  owner account already exists"
fi
chown -R sotto:sotto "$DATA_DIR"

# 6. HTTPS and firewall ----------------------------------------------------------------------------
say "Caddy (HTTPS for $SOTTO_DOMAIN)"
cat >/etc/caddy/Caddyfile <<CADDY
$SOTTO_DOMAIN {
	encode zstd gzip
	request_body {
		max_size 64KB
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	# Installers for Windows, Mac, Linux and the Chrome extension (deploy/publish-apps.sh).
	handle /downloads/* {
		root * /var/www
		file_server browse
	}
	# The reset link carries a token in its fragment; no Referer may leave the page.
	header /reset-password* Referrer-Policy no-referrer
	handle {
		reverse_proxy 127.0.0.1:$PORT
	}
}

# The owner console: its own origin, so the app's pages can never use the owner's cookie.
${SOTTO_OWNER_ORIGIN#https://} {
	encode zstd gzip
	request_body {
		max_size 64KB
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	redir / /owner 302
	@app not path /owner /owner/* /api/owner/*
	respond @app 404
	reverse_proxy 127.0.0.1:$PORT
}

# Extra sites (phase 9 landing page: deploy/caddy/salesshield.caddy via deploy/publish-landing.sh).
import /etc/caddy/sites/*.caddy
CADDY
install -d -m 755 /etc/caddy/sites
install -d -m 755 /var/www/downloads
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || die "Caddyfile invalid"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable --now sotto-backup.timer >/dev/null
systemctl enable sotto-cloud >/dev/null
systemctl restart sotto-cloud
systemctl reload-or-restart caddy

for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 || {
  journalctl -u sotto-cloud -n 40 --no-pager
  die "the server did not start (log above)"
}

say "Sotto management server is running"
echo "  App:            $SOTTO_PUBLIC_ORIGIN"
echo "  Owner console:  $SOTTO_OWNER_ORIGIN/owner"
[ -f /root/sotto-owner-password.txt ] && echo "  Owner sign-in:  ssh root@<server> cat /root/sotto-owner-password.txt  (change it after signing in)"
echo "  Logs:           journalctl -u sotto-cloud -f"
