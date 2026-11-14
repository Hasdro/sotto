# Child: review-ai-autoconfig (wave 4, T-083) — branch `phase9/review-ai-autoconfig`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (wave 3 must be merged there, especially T-079 `review-owner-platform`; if T-078…T-080 are not all `[x]` in `docs/TRACKER.md`, stop and tell the master). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/zero-config-2026-11.md` (ZC-04, ZC-05, ZC-12, DD-3), REQUIREMENTS R1, R2, R6, and decisions D-019, D-021, D-022, D-025, D-036, D-058, D-059, D-060, D-061, D-063, D-066, D-067. Read the T-079 and T-080 session-log entries in `docs/TRACKER.md`.

**Goal:** a new company gets a draft playbook without typing, AGN keeps the best-performing models on each stage without hand edits, and AGN's shared keys are rotated, metered and capped per company. Model: main (Opus). Two other children run in parallel (`review-followup-automation`, `review-zoho-scopes`); stay inside your files. You own `cloud/bundle.py`, `cloud/owner/**`, `packages/engine/**` and root `package.json` scripts this wave (D-058).

**Build on waves 1–3:** owner console Providers and keys, Model routing with benchmark column and rollback, prompt studio, circuit breaking (T-079); the consent record and "primary vendors only" (T-080, D-063); the router and registry (`sotto_worker/{router,prompts}`, `packages/engine/src/router.ts`); the synthetic replay (`apps/agent-worker/replay/`); learning extraction runs in the client (`features/learning/learn.ts`) — follow that pattern for model calls (D-022) unless you show a reason not to (then draft a decision in your report).

## Scope (item ids from the backlog)
1. **ZC-04** (D-066) Playbook bootstrap from Zoho (read-only through `cloud/zoho/lookup.py`), the company website and a pasted document into "needs review" entries; only after the company's consent record exists (D-063); a new `playbook_bootstrap` prompt in `seed/prompts/` through the registry and router; entries never answer on a call until a manager approves them; website fetch limited to the company's own domain, https, size and time caps, no private addresses (SSRF test).
2. **ZC-05** (D-067) Benchmark-based routing job: weekly, scores candidate models per stage, stages the winner, canaries it on AGN's demo org, rolls back on a worse p95 or quality; R6 "only a model whose last benchmark meets R1" holds; the replay is the evidence. **Golden calls (P0.5) do not exist yet:** build and test the job on the synthetic set, keep it off, and show "Waiting for golden calls" in the owner console.
3. **ZC-12** (D-061, DD-3) Key rotation without a release (add next key, mark the old one retiring, clients switch on the 10-minute config refresh; no key in any response); per-tenant sub-keys or short-lived tokens where the vendor offers them (research each vendor in `seed/models/providers.yaml` with `source-driven-development`; note which offer none); per-company metering from client-reported usage; per-company spend caps with an 80 % alert to the owner.
4. **W4-COST** (D-060) Cost-per-minute estimate: a seed price table `seed/models/prices.yaml` (vendor, unit, price, source URL, date checked) and `pnpm cost:estimate` that turns the synthetic replay's token and audio counts into cost per call minute per stage, labelled "estimate".

## Budget settings (the owner sets the values; no default spend)
- **`routing.monthly_cap_usd`** (D-067): owner console setting, **no default**. While unset the routing job does not run and the console says "Set a monthly cap to enable".
- **Per-company spend cap** (D-061): owner console per company, **no default**. While unset, metering is recorded but no cap or 80 % alert applies, and the console marks the company "Cap not set".
- Never run `pnpm replay:live` or any paid call: the live cost estimate is the owner's step. Put both setting names and the live-estimate step in your report.

## Owned files
New `apps/agent-worker/sotto_worker/cloud/{bootstrap,routing,metering}/**` (own tables in their own store modules, pattern of `learning/store.py`); `apps/agent-worker/sotto_worker/cloud/owner/**`; hub `apps/agent-worker/sotto_worker/cloud/bundle.py` this wave; `apps/agent-worker/sotto_worker/{router,prompts}/**`; `apps/agent-worker/replay/**`; `seed/models/**`, new `seed/prompts/playbook_bootstrap.md`; `packages/engine/src/**` (incl. `__tests__/bundle.json`, regenerated); root `package.json` (scripts only); `apps/app/app/playbook.tsx`, `apps/app/features/playbook/**`, new `apps/app/features/bootstrap/**`; tests `apps/agent-worker/tests/{test_replay,test_router,test_prompt_registry,test_live_replay,test_seed}.py`, `apps/agent-worker/tests/cloud/{test_owner,test_engine_fixture}.py`, new `apps/agent-worker/tests/cloud/test_{bootstrap,routing_job,metering,key_rotation}.py`, `packages/engine/src/**/*.test.ts`, `apps/app/__tests__/playbook-editor.test.tsx`, new `apps/app/__tests__/bootstrap*.test.tsx`.

## Out of bounds (ask the master in your report)
Hubs `cloud/{app,store,features,auth}.py`, `cloud/features.json`, `admin/_layout.tsx`, `lib/{cloud,cloudCompat,desktop}.ts`, `apps/desktop/**`, `cloud/{scheduler,email,gallabox}/**` (`review-followup-automation`: route mounts, feature entries such as `playbook_bootstrap`, store hooks and the weekly routing job registration go in your report); `cloud/zoho/**`, `adapters/crm/**`, `features/{crm,actions}/**`, `components/HealthBanner.tsx` (`review-zoho-scopes`; `lookup.py` read-only); `lib/i18n.ts`, `components/AppShell.tsx` (master; strings in feature-local `strings.ts`); `adapters/llm/**` and `adapters/stt/**` (ask first: a vendor token call belongs there), `packages/ui/**` (read-only), `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Bootstrap: refused without a consent record; entries land as "needs review" and are never used on a call before approval; a private-address or off-domain URL is refused (SSRF test); company isolation test.
- Routing: on the synthetic set the job picks the faster model that meets R1, stages it, canaries on the demo org only, rolls back on a worse p95; with `routing.monthly_cap_usd` unset it does not run (test).
- Rotation: a new key is used after the next config refresh with no release; the retiring key stops after its window; no key in any API response.
- Metering: usage is attributed to the right company; with a cap set, 80 % sends one owner alert and 100 % applies the cap behaviour documented in your report; with no cap, nothing is enforced and the console shows "Cap not set".
- Cost estimate: `pnpm cost:estimate` prints cost per minute per stage from the price table, each row citing its source.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `pnpm --filter @sotto/engine test`; `cd apps/agent-worker && uv run pytest`; `pnpm a11y` 0 serious.
- **Replay** (router, prompts and model config change): `pnpm gen` then `pnpm replay --all`, report p50/p95 and R4 0; p95 > 1500 ms is a failure. Include the cost-estimate output.
- Security: run the `security-auditor`, `tenancy-guardian` and `latency-guardian` subagents (keys, metering, router); fix C/H findings.
- Screenshots in `docs/evidence/phase9/review-ai-autoconfig/`: bootstrap review queue, owner routing job (waiting for golden calls / cap unset), key rotation, per-company spend — light, dark, Arabic RTL (app pages), 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(routing): …`, `feat(metering): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-ai-autoconfig` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds. No model names or prompt text in application code.
- **No spending, no vendor accounts, no sub-keys created on real vendor accounts.** **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging. Schema changes migrate `cloud.db` in place.
- Tracker: change only the T-083 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-ai-autoconfig`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95, cost estimate, screenshot folder) · files outside your list you need touched (exact lines, D-058) · owner settings to fill (cap names) and open questions · branch tip SHA.
