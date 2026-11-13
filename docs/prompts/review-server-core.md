# Child: review-server-core (wave 1, T-074) — branch `phase9/review-server-core`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section, proposed D-046…D-048, D-053, D-054, D-057), `docs/reviews/integrations-playbook-2026-11.md` (INT-01, INT-03, INT-16), `docs/reviews/zero-config-2026-11.md` (ZC-02, ZC-11, ZC-14, DD-4, DD-5), `docs/reviews/ux-critique-2026-11.md` (UX-21, UX-35, UX-39), REQUIREMENTS R1, R3, R9, R10, R12, D-022, D-029, D-031, D-036, D-037, `docs/REFERENCES.md` § Zoho CRM. Use the `security-and-hardening` skill for the reset flow and `source-driven-development` for Zoho OAuth details.

**Goal:** the server endpoints, data and desktop hooks that waves 2–3 build screens on. Model: main (Opus). Two other children run in parallel (`review-ui-core`, `review-copy-brand`); stay inside your files.

## Scope (item ids from the backlog)
1. **ZC-02** Zoho OAuth starts on the global accounts host; the callback's `location` / `accounts-server` sets the user's DC (stored per user, and per org as a default). A manual DC override stays possible (R10 "chosen data centre"). Probe fallback only if the params are absent.
2. **UX-35** Server-rendered connect page: what will be read ("meetings, contacts, deals") and written ("meetings and notes after you approve them"), the detected/chosen DC with "Change", a Cancel link. Done page: "Zoho is connected. You can close this tab." + an "Open Sales Shield" link to `agn-sales-shield://zoho/connected` (no tokens in the URL). AGN branding, tokens-free CSS, light/dark.
3. **W1-DESK** `apps/desktop`: register the `agn-sales-shield://` protocol (Mac + Windows; single-instance focus on open) and expose via `preload.cjs` a whitelisted `openPrivacySettings(kind)` for `mic` and `system-audio` (Mac `x-apple.systempreferences:` panes; Windows `ms-settings:privacy-microphone`). No arbitrary URL opening.
4. **ZC-14s** One config health per org computed by the server — `ok` or `needs_attention` with machine reasons (`zoho_token_expired`, `smtp_failing`, `minutes_low`, `trial_ending`) and a fix route — returned in the session config next to the feature map (D-036 refresh cycle). Company-scoped; no secrets.
5. **UX-39s** Password reset: `POST /auth/reset/request` (always 200, no account enumeration), emailed single-use token valid 30 minutes (hash stored), `POST /auth/reset/confirm` sets the password and revokes the user's other refresh tokens (D-029), rate-limited per address and client, audited. Email through the existing org/platform SMTP path.
6. **ZC-11s** Company defaults data (per `company_id`, audited on change): `record_calls` org policy (A4), manager derived from users with role manager/admin when none is set (B9), consent record `{choice: all|primary_only, accepted_by, accepted_at, text_version}` and `vendor_allow_list` (DD-4 data only, no legal text), `agent_context` stays as data (DD-5 waits for the owner). Expose GET/PUT for admins; agents read only `record_calls`.
7. **INT-01s** New Zoho action kind `call_log`: a structured Note (summary, objections, commitments, next step, chance band) on the Deal, else the Contact, else the Lead of the call; `approved: true` required; idempotency key per call + kind; audit row; no transcript text accepted (field allow-list + length caps). Uses the existing Notes scope; if a Contact/Lead parent needs a scope we do not hold, say so and keep Deal-only.
8. **INT-03** Stage guidance in `seed/prompts/crm_brief.md` as data: a short block keyed by Deal stage (Qualification, Needs analysis, Proposal, Negotiation, Closed…) ≤ 150 tokens rendered, labelled "stage as of prep". No prompt text in code (hard rule).
9. **INT-16** `lookup.py` reads `Lead_Source` and a campaign name already present on the Lead/Contact record (no Campaigns module scope) into the brief; budget ≤ 1200 chars unchanged.

## Owned files
`apps/agent-worker/sotto_worker/cloud/{app,store,auth,bundle,mail,passwords}.py`, `cloud/zoho/**`, `apps/agent-worker/sotto_worker/adapters/crm/**`, `seed/prompts/crm_brief.md`, `seed/company/**`, `apps/desktop/**`, `apps/app/lib/{cloud,cloudCompat}.ts` (typed client functions for the new routes only), new tests under `apps/agent-worker/tests/cloud/` (prefer new files: `test_reset.py`, `test_health.py`, `test_company_defaults.py`, `test_zoho_dc.py`, `test_call_log.py`) and `apps/desktop/test/`.

## Out of bounds
`cloud/features.json`, `cloud/features.py`, `cloud/owner/**` (owned by `review-copy-brand`: reuse existing flags, e.g. gate `call_log` with `zoho_actions`; if you need a new flag, write it in your report); `cloud/{email,gallabox,learning}/**`; all `apps/app/**` screens and `apps/app/lib/i18n.ts`; `packages/ui/**`; `seed/prompts/` other than `crm_brief.md`; `docs/DECISIONS.md`; `deploy/**`.

## Acceptance
- ZC-02: pytest with a faked callback carrying `location=eu` / `accounts-server` → token exchange and API calls go to the EU hosts; override works; state still bound to person + browser (D-037).
- UX-35: page HTML contains the scope sentence, DC, Cancel; done page contains the deep link and no token/code.
- W1-DESK: `apps/desktop` tests — protocol registered; `openPrivacySettings` accepts only `mic`/`system-audio` and maps to the right URL per platform; anything else rejected.
- ZC-14s: each reason appears under its condition; isolation test — company A never sees B's health.
- UX-39s: unknown email → 200 and no mail; token single-use, expires at 30 min (FakeClock), stored hashed; confirm revokes other refresh tokens; rate limit hit → 429; audit rows.
- ZC-11s: isolation (A cannot read/write B), agent cannot PUT, audit row per change, manager derivation test.
- INT-01s: parent fallback order, idempotent retry (no second write), unapproved → refused, transcript-length payload refused, audit row; `zoho_unknown` path unchanged.
- INT-03/INT-16: bundle renders the brief with stage guidance and lead source; unknown stage → no block.

## Evidence
`pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; `cd apps/agent-worker && uv run pytest -q` (coverage floor holds); `(cd apps/desktop && npm test)`; if you touch any app test, **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`). **Replay is required** (INT-03/INT-16 change the live prompt): `pnpm replay --all`, report p50/p95, p95 ≤ 1500 ms. Screenshots of the connect and done pages (light, dark, 390, 1280; Arabic if the page is localised) in `docs/evidence/phase9/review-server-core/`. Run the `security-auditor` subagent on the reset flow and the deep link; fix critical/high.

## Rules
- Tests first; small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-server-core` about every 45 minutes.
- **Do not deploy, do not touch us3 or the owner's Zoho org, do not build the Mac app** — the master does that. New tables are created on first use (existing pattern); no migration that deletes data.
- Never read or print `.env*`; no real Zoho/SMTP credentials in tests (fakes only).
- Tracker: only the T-074 line (state + one evidence line) and a session-log entry `### <date> · local · <model> · phase9/review-server-core`. Do not edit Now.

## Final report (max 5 bullets)
What changed (item ids, new routes) · evidence (tests, replay p50/p95, security review) · lines needed in files you do not own (e.g. a flag) · open questions for the owner · branch tip SHA.
