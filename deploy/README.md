# The Sotto management server (D-022)

The server on us3 manages accounts and subscriptions only. Calls never pass through it: each app (phone, desktop, web, Chrome extension) runs the call engine itself and talks to the AI and speech vendors directly.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Management server | systemd `sotto-cloud`, `127.0.0.1:8788` | Python 3.13 (uv). Handles sign up and log in, companies, plans, devices, usage, the call bundle and the owner console. Memory is capped at 400 MB. |
| HTTPS | Caddy (Ubuntu package) | Gets and renews the certificate automatically. Ports 80 and 443. |
| Database | `/var/lib/sotto/cloud.db` (SQLite) | Backed up nightly at 03:30 to `/var/lib/sotto/backups/` (the newest 14 are kept). |
| Secrets | `/etc/sotto/cloud.env` | `SOTTO_SECRET_KEY` encrypts the companies' provider keys. Owned by root:sotto, mode 640, never in git. |
| Firewall | ufw | Allows SSH, 80 and 443 only. |
| Web app | `/opt/sotto/apps/app/dist` | The same client as the other apps, served at `/`. |

## Install or update

From the repo on the Mac:

```bash
SOTTO_OWNER_EMAIL=you@example.com deploy/push.sh root@104.168.48.116   # first time
deploy/push.sh root@104.168.48.116                                       # updates
```

The script:
1. builds the web app pointed at `https://104-168-48-116.sslip.io`;
2. copies the **committed** code to `/opt/sotto`;
3. runs `deploy/install.sh` on the server.

The installer is safe to run again, and it keeps the secrets and the data.

On the first run it creates your owner account and writes a one-time password to `/root/sotto-owner-password.txt` on the server:

```bash
ssh root@104.168.48.116 cat /root/sotto-owner-password.txt
```

Sign in at `https://104-168-48-116.sslip.io/owner`. Change the password under **Account**, then delete the file:

```bash
ssh root@104.168.48.116 rm /root/sotto-owner-password.txt
```

## Day to day

| Task | Command (on the server) |
|---|---|
| Status | `systemctl status sotto-cloud` |
| Live log | `journalctl -u sotto-cloud -f` |
| Restart | `systemctl restart sotto-cloud` |
| Backup now | `systemctl start sotto-backup` |
| Restore a backup | `systemctl stop sotto-cloud && cp /var/lib/sotto/backups/<file> /var/lib/sotto/cloud.db && chown sotto: /var/lib/sotto/cloud.db && systemctl start sotto-cloud` |

## Your own domain

Point a DNS A record at the server, then run `deploy/push.sh root@104.168.48.116 sotto.example.com`.

## The old Docker demo server (D-020)

`pnpm demo` still runs the D-020 server on the Mac for local testing. The hosted Docker kit was removed in D-022, and git history has it.

## The landing page: salesshield.agncompu.com (T-066, T-067)

Static page in `apps/landing/` (no build step). Installer buttons read `apps/landing/downloads.json`, which `node scripts/downloads-manifest.mjs` generates from `apps/desktop/release/` (version, file names, sizes, sha256). A new version needs no HTML edit.

**Owner: DNS first.** Add an A record `salesshield.agncompu.com → 104.168.48.116`. In Cloudflare use **DNS only** (grey cloud) so Caddy gets its own certificate. If you want the orange cloud (proxied), set SSL/TLS mode to **Full (strict)** and tell the master, since certificate issuance then needs the DNS challenge.

Publish (the master runs this after the owner confirms DNS; it is a dry run unless `--apply`):

```bash
node scripts/downloads-manifest.mjs
deploy/publish-landing.sh root@104.168.48.116            # lists what it would do
deploy/publish-landing.sh root@104.168.48.116 --apply
```

It copies the page to `/var/www/salesshield`, the three installers to `/var/www/downloads`, the site block `deploy/caddy/salesshield.caddy` to `/etc/caddy/sites/`, and deletes the stale files named in `deploy/downloads-cleanup.txt` (APK, AppImage, extension zip, blockmaps, older installers). `/downloads/` has no directory listing.

**Caution:** `deploy/install.sh` rewrites `/etc/caddy/Caddyfile`. The script appends `import /etc/caddy/sites/*.caddy` to it, but a later `deploy/push.sh` would drop that line. Add the import line to the Caddyfile template in `install.sh` (outside this stream's files; the master decides).

`scripts/release.sh vX.Y.Z` makes the GitHub Release (dry run unless `--publish`). `scripts/landing-check.mjs` takes the screenshots and runs axe on the page.
