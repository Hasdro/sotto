# Child session: phase9/zoho-slice — the Saturday demo (T-053 + T-055 slice, T-057 rail, the Zoho part of T-071)

Read `docs/prompts/common.md` first and follow it. Then read:
- `docs/phases/phase-9-product-round.md` § 4 and § Owner additions;
- `docs/REFERENCES.md` § Zoho CRM v8;
- D-031 and D-036.

Use `source-driven-development` (official Zoho v8 docs) and `security-and-hardening`.

**Deadline:** this must be demo-ready for Saturday 14 Nov 2026. Build the smallest version that fully works and leave everything else out.

## Goal (demo slice)
1. **Zoho client config (server).**
   - Owner console: a platform Zoho client. Client ID and secret are write-only and AES-GCM encrypted like provider keys. The data centre defaults to `.com`.
   - Admin → Integrations: an optional per-org client that overrides the platform one. The per-org client wins when set.
   - Never return a secret in any API response, and never log one.
   - The owner pastes the values into the UI. **Do not read the Mac `.env`**, where the owner also put `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`.
2. **Per-user OAuth through the server.**
   - Flow: `GET /auth/zoho/start` (signed-in user; one-time `state` bound to the session, about 10 minutes; `access_type=offline`, minimal scopes from REFERENCES) → Zoho → `GET /auth/zoho/callback/` (trailing slash, exactly as registered).
   - The callback exchanges the code at `accounts-server`, stores the refresh token encrypted per user with `api_domain`, then shows a "Connected, return to the app" page.
   - The desktop app opens the start URL in the system browser and polls the connection status.
   - Disconnect revokes the token.
   - Cache access tokens for about 55 minutes.
   - The callback must answer on both `salesshield.agncompu.com` (once DNS exists) and the current `104-168-48-116.sslip.io`. The owner will add the sslip redirect URI in the Zoho console.
   - The `zoho` feature flag is `needs_connection` until the user has connected.
3. **Lookup (read-only).**
   - A server route that searches Contacts and Leads by phone or email, with a name search as fallback. Return up to 3 candidates with evidence (which field matched).
   - On the chosen record, pull:
     - the contact: name, title, email, phone;
     - the account: name, industry;
     - open deals: name, stage, amount, close date, owner;
     - the last 5 notes from the last 90 days.
   - Cap the size (a token budget). Enforce org scoping and the D-031 read matrix on the server.
   - First step on a real account: `GET /crm/v8/settings/modules` to confirm the `Events`/Meetings naming. Record the result in REFERENCES.
4. **Context rail (T-057).**
   - The collapsed toggle that brand-ui left on the live-call screen opens the rail.
   - The rail offers: "Find in Zoho" (search or the call's number), pick a candidate (never auto-attach), "Skip".
   - Show the CRM brief in the rail. The suggestion card must stay in the one-glance zone.
   - Inject the chosen record as a short brief through the prompt registry variable (no prompt text in code). Then run `pnpm replay --all` and keep p95 ≤ 1500 ms.

## Owned files
- New `apps/agent-worker/sotto_worker/cloud/zoho/**` and `adapters/crm/zoho*`.
- Additions in `cloud/app.py`, `cloud/store.py`, `cloud/owner/**`.
- `apps/app/features/crm/**` (new), `apps/app/app/admin/integrations.tsx` (new).
- The rail component under `apps/app/features/call/components/` (new file), plus the minimal hook-up in the call screen.
- `seed/prompts/` (a brief variable).
- `apps/app/lib/i18n.ts` (append a `crm.*` block, English and Arabic).
- `docs/REFERENCES.md` (Zoho verification results).

## Evidence
- Tests:
  - OAuth state (replay and expiry);
  - callback code exchange (mocked Zoho);
  - encrypted storage, with secrets never in responses;
  - per-org client beats the platform client;
  - org isolation;
  - read-matrix enforcement;
  - lookup candidates;
  - the rail never auto-attaches.
- Replay p50/p95.
- Screenshots: Admin → Integrations, the connected state, and the rail with a CRM brief (light, dark, RTL).
- A `security-auditor` subagent on the OAuth diff, with its real findings fixed.

## Hand-back
Report in at most 10 lines. Include the exact steps the owner must do:
- paste the client into the owner console;
- add the sslip redirect URI in the Zoho console;
- connect from the app.

The master deploys the server. Do not touch us3.
