# Child: review-copy-brand (wave 1, T-073) — branch `phase9/review-copy-brand`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section), `docs/reviews/ux-critique-2026-11.md` (the items below), REQUIREMENTS R7 and R8, D-026, D-028, D-036, D-038.

**Goal:** no engineering words, no old brand and no self-contradicting flags anywhere a customer or the Zoho partner looks; the landing page tells the Zoho story. Model: **sonnet** (mechanical, well-specified). Two other children run in parallel (`review-ui-core`, `review-server-core`); stay inside your files.

## Scope (item ids from the backlog)
1. **UX-06b** Change the values (en + ar) of `call.offline.*`, `call.notInThisBuild.*`, the phone "Phase 4" line, and every user-facing `pnpm demo` mention: e.g. offline = "Sales Shield can't reach its call engine. Restart the app; if it keeps happening, contact your admin." No "Phase", no commands. Keep keys; change values. (`call.mode.fake` is no longer rendered after `review-ui-core`; leave the key.)
2. **UX-42** Product voice for `call.connecting.*`, `call.error.*` and other empty/loading/error strings: "Connecting…", "Something went wrong with this call. Your notes are saved. Try again." Never "demo", "server" or "log" in agent-facing strings (an admin-only Health page may say "server").
3. **UX-08** Owner console: `<title>` and header "AGN Sales Shield · Owner"; no "Sotto" left in `cloud/owner/**` user-facing text; extend the R8 grep test (`packages/ui/src/brand/userFacingName.test.ts`) to cover `apps/agent-worker/sotto_worker/cloud/owner/`. Re-shoot Admin › Features and owner Features evidence.
4. **UX-09** (+ ZC B11) Admin › Features: a feature off by platform/plan shows a **disabled, off** switch with the reason as its label; shipped features (`zoho`, `zoho_actions`, `email_send`, `gallabox`, `whatsapp`, ratings/learning, …) have `built: true` so "Coming in a later version" never shows for them; header copy matches what is listed; plumbing rows (e.g. separate `integrations`, `zoho`/`gallabox` vs `whatsapp`) hidden from the org page with plain customer names (6–8 rows). Server enforcement (D-036) unchanged.
5. **UX-33** Owner console kill switch: a table of features with a status column ("Live" / "Killed since 12 Nov"), a destructive "Turn off for everyone" button with a confirm dialog and a "Turn back on"; entitlements table with a sticky first column and sentence-case headers.
6. **UX-44b** `scripts/a11y.mjs` also runs axe on the owner console pages (overview, companies, features, audit, account) in light and dark; 0 serious/critical.
7. **UX-28** History: "Your calls" instead of "Calls on this server"; sample calls only as an empty-state link ("No calls yet — open a sample call to see what a review looks like"), never mixed into real history.
8. **UX-34** Desktop Admin › Settings: one row "AI models are managed in the web admin" with an "Open web admin" button (uses the existing web-admin link helper).
9. **UX-36** Landing: replace the three "Screenshot slot" boxes with real images from `docs/evidence/phase9/**` (call card cropped at 1280, after-call actions; copy into `apps/landing/`), read versions from `downloads.json` at runtime (no hard-coded 0.2.0), fixed-height form skeleton "Loading the form…" + mailto fallback, rename the "not code-signed yet" heading to "First open on Mac and Windows" (steps kept).
10. **UX-37** Landing: replace "Your company, your settings" with "Works with Zoho CRM: prepares from your meeting, saves after your approval"; a text badge "Works with Zoho CRM" near the hero CTA (no Zoho logo).
11. **UX-38** Landing CTA: detect the platform; button "Download for Mac" / "Download for Windows"; small line "Apple silicon · Intel Mac · Windows" linking the others. en + ar (`apps/landing/i18n.js`).

## Owned files
`apps/app/lib/i18n.ts` (values of existing keys, en + ar; new keys only for your items), `apps/app/features/flags/**`, `apps/app/app/admin/features.tsx`, `apps/app/app/admin/settings.tsx`, `apps/app/app/history/index.tsx`, `apps/agent-worker/sotto_worker/cloud/owner/**`, `apps/agent-worker/sotto_worker/cloud/features.json`, `apps/agent-worker/sotto_worker/cloud/features.py`, `packages/ui/src/brand/**`, `scripts/a11y.mjs`, `apps/landing/**`, tests `apps/app/__tests__/{feature-gate,no-samples,history-server,i18n}.test.*`, `apps/agent-worker/tests/cloud/{test_owner,test_features}.py`.
Exception: if one of your string changes breaks a literal assertion in a test file you do not own, you may change **only that literal line**; list each such line in your report.

## Out of bounds
`packages/ui/src/**` outside `brand/`, `apps/app/app/call.tsx`, `apps/app/features/call/**`, `apps/app/features/rating/**` (owned by `review-ui-core`); `cloud/{app,store,auth,bundle}.py`, `cloud/zoho/**`, `apps/desktop/**`, `seed/**` (owned by `review-server-core`); `apps/app/app/admin/{_layout,integrations,instructions,keys}.tsx`; `docs/DECISIONS.md`; anything under `deploy/` — do not publish the landing page.

## Acceptance
- Grep test: no "Phase 4", "pnpm demo", "Fake AI", "dev only" in any en/ar value that an agent sees; no user-facing "Sotto" in `cloud/owner/**` (R8 test covers it and fails on a planted string).
- Features page jest: off_by_platform → switch disabled + off + reason label; a `built: true` feature never shows "later version"; hidden plumbing rows not rendered. `tests/cloud/test_features.py` still passes every state (R7).
- Owner console: kill test (pytest or DOM test) — turning off asks for confirmation and writes the audit row; status column shows the kill date.
- `pnpm a11y` includes `/owner` routes, 0 serious.
- History jest: real account with zero calls → empty state with the sample link; no sample rows mixed with real ones.
- Landing: no "Screenshot slot", version text equals `downloads.json`; axe 0 serious on the landing page (existing check); CTA label per platform.

## Evidence
`pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`; parallel sessions overload the machine); `cd apps/agent-worker && uv run pytest -q tests/cloud/test_owner.py tests/cloud/test_features.py`; `pnpm a11y`. Screenshots in `docs/evidence/phase9/review-copy-brand/`: Features (admin + owner), History empty state, landing — light, dark, Arabic RTL, 390 px and 1280 px. No live-path change → no replay needed (say so).

## Rules
- Tests first; small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-copy-brand` about every 45 minutes.
- **Do not deploy, do not publish the landing page, do not touch us3, do not build the Mac app** — the master does that.
- Tracker: only the T-073 line (state + one evidence line) and a session-log entry `### <date> · local · <model> · phase9/review-copy-brand`. Do not edit Now.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, a11y, screenshot folder) · lines changed in files you do not own · open questions · branch tip SHA.
