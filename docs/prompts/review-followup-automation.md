# Child: review-followup-automation (wave 4, T-081) — branch `phase9/review-followup-automation`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (wave 3 must be merged there; if T-078…T-080 are not all `[x]` in `docs/TRACKER.md`, stop and tell the master). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/integrations-playbook-2026-11.md` (INT-08, INT-09, INT-10, INT-13, INT-14), `docs/design/DESIGN-SYSTEM.md`, REQUIREMENTS R10, R12, and decisions D-022, D-031, D-032, D-033, D-045, D-055, D-058, D-069, D-070, D-071. Read the T-076 (post-call) and T-078 (integrations) session-log entries in `docs/TRACKER.md`.

**Goal:** after the call the agent sets a follow-up plan once and the app reminds them at each step; nothing is ever sent without their tap. Model: main (Opus). Two other children run in parallel (`review-zoho-scopes`, `review-ai-autoconfig`); stay inside your files. You own the server hubs `cloud/{app,store,features}.py`, `cloud/features.json`, `admin/_layout.tsx`, `lib/{cloud,cloudCompat,desktop}.ts` and `apps/desktop/**` this wave (D-058): list every hub line you change so the master can merge the other two streams' requests.

**Build on waves 1–3:** the one follow-up card (D-045, `features/review/FollowUp.tsx`), `EndedView.tsx`, email formats with static blocks (`cloud/email/`, D-032), Gallabox templates pick lists and allow-list (T-078), the desktop bridge (`apps/desktop/preload.cjs`, `lib/desktop.ts`), the coaching digest hook left by T-080 (wire it to your scheduler).

## Scope (item ids from the backlog)
1. **INT-08** (D-055) Follow-up plan (email day 0 → WhatsApp template day 2 → reminder): an in-process scheduler in the management server (no new dependency; survives a restart by reading due steps from SQLite; one runner per process); each due step creates a desktop notification that opens the prepared step; one tap sends after the usual preview (R12). Never auto-sends. The agent can pause or cancel a plan. Also register the T-080 weekly coaching digest and T-082's weekly CSV export as jobs (hooks named in their reports).
2. **INT-09** (D-070) Meeting reminders (UTILITY template) behind an org flag, **default off**; one tap per reminder; no standing approval.
3. **INT-10** (D-071) Gallabox status webhook: HMAC-verified, stores sent/delivered/read/failed per sent message, **no message text**; feature flag off by default until the owner confirms the Gallabox plan has webhooks.
4. **INT-13** Zoho Notifications watch for Deals/Events changes per connection, a renewal job before expiry, brief refresh on change. The `ZohoCRM.notifications.ALL` scope is added to the one scope bundle by `review-zoho-scopes` (D-069); until a connection has it, the feature is `needs_connection`. Verify the watch API against Zoho v8 docs first (`source-driven-development`).
5. **INT-14b** Admin-curated attachment list for follow-up emails (no agent uploads): type allow-list, size cap, per-company storage with an isolation test; a new Admin › Connections › Attachments page (entry in `admin/_layout.tsx`, yours this wave).

## Owner inputs
- **Gallabox webhooks (D-071):** depends on AGN's Gallabox plan (Essential/Advanced). Build it off by default; list "confirm plan, then set the webhook URL and secret in Gallabox" as an owner step.
- The Zoho Notifications endpoint must be reachable from Zoho: list the production URL step for the master; do not touch us3.

## Owned files
New `apps/agent-worker/sotto_worker/cloud/scheduler/**`; `apps/agent-worker/sotto_worker/cloud/gallabox/**` (incl. new `webhook.py`); new `apps/agent-worker/sotto_worker/cloud/zoho/webhooks.py`; `apps/agent-worker/sotto_worker/cloud/email/**` (incl. new `attachments*`); `apps/agent-worker/sotto_worker/adapters/{email,whatsapp}/**`; hubs `apps/agent-worker/sotto_worker/cloud/{app,store,features,auth,mail,__main__}.py` and `cloud/features.json` this wave; new `apps/app/features/followup/**`; `apps/app/features/{email,whatsapp,review,home}/**`; `apps/app/features/call/components/EndedView.tsx`; new `apps/app/app/admin/attachments.tsx`; hubs `apps/app/app/admin/_layout.tsx`, `apps/app/lib/{cloud,cloudCompat,desktop}.ts`; `apps/desktop/**` (notifications); `seed/prompts/followup.md`; tests `apps/app/__tests__/{messaging,home-first-run,home-meetings,feature-gate}.test.*`, new `apps/app/__tests__/{followup-plan,attachments}*.test.tsx`, `apps/desktop/test/**`, `apps/agent-worker/tests/cloud/{test_gallabox,test_email,test_email_defaults,test_features}.py`, new `apps/agent-worker/tests/cloud/test_{scheduler,followup_plan,meeting_reminders,gallabox_webhook,zoho_watch,attachments}.py`.

## Out of bounds (ask the master in your report)
`cloud/zoho/{oauth,actions,lookup,routes}.py`, `adapters/crm/**`, `cloud/export/**`, `features/{crm,actions}/**`, `features/call/components/CrmRail.tsx`, `admin/integrations.tsx`, `components/HealthBanner.tsx`, `seed/prompts/crm_brief.md` (`review-zoho-scopes`; call `cloud/zoho/lookup.py` read-only for the brief refresh); `cloud/{bootstrap,routing,metering,owner}/**`, `cloud/bundle.py`, `seed/models/**`, `replay/**`, `router/**`, `packages/engine/**`, `features/playbook/**` (`review-ai-autoconfig`); `lib/i18n.ts`, `components/AppShell.tsx` (master this wave: strings go in feature-local `strings.ts`); `packages/ui/**` (read-only), `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Scheduler: a due step fires once after a restart (no duplicate); a cancelled plan fires nothing; time is injected (fake clock), no real sleeps in tests.
- No send path exists without an explicit agent tap: tests assert the scheduler alone never calls the SMTP or Gallabox adapter (R12, D-033); every send is audited and idempotent.
- Meeting reminders: flag off by default; on, each reminder waits for its own tap; only allow-listed templates.
- Gallabox webhook: bad HMAC 401; valid → status stored; no message text column or field anywhere (test); company A cannot read company B statuses.
- Zoho watch: subscription created per connection with the scope, renewed before expiry, a change refreshes the attached brief; without the scope `needs_connection`.
- Attachments: only allow-listed types and size; agents cannot upload; company isolation test; the follow-up email lists the chosen attachment, and the "attached" warning (UX-22) clears.
- Desktop: notification opens the right step (desktop test).

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `cd apps/agent-worker && uv run pytest`; `(cd apps/desktop && npm test)`; `pnpm a11y` 0 serious.
- Replay: `pnpm replay --all` if `seed/prompts/followup.md` or anything on the live path changed; report p50/p95; p95 > 1500 ms is a failure.
- Security: run the `security-auditor` and `tenancy-guardian` subagents on the webhooks, scheduler and attachments; fix C/H findings.
- Screenshots in `docs/evidence/phase9/review-followup-automation/`: plan setup, notification → step, reminders setting, attachments page, message status — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(followup): …`, `feat(scheduler): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-followup-automation` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds.
- **Do not deploy, do not touch us3, do not build or install the Mac app**, do not register webhooks on real Zoho or Gallabox accounts — the master and owner do that after merging. Schema changes migrate `cloud.db` in place.
- Tracker: change only the T-081 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-followup-automation`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95 if run, screenshot folder) · hub lines you changed and files outside your list you need touched (exact lines) · owner steps and open questions · branch tip SHA.
