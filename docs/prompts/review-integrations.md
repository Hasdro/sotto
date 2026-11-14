# Child: review-integrations (wave 3, T-078) — branch `phase9/review-integrations`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (waves 1–2, the redesign D-041 and the owner's answers are there). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/zero-config-2026-11.md` and `docs/reviews/ux-critique-2026-11.md` (the items below), `docs/design/DESIGN-SYSTEM.md`, REQUIREMENTS R3, R10, R12, and decisions D-031, D-032, D-033, D-039, D-052, D-058, D-064, D-065, D-073. Read the wave-2 session-log entries (2026-11-13) in `docs/TRACKER.md`.

**Goal:** an admin connects email, WhatsApp and the team in minutes with almost nothing to type, and a new user can try a practice call in a real account. Model: main (Opus). Two other children run in parallel (`review-owner-platform`, `review-company-coaching`); stay inside your files.

**Build on waves 1–2:** `packages/ui` has `ChecklistRow`, `Disclosure`, `Sheet`, `Toast`, `LtrRun`; Admin › Connections is a group in `admin/_layout.tsx` (UX-29, D-051); the first-run checklist is data in `features/home/setup.ts` (its comment marks where the practice step goes); `SmtpSettings` and `GallaboxSettings` exist with write-only credentials (D-039). Strings go in feature-local `strings.ts` files (en + ar), not in `i18n.ts`.

## Scope (item ids from the backlog)
1. **UX-30** Integrations order: your Zoho connection → Email → WhatsApp. The per-org Zoho OAuth client form leaves this page (D-064: it becomes an owner-console override, built by `review-owner-platform`); keep only a read-only line when an override is set ("Client ID ends …a1b2"). Clear "Remove" copy with a confirmation.
2. **UX-32** SMTP presets (Google, Microsoft 365, Hostinger, Zoho Mail, Other) picked from the admin's email domain: known-domain map plus MX lookup with `dnspython` (D-052; if adding it fails, ship the static map + "Other" and say so). Only the password field is shown for a known preset; host/port/TLS under a Disclosure. A test email on save, result inline. Customer SMTP is the default sender; AGN's Hostinger SMTP stays the fallback (D-065).
3. **ZC-07** Gallabox: after a valid key, pull channels and APPROVED templates into pick lists; the allow-list defaults to the approved templates; template parameter → CRM/brief field mapping guessed, only unmapped parameters shown (D-033 unchanged: templates only).
4. **ZC-13** "Invite everyone with a Zoho CRM user in sales roles": read the org's Zoho users through the admin's connection (`cloud/zoho/lookup.py`), preview the list (default role agent, seats checked), invite only after the admin confirms; audited.
5. **UX-44c** Disabled Save/Send buttons on Integrations explain why ("Enter a client ID first").
6. **W3-PRACTICE** (owner Q15 → D-073, tracker T-038) Practice call in real accounts: a "Practice" label in the header, one neutral practice script (no company data, not the old Palm Grove samples), never saved to History, Reports, ratings or learning, never uploaded. Add the "Try a practice call" step to `features/home/setup.ts`. The script is data in a new `seed/practice/` file; the one line that ships it in the bundle (`cloud/bundle.py`, owned by `review-owner-platform`) goes in your report (D-058). If a guard is needed in `features/learning/**` or `features/rating/**` (not yours), write the exact line in your report.
7. **W3-INT-EVID** Integrations and practice screenshots light/dark/RTL/390/1280; axe 0 serious.

## Owner inputs
- None blocks this stream. Do not create SMTP, Gallabox or Zoho accounts and do not use the owner's real credentials; tests use fakes (`tests/cloud/fake_smtp.py`, mocked Gallabox transport).

## Owned files
`apps/app/app/admin/integrations.tsx`; `apps/app/features/{email,whatsapp,team}/**`; new `apps/app/features/integrations/**` (new client calls go in a feature-local `api.ts`, not `lib/cloud.ts`); practice: `apps/app/app/call.tsx`, `apps/app/features/call/**`, `apps/app/features/home/**`, `apps/app/lib/deviceHistory.ts`, new `seed/practice/**`; server: `apps/agent-worker/sotto_worker/cloud/{email,gallabox}/**`, `apps/agent-worker/sotto_worker/cloud/zoho/{routes,lookup}.py`, `apps/agent-worker/sotto_worker/adapters/{email,whatsapp}/**`, `apps/agent-worker/{pyproject.toml,uv.lock}` (dnspython only); tests `apps/app/__tests__/{messaging,admin-team,call,call-peek,call-survives-navigation,card-stack,home-first-run,home-meetings,device-history}.test.*`, `apps/app/features/call/**/*.test.*`, new `apps/app/__tests__/{integrations,practice}*.test.tsx`, `apps/agent-worker/tests/cloud/{test_email,test_email_defaults,test_gallabox}.py`, new `apps/agent-worker/tests/cloud/test_{smtp_presets,gallabox_templates,zoho_invite}.py`.

## Out of bounds (ask the master in your report)
Hubs this wave: `cloud/{app,store,bundle,features,auth,mail}.py`, `cloud/features.json`, `lib/{cloud,cloudCompat}.ts`, `admin/_layout.tsx`, `scripts/{a11y,screenshots}.mjs` (`review-owner-platform`); `lib/i18n.ts`, `components/AppShell.tsx` (`review-company-coaching`). Also `cloud/zoho/oauth.py`, `cloud/owner/**`, `features/{keys,prompts,learning,rating,admin,settings}/**`, `features/crm/**` (read-only: use `useZoho`, `ZohoConnect`), `packages/ui/**` (read-only), `apps/desktop/**`, `docs/DECISIONS.md`. New routes are added to your own `routes.py` modules; if a mount line or a store method is missing, write the exact line for the master.

## Acceptance (each item has a test or a screenshot)
- Jest: Integrations shows Zoho → Email → WhatsApp; no Zoho client form; an override shows "Client ID ends …" only.
- SMTP: `gmail.com` / a Google-MX domain → Google preset with only the password field; unknown domain → "Other" with all fields; save runs the test email and shows the result inline; the password is never returned by any API (pytest).
- Gallabox: a valid key fills channel and template pick lists with APPROVED templates only; allow-list defaults to them; unmapped parameters only are shown (pytest with a mocked transport).
- Invite: preview lists Zoho users in sales roles; nothing is sent before confirm; seats are respected; an audit row per invite; company A cannot invite into company B (isolation test).
- Every disabled button on Integrations has a visible reason.
- Practice: header "Practice"; after the call nothing is written to device history, the server, ratings or learning (tests); the first-run step appears and links to the practice call.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `cd apps/agent-worker && uv run pytest`; `(cd apps/desktop && npm test)`; `pnpm a11y` 0 serious (new routes: write the `scripts/a11y.mjs` lines in your report).
- Replay: `pnpm replay --all` if anything on the live path changed (practice touches `features/call`); report p50/p95; p95 > 1500 ms is a failure.
- Screenshots in `docs/evidence/phase9/review-integrations/`: Integrations (Zoho, SMTP preset + test result, Gallabox pick lists, invite preview), practice call — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(integrations): …`, `feat(practice): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-integrations` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds.
- Use `source-driven-development` before calling Gallabox or Zoho endpoints you have not used yet (docs in `docs/REFERENCES.md`).
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-078 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-integrations`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95 if run, screenshot folder) · files outside your list you need touched (exact lines, D-058) · open questions · branch tip SHA.
