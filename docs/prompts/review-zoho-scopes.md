# Child: review-zoho-scopes (wave 4, T-082) — branch `phase9/review-zoho-scopes`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (wave 3 must be merged there; if T-078…T-080 are not all `[x]` in `docs/TRACKER.md`, stop and tell the master). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/integrations-playbook-2026-11.md` (INT-02, INT-04, INT-06, INT-12, INT-16), `docs/REFERENCES.md` § Zoho CRM, `docs/design/DESIGN-SYSTEM.md`, REQUIREMENTS R10, R12, and decisions D-031, D-044, D-046, D-047, D-048, D-056, D-058, D-064, D-069, D-072.

**Goal:** one reconnect gives AGN everything it needs in Zoho: next-step Tasks, a read-only Blueprint checklist, AGN's own Deal fields, campaign attribution and a weekly export — and Stage/Amount can never be written. Model: main (Opus). Two other children run in parallel (`review-followup-automation`, `review-ai-autoconfig`); stay inside your files.

**Build on waves 1–3:** per-user OAuth with DC detection (`cloud/zoho/oauth.py`, D-046) and the multi-DC platform client (T-079, D-064); the after-call checklist (`features/actions/`, D-044: nothing pre-ticked, each row its own approval, idempotent write and audit row); the call-log Note (D-047); the brief with stage guidance (D-048, `seed/prompts/crm_brief.md`); config health (D-057).

## Scope (item ids from the backlog)
1. **W4-SCOPES** (D-069) One scope bundle in `oauth.py` for every new scope: Tasks, Blueprint/layout read, `settings.fields` (create AGN fields), Campaigns read, and `ZohoCRM.notifications.ALL` for T-081's INT-13. A connection with an older scope set shows one reconnect prompt (health reason `zoho_scopes_outdated`; the store line goes in your report since `store.py` is T-081's hub this wave; the label and fix link in `components/HealthBanner.tsx` are yours). Verify every scope name against the Zoho v8 docs first (`source-driven-development`).
2. **INT-02t** Next-step Task (`tasks.CREATE`) as a checklist row, prefilled from the review, agent-confirmed (due date, owner), idempotent, audited.
3. **INT-04** (D-056) Blueprint read-only checklist in the rail ("to move to X you still need …") for the linked Deal; may suggest a Note; never executes a transition (test).
4. **INT-06** (D-069) Allow-listed AGN custom fields on Deals (score, chance band, top objection, last call date): an admin action "Create AGN fields in Zoho" with a preview and confirmation (creates only missing fields, never changes existing ones); writes only those fields, as a checklist row with its own approval. **Stage and Amount stay blocked by test** (R12): the API rejects any Deal write outside the allow-list.
5. **INT-16c** Campaign module read for attribution in the brief (campaign name, type, status); replay after the `crm_brief` change (D-048, ≤ 150 tokens).
6. **INT-12** (D-072) Weekly CSV export (scores, counts, categories, Zoho ids; no transcript text) for Zoho Analytics: on-demand download for admins now, plus a named weekly job hook that T-081's scheduler registers (put the hook name in your report). No live push.

## Owner inputs
- None blocks this stream. Every agent reconnects once after release: list the release note line for the owner. Do not create fields in a real Zoho org; tests use a mocked transport. The owner's org is checked by the master after merge.

## Owned files
`apps/agent-worker/sotto_worker/cloud/zoho/{__init__,oauth,actions,lookup,routes}.py`; `apps/agent-worker/sotto_worker/adapters/crm/**`; new `apps/agent-worker/sotto_worker/cloud/export/**`; `seed/prompts/crm_brief.md`; `apps/app/features/{crm,actions}/**`; `apps/app/features/call/components/CrmRail.tsx`; `apps/app/app/admin/integrations.tsx`; `apps/app/components/HealthBanner.tsx`; tests `apps/app/__tests__/{zoho-actions,crm-rail,health-banner}.test.tsx`, `apps/app/features/crm/**/*.test.*`, new `apps/app/__tests__/{zoho-scopes,blueprint,agn-fields,export}*.test.tsx`, `apps/agent-worker/tests/cloud/{test_zoho,test_zoho_actions,test_zoho_meetings,test_zoho_dc,test_call_log,test_brief_stage,test_context}.py`, `apps/agent-worker/tests/adapters/**` (crm), new `apps/agent-worker/tests/cloud/test_{zoho_scopes,zoho_tasks,blueprint,agn_fields,campaigns,export}.py`.

## Out of bounds (ask the master in your report)
Hubs `cloud/{app,store,features,auth}.py`, `cloud/features.json`, `admin/_layout.tsx`, `lib/{cloud,cloudCompat,desktop}.ts`, `apps/desktop/**`, `cloud/zoho/webhooks.py`, `cloud/{email,gallabox,scheduler}/**`, `features/{email,whatsapp,review,home,followup}/**`, `features/call/components/EndedView.tsx` (`review-followup-automation`: route mount lines, feature entries and store lines go in your report; client calls go in `features/crm/api.ts`); `cloud/{bootstrap,routing,metering,owner}/**`, `cloud/bundle.py`, `packages/engine/**` (`review-ai-autoconfig`); `lib/i18n.ts`, `components/AppShell.tsx` (master; strings in feature-local `strings.ts`); `packages/ui/**` (read-only), `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- An old-scope connection shows exactly one reconnect prompt; after reconnect every new feature is available; the requested scope string matches the bundle (pytest).
- Task row: cannot be ticked before the due date and owner are confirmed; one Task per call and kind on retry; audited.
- Blueprint: the checklist shows the missing fields for the next transition; no request to a transition endpoint exists in the code path (test).
- AGN fields: create only missing fields after confirm; writes limited to the allow-list; a request carrying `Stage` or `Amount` (or any non-allow-listed field) is rejected (pytest, R12).
- Campaigns: name/type/status in the brief; replay p95 ≤ 1500 ms.
- Export: CSV has the documented columns, no transcript text (test), only the caller's company (isolation test).

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `cd apps/agent-worker && uv run pytest`; `pnpm a11y` 0 serious.
- **Replay** (crm_brief changed): `pnpm gen` then `pnpm replay --all`, report p50/p95 and R4 0; p95 > 1500 ms is a failure.
- Security: run the `security-auditor` and `tenancy-guardian` subagents on the Zoho writes and the export; fix C/H findings.
- Screenshots in `docs/evidence/phase9/review-zoho-scopes/`: reconnect prompt, Task row, Blueprint checklist, AGN fields preview, export — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(zoho): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-zoho-scopes` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds.
- **Do not deploy, do not touch us3, do not build or install the Mac app**, do not write to a real Zoho org — the master does that after merging.
- Tracker: change only the T-082 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-zoho-scopes`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95, screenshot folder) · files outside your list you need touched (exact lines, D-058) · open questions · branch tip SHA.
