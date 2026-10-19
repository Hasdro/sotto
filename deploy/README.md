# Hosting Sotto on your server (D-020)

One command from your Mac puts the Sotto demo on your server with HTTPS, an access code, and the **Keys & providers** panel. No domain purchase needed: it uses `sslip.io`, a free service that maps an IP address to a hostname, for example `104-168-48-116.sslip.io` → `104.168.48.116`.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| Sotto server: web app, calls, admin API | Docker container `sotto` | Python. Reaches port 8787 only through Caddy, plus the server's own loopback. |
| HTTPS | Docker container `caddy` | Gets and renews the certificate automatically. Ports 80 and 443. |
| Secrets | `/etc/sotto/sotto.env` on the server | Access code and encryption key. Mode 600, never in git. |
| Provider keys, call history | Docker volume `sotto_sotto-data` (SQLite) | Keys are encrypted with `SOTTO_SECRET_KEY`. |

## First install (about 5 minutes)

From the repo on your Mac:

```bash
cd ~/Documents/GitHub/sotto
deploy/push.sh root@104.168.48.116
```

It does four things:
1. builds the web app on your Mac;
2. copies the **committed** code and that build to `/opt/sotto` (your `.env` is never copied);
3. installs Docker on the server if it is missing;
4. starts Sotto.

At the end it prints:

```
Open:        https://104-168-48-116.sslip.io
Access code: XXXXXXXXXXXXXXXX   (shown once; it is also in /etc/sotto/sotto.env)
```

Then:
1. Open the address and enter the access code.
2. Go to **Admin → Keys & providers**. Paste your keys (Groq, Gemini, Deepgram, AssemblyAI …), press **Test**, and pick a vendor for each job. Keys are encrypted on the server and never shown again.
3. Go to **Call**. Run a scenario, type as the customer, or press **Speak as the customer** and use your microphone. The microphone needs HTTPS, which Caddy provides.

### Your own domain instead

Point the domain's DNS **A record** at the server's IP first, then:

```bash
deploy/push.sh root@104.168.48.116 sotto.yourcompany.com
```

### If the server already runs a website on ports 80/443

The installer detects this. It leaves your web server alone and starts Sotto on `127.0.0.1:8787` only. It then prints an nginx `location` block that forwards a site to Sotto, including WebSockets. Set `SOTTO_DOMAIN` and `SOTTO_PUBLIC_ORIGIN` in `/etc/sotto/sotto.env` to that site's address, then rerun `bash /opt/sotto/deploy/install.sh`.

## Updating

Commit, then run the same command again:

```bash
deploy/push.sh root@104.168.48.116
```

Your access code, encryption key, provider keys and call history all stay.

## Everyday commands (on the server)

```bash
cd /opt/sotto/deploy
C="docker compose -p sotto --env-file /etc/sotto/sotto.env"
$C ps                         # what is running
$C logs -f --tail 100 sotto   # live log: calls, cards, first-word times
$C restart sotto              # restart the app
grep ACCESS_CODE /etc/sotto/sotto.env   # forgot the access code
```

- **Change the access code:** edit `SOTTO_ACCESS_CODE` in `/etc/sotto/sotto.env`, then `$C up -d`. Everyone is signed out.
- **Back up:**

  ```bash
  docker run --rm -v sotto_sotto-data:/d -v "$PWD":/b alpine tar czf /b/sotto-data.tgz -C /d .
  ```

  Keep `/etc/sotto/sotto.env` too. Without `SOTTO_SECRET_KEY` the saved provider keys cannot be decrypted, and you would have to re-enter them.

## Check it from your Mac

```bash
pnpm spoken:live --url https://104-168-48-116.sslip.io --code YOUR_ACCESS_CODE
```

Your Mac speaks five customer sentences into the hosted server. The test prints, for each one, the time from the end of the sentence to the transcript and to the first card. This needs a speech-to-text key saved on the server.

## Security notes

- **Access:**
  - Without the access code you see only the sign-in page. Every API call and call socket checks the session cookie (HttpOnly, Secure, SameSite=Strict, 12 hours).
  - Wrong codes are rate-limited: 10 per 10 minutes per address.
  - Requests that change something must come from the site's own origin.
- **Keys:**
  - Encrypted with AES-256-GCM.
  - Write-only through the API.
  - Each key is only ever sent to its own vendor (D-016).
- **Data:** this is a **demo with sample data** (a fictional company). Do not run real customer calls through it until the free-tier data question in `docs/BRIEF.md` is answered.
- **Not yet production:** real sign-in with users and roles (Supabase, Phase 5) and telephony (LiveKit, Phase 4) replace the access code and the browser microphone later.
