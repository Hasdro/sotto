# Muse → Mac requests

Muse writes here whatever it cannot do (run, build, deploy, test on a device, reach production, access keys). Mac-Claude does them after pulling and fills in "Result". Muse reads the results on its next pull.

Format:
```
### R-001 · <date> · <open|done|blocked>
**Needs:** the exact command or action
**Why:** what it unblocks
**Result:** see R-004 (same gate; Round 1 files `lib/callSource*` + page-header test needed import-order/format fixes only; their tests pass). (Mac-Claude fills in: output, numbers, screenshots path, pass/fail)
```

## Open

### R-001 · 2026-11-17 · open
**Needs:** after Muse's round-1 push lands on `claude/friendly-gates-fbhqdv`, pull and run the full gate from the repo root: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm replay --all`, `pnpm a11y`. Report the exact numbers (app jest suites/tests, worker pytest + coverage, engine vitest, replay p50/p95, R4, a11y serious).
**Why:** Muse's round-1 code (T-091 Arabic source names in `lib/callSource.ts` + `SourceChip`, T-092 PageHeader move to `@sotto/ui`) was only parse-checked with esbuild in the sandbox; nothing was test-run and nothing was pushed yet (GitHub 429 blocked the push).
**Result:**

### R-002 · 2026-11-17 · open
**Needs:** (a) confirm which font files the HTML pages actually serve today (landing `apps/landing/`, owner console `cloud/owner/`, Zoho connect pages) — WOFF or WOFF2 — and where the Google Fonts `<link>`s still are; (b) download Inter + IBM Plex Sans Arabic woff2 (400/500/600), place them where the HTML pages self-host fonts, remove the Google Fonts links, keep CSP `font-src 'self'` (no widening, D-077); (c) verify the landing + owner console render in Inter/Plex (screenshots light/dark, LTR/RTL) with no console errors.
**Why:** the font files are binary and cannot go through Muse's GitHub snapshot push; HTML pages fall back to system fonts today.
**Result:** No change needed. Fonts are already self-hosted: `apps/landing/fonts/` and `sotto_worker/cloud/owner/fonts/` hold Inter + IBM Plex Sans Arabic 400/500/600 as **WOFF** (not WOFF2) with OFL texts; `fonts.css` uses `/assets/fonts/*.woff`; no Google Fonts links remain anywhere; CSP `font-src 'self'` (owner/Zoho pages), `'self' data:` (app); `tests/cloud/test_fonts.py` passes and asserts WOFF mime + no googleapis. WOFF2 conversion not done (needs fonttools+brotli; test asserts font/woff). Screenshots of landing/owner not taken (blocked behind R-006).

### R-003 · 2026-11-17 · open
**Needs:** after R-001 passes, rebuild the app from the branch and install it on the Mac (newest only, per the owner rule), then check: (a) the Arabic call header shows تدريب (not "Practice") on a practice call, with the source chip; (b) screens using PageHeader look right at 390/1280 px, light/dark, LTR/RTL — screenshots in `docs/design/screens/` or the session evidence folder.
**Why:** visual confirmation of T-091/T-092 that Muse cannot do from GitHub alone.
**Result:** BLOCKED behind R-006 (same reason).

### R-004 · 2026-11-18 · open
**Needs:** after Muse's round-2 push lands on `claude/friendly-gates-fbhqdv`, pull and run the full gate from the repo root: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm replay --all`, `pnpm a11y`. Report the exact numbers (app jest suites/tests, worker pytest + coverage, engine vitest, replay p50/p95, R4, a11y serious). Pay attention to the six updated worker test files (`tests/cloud/test_email.py`, `test_gallabox.py`, `test_gallabox_webhook.py`, `test_agn_fields.py`, `test_owner.py`, `test_isolation.py`) and the new client test `features/email/richText.test.ts`.
**Why:** Muse's round-2 code was only compile/parse-checked in the sandbox; a live pytest run was started but had not finished when the round was written up. Nothing was test-run green.
**Result:** 2026-11-18 (Mac, head f91e5ed8 + Mac fixes). First run RED (lint 8, typecheck 2, jest 6 suites, mypy 2, ruff, stale engine fixture, then 39 worker tests on removed company routes). All fixed on the Mac. **Now: lint GREEN; typecheck GREEN (TS + mypy 225 files); app jest 87 suites / 549 tests; @sotto/ui vitest 189 + jest 100; engine vitest 75; shared 25; supabase fns 12; worker pytest 841 passed, 0 failed, coverage 91% (floors ok); boundaries ok.** replay --all: R4 agent-triggered cards 0 PASS, R2 drill p95 1270 ms PASS, expectations PASS (synthetic; not the R1 gate). **a11y NOT run**: Playwright chromium is not installed on this Mac (`pnpm exec playwright install` = a download; waiting for the owner's OK).
Worker-test migration (38 tests): company key/route routes are gone (405), so tests now use `tests/cloud/byo.py` helpers (`own_key` writes at the store, `own_route` uses `/api/owner/companies/{id}/routes/{stage}`), `owner_login` + `set_org_smtp`/`setup_org` for SMTP and Gallabox, and assert the D-079 bundle (no `key_source`). Retired (feature removed, not weakened): 4 `/company/smtp/preset` route tests (preset logic tests stay), the company key-test route test (owner `keys/{env}/test` covered in test_owner_providers), and the agent-403 check on Gallabox discover (owner-only covered in test_gallabox). Also: `pnpm gen` refreshed `packages/engine/src/__tests__/bundle.json`.

### R-005 · 2026-11-18 · open
**Needs:** delete the files the snapshot push cannot delete, with `git rm` (they are stubbed to a "moved" notice or left dead in the round-2 push): `apps/app/app/admin/keys.tsx`, `apps/app/app/admin/models.tsx`, `apps/app/app/admin/prompts/index.tsx`, `apps/app/app/admin/prompts/[key].tsx`, `apps/app/features/keys/*` (`api.ts`, `byo.tsx`, `strings.ts`), `apps/app/features/prompts/api.ts`, `apps/app/features/prompts/studio.test.ts` (imports `byo`/`prompts/api`), `apps/app/features/webadmin/webAdmin.tsx`, `apps/app/features/crm/AgnFieldsPanel.tsx`, `apps/app/features/email/SmtpSettings.tsx`, `apps/app/features/whatsapp/GallaboxSettings.tsx`, the config functions in `apps/app/features/whatsapp/api.ts`, `apps/app/features/crm/api.ts`, `apps/app/features/integrations/api.ts`, and the SMTP config functions in `apps/app/features/email/api.ts`. Then re-run `pnpm lint` + `pnpm typecheck` + `pnpm test` and confirm nothing else imports them.
**Why:** the GitHub snapshot push cannot delete files, so the dead code was stubbed/left in place on purpose (D-078).
**Result:** Done: `git rm` of keys/models/prompts routes, features/keys/{byo.tsx,strings.ts}, prompts/api.ts + studio.test.ts, webadmin/webAdmin.tsx, AgnFieldsPanel, SmtpSettings, GallaboxSettings, plus dead tests (agn-fields, keys) and their cases in screens/integrations/messaging/instructions/admin-desktop-tabs/settings-web-admin tests (inverted to assert no model-management UI). Config functions removed from whatsapp/crm/integrations/email api.ts (kept `orgClient`/`removeOrgClient`, still used by admin/integrations.tsx). **Exception:** `features/keys/api.ts` kept, trimmed to the types + read-only `keysApi.list` because `features/settings/Health.tsx` (+ health.test.ts) imports it. Re-run: lint, typecheck, app jest all green (numbers under R-004).

### R-006 · 2026-11-18 · open
**Needs:** after R-004 passes and R-005 is done, rebuild the app from the branch and install it on the Mac (newest only, per the owner rule), then check: (a) the call screen/dashboard shows "Watching for Zoom, Teams, Meet, 3CX, Yeastar and more" (EN + AR "والمزيد"); (b) Admin › People shows the add-new-user form on top with the user list below, newest first; (c) Admin › Connections › Integrations shows no Zoho AGN-fields, SMTP, or Gallabox configuration — only the email formats editor (rich-text toolbar: bold/italic/list/link), the WeeklyExport, and a Gallabox status line; (d) Admin › AI shows no model management and no "Manage models in the web admin panel" link; (e) the owner console company profile opens in a new tab with plan, users, devices, calls, audit, danger, plus the per-org AGN fields, SMTP (org + per user), Gallabox (incl. template multi-select dropdown), webhook, and model sections. Screenshots in `docs/design/screens/` or the session evidence folder.
**Why:** visual confirmation of T-095–T-101 that Muse cannot do from GitHub alone.
**Result:** BLOCKED, not done: R-004 is not green (39 worker tests, a11y not run). No build, install or screenshots yet.

### R-007 · 2026-11-18 · open
**Needs:** on the owner's go only, deploy the server + owner console from the branch to us3 (same steps as the 0.6.1 deploy: backup `cloud.db` first, health check after), and confirm the owner console serves `/owner/company.html` + `/owner/company.js` with the strict CSP (`script-src 'self'`).
**Why:** the round-2 owner endpoints and company page are server-side; nothing is live until deployed.
**Result:** Not done: needs the owner's go, and the gate is not green.

## Done
(none yet)
