# Child: review-company-coaching (wave 3, T-080) — branch `phase9/review-company-coaching`

Follow `docs/prompts/common.md`. **First:** `git fetch origin && git merge origin/claude/friendly-gates-fbhqdv` into your branch (waves 1–2, the redesign D-041 and the owner's answers are there). Read `docs/reviews/backlog-2026-11.md` (your section and § Needs the owner, answered 14 Nov), `docs/reviews/zero-config-2026-11.md` (ZC-11, DD-4, DD-5, B10) and `docs/reviews/integrations-playbook-2026-11.md` (INT-05, INT-15), `docs/design/DESIGN-SYSTEM.md`, REQUIREMENTS R2, R3, R4, R11, and decisions D-034, D-040, D-049, D-050, D-058, D-062, D-063. Read the wave-1 `review-server-core` entry (ZC-11s company defaults data) in `docs/TRACKER.md`.

**Goal:** an admin sets the company up on one page, agrees once to who processes calls, and managers get coaching and playbook suggestions from what the team already does. Model: main (Opus; HR-sensitive data). Two other children run in parallel (`review-integrations`, `review-owner-platform`); stay inside your files. You own `apps/app/lib/i18n.ts` and `components/AppShell.tsx` this wave (D-058).

**Build on waves 1–2:** `GET/PUT /company/defaults` (record_calls policy, manager, consent record with timestamp, `vendor_allow_list`; ZC-11s); learned instructions (D-034, D-040, `cloud/learning/`, `admin/instructions.tsx`); ratings (`features/rating`); reports (`app/reports.tsx`, `features/reports`); the escalation inbox and playbook editor.

## Scope (item ids from the backlog)
1. **ZC-11c** One "Company defaults" page (`admin/settings.tsx`): tone, call goal (prefilled), record calls as org policy (D-049; agents see a read-only line), allow unverified AI answers (R2), manager (auto-derived from roles, changeable).
2. **DD-4** (D-063) "Who processes your calls" step at onboarding (admin first run) and on the defaults page: the sub-processor list (drafted from `seed/models/providers.yaml`), choice + timestamp audited through the existing consent record, a "primary vendors only" switch (writes `vendor_allow_list`; R2 backup off). Every legal sentence and the list carry a visible **"DRAFT — not legal text"** marker and live in one data file (`apps/app/features/admin/consentText.ts` or a seed file) so the owner's wording replaces it without code changes.
3. **DD-5** (D-062) Remove the agent-track-context toggle; AGN's platform default applies; behaviour unchanged (R4: the agent track never triggers a card). The server-side default line (`cloud/bundle.py` / `store.py`, owned by `review-owner-platform`) goes in your report; `sotto_worker/company.py` is yours.
4. **ZC-B10** Learned instructions auto-apply by default (D-034); an "AGN learned n things" card on admin home links to the editor.
5. **UX-31** Instructions: a pending version shows as a diff with Approve/Reject; the editor is hidden until decided; word counter only above 20 words; 44 px reorder controls.
6. **UX-06c** "From the call with <name>, <date>" instead of a call id.
7. **INT-05** Manager coaching view (rejected cards, repeated objections, weakest review skill, learned instructions) for managers (own team) and admins; agents see only their own data first; no ranking by default. Opt-in weekly email: build the digest, the opt-in setting and a "Send me a preview" action now; the weekly trigger is wired to the scheduler that `review-followup-automation` (T-081) adds in wave 4 — leave one clearly named hook and list it in your report.
8. **INT-15** Playbook suggestions from repeated "not helpful" ratings and manager answers to escalations: each suggestion is an approval card for a manager; nothing reaches the playbook without approval (R2 step 5).

## Owner inputs
- **Legal text and sub-processor list (D-063):** the owner or counsel supplies them before release. Ship the DRAFT placeholder; list the file path in your report.

## Owned files
`apps/app/app/admin/{settings,instructions,index,features,company,recordings,devices,activity}.tsx`; `apps/app/app/{reports,playbook,inbox,settings}.tsx`, new `apps/app/app/coaching.tsx`; `apps/app/features/{learning,reports,playbook,escalations,admin,inbox,settings,flags}/**`, new `apps/app/features/coaching/**` (client calls in feature-local `api.ts`, not `lib/cloud.ts`); hubs `apps/app/lib/i18n.ts`, `apps/app/components/AppShell.tsx` this wave; `apps/app/lib/role.tsx`; server `apps/agent-worker/sotto_worker/cloud/learning/**`, new `apps/agent-worker/sotto_worker/cloud/coaching/**` (own tables in its own store module, pattern of `learning/store.py`), `apps/agent-worker/sotto_worker/company.py`; `seed/prompts/learned_*.md`, new `seed/prompts/{coaching_digest,playbook_suggest}.md`; tests `apps/app/__tests__/{settings-server,settings-web-admin,settings-personal,reports,playbook-editor,inbox-server,knowledge,admin-company,admin-tools,feature-gate,i18n,screens}.test.*`, `apps/app/features/{learning,reports,escalations}/**/*.test.*`, new `apps/app/__tests__/{company-defaults,consent,coaching,playbook-suggest}*.test.tsx`, `apps/agent-worker/tests/cloud/{test_learning,test_company_defaults,test_reports,test_manager_email}.py`, `apps/agent-worker/tests/test_company.py`, new `apps/agent-worker/tests/cloud/test_{coaching,playbook_suggest}.py`.

## Out of bounds (ask the master in your report)
Hubs `cloud/{app,store,bundle,features,auth,mail}.py`, `cloud/features.json`, `lib/{cloud,cloudCompat}.ts`, `admin/_layout.tsx`, `scripts/{a11y,screenshots}.mjs`, `features/{keys,prompts,webadmin}/**` (`review-owner-platform`: mount lines for `cloud/coaching` routes, feature catalog entries and a11y routes go in your report); `admin/integrations.tsx`, `features/{email,whatsapp,team,call,home}/**`, `lib/deviceHistory.ts` (`review-integrations`); `features/rating/**` (read-only), `packages/ui/**` (read-only), `apps/desktop/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Defaults page saves tone, goal, record policy, unverified answers and manager in one place; agents see the record policy read-only; every change is audited (R3).
- Consent: shown on admin first run; choice + timestamp stored and audited; "primary vendors only" removes backups from the allow-list; the DRAFT marker is visible in en and ar.
- No agent-track toggle anywhere; the replay still has 0 agent-triggered cards (R4).
- Instructions: pending diff with Approve/Reject; editor hidden until decided; counter only > 20 words; reorder targets ≥ 44 px; "From the call with <name>, <date>".
- Coaching: a manager sees only their team, an admin the company, an agent only themselves; no ranking by default; company A cannot read company B coaching data (isolation test).
- Playbook suggestions: n repeated "not helpful" ratings on one topic → one suggestion card; approve adds a playbook entry; reject records it; nothing changes without approval.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `cd apps/agent-worker && uv run pytest`; `pnpm a11y` 0 serious.
- **Replay** if `learned_*` prompts, `company.py` or the agent-track default changed: `pnpm gen` then `pnpm replay --all`, report p50/p95 and R4 0; p95 > 1500 ms is a failure.
- Screenshots in `docs/evidence/phase9/review-company-coaching/`: defaults page, consent step, instructions diff, admin home card, coaching view (manager and agent), suggestion card — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(company): …`, `feat(coaching): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-company-coaching` about every 45 minutes.
- **Never lower a quality bar** (`CONSTRAINTS.md`): no skipped or deleted tests, no `@ts-ignore` / `# type: ignore`, no loosened thresholds. No prompt text in application code.
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-080 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-company-coaching`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95 if run, screenshot folder) · files outside your list you need touched (exact lines, D-058) · open questions (legal text path) · branch tip SHA.
