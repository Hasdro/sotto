# Child: review-owner-platform (wave 3, T-079) — branch `phase9/review-owner-platform`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (waves 1–2, the redesign D-041 and the owner's answers are there). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/zero-config-2026-11.md` (ZC-01, ZC-06, ZC-10, DD-1, DD-2, DD-6), `docs/design/DESIGN-SYSTEM.md`, REQUIREMENTS R1, R2, R3, R6, R7, R10, and decisions D-019, D-022, D-028, D-036, D-038, D-046, D-057, D-058, D-059, D-061, D-064, D-068. Read the wave-1 `review-copy-brand` and `review-server-core` session-log entries (2026-11-13) in `docs/TRACKER.md`.

**Goal:** AGN runs providers, keys, model routing, prompts, Zoho clients and sign-ups from the owner console; companies just work, and see those screens only when AGN enables "bring your own". Model: main (Opus). Two other children run in parallel (`review-integrations`, `review-company-coaching`); stay inside your files. You own the server hubs this wave (D-058): merge the line requests the master forwards to you only if asked; otherwise list what you changed in them precisely so the master can merge the others.

**Build on waves 1–2:** the owner console (`cloud/owner/`, D-041 styling, kill-switch status table UX-33) and its routes in `cloud/app.py` (`/api/owner/*`, `owner_route`); the feature catalog (`features.json`/`features.py`, D-028/D-036); Zoho DC detection (D-046, `cloud/zoho/oauth.py`); config health (D-057); keys/models/prompts pages in the web admin (D-038, now superseded by D-059).

## Scope (item ids from the backlog)
1. **ZC-01** (D-064) Platform Zoho client per DC family in the owner console (the owner enables multi-DC on the existing client); the server picks the client by the detected DC; a per-org client becomes an owner-console override (write-only, encrypted, "Client ID ends …"). Admin › Integrations stops showing the form (that page is `review-integrations`'s).
2. **ZC-06** Platform circuit breaking: a primary provider failing across tenants is demoted for N minutes for everyone through the 10-minute config refresh (D-036 session config); the client router honours the demotion (`packages/engine/src/router.ts`); an owner health board shows per-provider failures, demotions and their expiry. R2 backup race and the holding line are unchanged.
3. **DD-1** (D-059, D-061) Owner console "Providers and keys" (platform keys, write-only, test, replace, remove, "Get a key" links from `docs/PROVIDER-KEYS.md`) and "Model routing" (per stage, benchmark column, one-click rollback). A platform entitlement `byo_providers` (default off) lets AGN enable company BYO; only then do the web admin's Keys and Models pages show for that company (otherwise `off_by_platform` with the reason, D-028). Do **not** build metering or spend caps: that is ZC-12 in wave 4 (`review-ai-autoconfig`).
4. **DD-2** (D-059) Prompt studio in the owner console with persisted `prompt_versions` (versioned record, variables, test against recordings with quality + latency, publish, one-click rollback; R6). Platform, company, team and campaign levels; the most specific wins; company overrides are owner-only unless BYO is on.
5. **ZC-10** (D-068) Zoho Forms sign-up webhook (shared secret, rate-limited per IP and globally, deduped by email) creates a trial company (14 days, plan defaults) and the first admin invite email; owner "Sign-up queue" lists them with suspend/delete. Check the Zoho Forms webhook docs first (`source-driven-development`). The owner configures the webhook URL in Zoho Forms: list that step in your report.
6. **W3-OWN-A11Y** axe 0 serious on every new owner view (light + dark) via `scripts/a11y.mjs`.

## Owner inputs
- The multi-DC switch in the Zoho API console and the Zoho Forms webhook URL are the owner's steps (list them). Do not create vendor accounts or keys; tests use fakes. No spend: never run `pnpm replay:live`.

## Owned files
`apps/agent-worker/sotto_worker/cloud/owner/**`; hubs `apps/agent-worker/sotto_worker/cloud/{app,store,bundle,features,auth,mail,__main__}.py` and `cloud/features.json` this wave; `apps/agent-worker/sotto_worker/cloud/zoho/oauth.py`; `apps/agent-worker/sotto_worker/{prompts,router}/**`; `seed/models/**`; `packages/engine/src/router.ts` (+ new `router.test.ts`) and `packages/engine/src/__tests__/bundle.json` (regenerated); `apps/app/app/admin/{_layout,keys,models}.tsx`, `apps/app/app/admin/prompts/**`; `apps/app/features/{keys,prompts,webadmin}/**`; hubs `apps/app/lib/{cloud,cloudCompat}.ts` this wave; `scripts/{a11y,screenshots,panels-shots}.mjs`; tests `apps/agent-worker/tests/cloud/{test_owner,test_owner_favicon,test_features,test_accounts,test_isolation,test_security,test_cli,test_zoho_dc,test_engine_fixture}.py`, `apps/agent-worker/tests/{test_router,test_prompt_registry}.py`, new `apps/agent-worker/tests/cloud/test_{owner_providers,owner_prompts,circuit,signup,zoho_multidc}.py`, `apps/app/__tests__/{keys,admin-desktop-tabs}.test.tsx`, `apps/app/features/prompts/studio.test.ts`.

## Out of bounds (ask the master in your report)
`cloud/{email,gallabox}/**`, `cloud/zoho/{routes,lookup}.py`, `adapters/**`, `apps/app/app/admin/integrations.tsx`, `features/{email,whatsapp,team,call,home}/**` (`review-integrations`); `lib/i18n.ts`, `components/AppShell.tsx`, `admin/{settings,instructions,index,features,company}.tsx`, `cloud/learning/**`, `features/{learning,admin,flags,settings,playbook}/**` (`review-company-coaching`); `packages/ui/**` (read-only), `apps/desktop/**`, `apps/landing/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Zoho: an EU-detected user gets the EU-family client; an org override wins; the secret is never returned (pytest).
- Circuit: N failures across two tenants demote the primary for everyone on the next config refresh; it returns after expiry; the router uses the backup first while demoted (pytest + engine test); R2 drill still passes.
- Providers: platform key add/test/replace/remove from the owner console; no key in any API response; with `byo_providers` off, a company admin gets `403 feature_unavailable` `off_by_platform` on key/model/prompt writes and the pages show the reason; with it on, they work (one test per state, R7).
- Prompt studio: create v2, test it on recordings (quality + latency shown), publish, roll back to v1; the next session config carries the published version; isolation test (company A cannot read or change company B prompts).
- Sign-up: a valid webhook creates one trial company and one invite; a replay of the same email creates nothing new; wrong secret 401; rate limit 429; the queue shows it; suspend blocks calls (R3).
- Owner views: axe 0 serious, light and dark.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `pnpm --filter @sotto/engine test`; `cd apps/agent-worker && uv run pytest`; `pnpm a11y` 0 serious.
- **Replay** (router, prompts and model config change): `pnpm gen` then `pnpm replay --all`, report p50/p95; p95 > 1500 ms is a failure.
- Security: run the `security-auditor` and `tenancy-guardian` subagents on keys, sign-up and prompt routes; fix C/H findings.
- Screenshots in `docs/evidence/phase9/review-owner-platform/`: owner Providers and keys, Model routing, Prompt studio, health board, Zoho clients, Sign-up queue; web admin Keys with BYO off — light, dark, 390 px and 1280 px (Arabic RTL for the web admin pages).

## Rules
- Tests first; small conventional commits (`feat(owner): …`, `feat(router): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-owner-platform` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds. No model names or prompt text in application code (seed and registry only).
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging. Schema changes must migrate the existing `cloud.db` in place (no data loss); say so in the report.
- Tracker: change only the T-079 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-owner-platform`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95, screenshot folder) · hub lines you changed and files outside your list you need touched (exact lines) · owner steps and open questions · branch tip SHA.
