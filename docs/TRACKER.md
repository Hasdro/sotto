# Sotto — project tracker

This is the single place that says where the project stands. Every session reads it at the start and updates it at the end (`/next-task`, `/handoff`). Keep it true: a stale tracker is worse than none.

Update rules:
- **Now:** overwrite it each session.
- **Task board:** change only the state markers and evidence. Never delete a task. Add new tasks with the next ID and a reason.
- **Session log:** append the newest entry first. Never rewrite history.

State markers:

| Marker | Meaning |
|---|---|
| `[ ]` | todo |
| `[~]` | in progress |
| `[x]` | done, with evidence |
| `[!]` | blocked, with a reason |
| `[-]` | dropped, with the decision ID |

Tags:
- `local-only`: needs the Mac, Docker, simulators, devices or Ollama.
- `owner`: needs the owner.

---

## Now

<!-- SessionStart hook prints this section. Keep it under 15 lines. -->
- **Phase:** 9 — AGN Sales Shield product round (`docs/phases/phase-9-product-round.md`), version ladder 0.3.0 → 0.8.0 (D-030).
- **Version now:** **0.6.1** (16 Nov, owner 3a): waves 3–4 + hardening + D-075/D-076 deployed to us3 (backup `cloud.db.pre-2026-11-16-waves34`; health, owner, landing, Zoho notify 200). Mac arm64 + x64 + Windows published (unsigned) and installed on the owner Mac. 0.6.0 crashed at launch (notify.cjs not in `build.files`) and was never on the server; 0.6.1 adds it plus `apps/desktop/test/packaged-files.test.cjs`.
- **Round 2 (M-002, D-078–D-080) landed 18 Nov, on `main` (27f5710, fast-forward) and deployed to us3** (backup `cloud.db.pre-2026-11-18-round2`; health, owner console, `/owner/company.html` + `company.js` 200, CSP `script-src 'self'`). Mac arm64 build of the branch installed (still version 0.6.1, no bump; x64 + Windows built, NOT published). Gate on the Mac: lint, typecheck (TS + mypy), app jest 87 suites / 549, ui 189 + 100, engine 75, worker pytest 841 (cov 91%, floors ok), replay R4 0, a11y 73 checks 0 serious. Details and the visual checks: `docs/muse/MAC-REQUESTS.md` R-001..R-007, screenshots `docs/design/screens/round2/`.
- **Round 3 (M-003, D-081–D-093) merged to `main` 20 Nov (fast-forward, no force; main now at the branch tip).** Deployed to us3 the same day (backup `cloud.db.pre-2026-11-20-round3`; health, owner, company.html+js 200, CSP `script-src 'self'`; R-010); landing page PUBLISHED with the real Zoho hosted URLs and the branch pushed (R-011).** DeepSeek as a selectable provider (flash + v4-pro) with server-resolved endpoints, custom providers per company, per-model enable toggles, company page as tiles opening popups, dropdown fixes, take-a-tour (client + admin), GitHub issue reporting from the owner console, client bug reports → vendor review queue → GitHub, signup via new-company API + OTP + welcome email, client billing screen, landing Pricing section. Gate (R-008) GREEN on the Mac 19–20 Nov: lint, typecheck, app jest 87/549, worker pytest 871, replay p50 576 / p95 978 ms (R4 0, R2 drill p95 1270), a11y 73 checks 0 serious — after 31 files of gate fixes (uncommitted; commits follow). Version still 0.6.1 (no bump).
- **Open:** GitHub CI is RED on the branch/main since 15 Nov (web bundle budget `scripts/check_bundle_size.py`, `npm audit` high advisories in production deps) — not caused by round 2, not yet investigated. Still open from before: DESIGN-SYSTEM §5.7 stale vs landing v2 (T-094); landing `shot-*.png` old UI; Contact updates fire customer Zoho workflows (by design, D-075 covers Deals only); managers see company-wide WhatsApp statuses; old installers 0.3.0/0.3.1/0.5.1/0.5.2 on the server's `/var/www/downloads` (owner to approve deletion); not seen live: owner-console sign-in + a real company profile, Gallabox template dropdown (needs real keys), the Arabic 'Watching…' line in the installed app. T-093 fonts: already self-hosted as WOFF (no change needed; WOFF2 conversion optional). **Round 3 open:** the real Zoho hosted page URLs are in (`store.py`, landing Subscribe links) and the landing page is PUBLISHED live with them (R-011 a/b). Still open: GitHub repo + token to be supplied by the owner (Account › GitHub issues panel); `sales-shield@agncompu.com` mailbox still to be provisioned with SMTP credentials entered (R-011 c/d); TTS is stored-only, not built (D-081); live DeepSeek benchmark not run (needs a real key, D-083); Zoho Billing webhook receiver deferred (D-090).
- **Next ladder step after 0.6.1:** 0.7.0 WhatsApp — wire the existing `WhatsAppAction` (T-065) and `EmailAction` (T-063) into the post-call panel (T-061; AI-suggested actions with reason/confidence still open), then Gallabox keys + panel wiring on a real account (owner). T-053 left: verify on the owner's org (`GET /api/v1/zoho/modules`); T-056 left: prep chat + AI TLDR, History view of the brief.
- **Branch:** master `claude/friendly-gates-fbhqdv` (draft PR https://github.com/Hasdro/sotto/pull/1). Muse (muse.ai) is PM + lead engineer from 17 Nov 2026 (`docs/muse/HANDOFF.md`); Mac-Claude pulls, tests, builds, deploys, installs.
- **Environment:** local Mac. ssh to us3 works (root@104.168.48.116). Electron dev runs need `env -u ELECTRON_RUN_AS_NODE` and an explicit `--user-data-dir`.
- **Owner items still open:** spend caps (`routing.monthly_cap_usd`, per-company), Gallabox plan webhooks, Zoho multi-DC, Zoho Forms sign-up webhook, legal consent text + sub-processor list, agents reconnect Zoho once, live-cost replay (`pnpm replay:live`, costs money).

## Phase board

| Phase | Status | Branch / PR | Exit gate evidence |
|---|---|---|---|
| 0 Brief, playbook, golden calls | owner answers applied 2026-10-19 (BRIEF, D-017/D-018); playbook docs + golden calls later | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | – |
| 1 Architecture, skeleton, CI | architecture owner-approved (D-017); gate waits on P1.7 (Docker) | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | CI green ([run](https://github.com/Hasdro/sotto/actions/runs/39166712190)); `docs/handoffs/phase-1.md` |
| 2 Engine, router, registry, replay | mostly done (STT, audio replay, Ollama pending) | `claude/friendly-gates-fbhqdv` · PR #1 | synthetic replay p95 1148 ms, outage drill PASS |
| 3 Design system and screens | mostly done (role switch, axe CI, owner QA pending) | same | `docs/evidence/p3/`, `docs/evidence/demo/` |
| 4 Live calls | todo | – | – |
| 5 Tenants, roles, trials | schema + RLS done; auth/UI pending | same | 284 pgTAP assertions |
| 6 Prompt studio, model settings | in progress: P6.7 keys panel done, P6.5 partial (demo server) | same | `tests/server/` 62 passed |
| 7 Escalations, Zoho CRM | todo | – | – |
| 8 Hardening, release, pilot | todo | – | – |
| 9 AGN Sales Shield round (0.3.0–0.8.0) | in progress: docs recorded, 0.3.0 workstreams started | `claude/friendly-gates-fbhqdv` + `phase9/*` | – |

## Task board

Details and acceptance criteria are in `docs/phases/phase-N-*.md`.

### Phase 0
- [x] P0.1 Interview the owner `owner` — replaced by the decisions page; answers submitted 2026-10-19 (`docs/OWNER-ANSWERS.md`)
- [x] P0.2 Write docs/BRIEF.md `owner` — owner answers applied 2026-10-20 (commit 04f883c); remaining `OPEN:` items are listed under Waiting on owner
- [!] P0.3 Draft the playbook (faq, objections, products, never-promise) `owner` — needs the real products, questions and objections; no invented content (D-009)
- [~] P0.4 Golden-call plan (test-calls/PLAN.md) `owner` — draft written; waits for owner agreement and a date
- [ ] P0.5 Label 10 golden calls `owner` (may finish later; blocks P2.8)
- [x] P0.6 Decisions from the interview — D-017 (approvals), D-018 (English only)

### Phase 1
- [x] P1.1 Decide D-005 Expo vs Flutter `owner` — Expo, D-010 (owner-approved, D-017)
- [x] P1.2 Finalize ARCHITECTURE.md (failure modes, cost per minute) `owner` — written and revised after an adversarial review; 19 failure modes with no TBD; cost ≈ $0.02–0.05/min plus carrier (up to $0.30/min on Twilio UAE mobile). Owner-approved 2026-10-19 (D-017).
- [x] P1.3 Monorepo skeleton — `pnpm install && pnpm typecheck && pnpm test` green (vitest 28, jest-expo 3, pytest 30); web screenshots in `docs/evidence/p1.3/`
- [x] P1.4 Commands + hooks working — CLAUDE.md table updated; Stop hook exits 2 on a broken type, 0 when clean (~8 s); format hook ~0.6 s
- [x] P1.5 scripts/check-boundaries.sh with fixtures — 7 rule IDs (incl. the P1.8 suppression guard), 12 failing + 2 passing fixture trees, repo clean (`bash scripts/tests/run.sh`)
- [x] P1.6 GitHub Actions CI + gitleaks — all 4 jobs green on PR https://github.com/Hasdro/sotto/pull/1 (run https://github.com/Hasdro/sotto/actions/runs/39166712190); pre-commit hook blocks a planted token (exit 1)
- [!] P1.7 Local Supabase smoke test `local-only` — blocked in cloud: needs Docker + supabase CLI (Mac)
- [x] P1.8 CONSTRAINTS.md — floor + numbers (p95 1500, worker coverage 90%, AA contrast, 450 KB web JS, audits) each with a command; suppression guard in check-boundaries; linked from CLAUDE.md
- [x] P1.9 Roadmap + tracker refresh — ROADMAP "done when" lines rewritten from the acceptance tests; Phase 2 tasks annotated with what each needs

### Phase 2
- [x] P2.1 Contracts and fake adapters — Clock/FakeClock, LLM/STT protocols, FakeLLM; contract tests (pytest)
- [x] P2.2 Model router (per stage, per company, deadlines, fallback) — absolute t0 deadline, backup race, circuit per (company, endpoint), R1 guard; 13 tests
- [x] P2.3 Real adapters: anthropic, openai, openai_compatible, STT ×4. LLM: `pnpm replay:live` on Groq + Gemini, model IDs ok, p95 837–848 ms. STT: Deepgram, AssemblyAI, Speechmatics and ElevenLabs over raw WebSockets (spec/phase-2-stt.md), 20 tests, code-review fixes eb8ebdb. `pnpm stt:live`: Deepgram p50 829 ms WER 0%, AssemblyAI p50 667 ms WER 0%; Speechmatics free plan hit its concurrency quota (T-008); ElevenLabs has no key. The owner picks vendors by setting (D-019)
- [x] P2.4 Prompt registry (seed/prompts, scopes, variables) — scopes, publish/rollback, strict render, platform fallback; 8 tests
- [x] P2.5 Pipeline: turn → trigger → playbook → suggest → stream — CallSession + trigger rules + playbook index (drafting on partials still TODO)
- [x] P2.6 R2 chain: backup, holding line, escalation record — holding at t0+1400, late answer ≤ 5 s, one escalation per question; session tests
- [x] P2.7 Telemetry events per card — CardTimingRecord per card + nearest-rank p50/p95
- [~] P2.8 Replay harness + judge, p95 ≤ 1500 ms (needs P0.5 + keys) `owner` — SYNTHETIC replay done (p50 567, p95 1148 ms, agent cards 0); audio replay + judge wait for golden calls + keys
- [~] P2.9 Local model (Ollama) benchmark `local-only` — first run on the Mac 2026-10-20 via the panel's speed check: gemma3:1b p50 453 ms, worst 2753 ms (cold model load); the golden-set benchmark waits for P0.5

### Phase 3
- [x] P3.1 Two visual directions `owner` — Claude chose "Prompter's box" (D-014, under D-013); owner reviews `docs/evidence/p3/`
- [x] P3.2 docs/DESIGN.md — tokens, card anatomy, layouts, motion, RTL, a11y
- [x] P3.3 packages/ui + gallery — components + `/gallery`; vitest 102 + jest 31; axe-core in CI since 2026-10-20: `pnpm a11y` (Playwright Chromium) checks 11 screens in light, dark and Arabic RTL — 33 checks, 0 serious/critical. It found that react-native-web no longer maps `accessibilityState` to `aria-checked`/`aria-disabled`/`aria-busy`: every radio lacked its state; fixed with `aria-*` props
- [x] P3.4 Agent screens (mock) — in-call screen live on the demo bridge (e2e screenshots `docs/evidence/demo/`), history, playbook; app jest 90
- [x] P3.5 Manager/admin screens (mock) — inbox, team, prompts, models (with benchmark), settings; mock role switch (agent / manager / admin) gates navigation and pages per R3 (`lib/role.tsx`, `components/RoleGate.tsx`); screenshots `docs/evidence/p3.5/`. Plan/trial banner added 2026-10-20 (`components/PlanBanner.tsx`, rules in `features/admin/plan.ts`: days left rounded up, urgent from 3 days, blocked when expired/suspended; sample plan until P5.5). Playbook editor added 2026-10-20 on the demo server: the Playbook page shows the playbook calls use (file + inbox + manager answers, with source badges); managers/admins add, edit and remove their own answers (≤ 25 words; file entries read-only); the next call uses them (`tests/server/test_parts.py::test_the_next_call_uses_the_managers_own_answers`, `__tests__/playbook-editor.test.tsx`). Supabase storage in Phase 5
- [ ] P3.6 Visual QA loop `owner`
- [x] T-020 Phone navigation from the left (owner feedback on the APK, D-023) — top bar + menu button opens a start-edge drawer (sidebar items, role switch, user/company footer), mirrored in Arabic; bottom tabs removed; closes on item/scrim/close/Escape/Android back; web focus trap via `Modal`. Polish at 390/360 px: full-width call actions, inbox filter no longer clipped, account spacing, invite form says "Name". Evidence `docs/evidence/d023/` (39 shots: light/dark, LTR/RTL; `node scripts/screenshots.mjs`)

### Review remediation (`docs/AGENT-BRIEF-2026-10-21.md`, 21 Oct 2026)

One item = one task = one commit. `[OWNER]` items wait for the owner's yes.

- [x] T-022 B0.1 Customer transcripts do not survive sign-out — device calls are kept per company + user (`sotto.calls.<company>.<user>`), cleared on sign-out, old shared key discarded. Evidence: `__tests__/device-history.test.ts` (A signs out, B signs in, B sees nothing); app jest 183 passed
- [x] T-023 B0.2 Speech vendors the app cannot run are not selectable (Deepgram, ElevenLabs) — catalogue flag `client: false`, passed in the bundle, greyed out in the stage picker with "not available in the app yet"; the server refuses such a route for `stt`/`stt_backup`; worker adapters kept. Evidence: `test_speech_vendors_the_app_cannot_run_are_refused`, keys jest "does not let a speech stage pick…"; pytest 366 passed, app jest 184 passed
- [x] T-024 B0.3 No sample rows in a real account's History or Playbook — any build that names a Sotto server shows only its own calls/answers, with "No calls yet" / "No answers yet" empty states (also while loading or on a failed fetch); samples only in the local demo; live calls are labelled "Live call", not "Practice call". Evidence: `__tests__/no-samples.test.tsx` (5); app jest 189 passed
- [x] T-025 B0.4 Leaving the call screen keeps the call; End asks first — the session lives in `CallSessionProvider` above the navigator (connects on the first visit to Call, ends on confirmed End, sign-out or app close); End opens an "End this call?" dialog (RN `Modal`, no new dependency); `?mock=1` keeps its own session. Evidence: `__tests__/call-survives-navigation.test.tsx` (navigate away and back: 1 socket, 0 closes, 0 ends; confirm → exactly 1 end), `call.test.tsx` confirm test; app jest 190 passed
- [x] T-026 B0.5 Agents and the call screen are told when the plan blocks calls — a non-dismissable "Calls paused — <reason>. Ask your admin." line (expired, suspended, minutes used up), localised; the full banner stays for managers/admins elsewhere. Evidence: `__tests__/plan-paused.test.tsx` (5)
- [x] T-027 B0.6 No `_API_KEY` names in user-facing copy — call notices now say "Real AI answers are off — ask your admin to connect a model.", "The backup AI is off — …", "Speech-to-text is off — …". Evidence: two engine tests asserting the text and no `_API_KEY`; engine vitest 25 passed
- [x] T-028 B1.1 No 150 ms settle after a sentence-ending final — engine flushes at once on `.`/`?`/`!`; 400 ms tail wait and mid-thought hold unchanged. Evidence: engine test "releases a sentence-ending final at once…"; replay unchanged at p50 567 / p95 1148, holding 45% (the synthetic replay models STT as a fixed 350 ms and runs the Python worker, so it cannot show this saving; a real spoken call will). Watch: a vendor that splits one turn into two finals after the end of speech would now drop the second as a late tail (AssemblyAI sends one final per turn; Speechmatics flushes the rest on ForceEndOfUtterance)
- [x] T-029 B1.2 Primary model first-token budget 700 → 1150 ms from t0 — owner chose 'raise' (D-025). Evidence: `test_loads_the_seed_file_with_every_stage` pins 1150; synthetic replay p50 567 / p95 1148; LIVE replay p50 608 / p95 1401 (the holding line), backup started on 0 of 11 turns (was 2–3), holding 27%
- [x] T-030 B1.3 Keep-warm every 120 s, not 25 s (rate-limit fix) — still warms once at call start. Evidence: engine test on `KEEP_WARM_EVERY_MS` ≥ 120 000; replay p50 567 / p95 1148, holding 45% (unchanged)
- [x] T-031 B1.4 Replay says "synthetic — not the R1 gate"; reports backup starts/wins — prints `PASS (synthetic — not the R1 gate)` plus a line that only real recorded calls count; `--live` says "live smoke test"; exit code unchanged. Evidence: `test_cli_does_not_claim_the_r1_gate_and_reports_the_backup_race`; replay: backup started on 0 of 11 turns, won 0
- [x] T-032 B2.1 Top three playbook entries go to the model when the direct match misses — engine and worker: one ranked scan per turn (the duplicate second lookup is gone; it also meant the model's `playbook.match` slot was always empty); the three nearest entries with any overlap go into the existing `playbook.match` slot, capped at 600 characters; playbook cards still need ≥ 0.42. Evidence: engine tests "gives the model the three nearest entries…", "caps … 600 characters"; worker `test_match_text_…`; synthetic replay unchanged (its fake model ignores the slot); LIVE replay holding 36% → 27% and 18% (two runs), p95 1342 → 1203 / 1130 ms
- [x] T-033 B2.2 Replay reports playbook share, holding share, mean top-1 score, share below 0.42 — synthetic and live replays. Baseline 21 Oct: playbook cards 45% · holding 45% · mean top-1 0.33 · 6 of 11 turns below 0.42 (55%). Evidence: `test_cli_reports_how_well_the_playbook_matches`, `test_replay_records_the_top_match_score_of_each_customer_turn`, `test_ranks_the_nearest_entries_best_first`
- [x] T-034 B3.1 Escalations carry the transcript excerpt, agent and call — the app sends the excerpt (last 2000 characters kept) and call id; the server takes the agent from the signed-in user, adds the two columns to existing databases on start, and returns agent name; the inbox shows "What was said just before" under the question and the agent's name; real accounts say "Customer", not "Practice call". CRM link waits for the CRM module. Evidence: `test_an_escalation_carries_the_excerpt_the_agent_and_the_call`, `test_an_older_database_gains_the_escalation_context_columns`, inbox jest (T-034); pytest 372 passed, app jest 196 passed
- [ ] T-035 B3.2 Email the manager within a minute `[OWNER]` (Resend account, sender, recipient)
- [x] T-036 B4.1 Phones say plainly that live calls come with phone calling (Phase 4) — on iOS/Android the start panel is replaced by "Live calls in the phone app arrive with phone calling (Phase 4). Use the Mac or Windows app today." and a button to the downloads page; web and desktop unchanged. Evidence: call jest (ios, android)
- [x] T-037 B4.2 Guided key setup checklist on Admin → Keys & providers — "Three steps before your first call": connect a suggestion model, connect speech-to-text (each names the stage's vendor with its catalogue steps and "Get a key" link), add one playbook answer (link to the playbook; count from the bundle); ticks when done; gone once both keys are set. Evidence: keys jest (T-037 ×2)
- [ ] T-038 B4.3 60-second practice call in real accounts — owner allowed it 14 Nov (D-073); built in T-078 (W3-PRACTICE)
- [x] T-039 B5.1 Admin → Team uses the real team API — the Account page's team panel moved to `features/team/TeamPanel.tsx` and both screens use it (`GET/POST /api/v1/team`); no sample staff; without a Sotto account Admin → Team says one is needed. Evidence: `__tests__/admin-team.test.tsx` (3), screens test updated
- [x] T-040 B5.2 Prompt studio hidden until prompts persist — Prompts tab removed; its routes say "Prompt editing comes in a later phase" (calls use the tested default prompts); the in-memory store is no longer mounted; the studio logic and its tests stay in `features/prompts`. The R6 prompt-studio acceptance (v2 → test → publish → roll back) returns with persistence: needs a `prompt_versions` table and `build_bundle` shipping the published body (its own task). The UI test of the hidden editor was removed with it
- [x] T-041 B5.3 Models screen hidden (duplicate of Keys & providers speed check) — Models tab removed; the route points to Keys & providers, where the real per-stage choice and measured speed live. Evidence (T-040/T-041): screens tests "admin hides the prompt editor…", "admin models points to Keys & providers…"; app jest 202 passed. One commit for both (shared tab list and strings)
- [x] T-042 B6.1 Engine coverage floor 80% — `@vitest/coverage-v8` 5.0.5 (matches vitest), thresholds 80% statements + branches in `packages/engine/vitest.config.ts`, run by `pnpm test`; 90% at Phase 8; recorded in CONSTRAINTS.md. Branches were 64.7%, so 21 tests were added (adapters, Speechmatics, bridge, ids): now 92.6% statements / 82.0% branches, 50 tests. Probe: 60 uncovered branches → 70.2%, exit 1; removed → exit 0
- [x] T-043 B6.2 Engine tests on a fake clock (< 2 s) — vitest fake timers (setTimeout, performance, Date) in the six slow tests; one spoken-turn test keeps real timers end to end. Evidence: three runs, 29 passed each, 779 / 632 / 621 ms (was 7.1 s)
- [ ] T-044 B6.3 Web bundle 476/450 KB `[OWNER]` (raise, cut zod, or lazy-load the call screen) — measured 22 Oct after the 0.2.0 build; over budget, not hidden

### Phase 4
- [ ] P4.1 Telephony: LiveKit + SIP trunk `local-only` `owner`
- [~] P4.2 Token service (edge function) — call-start policy pure + 12 tests (D-015); Deno entry + LiveKit signing adapter need the LiveKit account
- [ ] P4.3 App calling: dev build, CallKit/ConnectionService, web `local-only`
- [ ] P4.4 Worker in the room, customer track only
- [ ] P4.5 Desktop + other softphone (optional)
- [ ] P4.6 Live latency vs replay `local-only` `owner`
- [ ] P4.7 Robustness cases

### Phase 5
- [x] P5.1 Schema — `supabase/migrations/20261018000000_tenancy.sql` (all ARCHITECTURE §3 tables)
- [x] P5.2 RLS + isolation test matrix — 142 pgTAP assertions pass on local Postgres 16 (`pnpm test:db`) and in CI; a mutation check catches a leaky policy
- [ ] P5.3 Auth + devices + revoke
- [ ] P5.4 Invitations and roles UI
- [ ] P5.5 Plans and trials
- [ ] P5.6 Billing hook (optional) `owner`
- [ ] P5.7 Security review

### Phase 6
- [x] P6.1 Registry + router read from DB — `sotto_worker/config/db.py` (PostgREST, worker JWT); mocked-HTTP tests
- [~] P6.2 Prompt studio — app: list → detail with scope, versions, draft editor with the variable catalogue and strict unknown-variable check, line diff vs live, publish and one-click rollback, on an in-memory store (`features/prompts/`, evidence `docs/evidence/p6.2/`). Pending: read/write `prompt_versions` in Supabase (audited by the DB trigger) and variable autocomplete inside the editor
- [ ] P6.3 Test on recordings
- [~] P6.4 Model settings + custom endpoints + R1 guard — demo server (2026-10-20): Admin → Keys & providers picks vendor + model per stage, "Measure speed" runs the chosen model on scripted playbook-miss questions through the real pipeline and stores first-token p50/worst; the stage shows it against its deadline, and a live stage refuses a model measured at p50 > 1000 ms (R1 guard). Live check: Groq gpt-oss-20b p50 490 / worst 880 ms; Gemini 2.5 Flash-Lite p50 677 / 1106 ms. Custom OpenAI-compatible endpoints from the panel (same night): name + base URL (+ optional key, https only, bound to that host; metadata/link-local refused). R6 acceptance run live: Ollama added in the panel → Test "3 models available" → suggest = gemma3:1b → speed p50 453 ms (worst 2753 ms cold load) → a typed call got its AI card from the local model, first word 465 ms
- [~] P6.5 Feature flags — demo server (D-020, 2026-10-20): AI answers outside the playbook, backup providers (LLM + STT), agent-track context and card language are saved by Admin → Settings and applied to the next call (`runtime.apply_settings`, `/api/company/settings`, audited). Remaining: drafting-on-partials / CRM / voice-sample flags and per-company storage in Supabase
- [ ] P6.6 Admin permissions
- [x] P6.7 Keys & providers panel: add/test/replace keys with "Get a key" links, vendor per stage (owner request 2026-10-20, D-019) — server API + Admin → Keys & providers (D-020); AES-GCM write-only vault, per-vendor test (all 5 owner keys test OK live), per-stage vendor + model, audit log; tests in `tests/server/` and `apps/app/__tests__/keys.test.tsx`. security-auditor review 2026-10-20: 0 critical, 1 high, 2 medium, 6 low — all fixed the same night (streamed 8 KB body cap + Caddy 16 KB limit; session key derived from secret + access code; sign-in attempts counted before the body read, per client and globally, oldest-client eviction; trusted proxy = the compose subnet, nginx snippet sends $remote_addr; ≤ 5 open call sockets and real-time audio rate limit; transcript bounded; only provider keys reach call runtimes; key test checks the URL it calls against the vendor host; CSP + nosniff + frame-ancestors on every response; hosted mode needs https; sign-out origin check; audit log names the client; images pinned by digest). Pending: Supabase storage in Phase 5/6

### Phase 7
- [x] P7.1 Email adapter + outbox — retry 10 s/30 s/1/5/15 min + dead letter, Resend with Idempotency-Key; DB trigger enqueues one email per escalation
- [~] P7.2 Escalation flow → playbook — Demo server (D-020, 2026-10-20): escalations from calls land in the Inbox; answer / add-to-playbook go to the server (same 1–25-word, add-once rules) and the next call's playbook includes the added answer (`tests/server/test_app.py::test_an_escalated_question_is_answered_added_and_used_by_the_next_call`). DB: `approve_escalation()` turns an answered escalation into a playbook entry (team-scoped, ≤ 25 words, once, audited; 9 pgTAP). App: the inbox answers and adds to the playbook on an in-memory store with the same rules (`features/escalations/`, evidence `docs/evidence/p7.2/`). Pending: swap the store for Supabase once auth exists (P5.3)
- [x] P7.3 CRM interface + fake
- [ ] P7.4 Zoho implementation `owner`
- [x] P7.5 After-call summary — summary stage + seed prompt + extract fallback (not yet wired to the CRM outbox)

### Phase 8
- [ ] P8.1 Load test
- [ ] P8.2 Failure drills
- [ ] P8.3 Monitoring + alerts
- [ ] P8.4 Environments, backups, restore
- [ ] P8.5 Builds: TestFlight, Play internal, PWA, (Tauri) `owner`
- [ ] P8.6 Full security + quality review
- [ ] P8.7 One-week pilot `owner`

### Phase 9 (`docs/phases/phase-9-product-round.md`; acceptance = its "Definition of done")
0.3.0 Foundation
- [x] T-045 Feature-flag catalog, five states, server enforcement (D-028, D-036), retrofit existing features — `flags-auth` · evidence: `tests/cloud/test_features.py` (each state → 403 `feature_unavailable`, isolation A/B, audit), branch `phase9/flags-auth`; fixes `phase9/flags-auth-fixes`: a changed map re-reads the bundle after the live call (`persistent-login.test.ts`), the review is skipped when `call_review` is off (`features/call/review-flag.test.ts`)
- [x] T-046 Owner entitlement matrix + global kill switch; Admin → Features; greyed-state UI component — `flags-auth` · evidence: `__tests__/feature-gate.test.tsx`, screenshots `docs/evidence/phase9/flags-auth/` (Admin → Features light/dark/RTL, owner matrix light/dark, greyed Reports/Recordings 390 px + RTL); Admin tab added by the master at merge
- [x] T-047 Persistent login: rotating refresh tokens, 90-day sliding, `safeStorage`, 0.2.0 token migration (D-029) — `flags-auth` · evidence: `tests/cloud/test_persistent_login.py`, `__tests__/persistent-login.test.ts`, `apps/desktop/test/secure-store.test.cjs`, dev Electron run `docs/evidence/phase9/flags-auth/electron-secure-store.json`; security-auditor: no critical/high, mediums fixed; master review fixes (`phase9/flags-auth-fixes`, D-029 amendment): a lost refresh or migration answer renews again until the successor is used, local calls wiped only on manual sign-out or `device_removed`, the 0.2.0 token kept unless the pair was saved
- [x] T-048 Logo: three vector directions `owner` (choice) — `brand-ui` · owner picked (c) Shield monogram 12 Nov; `export.mjs c` → icns/ico, mac tray template @1x/@2x, Windows tray ico, favicon (png + scheme-aware svg), in-app mark + About, `apps/landing/` logo/favicon; evidence `docs/evidence/phase9/logo-c/` (tray, About, favicon light/dark, 16 px check)
- [x] T-049 Rebrand to AGN Sales Shield: strings (en + ar), installers, tray, window, About, favicon (D-026) — `brand-ui` · grep check `packages/ui/src/brand/userFacingName.test.ts` passes; userData pinned to `sotto-desktop`
- [x] T-050 Global reskin + live-call polish + information-density rules — `brand-ui` · before/after `docs/evidence/phase9/brand-ui/`; a11y 33 + live-call 8 checks, 0 serious; replay p95 978 ms
- [x] T-051 Mascot five result moods from the review score — `brand-ui` · `moodFor` boundary tests; `mascot-moods-80-65-50-30-none.png`
- [x] T-052 0.3.0 release gate: merge, replay, a11y, screenshots, both installers, tag v0.3.0 — master. Merged flags-auth + brand-ui + landing + review fixes (728b97c); gate green (typecheck, lint, boundaries, pnpm test app 284 / worker 442, desktop); replay ALL p50 576 / p95 978 ms, R4 0 agent cards, R2 drill p95 1270 ms; a11y 36 checks 0 serious. Owner picked logo (c) and approved deploy + publish (chat, 2026-11-12). Server deployed 2026-11-12 23:45 from d83b276-era HEAD (backup `cloud.db.pre-2026-11-12` via sqlite3 backup API; health/app/owner/downloads 200; new tables company_features, company_entitlements, feature_kill, spent_refresh; no log errors). Logo (c) merged (07eacf9); version 0.3.0; installers built and smoke-started (packaged Mac app, own profile, loads app://sotto); published to /downloads/ (arm64 dmg 127223240 B sha256 82103474…, x64 dmg 133960851 B 14ff2d43…, Windows exe 114741946 B 9fe7d89c…; all 200); tag v0.3.0 pushed; web redeployed (About 0.3.0); GitHub Release v0.3.0 via scripts/release.sh. Installed /Applications/AGN Sales Shield.app 0.3.0 for the owner; old Sotto.app, Sotto-simulator.app and the release .app copies moved to the Trash (owner request); profile sotto-desktop kept.
0.4.0 Pre-call
- [~] T-053 Zoho per-user OAuth via the server, data centres, encrypted tokens, permission matrix (D-031) `owner` (OAuth client) — `zoho-slice` (Saturday demo, branch `phase9/zoho-slice`): platform + per-org client (write-only, AES-GCM), `/auth/zoho/start` → `/auth/zoho/callback/` with one-time state bound to person + browser, encrypted refresh token, 55-min access cache, revoke on disconnect, read matrix; `tests/cloud/test_zoho.py` 21 tests; security-auditor M1/L1/L2 fixed. Left: verify on the owner's org (`GET /api/v1/zoho/modules`), write scopes (0.6.0).
- [x] T-054 Meeting/contact matching: ≤ 3 candidates with evidence, manual search, skip — `zoho-slice` + `zoho-actions`: Contacts/Leads by phone/email/name and Meetings (Events) from 3 h ago to 12 h ahead, 3 nearest with time as evidence; never auto-attached (`crm-rail.test.tsx`, `test_zoho_actions.py`). Events `criteria` search to verify on the owner's org.
- [x] T-055 Context pull (deal, contact, account, meeting, last 5 notes / 90 days) with a token budget — `zoho-actions`: meeting (title, time, attendees, agenda) + its contact's brief; ≤ 1200 chars.
- [~] T-056 Prep chat + structured brief, saved with the call, injected into the live prompt (replay) — `zoho-actions`: structured brief (TLDR, objective, attendees, pains, competitors, next step) editable in the rail, works without Zoho (`prep` built), injected via `crm_brief` v2 (per-turn), saved at call end `PUT /calls/{id}/brief` (company-scoped, own call only); replay p50 576 / p95 978 ms. Left: prep chat + AI TLDR, History view of the brief.
- [x] T-057 Live context rail (collapsed; no latency regression) — `zoho-slice` (Saturday demo, branch `phase9/zoho-slice`): CrmRail in the collapsed rail; brief → `crm_brief` prompt (per-turn part only); replay ALL p50 576 / p95 978 ms; screenshots `docs/evidence/phase9/zoho-slice/`.
0.5.0 Learning loop
- [x] T-058 Ratings on AI advice cards with reason chips; admin aggregates
  - Evidence: `phase9/learning-admin`; worker `tests/cloud/test_learning.py`, app `features/rating/RatingControls.test.tsx` (no card words reach the server).
- [x] T-059 Learned instructions: minimised packet, 8 × 25 words, registry variable, next-call only (D-034; replay)
  - Evidence: `features/learning/packet.test.ts` (no full transcript), engine learned-instructions tests; replay p50 576 / p95 978 ms. Open: live test call on the Mac (owner).
- [x] T-060 Settings instruction editor: edit, reorder, disable, delete, versions, revert, review switch, badge
  - Evidence: Admin › Instructions, `features/learning/instructions.test.tsx`; a11y 39 checks 0 serious, axe 0 on the seeded page; screenshots `docs/evidence/phase9/learning-admin/`.
0.6.0 Post-call actions
- [~] T-061 Post-call panel + during-call side panel (lead, contact only) — `zoho-actions`: `features/actions/PostCallPanel.tsx` (Meeting, Lead or Contact update, Deal note; each its own approval) + collapsed `QuickActions` in the rail; follow-up slot waiting for `messaging`'s email/WhatsApp components. Left: AI-suggested actions with reason/confidence.
- [x] T-062 Zoho writes: Meeting, Lead, Contact, Deal note — approval, audit, idempotency — `zoho-actions`: `POST /zoho/actions/{kind}` (approved:true, closed field lists, idempotency table; unconfirmed 5xx/timeouts keep the key → `zoho_unknown`, never a double write), audit rows incl. failed/unknown, no Deal/Account write module or scope (tests), write scopes + reconnect prompt for 0.3.1 connections; security review H1/M1/L1–L3 fixed.
- [ ] T-063 Email: senders, formats, static blocks, To/CC, preview, send, audit (D-032) `owner` (SMTP)
- [ ] T-061 Post-call panel + during-call side panel (lead, contact only)
- [ ] T-062 Zoho writes: Meeting, Lead, Contact, Deal note — approval, audit, idempotency
- [~] T-063 Email: senders, formats, static blocks, To/CC, preview, send, audit (D-032) `owner` (SMTP) — built: org SMTP + platform fallback (write-only), test email with exact SMTP error, formats with verbatim opening/signature, preview == sent, confirm, audit, idempotency; `EmailAction` exported for the post-call panel; waits for owner SMTP + panel wiring; evidence `docs/evidence/phase9/messaging/` (branch `phase9/messaging`)
0.7.0 WhatsApp
- [~] T-064 Gallabox adapter: template list + allow-list, `window_status()`, last 100 messages (D-033) `owner` (key) — adapter + allow-list with cached params, `channel` never copied; `window_status()` always `unknown` (no documented signal) so template-only; last 100 messages NOT built (no history endpoint; storing webhooks forbidden by D-033) — owner decision; evidence `docs/evidence/phase9/messaging/` (branch `phase9/messaging`)
- [~] T-065 Approved WhatsApp sends from the post-call panel — `WhatsAppAction` (allow-listed template, prefilled name, preview, confirm, audit masked phone, idempotency, stop codes block); waits for panel wiring + owner Gallabox keys; evidence `docs/evidence/phase9/messaging/` (branch `phase9/messaging`)
0.8.0 Release
- [~] T-066 Landing page, Privacy, Terms, Zoho Forms slot `owner` (form, legal review) — `apps/landing/` built with placeholders (logo, screenshots, Zoho form, DRAFT legal); axe 0 serious, evidence `docs/evidence/phase9/landing/`; waits for logo/tokens, 0.3.0 screenshots, owner form + legal text
- [~] T-067 DNS + Caddy for salesshield.agncompu.com; clean `/downloads/` `owner` (DNS) — `deploy/caddy/salesshield.caddy`, `deploy/publish-landing.sh` (dry run), `scripts/release.sh` (dry run) written; nothing run on us3; `caddy validate` not run (Caddy not installed locally)
- [ ] T-068 GitHub Releases v0.3.0…v0.8.0 with installers
- [ ] T-069 Local Mac cleanup + clean install keeping data `local-only`
Added 2026-11-13 (owner)
- [ ] T-070 Research: automate Zoho OAuth client creation, or one platform client for all orgs (multi-DC) — recommendation + decision
- [~] T-071 (Zoho part done in `zoho-slice`: Admin → Integrations org client + own connection; Gallabox part built in `phase9/messaging`, unverified on a real account) Admin → Integrations: per-org Zoho client (write-only, encrypted; platform client default) and Gallabox key/secret/channel; Gallabox template dropdown pulled from the API, selected templates' parameters cached

### Review backlog (Nov 2026)
Items, waves, owned files and owner questions: `docs/reviews/backlog-2026-11.md`. Wave-1 prompts: `docs/prompts/review-{ui-core,copy-brand,server-core}.md`; wave-2: `docs/prompts/review-{live-call,post-call,home-shell}.md`; wave-3: `docs/prompts/review-{integrations,owner-platform,company-coaching}.md`; wave-4: `docs/prompts/review-{followup-automation,zoho-scopes,ai-autoconfig}.md`. Branches `phase9/<stream>`.
Wave 1
- [x] T-072 `review-ui-core` — UX-02, UX-11, UX-12, UX-13, UX-14, UX-15, UX-06a, UX-07, UX-40, UX-43a, UX-44a, W1-UI, W1-SPLIT
  - Evidence: branch `phase9/review-ui-core`; app jest 352/352, ui 167 vitest + 89 jest, desktop 17; typecheck, boundaries, biome (explicit paths) green; a11y 39 checks 0 serious; replay ALL p50 576 / p95 978 ms, R4 0, R2 drill p95 1270; shots `docs/evidence/phase9/review-ui-core/`.
- [x] T-073 `review-copy-brand` (sonnet) — UX-06b, UX-42, UX-08, UX-09 (+B11), UX-33, UX-44b, UX-28, UX-34, UX-36, UX-37, UX-38
  - Evidence: app jest 339 pass, pytest 532 pass, `pnpm a11y` 49 checks / 0 serious (incl. `/owner` ×5 views, light+dark); screenshots `docs/evidence/phase9/review-copy-brand/`. Not deployed or published.
- [x] T-074 `review-server-core` — ZC-02, UX-35, W1-DESK, ZC-14s, UX-39s, ZC-11s, INT-01s, INT-03, INT-16
  - Evidence (13 Nov, `phase9/review-server-core`): worker 588 passed (new: test_zoho_dc, test_call_log, test_brief_stage, test_reset, test_health, test_company_defaults), desktop 25, app jest 334 (6 load timeouts re-run green), lint/typecheck/boundaries green, replay ALL p50 576 / p95 978 ms, R4 0; security-auditor 0 C/H, M1+L1–L3 fixed; screenshots `docs/evidence/phase9/review-server-core/`.
Wave 2
- [x] T-075 `review-live-call` — UX-01, UX-03r, UX-16, UX-17, UX-18, UX-19 (+INT-11), UX-20, UX-21, ZC-08, W1-L1
  - Evidence (13 Nov, `phase9/review-live-call`): app jest 401 passed (`--maxWorkers=2`), desktop 25, typecheck + boundaries green, biome clean on the 26 changed files (copied config; `pnpm lint` checks nothing in worktrees), a11y 49 checks 0 serious, replay ALL p50 576 / p95 978 ms, R4 0; screenshots `docs/evidence/phase9/review-live-call/`.
- [x] T-076 `review-post-call` — UX-04, UX-05, UX-22, UX-23, UX-24, UX-27, UX-41, INT-01c, INT-02m, INT-07, INT-14a, W2-REPLAY + UX-02h
  - Evidence: app jest 379, engine 68, worker 593, desktop 25; typecheck, boundaries, biome (changed files) green; a11y 49 checks 0 serious; replay ALL p50 576 / p95 978 ms, R4 0, R2 drill p95 1270; screenshots `docs/evidence/phase9/review-post-call/` (checklist, edit, skip/undo, done; light/dark/ar; 390/1280). Branch `phase9/review-post-call`.
- [x] T-077 `review-home-shell` — UX-10 (+ZC-09, DD-8), UX-03h, UX-25, UX-26, UX-43b, UX-29, UX-39 (+UX-39r), ZC-14c, ZC-map-agent, W2-A11Y (practice step left out, owner Q15)
  - Evidence (13 Nov, `phase9/review-home-shell`): app jest 66 suites / 398 tests green with `--maxWorkers=2` (new: home-first-run, admin-company, health-banner, account-signin, reset-password, settings-personal, locale-os), typecheck/boundaries green, biome clean on owned files, `pnpm a11y` 64 checks 0 serious (routes + /home, /settings, /reset-password, /admin/integrations, /admin/company), signed-in screenshots against a local cloud (`SOTTO_SHOT_BASE`) in `docs/evidence/phase9/review-home-shell/`. No live-path change, so no replay.
Wave 3
- [x] T-078 `review-integrations` — done, merged on master 14 Nov (92ddfc7): UX-30, UX-32 (+ZC-03), ZC-07, ZC-13, UX-44c, W3-PRACTICE (D-073), W3-INT-EVID
  - Evidence: app jest 491, worker pytest 635, desktop 25, lint + typecheck + boundaries green; replay p50 576 / p95 978 ms, R4 0; 24 screenshots + axe 0 serious in `docs/evidence/phase9/review-integrations/`. Needs the master's `bundle.py` practice line before practice works on a server.
  - Master merge evidence (14 Nov): app jest 81 suites / 522, worker pytest 687 (cov 91.0%), engine vitest 75, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 79 checks 0 serious.
- [x] T-079 `review-owner-platform` — done, merged on master 14 Nov (3100918) — ZC-01, ZC-06, DD-1, DD-2, ZC-10, W3-OWN-A11Y
  - Evidence: worker pytest 639, engine vitest 75, app jest 470, desktop 25, a11y 76 checks 0 serious, replay p50 576 / p95 978 ms, shots `docs/evidence/phase9/review-owner-platform/`.
  - Master merge evidence (14 Nov): app jest 81 suites / 522, worker pytest 687 (cov 91.0%), engine vitest 75, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 79 checks 0 serious.
- [x] T-080 `review-company-coaching` — done, merged on master 14 Nov (04f1541) with its hub lines — ZC-11c, DD-4, DD-5, ZC-B10, UX-31, UX-06c, INT-05, INT-15
  - Evidence: app jest 78 suites / 493 tests, worker pytest 628, engine vitest 68, typecheck + ruff/mypy + boundaries green, a11y 64 checks 0 serious, replay p50 576 / p95 978 ms, R4 0; screenshots `docs/evidence/phase9/review-company-coaching/`.
  - Master merge evidence (14 Nov): app jest 81 suites / 522, worker pytest 687 (cov 91.0%), engine vitest 75, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 79 checks 0 serious.
Wave 4
- [x] T-081 `review-followup-automation` — done, merged on master 15 Nov (d74b85c) with its hub lines — INT-08, INT-09, INT-10, INT-13, INT-14b (+ T-080 weekly digest job)
  - Evidence: worker pytest 720 (cov 91%), app jest 83 suites / 537, desktop 29, typecheck + ruff/mypy + boundaries + biome green, a11y 79 checks 0 serious; 48 shots + axe 0 serious in `docs/evidence/phase9/review-followup-automation/`; security-auditor and tenancy-guardian: no C/H, mediums fixed. Replay not run (live path and `seed/prompts/` untouched).
  - Master merge evidence (15 Nov): app jest 88 suites / 561, worker pytest 836 (cov 91%), engine vitest 75, desktop 29, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 82 checks 0 serious.
- [x] T-082 `review-zoho-scopes` — done, merged on master 15 Nov (448537f) with its hub lines — W4-SCOPES, INT-02t, INT-04, INT-06, INT-16c, INT-12
  - Evidence: worker pytest 738, app jest 540, desktop 25, lint/typecheck/boundaries green, replay p50 576 / p95 978 ms R4 0, a11y 79 checks 0 serious; 32 shots + axe 0 serious in `docs/evidence/phase9/review-zoho-scopes/`.
  - Master merge evidence (15 Nov): app jest 88 suites / 561, worker pytest 836 (cov 91%), engine vitest 75, desktop 29, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 82 checks 0 serious.
- [x] T-083 `review-ai-autoconfig` — done, merged on master 15 Nov (1eb2618) with hub lines 1–6 (cap enforcement, alerts, scheduler, Zoho source, status codes) — ZC-04, ZC-05, ZC-12, W4-COST
  - Evidence: worker pytest 745 (coverage ok), app jest 82 suites / 528, engine vitest 75, desktop 25, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, cost estimate 0.0062 USD/min (synthetic), `pnpm a11y` 79 checks + `scripts/autoconfig-shots.mjs` 20 checks, 0 serious; shots `docs/evidence/phase9/review-ai-autoconfig/`.
  - Master merge evidence (15 Nov): app jest 88 suites / 561, worker pytest 836 (cov 91%), engine vitest 75, desktop 29, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, a11y 82 checks 0 serious.
- [x] T-084 `design-system` — Quiet Paper Glass from the owner's muse-ai reference (D-041): `docs/design/DESIGN-SYSTEM.md`, tokens + primitives in `packages/ui`, `tokens.css`/`components.css` for HTML, Inter + IBM Plex Sans Arabic, gallery screens in `docs/design/screens/` (branch `phase9/design-system`, `docs/design/READY`)
- [x] T-085 `redesign-app` — the desktop/web app on Quiet Paper Glass (D-041): shell (gray-fill nav rows, neutral unread count, glass phone top bar, inset banners), page header 34 px, Home, live-call chrome (Live pill, chip rail toggle, glass composer/listen capsules, glass End dialog), glass overlays (palette, profile, peek, tutorial), 22 px outlined cards, desktop window canvas; screens in `docs/design/screens/app/` (branch `phase9/redesign-app`)
- [x] T-086 `redesign-panels` — admin + web panels on Quiet Paper Glass (D-041): web admin shell/pages, owner console, Zoho connect pages, landing + legal (branch `phase9/redesign-panels`; evidence `docs/design/screens/panels/`)
- [x] T-087 `landing-redesign` — landing page redesigned with the antislop skills on Quiet Paper Glass (D-041): story around the call, real app screens, plain limits list, one download section with loading/error states (branch `phase9/landing-redesign`; evidence `docs/design/screens/landing/`)
- [x] T-088 `logo-refresh` — the blue D-041 logo is the only logo: icns/ico, tray.ico, favicons (svg/16/32/48), icon-512, landing logo/logo-dark/favicons, owner console favicon (new), Expo Android adaptive layers + splash, all regenerated from `docs/design/logo` (direction c) in `color.primary` #005bbf / dark #6aa8f7, favicon ink #2f7fe0 (branch `phase9/logo-refresh`; evidence `docs/design/screens/logos/contact-sheet.png`).
- [x] T-089 `landing-appeal` — landing v2 after the owner's "it is a mess": hero with a short headline and the live-call window on a blue stage (muse-ai composition), before/during/after band with app vignettes, two alternating feature rows (customer track only; no playbook answer), one inverse "will not do" panel, download stage, contact, fuller footer (branch `phase9/landing-appeal`; evidence `docs/design/screens/landing-v2/`)
- [x] T-090 `wave4-hardening` — Task/AGN-field writes 404 unless the `call_id` is the caller's own call in their company (`store.require_own_call`, isolation tests); D-074 "R12 rests on code for Deals"; `Consent.tsx` vendors are list items (axe critical fixed); a11y harness answers `/api/*` with 404 JSON (it served index.html, so `/admin/keys` and `/admin/settings` crashed blank and passed), fails on page errors or empty pages, and requires the consent panel on `/admin/settings` (branch `phase9/wave4-hardening`; not merged)

### Muse round 1 (17 Nov 2026, M-001)
- [~] T-091 Arabic "Practice" label on the call header — `sourceName()` in `lib/callSource.ts` localises the four word source names (practice → تدريب, mic → الميكروفون, computer → صوت الكمبيوتر, browser → مكالمة ويب); brand names stay Latin. `SourceChip` uses it for its label and accessible name. Evidence: `apps/app/lib/callSource.names.test.ts` (new). Written + parse-checked only; full gate pending (Mac R-001).
- [~] T-092 PageHeader moves to `@sotto/ui` — `packages/ui` `PageHeader` (chrome.tsx) gains the app header's `icon` disc and muted `subtitle`; `apps/app/components/PageHeader.tsx` is now a thin adapter (same props, same page spacing) so existing screens need no change. Evidence: `packages/ui/src/components/page-header.test.tsx` (new). Follow-up: delete the adapter and import from `@sotto/ui` directly (needs a repo-wide import sweep). Written + parse-checked only; full gate pending (Mac R-001).
- [ ] T-093 Fonts: self-host Inter + IBM Plex Sans Arabic as WOFF2, keep CSP `font-src 'self'` (D-077) — HTML pages (landing, owner console, Zoho pages) fall back to system fonts today; self-hosted fonts are WOFF. Needs the Mac: font files are binary (cannot go through the GitHub snapshot push), confirm the current files, place the WOFF2 files, remove the Google Fonts links, verify no CSP change is needed.
- [ ] T-094 DESIGN-SYSTEM §5.7 — still says "no gradients" and a 48 px display; landing v2 uses a `signal-fill` stage panel and a 64 px hero headline. Exact replacement text is in the 2026-11-17 session log; apply on the next pull. Also confirm §3.6 (display 48/56) against `apps/landing/styles.css`.

### Muse round 2 (18 Nov 2026, M-002)
- [x] T-095 "Watching for…" text — call screen/dashboard `start.watching` and `call.wait.apps` now read "Watching for Zoom, Teams, Meet, 3CX, Yeastar and more" (EN + AR "والمزيد"). Written + parse-checked only; visual check pending (Mac R-006).
- [x] T-096 Admin › People order — invite form moved above the member list in `features/team/TeamPanel.tsx`; list sorted newest-first (client-side `created_at`). Same component is used by the Account screen, so it changes there too. Written + parse-checked only; visual check pending (Mac R-006).
- [x] T-097 Vendor-only configuration (D-078) — Zoho AGN fields, SMTP, Gallabox + delivery webhook, and model configuration moved from the client app to the owner console, per organisation. Client config UI removed (route files stubbed to a "moved" notice; dead feature modules left in place for Mac `git rm`, R-005). Owner endpoints added: `GET|POST /api/owner/companies/{id}/zoho/agn-fields` (via a connected-admin surrogate), `GET|PUT|DELETE /api/owner/companies/{id}/smtp` + per-user `…/users/{uid}/smtp` (+ test), `GET|PUT|DELETE /api/owner/companies/{id}/gallabox{,…}` (+ load/discover/channel/allow/webhook), `GET|PUT|DELETE /api/owner/companies/{id}/routes/{stage}`. Client write endpoints removed: BYO keys/routes, org SMTP PUT/DELETE/test/preset, Gallabox webhook GET/POST. Evidence: `tests/cloud/test_email.py`, `test_gallabox.py`, `test_gallabox_webhook.py`, `test_agn_fields.py`, `test_owner.py`, `test_isolation.py` updated. Written + compile/parse-checked only; full gate pending (Mac R-004).
- [x] T-098 Email formats are rich text (D-080) — formats store Markdown; new `RichTextField` (bold/italic/list/link toolbar) in the extracted `FormatsEditor`; server renders `multipart/alternative` (plain part = markers stripped; HTML part = sanitised Markdown subset) only when the filled text contains Markdown — plain formats send exactly as before. Subject stays plain text. Evidence: `features/email/richText.test.ts`, `tests/cloud/test_email.py::test_rich_format_sends_markdown_as_html`. Written + compile/parse-checked only; full gate pending (Mac R-004).
- [x] T-099 Gallabox status only + template multi-select — client shows `GallaboxStatus` panel (status badge + channel label, no config); owner console company page has a templates `<details>` multi-select dropdown with per-parameter source selects (max 50, server re-validates against live Gallabox). Written + parse-checked only; visual check pending (Mac R-006).
- [x] T-100 Model visibility boundary (D-079) — bundle drops `providers[].models`, `overrides`, and `key_source`; client shows no model UI anywhere. Boundary: the effective provider+model per stage still reaches the device because calls go direct to vendors (D-038) — full invisibility would need server-side proxying, NOT in this round. Evidence: `tests/cloud/test_isolation.py` bundle-redaction assertions. Written + compile/parse-checked only; full gate pending (Mac R-004).
- [x] T-101 Company profile opens in a new tab — owner console: company rows open `/owner/company.html?id=<id>` in a new tab; the drawer (`renderDrawer`/`openCompany`/`table`/`resetPw`/`setActive`/`revoke` in `owner.js`, drawer `<aside>` in `index.html`) is removed. New `company.html`/`company.js` hold plan, users, devices, calls, audit, danger, plus the per-org sections from T-097/T-099. Written + `node --check` OK; visual check pending (Mac R-006).
- [x] T-102 Per-user SMTP (org → user → platform) — new table `smtp_user_accounts` (vault `smtp:user:<company>:<user>`); `send()` resolves the active scope user → org → platform; `senders()` returns the single active sender (`user`|`org`|`platform`). Evidence: `tests/cloud/test_email.py::test_user_smtp_wins_over_org_and_platform`. Written + compile-checked only; full gate pending (Mac R-004).

### Muse round 3 (19 Nov 2026, M-003)
- [x] T-103 DeepSeek as a first-class provider (D-083) — seed catalogue entry (`providers.yaml`: `deepseek`, `openai_compatible`, base URL `https://api.deepseek.com/v1`), `DEEPSEEK_API_KEY` host-bound in `adapters/factory.py` and `packages/engine/src/adapters/llm.ts` (`KEY_HOSTS`), prices in `prices.yaml` (flash $0.30/$1.20, v4-pro $1.32/$3.96 peak per MTok), `tenant-auth.yaml` `console_only`. Models are `deepseek-flash` and `deepseek-v4-pro` only — `deepseek-chat`/`deepseek-reasoner` were retired 24 Jul 2026 and are NOT added. Evidence: `tests/cloud/test_owner_providers.py` (DeepSeek test). Live benchmark not run (needs a real key).
- [x] T-104 Provider/model system, OpenCode model (D-081/D-082/D-084) — per-company `custom_providers` table + CRUD under `/api/owner/companies/{id}/providers…` (create/patch/delete, models add/patch/delete, test via `server/keytest.py`); seed + custom merge in `Catalog`/`company_catalog()`; route PUT validates against the ENABLED list (400 `model_unavailable`); `GET /api/owner/providers` honours `?company_id=`; built-in per-model toggles via platform override table `platform_model_overrides` + `PATCH /api/owner/providers/{pid}/models/{mid:path}`; bundle emits `base_url`, never the key. Custom keys vaulted as `ENDPOINT_<SLUG>_KEY` in `company_keys` (D-084 correction — the contract's vault name would have stranded them). Evidence: `tests/cloud/test_owner_providers.py` (15 tests).
- [x] T-105 Company page tiles + dropdowns + status (D-092/D-093) — 8 tiles (Users, Devices separate, Integrations, Models, Plan, Calls, Audit, Danger) opening a shared wide `<dialog>` with the existing section bodies; section ids `#sec-*`; stats strip gains an "Integrations: X of 5 set up" rollup; templates `<details>` picker replaced with a contained scrollable searchable list; every select labelled; model selects filterable when >6 models with a free-text fallback for empty lists; `.status.warn` added; Plan dropdown gains growth/scale. Evidence: `node --check` on `company.js`/`owner.js`; visual click-through pending (Mac R-009).
- [x] T-106 GitHub issue reporting (D-085) — vault `platform:github` + table `platform_github` (token write-only, owner-only; status shows repo + saved date); `GET/PUT/DELETE /api/owner/github` + `POST /api/owner/github/test` + `POST /api/owner/github/issues`; per-page GitHub icon (`.ss-icon-btn`) in every `.page-head` opening a dialog with the auto-filled page address + screenshot upload + description; screenshot upload `POST /api/v1/issue-attachments` (raw image body ≤5 MB, unguessable public URL, embedded as a Markdown image). Evidence: `tests/cloud/test_signup_otp_github_bugs.py` (attachment + issue tests, mocked GitHub transport). Repo + token still to be supplied by the owner.
- [x] T-107 Bug reports (D-086) — client form (title + description, page address auto-filled, optional screenshot upload) in Settings › About and ⌘K `act-bug-report`; `POST /api/v1/bug-reports` (only server-hosted attachment URLs accepted); owner review queue (`GET/PATCH /api/owner/bug-reports`, Bug reports tab: status filter, inline edit, Submit-to-GitHub, issue URL link) + `POST /api/owner/bug-reports/{id}/submit`. Evidence: `tests/cloud/test_signup_otp_github_bugs.py` (lifecycle + validation + uploaded-screenshot round trip). In-app queue works only where the browser also holds an owner session; in production the owner console is the queue.
- [x] T-108 Signup: new-company API + OTP + welcome email (D-087/D-088/D-089) — `POST /api/v1/companies` (CRM shared-secret HMAC, `X-AGN-Signup-Secret`); creates company + first admin (random password, `must_change=True`), defaults, `companies.billing_plan_code`; plan mapping SHIELD-STARTER/GROWTH/SCALE → starter/growth/scale; internal plans: starter 5→3 seats, new growth (10/5,000), scale (100/20,000); OTP `POST /api/v1/auth/otp/request` + `verify` (6-digit, 10-min TTL, hash-only, max 5 attempts, single-use, `{ok: true}` anti-enumeration); welcome email EN/AR in the background (only when a platform sender is configured); platform sender canonical path DB `smtp:platform`. Evidence: `tests/cloud/test_signup_otp_github_bugs.py` (21 tests). Zoho Billing webhook receiver deferred (D-090).
- [x] T-109 Client billing section (D-090) — `GET /api/v1/billing` (plan, status, price AED/month, seats/minutes used, `paid_until`, `upgrade_url`); `app/admin/billing.tsx` shows plan + price + usage + next charge with an Upgrade button only when the URL is real. Upgrade/subscribe links are `TODO-ZOHO-HOSTED-URL-*` placeholders until the real hosted page URLs are pasted in (Mac R-011). Evidence: `tests/cloud/test_signup_otp_github_bugs.py` (billing tests).
- [x] T-110 Take-a-tour (D-091) — client `Tutorial.tsx` auto-plays on first sign-in while `tutorialDone` is false (Skip + "Don't show this again" kept; closing without the box hides it for this sign-in only); ⌘K `act-tutorial` fixed to open it; new `AdminTour.tsx` (5 admin steps) in the admin layout with its own `adminTourDone` pref + "Play the tour" row in Settings › Advanced; admin console tour (5-step overlay, `localStorage sotto.adminTourDone`, "Take the tour" button in the sidebar). Evidence: parse-checked only; visual check pending (Mac R-009).
- [x] T-111 Landing Pricing section (D-090) — `#pricing` between `#download` and `#contact`, Pricing links in top + footer nav, three cards (Starter AED 990/3 agents, Growth AED 2,490/10, Scale AED 4,990/unlimited; 14-day trial, monthly, auto-renew, extra agent AED 149), each with one Subscribe link to the `TODO-ZOHO-HOSTED-URL-*` placeholder. EN/AR via `data-i18n`. Must not go live with the placeholders (Mac R-011).
- [x] T-112 Integration fixes — owner-console screenshot upload aligned to the server (was `POST /api/issue-attachments` + FormData; now `POST /api/v1/issue-attachments` + raw image body, both `company.js` and `owner.js`); bug-report screenshot URL normalisation (upload answers absolute, store keeps the relative path, submit re-prefixes with the origin); seed-model toggles wired in the Models tile (`PATCH /api/owner/providers/{pid}/models/{mid:path}`); bundle/`needed_keys` use `platform.company_seed` so custom routes resolve. Evidence: 145 worker tests pass in 13 suites in the sandbox throwaway tree (`/tmp/sotto-test/`).

## Waiting on owner

Things only the owner can do, so the agent never waits silently.

- [ ] **Phase 9 batch (12 Nov 2026):** (1) pick a logo direction once T-048 is ready; (2) DNS A record `salesshield.agncompu.com → 104.168.48.116` (say if Cloudflare proxies it); (3) Zoho OAuth Web Application client at api-console.zoho.com — client ID/secret into the app's key panel or the Mac `.env`, plus the redirect URI, data centre and a test org; (4) Zoho Forms embed code; (5) Hostinger sender address + SMTP login (key panel), optional Resend key; (6) Gallabox API key, secret, channel and the template list; (7) review Privacy/Terms drafts; (8) test Mac + Windows builds when asked.

- [x] **Hub decisions** — saved 2026-10-20 11:38 (all six = the recommendations: keys on server, SQLite, Electron, Xcode, manual billing, audio 30 days).
- [x] **Owner console first sign-in** — password changed, file deleted (checked 2026-10-20).
- [x] **Android SDK** — Android Studio set up, licence accepted by the owner.
- [x] **Xcode** — Xcode 27.1 installed (xcode-select still points at CommandLineTools; builds use `DEVELOPER_DIR`).
- [ ] Answer the Phase 0 interview, or simply correct the `ASSUMED:` lines in `docs/BRIEF.md` (D-009)
- [ ] Agree to `test-calls/PLAN.md` and set a recording date; check whether Yeastar can record split channels
- [ ] **Review-brief decisions on the hub** (2026-10-21): ship the Batch 0–6 fixes to the server and Mac app; T-029 first-token budget (R2 wording); T-035 manager email (Resend account, sender, recipient); T-038 practice call in real accounts; T-044 web bundle room; Batch 7 items
- [ ] Supply playbook content (owner says sent 2026-10-20; not found on the Mac, in the repo or on the server — ask where): products and prices, top 20 questions, top 10 objections, never-promise list (P0.3)
- [ ] Record 10 golden calls with consent (separate customer and agent tracks)
- [ ] Add 5–10 design references to `docs/design/refs/`
- [ ] Install Docker Desktop: run `brew install --cask docker-desktop` in a terminal (it needs your password), then open Docker once
- [ ] Accounts, when their phase arrives:
  - Phase 2: Groq + Google AI Studio (free, D-016); 3 STT vendors for the comparison (Deepgram, Speechmatics, AssemblyAI; free credits)
  - Phase 4: LiveKit Cloud + SIP trunk, Apple Developer, Google Play
  - Phase 1/5: Supabase dev project
  - Phase 7: Resend/Postmark
  - Phase 8: Sentry
- [-] Cloud sessions: set the API keys as environment secrets (owner: keys only in the Mac's `.env`), and allow network access to the vendors' domains
- [-] Trademark and domain check for "Sotto" (D-001) — superseded by D-026 (AGN Sales Shield)
- [x] Let Claude write `.env.example` (owner approved 2026-10-19; apply next session). The deny rule `Read(./.env.*)` in `.claude/settings.json` also blocks `.env.example`. Suggested: add an allow rule for `./.env.example`. Until then `docs/ENV.md` lists the variables.
- [x] Try the demo on the Mac (owner, 2026-10-19: "looks nice")
- [x] Answer the decisions page (submitted 2026-10-19; see `docs/OWNER-ANSWERS.md`): https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6. It replaces the Phase 0 interview and covers BRIEF, D-009 to D-015, accounts, hooks and `.env.example`.
- [ ] Free AI keys: `GROQ_API_KEY` (console.groq.com) and `GEMINI_API_KEY` (aistudio.google.com) in `.env` at the repo root on the Mac (`~/Documents/GitHub/sotto/.env`; copy `.env.example`). Only `.env` on the Mac (D-017). Not present on 2026-10-20.
- [x] Groq, Gemini, OpenRouter, Deepgram, AssemblyAI and Speechmatics keys in `.env` (2026-10-20). ElevenLabs is optional.
- [ ] (done above) Get the keys you choose (links and steps: `docs/PROVIDER-KEYS.md`) and put them in `.env`. Speech-to-text: pick any two of Deepgram, AssemblyAI, Speechmatics or ElevenLabs (recommended: Deepgram + AssemblyAI)
- [x] Deploy to us3: done by Claude on 2026-10-20 (ssh worked). Superseded by D-022, the management server.
- [-] (old) **Deploy the demo to us3** (Claude was blocked from ssh): `cd ~/Documents/GitHub/sotto && deploy/push.sh root@104.168.48.116`. It prints the HTTPS address and a one-time access code. Then add your keys in Admin → Keys & providers. Full guide: `deploy/README.md`.
- [ ] Review D-020 (hosted server, keys encrypted on the server) and D-021 (AssemblyAI main + Speechmatics backup STT, by measurement); both reversible.
- [ ] Retention: how long to keep call audio (owner chose "also keep audio" without a duration)
- [ ] Free tiers and customer data: choose before the first real customer call (owner: "not sure, explain more when it matters")
- [ ] Yeastar admin details and whether it can send a SIP trunk to LiveKit (P4)
- [ ] First 1–3 companies and agent counts
- [x] Review the design direction (D-014; approved on the decisions page) and the screenshots in `docs/evidence/p3/` and `docs/evidence/demo/`
- [x] Approve or edit two Claude Code hook changes (owner approved both 2026-10-19; applied 2026-10-20, commit d22c2cc) in `.claude/settings.json`. A review subagent suggested them; agents do not change their own hook config on a subagent's word.
  - **Stop hook:** send stdout to stderr, `{ pnpm -s typecheck && pnpm -s test; } 1>&2 || exit 2`, so Claude sees the tsc and pytest errors. Also exit 0 when the hook input has `"stop_hook_active": true`, so a machine without `uv` cannot trap the session.
  - **PostToolUse format hook:** today a Biome failure skips ruff with no notice. Run the two formatters independently.

## Known issues and tech debt

- [x] **Flaky under load (2026-11-12), fixed at the root (2026-11-13):** advancing 8 s of fake time in `call.test.tsx` stepped every looping animation (mascot, listening bars) frame by frame — ~0.8 s CPU idle, > 5 s under load. The test now runs with reduced motion (advance 1 ms real). Found on the way: the listening bars (`CardStack` `Bar`) ignored reduced motion (accessibility); they now use `useReduceMotion` (exported from `packages/ui`). The first attempt (`advanceTimers: true`) did not fix it.

- **T-015** (2026-10-20, D-022) Gaps in the cloud server. Not yet available in hosted mode:
  - custom endpoints (Ollama/vLLM): the Mac demo only;
  - Deepgram/ElevenLabs STT from the client: no short-lived token path yet;
  - password reset by email;
  - prompt versions stored on the server;
  - usage of calls made while offline is lost.

  Transcripts stay on the device by design (web keeps the last 30; phones keep them in memory only until a storage module exists).
- **T-019** (2026-10-20 evening) **Real-world test of the Mac app (D-022 client engine), spoken customer, live keys** against a local management server (`.test` account; keys loaded from `.env` by script, never printed). Found and fixed, each with a failing-first test: (1) the first ~1 s of microphone audio (while the STT token is fetched) was dropped, so the vendor's clock ran behind ours and a sentence following closely ("…main road. What would you tell her?") was discarded as a "late tail" — audio is now kept and sent once the vendor connects; (2) AssemblyAI ended every session at start ("Input Duration Violation 1400 ms": kept audio went as one chunk > 1 s) and the call silently ran on Speechmatics — kept audio now goes in 100 ms chunks; (3) the backup model received the primary's settings (gpt-oss `reasoning_effort: low`, 300 tokens) so Gemini 2.5 Flash thought, ran out of tokens and stopped mid-sentence — each route now uses its own settings (TS engine and Python router); (4) cards showed "On screen 0.00 s": on-device turn_end and card arrive together, the card's own `timing.first_token_ms` (from end of speech) is now used when longer; (5) a vendor cut after a dangling word ("with the." + "Apartment?") is joined; (6) a short customer statement just before a question is read with it (playbook, AI and escalation see the whole ask); (7) real accounts no longer see the two sample inbox questions. Final run: playbook cards 0.59–0.60 s, AI card 1.18 s complete, AssemblyAI the whole call. Replay: synthetic p50 567 / p95 1148 ms PASS; live first word p50 603 / p95 990 ms PASS. Still open: the STT label stays on the main vendor after a switch (the toast says it); "What is the payment plan for the two-bedroom apartment?" matches the price entry (TF-IDF prefers "two-bedroom"); one app jest run had 1 failure that 6 reruns did not reproduce (flaky, not identified). Desktop: `SOTTO_LOCAL_SERVER=http://127.0.0.1:8788` lets a dev build reach a plain-http local server.
- **T-016** (2026-10-20 17:00) Android release APK (arm64, debug-signed, 30 MB) built and on `/downloads/`; iPhone Release simulator build opens to sign-in on iPhone 18 Pro sim. Fixed: start-up hung on a blank screen when SecureStore refuses (unsigned build) — storage now falls back to memory (`__tests__/cloud-storage.test.ts`). Not tested on an Android device/emulator (emulator needs 12 GB free). Earlier note: The native microphone capture is still web-only (`features/call/mic.ts`): phone apps run typed and scripted calls; the spoken track on phones comes with LiveKit in P4 or a native PCM recorder.
- **T-017** (2026-10-20) Security review of the cloud server by the `security-auditor` subagent.
  - Findings: 0 critical, 1 high, 4 medium, 6 low.
  - Fixed the same day (commit 3f07b16; 7 regression tests in `tests/cloud/test_security.py`; 35 cloud tests pass):
    - H1: scoped key delivery, audited; no STT keys on devices; server-side key tests.
    - M1: the owner console is on its own origin.
    - M2: seats are checked inside the transaction and when a user is re-enabled.
    - M3: only failures count, the owner has its own limiter, IPv6 is grouped by /64.
    - M4: usage ids are per company.
    - L2: the first password is enforced on the server; a password change ends other sessions and is rate-limited.
    - L3: the Electron path check.
    - L4: an exact owner origin.
    - L5: systemd hardening, now rated 1.7 OK.
    - L6: an escalation rate limit.
  - M4b, fixed later the same day (8999602): the server records each call start, caps reported minutes by its own clock and refuses calls on an ended plan.
  - Open:
    - L1: signup and invite still reveal that an email exists.
    - L5: the uv installer has no checksum; there are no off-box backups.
- **T-018** (2026-10-20) The desktop installers are unsigned: Windows shows SmartScreen and the Mac first open needs right-click → Open. Fix with a code-signing certificate and Apple Developer notarisation.

- **T-002** (2026-10-18) — resolved the same night: cards and `turn_end` carry `turn_id`, and the app groups by it (commits a300a22, b5d81aa).
- **T-003** (2026-10-18) zod adds about 90 KB to the web bundle (426 KB of the 450 KB budget). Consider a zod/mini parser in `packages/shared`.
- **T-004** (2026-10-18) Drafting on partial transcripts (ARCHITECTURE §4) is not implemented. Today the suggest request starts on the final transcript.

- **T-005** (2026-10-20) Blocking work on the live event loop defeats the R2 timers. Provider SDK imports (OpenAI ~0.6 s, Anthropic ~1.1 s) are now done at start (`preload_adapters`, d8b10d1). Still open (latency-guardian review, carried to P4.4 and P6.7):
  - the Phase 4 worker entry must call preload, plus warm at room join;
  - company-specific routes must be preloaded at call start;
  - ~~HTTP keep-alive (httpx default 5 s) must outlast silences~~ — done 2026-10-20 (120 s + re-warm every 25 s per call);
  - `router.warm` must warm each stage separately (one `ModelFailsR1` skips both);
  - playbook lookup runs twice per turn; pass the result through.
- **T-006** (2026-10-20) On Groq the primary misses its 700 ms first-token deadline in about 18% of turns. The backup (Gemini) races but has not won yet. Watch this on real recordings, and consider a lower `reasoning_effort` or a non-reasoning model for `suggest` if p95 climbs.
- **T-007** (2026-10-20) **R1 risk: STT final latency.**
  - Problem: synthetic speech gives 0.6–0.9 s from end of speech to the final transcript (Deepgram p50 829 ms, AssemblyAI 667 ms). The ARCHITECTURE §4 budget is 350 ms for end-of-turn + final STT. Add model first-token time (~430 ms) and the total p50 is about 1.2 s, so p95 is likely over 1.5 s on real calls.
  - Plan:
    1. a `finalize()` per adapter, triggered by our own end-of-turn decision (VAD + turn model), instead of waiting for the vendor's endpointing;
    2. then compare Deepgram Flux (built-in end of turn);
    3. drafting on partials (T-004).
  - Measure with `pnpm stt:live`.
  - Step 1 done 2026-10-20 (night 2): `finalize()` on all four adapters; `pnpm stt:live` now also runs a "+final" pass that forces the final 200 ms after the last word. Deepgram p50 771 → 471 ms (max 502), AssemblyAI 625 → 330 ms (max 369; one word split "week. End"), Speechmatics ~280 ms either way. Remaining: call `finalize()` from the end-of-turn stage in the Phase 4 worker (P4.4), then steps 2–3.
- **T-009** (2026-10-20) **R1 on the spoken path, AI cards.** `pnpm spoken:live` (Deepgram, live models): playbook cards 0.6–0.7 s after the end of speech, but an off-playbook question's AI card took 1.8–2.1 s (the holding line still came at 1.34 s). Cause: the request starts only at the final transcript (~650 ms: 300 ms VAD quiet + forced final + 150 ms settle), then gpt-oss-20b first token 0.5–1.1 s. Bench of first token on the real prompt (10 turns each): Groq gpt-oss-20b p50 501 / max 706 ms; Gemini 2.5 Flash-Lite p50 488 / max 764 (always answers); Gemini 2.5 Flash mostly NO_SAFE_ANSWER; Gemini 3.1 Flash-Lite p50 2.7 s; Groq qwen3.8-27b no answers. Tried 2026-10-20: drafting the turn from the partial at our VAD end (T-004 idea) — **rejected on data**: at the 300 ms cut the partial lacks the last 1–3 words on every vendor (Deepgram "Another company quoted us" for "…us 20% less."; AssemblyAI "Is parking included with"; Speechmatics "What would you tell"), so cards would answer the wrong question. **Fixed 2026-10-20 (same night):** (1) T-005 keep-alive: model clients keep idle HTTPS connections 120 s (SDK default 5 s) and a live call re-warms them every 25 s; (2) late tails of a forced final are matched to their turn by audio start time, and an unfinished sentence waits 400 ms for its tail; (3) D-021 AssemblyAI main STT. Result, `pnpm spoken:live` ×3: off-playbook AI card **831 / 948 / 1168 ms** after the end of speech (was 1.8–2.1 s), playbook cards ~0.5 s, all sentences whole. Earlier levers kept for later: the fastest final (Speechmatics ~280 ms in `stt:live`; set STT main to Speechmatics in the panel and measure with `pnpm spoken:live`), a faster first token (Gemini 2.5 Flash-Lite), the end-of-turn model (P2.5) instead of fixed quiet, and speculative suggest that is only shown when the final matches the draft. Also seen: a long pause between two sentences ends the turn (silence-only VAD); the end-of-turn model (P2.5) fixes that.
- **T-008** (2026-10-20) Speechmatics on the free plan returns "Concurrent Quota Exceeded" on the third sequential clip. The free plan allows 2 sessions, and closed sessions seem to linger. Check whether the session close is graceful, or add a pause, before using it as a backup. Resolved 2026-10-20 (night 2): a 1.5 s pause between clips in `stt:live` avoids it (6 of 6 clips OK). On real calls one session per call is fine; the free plan still caps us at 2 concurrent calls.
- **T-010** (2026-10-20) Not yet verified on a real server: the Docker image build, Caddy certificate issuance on sslip.io, and the install script on us3's OS (Claude had no access). The first `deploy/push.sh` run is the test; read its output.
- **T-014** (2026-10-20) The first spoken call after a server (re)start can be slow on the AI path (one run: AI card 2.7 s, holding line on time at 1.4 s); warm runs give 1.0–1.3 s. Fixed the same night: model clients are shared across calls (keyed by route + key hash, so changes still apply) and warmed at server start; first call after a restart: AI card 1008 ms after end of speech (was 2.7 s).
- **T-013** (2026-10-20) code-reviewer pass on the overnight work: 3 high / 3 medium / 3 low, all fixed with regression tests — a fresh runtime per call (changes apply on the same screen, new hello if the vendor changes); each ended turn keeps a snapshot of its own t0 (a new sentence no longer shifts it) and later finals stay with the next sentence; Stop sends the last sentence; any STT failure switches to the backup with a notice; Safari AudioContext resume; push.sh only derives sslip.io from an IPv4; removing an inbox answer allows adding it again; long spoken turns capped at 2000 chars; finals clear the "Hearing…" line.
- **T-012** (2026-10-20) Fixed: `CallSession.drain()` spun forever (100% CPU) when a finished turn had not left `_tasks` yet; found by the speed check; regression test fails on the old code.
- **T-011** (2026-10-20) Silence-only end of turn (300 ms) splits a customer's two-sentence turn with a pause; replace with the end-of-turn model (P2.5). Step done the same night: when the *final* text ends mid-thought ("…worries about the", no sentence punctuation) the turn waits 500 ms more, and speech that resumes joins the same turn (`audio.mid_thought`, test `test_a_pause_mid_thought_keeps_one_turn`); `spoken:live` unchanged (~550 ms). Partial transcripts at the cut miss 1–3 words on every vendor, so drafting from partials was rejected (T-009).
- **T-001** (2026-10-18) `pnpm audit` ignores two high advisories that have no patched version and are reachable only through Expo build tooling:
  - GHSA-86w9-cpqp-85rv: node-forge via `@expo/cli`;
  - GHSA-vfj7-8cjw-p6xm: braces via `metro-file-map`.

  Both are listed in `pnpm-workspace.yaml` → `auditConfig.ignoreGhsas`. Remove them when Expo ships a fix; re-check at every Expo SDK upgrade.

## Ideas (not scheduled; need a requirement or decision first)

- Zoho brief: read `agent_note` and `risks` fields (wave-2 follow-up, left for later).

## Session log

### 2026-11-20 · Mac · `main` (Round 3 merged)
- **Done:** merged `claude/friendly-gates-fbhqdv` to `main`, fast-forward only (local main was 417 behind `origin/main`; pulled `--ff-only` first, then `--ff-only` merge — no force-push anywhere). `main` pushed to origin; new main HEAD is the branch tip `4381a65` (plus this record commit). No branches created, production untouched.

### 2026-11-20 · Mac · `claude/friendly-gates-fbhqdv` (R-011b landing publish + final push)
- **Done:** published the landing page (`deploy/publish-landing.sh root@104.168.48.116 --apply`; refreshed `apps/landing/downloads.json` first for the rebuilt 0.6.1 installers) and verified it live at `https://salesshield.agncompu.com/` (200, Pricing section, the three Subscribe links = the real Zoho hosted URLs SHIELD-STARTER/GROWTH/SCALE, no placeholders left). Pushed the branch fast-forward (`31cbd22..a313216`, no force); local and origin agree, working tree clean. First rsync attempt died with a broken pipe; the retry completed and Caddy validated + reloaded.
- **Still open (R-011 c/d):** GitHub repo + token for Account › GitHub issues, and the `sales-shield@agncompu.com` mailbox — both need the owner.

### 2026-11-20 · Mac · `claude/friendly-gates-fbhqdv` (R-010 deploy)
- **Done:** deployed the server + owner console from the branch to us3 on the owner's go (R-010). Backup `/var/lib/sotto/backups/cloud.db.pre-2026-11-20-round3` (sqlite3 backup API) first, then `deploy/push.sh root@104.168.48.116` from commit 23da9c6 — installer ran clean, `sotto-cloud` active, no journal errors. Verified: `/api/v1/health` 200, `/healthz` returns `{"ok":true,"service":"sotto-cloud"}`, app `/` 200, owner `/owner` 200, `/owner/company.html` + `/owner/company.js` 200 with CSP `default-src 'self'; script-src 'self'; …`. New tables (`custom_providers`, `platform_model_overrides`, `platform_github`, `bug_reports`, `issue_attachments`, `otp_codes`) and `companies.billing_plan_code` confirmed in the live DB, created by the store at start. Landing page not touched; branch not pushed.

### 2026-11-20 · Mac · `claude/friendly-gates-fbhqdv` (R-009 visual check)
- **Done:** rebuilt the app from the branch and installed it on the Mac (newest only; arm64 + x64 DMGs in `apps/desktop/release/`, NOT published; version still 0.6.1, no bump; the x64 DMG was rebuilt after a cleanup slip deleted it — both are builds of this branch). Verified R-009 (a)–(g) against a local management server in a scratch data dir (port 8789): company tiles/popups (all 8 clicked), Gallabox picker (code-only, no keys), admin + client tours (auto-play, Skip, don't-show-again, replay), GitHub icon dialog ("not set up" message), bug-review queue (list, inline edit, submit button), client billing screen (trial, seats, minutes, upgrade placeholder), landing Pricing (EN + AR, not published). Screenshots: `docs/design/screens/round3/` (42 PNGs).
- **Findings:** (1) the vendor-consent sheet reopens on every full page load until an admin saves the consent record (by design, ConsentStep) — it sits above the tutorial until "Later" is pressed; (2) the client web build served from `apps/app/dist` runs in demo mode unless exported with `EXPO_PUBLIC_SOTTO_SERVER` (the desktop web build names the prod server); (3) `create-owner` mints its own one-time password into the file (not the password you put in it) — I lost a turn to that; (4) the owner Users popup is list + Reset password/Disable, add-new/role-change live in the client app's Admin › People.
- **Not verifiable here:** Gallabox templates picker content (needs real keys), GitHub issue submission (needs repo + token, R-011), the Zoho hosted subscribe links (placeholders until R-011). Nothing pushed; production untouched.

### 2026-11-20 · muse (VM) + Mac · `claude/friendly-gates-fbhqdv` (R-008 gate fixes)
- **Done:** diagnosed the failing Mac gate on the VM and fixed all of it in 31 files: Biome owner-console/app errors (format, headings, list semantics, unused vars); `billing_info` now returns `seats_used` (was a typecheck error); expo-router mocks gained `useRouter`/`usePathname` (15 of the 16 jest failures); tutorial/admin-tour explicit request now replays after a close in the same sign-in (D-091, a real bug, not a stale test); ruff/mypy/boundary fixes; engine fixture regenerated for DeepSeek; manager-email test drains the D-087 welcome mail. Also seeded `sotto.adminTourDone` in the a11y harness so the auto-playing admin tour can't block its tab clicks.
- **Verification (Mac, head 31cbd222 + fixes, uncommitted):** lint GREEN (Biome 11 warnings only, ruff clean, boundaries ok); typecheck GREEN (all TS + mypy 228 files); test GREEN (shared 25, ui 189+100, supabase 12, engine 75, app jest 87/549, worker pytest 871 in 153 s, scripts pass); replay GREEN (synthetic ALL p50 576 / p95 978 ms, R4 0, R2 drill p95 1270); a11y GREEN (fresh export, 73 checks, 0 serious). The VM gate was green first with the same numbers; the Mac worker run's 6 first-run failures were 4 VM proxy-env artifacts + the 2 Round 3 omissions above. First Mac replay attempt failed on a pasted em-dash (`pnpm replay —all`); re-run with `--all` passed.
- **Push:** fixes NOT yet committed — 6 small commits follow on `claude/friendly-gates-fbhqdv` (owner console; jest mocks + D-091; app lint + a11y harness; worker lint/typecheck + seats_used; engine fixture + manager-email test; tracker/requests record). `fixes-r008.diff` is untracked and must be deleted, not committed.
- **Next:** R-009 (rebuild + install, verify the round-3 screens), R-010 (deploy on the owner's go), R-011 (Zoho hosted URLs, GitHub repo+token, SMTP mailbox — all owner-provided). No version bump (still 0.6.1).

### 2026-11-19 · muse · `claude/friendly-gates-fbhqdv` (round 3, M-003)
- **Done:** T-103 DeepSeek (flash + v4-pro, verified current; chat/reasoner retired, NOT added); T-104 provider/model system per the OpenCode model — custom providers in the DB, per-model enable toggles (seed + custom), per-stage picker over enabled models only, server-resolved endpoints; T-105 company page as tiles opening popups + dropdown fixes + status colours; T-106 GitHub issue reporting (repo+token vault, per-page icon, screenshot upload); T-107 bug reports (client form → owner review queue → GitHub); T-108 signup (new-company API, OTP, welcome email, plan presets aligned to Zoho Billing); T-109 client billing screen; T-110 take-a-tour (client + admin); T-111 landing Pricing section; T-112 integration fixes (attachment endpoint mismatch, screenshot URL normalisation, seed toggles, `company_seed` wiring). D-081–D-093 recorded; D-084 corrected (custom keys as `ENDPOINT_<SLUG>_KEY` in `company_keys`).
- **Verification here:** `py_compile` clean on all edited Python; `node --check` on owner JS; `esbuild` parses all 15 touched TS/TSX; i18n EN/AR parity clean (app 966 keys, landing keys, `data-i18n` all present); worker tests 145 passed in 13 suites in a throwaway tree (`/tmp/sotto-test/`, base dce4067a + staged overlay + Agent A's files) — the two new test files plus the updated `test_owner`/`test_email`/`test_reset`/`test_isolation`/`test_signup`/`test_blueprint`/`test_security`/`test_spend_enforcement`/`test_metering`/`test_persistent_login`/`test_accounts`. Full `tests/cloud/` suite (~45 files), app jest, `pnpm lint`/`typecheck`, replay, a11y NOT run in this sandbox — see `docs/muse/MAC-REQUESTS.md` R-008. UI click-through NOT done — Mac R-009.
- **Boundary (state plainly):** D-079 still holds — the effective provider+model per stage reaches the device (direct-to-vendor calls); full invisibility needs server-side proxying, NOT in this round. TTS is stored-only, not built (D-081). The Zoho Billing webhook receiver is deferred (D-090) — payments are the owner's on the Zoho end.
- **Push:** one `push_files` commit on `claude/friendly-gates-fbhqdv` (this commit). Head re-checked as `dce4067a` immediately before pushing. Flip T-103–T-112 to [x] once the Mac gate passes.
- **Next:** Mac pulls after the push, runs R-008 (full gate + replay), R-009 (rebuild + install, verify the round-3 screens), R-010 (deploy server/owner console on the owner's go), R-011 (hosted payment page URLs + landing publish + final push, GitHub repo+token, sender mailbox). No version bump (still 0.6.1).

### 2026-11-18 · local Mac · Sonnet 5.5 · `claude/friendly-gates-fbhqdv` → `main` (Mac requests R-001..R-007)
- **Done:** ran the full gate on Muse's rounds 1–2 (red at first), fixed what the sandbox could not see, did R-005 `git rm`, migrated 38 worker tests, built and installed the Mac app, checked the screens, deployed to us3, fast-forwarded `main`.
- **Fixes on the Mac:** biome/ruff format + import order; `RichTextField` type (`TextInputSelectionChangeEvent`); mypy narrowing in `tests/cloud/test_email.py`; `pnpm gen` refreshed `packages/engine/src/__tests__/bundle.json`; `features/keys/api.ts` KEPT but trimmed to types + read-only `keysApi.list` (still imported by `features/settings/Health.tsx`).
- **Worker tests after D-078:** company key/route routes are gone (405). Tests now use `tests/cloud/byo.py` (`own_key` writes at the store; `own_route` uses `/api/owner/companies/{id}/routes/{stage}`), `owner_login` + `set_org_smtp`/`setup_org` for SMTP and Gallabox, and the D-079 bundle (no `key_source`). Retired because the feature is gone: 4 `/company/smtp/preset` route tests (the preset logic tests stay), the company key-test route test (owner `keys/{env}/test` is covered), the agent-403 check on Gallabox discover (covered in `test_gallabox`).
- **Gotchas for the next agent:** `pnpm a11y` needs a fresh `pnpm --filter @sotto/app export:web` and Playwright Chromium (`pnpm exec playwright install chromium`); `pnpm replay --all` works as written (it is the `replay` script with `--all`); the web build only talks to a server when `EXPO_PUBLIC_SOTTO_SERVER` is set at export time; the Electron build config builds arm64 and x64 together; the first-run consent sheet covers admin screens until consent is recorded (`PUT /api/v1/company/defaults`).
- **Left:** see Now › Open. No version bump was made (still 0.6.1); the next release should bump it and publish installers (owner's go).

### 2026-11-18 · muse · `claude/friendly-gates-fbhqdv` (round 2, M-002)
- **Done:** T-095 watching text (EN+AR, both strings); T-096 People invite on top + newest-first; T-097 vendor-only config — owner endpoints for AGN fields (connected-admin surrogate), org + per-user SMTP, Gallabox + webhook, per-company model routes; client write endpoints and config UI removed, model routes stubbed to a "moved" notice (dead modules left for Mac `git rm`, R-005); T-098 email formats as Markdown rich text with `multipart/alternative` send; T-099 Gallabox status-only client panel + template multi-select dropdown in the owner company page; T-100 bundle redaction (`providers[].models`, `overrides`, `key_source` dropped); T-101 owner company profile as a new-tab page (`company.html`/`company.js`, drawer removed); T-102 per-user SMTP (user → org → platform). D-078/D-079/D-080 recorded. Six worker test files updated (email, gallabox, gallabox webhook, agn fields, owner, isolation).
- **Verification here:** all edited Python files `py_compile` OK; all staged TS/TSX parse OK (`npx esbuild`); `owner.js`/`company.js`/`a11y.mjs` `node --check` OK. A live pytest run was attempted in a throwaway tree (`/tmp/sotto-test/`, venv `/tmp/sotto-venv`): the missing repo modules were being fetched from GitHub one at a time when this round was written up — the suite has NOT run green yet. Full gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, replay, a11y) NOT run in this sandbox — see `docs/muse/MAC-REQUESTS.md` R-004.
- **Boundary (state plainly):** D-079 — the effective provider+model per stage still reaches the device because calls go direct to vendors (D-038 architecture); full invisibility would need server-side proxying, which is NOT in this round.
- **Push:** one `push_files` commit on `claude/friendly-gates-fbhqdv` (this commit). Head re-checked as `0a48cf56` immediately before pushing. Flip T-095–T-102 to [x] once the Mac gate passes.
- **Next:** Mac pulls after the push, runs R-004 (full gate + replay), R-005 (`git rm` the stubbed/dead files), R-006 (rebuild + install, verify the round-2 screens), R-007 (deploy server/owner console on the owner's go). Commercialisation (3 landing-page plans + Zoho Billing subscriptions + hosted purchase → auto-created preconfigured accounts) is a separate next round — remind the owner; it is NOT in this push.

### 2026-11-17 · muse · `claude/friendly-gates-fbhqdv` (round 1, M-001)
- **Done:** T-091 Arabic source names (`lib/callSource.ts` `sourceName()`, `SourceChip` uses it; new `lib/callSource.names.test.ts`); T-092 PageHeader implementation moved to `@sotto/ui` `PageHeader` (`chrome.tsx`: `icon` + muted `subtitle`), app's `components/PageHeader.tsx` is now a thin adapter with the same props and page spacing; new `packages/ui/src/components/page-header.test.tsx`. Tracker `Now` refreshed to 0.6.1 (it still said 0.5.0); next ladder step named (0.7.0 WhatsApp panel wiring, T-061/T-063/T-065).
- **Not done:** DESIGN-SYSTEM §5.7 (T-094) — exact replacement ready, file not re-fetched this round: replace "Hero: `.ss-display` 48/56 headline, 18 px lead, a static `.ss-suggestion` card demo (the product shot), no gradients/blobs." with "Hero: 64 px headline, 18 px lead, the live-call window on a flat `signalFill` stage panel, a static `.ss-suggestion` card demo (the product shot). No gradients or blobs: the stage is a solid fill." Also add to DECISIONS.md as D-077: "HTML pages self-host Inter + IBM Plex Sans Arabic as WOFF2; CSP `font-src 'self'` stays (no Google Fonts link, no widening)." — T-093, needs the Mac for the binary font files.
- **Verification here:** the 6 touched/new code files parse (`npx esbuild`, syntax only). Full gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, replay, a11y) NOT run in this sandbox — see `docs/muse/MAC-REQUESTS.md` R-001.
- **Push:** one `push_files` commit on `claude/friendly-gates-fbhqdv` (this commit). The 13:46 429 had cleared — the head was re-checked as `49b2e422` immediately before pushing. Flip T-091/T-092 to [x] once the Mac gate passes.
- **Next:** Mac pulls after the push, runs R-001 (gate + Arabic header screenshot + PageHeader screens), R-002 (WOFF2 fonts), R-003 (rebuild + install, verify on the Mac).

### 2026-11-16 · local · Opus 5.5 · master `claude/friendly-gates-fbhqdv` (owner decisions of 15 Nov)
- **Done:** D-075: `ZohoCRMReader.update_deal_fields` sends `"trigger": []` (Zoho v8: omitted = workflow/approval/blueprint run; `[]` = none); Contact update and creates unchanged (same as a manual edit). D-076: `playbook_bootstrap` in `features.json` (admin/manager, default off), every bootstrap route gated after the role check (`feature_unavailable`/`off_by_org`), app `BootstrapPanel` wrapped in `FeatureGate`, strings EN/AR. Tests: `test_agn_fields` (body pins `trigger: []`), `test_bootstrap` (off by default → 403 on all 5 routes; admin turns it on → allowed), `test_features`, `bootstrap.test.tsx` (off → reason, no route call; agent hidden).
- **Gate:** lint + typecheck green; app jest 88 suites / 564 (`--maxWorkers=2`); worker pytest 840 (coverage 91%); replay p50 576 / p95 978 ms, R4 0.
- **Next:** 0.6.0 release steps (owner); deploy only on the owner's go.

### 2026-11-15 · local · Opus 5.5 · phase9/wave4-hardening (child of master, T-090)
- **Done:** (1) `cloud/zoho/routes.py` `action()` calls `store.require_own_call` for `task` and `agn_fields`: the id must match a `call_starts` or `usage` row of the same company and user, else 404 `not_found` before anything reaches Zoho. Tests: `test_zoho_tasks.py::test_a_task_on_another_persons_or_companys_call_is_404` (other company, same-company colleague, never-started id; a reported-only call still works), `test_agn_fields.py::test_agn_fields_on_another_companys_call_are_404`; fixtures now start `call-abc`. (2) D-074. (3) T-081's critical was real (`aria-required-children`: `<ul role=list>` with `role=none` children); master's 0 came from `/admin/settings` crashing blank in the harness. Fixed in `Consent.tsx` (`listitem`) + jest test; `scripts/a11y.mjs` hardened (see T-090).
- **Gate:** worker pytest 838 (coverage 91%), app jest 88 suites / 562 (`--maxWorkers=2`), typecheck green, biome clean (explicit paths; `pnpm lint` checks nothing in a worktree), lint:worker + boundaries ok, a11y 82 checks 0 serious (before the Consent fix: 3 critical on `/admin/settings`). No live-path change, so no replay.
- **Open:** `call_log` writes take a `call_id` the same way (only deduped per person; not changed, out of scope); practice calls have no `call_starts` row, so a Task/AGN write after a practice call now 404s (intended: practice never reaches Zoho); the first-run consent *sheet* itself needs a signed-in cloud stub to be axe-checked (its panel is checked on `/admin/settings`). Deal `trigger` and `playbook_bootstrap` untouched (owner).
- **Next action:** master merges `phase9/wave4-hardening` (`--no-ff`), reruns the gate there.

### 2026-11-15 · local · Opus 5.5 · claude/friendly-gates-fbhqdv (master, subagent)
- **Merged wave 4** (`--no-ff`, after `git fetch`): T-081 d74b85c, T-082 448537f, T-083 1eb2618. Only `docs/TRACKER.md` conflicted (both sides kept).
- **Hub lines applied (D-058):** T-081: `useFollowupNotices()` moved from Home to `AppShell` (once per app); `/admin/attachments` in `scripts/a11y.mjs`; `zoho_csv_weekly` job registered (scope bundle already in T-082's `oauth.SCOPES`). T-082: `HEALTH_FIX` + `config_health` reason `zoho_scopes_outdated`, `HealthReason` union in `lib/cloud.ts`, isolation test line for the weekly CSV. T-083 1–6: spend cap withholds AGN platform keys in `bundle` (`keys_for_call(platform_withheld=)`, BYO keys still go out) and STT tokens in `stt_token` (`effective_key(platform_withheld=)`, 402 `plan_blocked`); `/usage` runs `metering.check` and emails every owner once per level (log only without a platform mailbox); scheduler jobs `spend_cap_check` (daily), `routing_weekly`, `key_rotation_purge` (hourly), `zoho_csv_weekly`; Zoho `zoho_call` exposed to the bootstrap (its `zoho` flag now also needs the person's own working connection); STATUS codes `consent_required` 409, `off_domain`/`private_address` 422. New `tests/cloud/test_spend_enforcement.py`, `test_health.py::test_zoho_scopes_outdated`.
- **Tests adapted, not loosened:** `test_zoho_watch` (a fresh connect now has the notifications scope, so the "without the scope" case strips it, as an older connection); `test_metering` cap test reports usage before the cap is set (the app's own `/usage` check would record the alerts first); `test_bootstrap` Zoho source now expects `feature_unavailable`/`needs_connection` (wired) instead of the unwired `zoho_reconnect`; `test_health` token-expired case connects with the full bundle.
- **Gate:** app jest 88 / 561, worker pytest 836 (cov 91%, floors ok), engine vitest 75, desktop 29, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 0, R2 drill p95 1270 ms, a11y 82 checks 0 serious. Not deployed; no installers.
- **Not applied:** T-083 line 7 (optional `playbook_bootstrap` feature flag: needs a default-state decision). Open from children: R12 Deal update `trigger: []` (owner choice); Task/AGN-fields `call_id` not checked against the caller's usage row (fixed in T-090); managers see company-wide WhatsApp statuses (no teams); `features/admin/Consent.tsx` list role (axe critical seen by T-081 for a new admin; fixed in T-090); draft decision text for "R12 rests on code for Deals" (now D-074, T-090).
- **Next:** owner items (spend caps, routing cap, demo org, Gallabox webhooks, Zoho reconnect note, `pnpm replay:live`), then deploy on the owner's go.

### 2026-11-14 (j) · local · Opus 5.5 · phase9/review-followup-automation
- **Done (T-081):** server: in-process scheduler `cloud/scheduler/` (steps move pending → due once, in one UPDATE; survives restarts; jobs claim their last run in SQLite; one runner per process; `serve` starts it, tests tick a fake clock) with follow-up plans (email today → WhatsApp template in n days → call reminder; pause/resume/cancel; a step is `done` only if the email/WhatsApp send log has the step's own key `fu-<id>` for that agent; drafts allow-listed and cleared when finished; nothing in the package imports a sender, by test). Jobs: T-080 `coaching_weekly_digest` (daily; the hook is idempotent) and `zoho_watch_renewal` (6 h). INT-09 meeting reminders: `meeting_reminders` flag default off (new catalog `"default": "off"`), UTILITY allow-listed templates only, one tap each. INT-10: `gallabox/webhook.py` (per-org URL + secret shown once, base64 HMAC-SHA256 in `x-gallabox-signature`, 401 on bad HMAC, status only, monotonic, only messages the org sent; `whatsapp_status` flag default off). INT-13: `zoho/webhooks.py` (v8 `POST/PATCH /crm/v8/actions/watch` checked against the docs; channel per connection, 6-day expiry, renewed 2 days before; callback token hashed, expired channels refused, failures and per-channel rate limited; a Deals/Events change rebuilds recent call briefs via `lookup.build_brief`; `zoho_watch` is `needs_connection` until the connection has `ZohoCRM.notifications.ALL`). INT-14b: `email/attachments.py` (admin-only uploads, PDF/PNG/JPEG/docx/xlsx/pptx by name + type + first bytes, 5 MB / 20 files / 25 MB per company, isolation test; send attaches only the org's files; preview lists names). App: `features/followup/` (PlanSetup under the follow-up card, PlanStatus with delivery status, DueSteps on Home, `/home?step=<id>` opens the step in the usual composer with the step's key, desktop notices every minute); EmailAction attachments picker (UX-22 "attached" warning clears), WhatsAppAction template preset; Admin › Connections › Attachments; Gallabox webhook block in GallaboxSettings. Desktop: `notify.cjs` (own pages only, 16-hex step id, short text; click → focus + `notify-open`).
- **Hub lines for the master (D-058; all already in this branch's hubs):** `cloud/app.py` mounts `followup_routes`, `gallabox_webhook`, `zoho_webhooks`, the scheduler + lifespan + `CloudConfig.run_scheduler/clock`, `hook_origin`, `zoho_notify_limit`, status `not_sent`; `cloud/__main__.py` `run_scheduler=True`; `cloud/store.py` default-off org layers, `zoho_scopes`, `ZOHO_NOTIFY_SCOPE`; `cloud/features.py` + `features.json` five features; `admin/_layout.tsx` Attachments page (own-label type); `lib/desktop.ts` `notify`/`onNotifyOpen`. **Needed outside my files:** `features/flags/{catalog,strings}.ts` (five ids + en/ar, done here, test keeps them equal to the catalog); `__tests__/admin-desktop-tabs.test.tsx` (Connections now has two pages; assertion updated, not loosened); `components/AppShell.tsx`: call `useFollowupNotices()` once (now on Home only, so notices stop when Home is not mounted); `scripts/a11y.mjs`: add `/admin/attachments`; T-082: add `ZohoCRM.notifications.ALL` to `oauth.SCOPES` (store constant `ZOHO_NOTIFY_SCOPE`) and register its weekly CSV job with `scheduler.register("zoho_csv_weekly", 7 * DAY_MS, job)` in `app.py`.
- **Owner steps:** confirm the Gallabox plan has webhooks, then Admin › Features › "WhatsApp delivery status" on, Admin › Integrations › WhatsApp › "Create webhook URL", paste URL + secret into Gallabox › Settings › Webhooks with `Message.WA.Status.Received/Failed`, and check the real payload in Gallabox › Webhooks › Logs (shape undocumented; the parser looks in `whatsapp.id/status`, `message.*`, `messageId`, `status`). Zoho callbacks need `https://<public origin>/api/hooks/zoho/notify` reachable (master, after deploy). Meeting reminders stay off until an admin turns them on.
- **Open:** the wave-3 AI-vendor consent step's vendor list is `accessibilityRole="list"` with non-listitem children (axe critical `aria-required-children` on every page for a new admin; `features/admin/Consent.tsx`, not mine). Managers see company-wide WhatsApp statuses (teams are not modelled; R3 says own team).
- **Next:** master merges `phase9/review-followup-automation`, adds the AppShell/a11y lines, runs the gate; T-082 adds the scope.

### 2026-11-14 · local · Opus 5.5 · phase9/review-zoho-scopes
- T-082 built (wave 4). W4-SCOPES (D-069): `oauth.py` `FEATURE_SCOPES` bundle (tasks.CREATE, deals.UPDATE, settings.fields.READ/CREATE, campaigns.READ, notifications.ALL), names checked against Zoho v8 docs; per-feature gating so old connections keep their reads/writes; `/zoho/status` gives `scopes_outdated` + `features`. Blueprint is read per record with deals.READ (no Blueprint/layout scope).
- INT-02t `task` kind (owner + due date confirmed, `task-{call_id}` idempotent, audited; `GET /zoho/owners`). INT-06 `agn_fields` kind + adapter allow-list (`update_deal_fields`; Stage/Amount and any other Deal field refused before a request, R12 tests), admin `GET/POST /zoho/agn-fields` creates only missing fields. INT-04 `GET /zoho/deals/{id}/blueprint` + rail checklist (read only, "add to prep notes"). INT-16c campaign line (`crm_brief` v4 `campaign_label`, `pnpm gen`). INT-12 `cloud/export/` weekly CSV (admins, own company, no call text, formula-safe) + `weekly_export_job`, mounted from `zoho/routes.py`.
- Security/tenancy review: 0 C/H; fixed CSV formula cells, export join by user, ASCII ids. Open (to master): HEALTH_FIX/config_health line, HealthReason union, isolation test line, `trigger: []` choice, call_id ownership check.

### 2026-11-14 · local · Opus 5.5 · phase9/review-ai-autoconfig
- **Done (T-083):** ZC-04 playbook bootstrap (`cloud/bootstrap/`: consent-gated, drafts in their own table as "needs review", approve → one playbook entry; website read SSRF-guarded: https, own domain, public IPs pinned with SNI, redirects re-checked, size/time caps, no compression, linear HTML parse; Zoho won deals + notes read-only; pasted text stays on the device; `seed/prompts/playbook_bootstrap.md` runs on the device's summary stage; app panel + review queue on Playbook). ZC-05 routing job (`cloud/routing/`: benchmarks per live stage, R6 guard, canary on the demo org only, promote or roll back on worse p95/quality; off while `routing.monthly_cap_usd` is unset, "Waiting for golden calls" until P0.5; tested on the synthetic set via `replay/routing_bench.py`). ZC-12 key rotation (next key in the next bundle, old key retiring 20 min then deleted, never in a response), per-company metering from reported calls, spend caps with one 80 % and one 100 % alert, vendor sub-key/token research `seed/models/tenant-auth.yaml`. W4-COST `seed/models/prices.yaml` + `pnpm cost:estimate`.
- **Reviews:** security (fixed H regex slowdown, total fetch timeout, compression, NAT64/6to4, async DNS, atomic approve); tenancy (fixed demo org needs an all-vendors consent, canaries move with the demo org, accepted users only for domains, BYO metered per stage); latency PASS (fixed R6 during a canary, check_route on candidates, 20 canary calls, baseline after the last route change).
- **Open (master, D-058):** hub lines in the shared notes `review-ai-autoconfig-handover.md` — cap enforcement in `keys_for_call`/`bundle`/`stt_token`, alert on usage, scheduler entries, Zoho `zoho_call`. Until merged, caps are shown but not enforced.
- **Owner:** set `routing.monthly_cap_usd`, the demo org and per-company caps (no defaults); run `pnpm replay:live` for the live cost estimate (spends money).

### 2026-11-14 (i) · local · Opus 5.5 · claude/friendly-gates-fbhqdv (master, subagent)
- Merged wave 3 with `--no-ff`: `phase9/review-owner-platform` (3100918), `phase9/review-integrations` (92ddfc7), `phase9/review-company-coaching` (04f1541); tracker conflicts kept both sides.
- Hub lines applied (D-058): `app.py` mounts the coaching routes (`CoachingStore`, seed prompts, `config.mailer`) and adds the company's tone/call goal to the bundle settings; `bundle.py` ships `practice` (from `seed/practice/practice.json`, no `expect`), uses the company tone/call goal, `agent_context` from the seed profile only (D-062); `store.py` drops the `agent_context` setting (an older app sending it is ignored), accepts `tone`/`call_goal` (≤ 300 chars, audited) in company defaults, `text_defaults()`, `client_id_tail` (last 4) in `zoho_client_status` org; `runtime.py` uses `COMPANY_SETTINGS`; `zoho/routes.py` `client_of` → `Client.from_store(c)`; `scripts/a11y.mjs` + `/coaching`; `pnpm gen` refreshed the engine bundle fixture. Lint fixes: biome format on two files, `admin/instructions.tsx` diff key without the index.
- New tests: tone/goal saved and in the bundle, retired `agent_context` ignored, practice in the bundle, `client_id_tail`.
- Gate: app jest 522, worker pytest 687 (coverage 91.0%, floors ok), engine vitest 75, ui vitest 189 + jest 96, lint + typecheck green, replay p50 576 / p95 978 ms, R4 0, R2 drill p95 1270, a11y 79 checks 0 serious. Not deployed; no installers.
- Left for later: `weekly_digest_job` scheduling (T-081); "Practice" source name in English on the Arabic call header (`lib/callSource.ts`); ZC-12 per-tenant sub-keys (wave 4).
- Owner items from the children: enable multi-DC on the Zoho API client; add the Zoho Forms webhook (URL + `X-AGN-Signup-Secret` from Sign-up queue › New secret); legal consent text and sub-processor list (`features/admin/consentText.ts` is DRAFT).

### 2026-11-14 (h) · local · Opus 5.5 · phase9/review-company-coaching
- T-080 built. Server: new `cloud/coaching/` (coaching view scoped by role, no ranking; device signals; playbook suggestions from repeated "not helpful" questions and answered escalations, approve/reject audited; weekly digest opt-in + preview + `weekly_digest_job` hook for T-081), learned items carry `source_label`, `company.COMPANY_SETTINGS` without `agent_context` (D-062). Seed: `coaching_digest`, `playbook_suggest` (bundle fixture regenerated with `pnpm gen`).
- App: Admin › Company defaults (tone, goal, record policy, AI answers, manager, vendor consent); first-run consent sheet with DRAFT text in `features/admin/consentText.ts`; personal Settings shows the record policy read-only; instructions diff + editor hidden while pending + counter > 20 words + call names; "AGN learned n things" card; `/coaching` for every role; playbook suggestion cards.
- Waiting at merge (hubs): mount coaching routes in `app.py`; `store.py` accept `tone`/`call_goal` in company defaults + `bundle.py` use them; `bundle.py` agent_context from the profile only; drop the `agent_context` setting; `runtime.py` use `COMPANY_SETTINGS`; a11y route `/coaching`. Owner: legal text and sub-processor list.

### 2026-11-14 (h) · local · Opus 5.5 · phase9/review-integrations
- **Done (T-078):** server: SMTP presets from the admin's domain (`/company/smtp/preset`, known map + MX via `dnspython`, D-052); Gallabox `discover` (numbers as opaque refs, APPROVED templates, guessed parameter sources, only unmapped shown) + `channel` pick, the allow-list saves the mapping, and a send without a number is refused; `/zoho/team` preview + `/zoho/team/invite` (confirm, seats all-or-nothing, audited, isolation-tested). App: Integrations order Zoho → Email → WhatsApp, the org client form is gone (override line only, D-064), SMTP only-password presets + test email on save, Gallabox pick lists, invite from Zoho, reasons on disabled buttons; practice call (`seed/practice/practice.json`, `/call?practice=1`, Home step, nothing kept).
- **Evidence:** jest 491, pytest 635, desktop 25; replay p50 576 / p95 978 ms; axe 0 serious on 24 shots (local server with a fake Gallabox and SMTP; nothing external).
- **Next:** master adds `"practice"` to `cloud/bundle.py` and `client_id_tail` to `store.zoho_client_status`, then merges. Note: `lib/callSource.ts` shows the source name "Practice" in English on the Arabic call header.

### 2026-11-14 · local · Opus 5.5 · phase9/review-owner-platform
- T-079 built: owner console views Providers and keys, Model routing (benchmark guard, rollback), Prompt studio (persisted `prompt_versions`, synthetic test, publish, rollback), Health (ZC-06 cross-tenant demotion, carried in `/api/v1/features` + bundle `demoted_until`; engine router uses the backup first), Zoho clients (per-DC secret + owner overrides, D-064), Sign-up queue (Zoho Forms webhook, approve/suspend/delete, D-068). `byo_providers` entitlement gates company key/model/prompt writes (403 off_by_platform); web admin Keys/Models/Prompts show the reason.
- Schema: new tables only, created in place; first start switches BYO on for companies that already had their own keys or routes (nothing stops working).
- Reviews: tenancy (fixed: team/campaign prompt slots now per company; sign-up PII deleted with the company); security (fixed: AGN keys reach a self-signup company only after the owner approves it; only approved companies with calls in the last 30 days count toward a demotion; webhook secret checked before the global rate limit). Open (wave 4, ZC-12): per-tenant sub-keys instead of shipping platform keys to devices.
- Needs the master: `cloud/zoho/routes.py` `client_of` → `Client.from_store(c)`; `tests/cloud/test_reports.py` BYO line (done here, outside the owned list); new helper `tests/cloud/byo.py`, `scripts/owner-platform-stubs.mjs`.
- Owner steps: enable multi-DC on the Zoho API client; add the Zoho Forms webhook (URL + header `X-AGN-Signup-Secret` from Sign-up queue › New secret).

### 2026-11-14 (g) · local · Opus 5.5 · claude/friendly-gates-fbhqdv (master, subagent)
- **Done:** owner answered the 15 backlog questions "all recommended". Recorded D-042…D-058 (backlog technical drafts, same numbers as the code comments) and D-059…D-073 (one per owner answer, Q1…Q15) in `docs/DECISIONS.md`, with pointers on D-019, D-022, D-024, D-031, D-038, D-039 and the phase 9 brief line (D-043). REQUIREMENTS: R3 self-signup (D-068) and BYO note (D-059), R4 "(platform default)" (D-062), R6 Keys & providers and prompt studio in the owner console (D-059, D-061); R12 untouched. Six wave 3–4 prompts in `docs/prompts/review-*.md`; T-078…T-083 ready. Practice call (Q15, T-038) assigned to T-078.
- **Owner inputs still open:** live cost-per-minute replay (D-060, spends money); `routing.monthly_cap_usd` and per-company spend caps (D-061, D-067; no default); sub-processor list and legal text (D-063); Zoho multi-DC switch (D-064); Gallabox webhook plan (D-071).

### 2026-11-14 (f) · local · Opus 5.5 · phase9/logo-refresh
- **Done (T-088):** no blue logo file existed; only the in-app `BrandSymbol` was blue (it draws `color.primary`). `build.mjs`/`export.mjs` switched to the D-041 blues and rerun for direction (c); `export.mjs` now also writes the landing copies (same names, no HTML change), `cloud/owner/favicon.svg` and the Expo Android/splash images (were Expo defaults; `app.json` adaptive `backgroundColor` → #005BBF). Owner console: `<link rel=icon>` + `favicon.svg` in the owner file allow-list, 2 pytest. macOS tray template unchanged (black + alpha). `rg 0b5f63|5fc4bb|178680` → only `docs/DESIGN.md:47` (old token table, not an asset). New `docs/design/logo/contact-sheet.mjs`.
- **For the master:** rebuild installers to ship the new icns/ico (no build here); Zoho connect pages have no `<link rel=icon>` and rely on the web app's `/favicon.ico` from the Expo export; landing has no 180 px apple-touch (uses `icon-512.png`, fine).
### 2026-11-14 (f) · local · Opus 5.5 · phase9/landing-appeal
- **Done (T-089):** `apps/landing` v2 (index, styles, i18n en+ar; privacy/terms header aligned). Dials ENERGY 2 / RHYTHM 3 / MOTION 1 (one fade-up of the hero window, off for reduced motion). Product pictures are drawn in HTML/CSS with the app's tokens (call window, brief, question card, approvals list, track waveforms, warning + holding cards), so they stay crisp at 2x and follow dark mode and Arabic RTL; `scripts/landing-shots.mjs` not rerun (this worktree has no app node_modules) and the old 1x `shot-*.png` were removed as unused. Logo now referenced as `logo.svg` / `logo-dark.svg` files (swapped by theme), so the logo session's new files show up without edits. Facts unchanged (1.5 s, customer track only, Zoho with approval, Deal stage/amount never written, macOS + Windows); no customers, numbers or testimonials. `downloads.json` wiring, Zoho Forms iframe, self-hosted fonts and CSP unchanged.
- **Evidence:** `node scripts/landing-check.mjs docs/design/screens/landing-v2` → 30/30 runs (390/768/1280/1440, light/dark, RTL; index + privacy + terms) axe 0 serious/critical, no horizontal overflow (`axe.txt`); full-page `light-1440.png`. `biome check apps/landing scripts` clean, `check-boundaries` ok. Full `pnpm lint` cannot run inside a `.claude/worktrees/*` checkout (biome ignores every path there); run it from the master checkout.
- **For master:** DESIGN-SYSTEM §5.7 still says "no gradients" and a 48 px display; v2 uses the `signal-fill` stage panel and a 64 px hero headline. Update §5.7 or tell me to revert. `scripts/landing-check.mjs` gained svg/png/woff MIME types and 768/1440 runs. No deploy.

### 2026-11-14 (e) · local · Opus 5.5 · phase9/landing-redesign
- **Done (T-087):** `apps/landing` redesigned with antislop (core, ui, copywriting, layoutmobile, human; mode "during", set by the master's brief) on D-041. Design read: product landing for sales agents and managers, Quiet Paper Glass, dials ENERGY 1 / RHYTHM 2 / MOTION 1. Sections: hero (headline states R1's 1.5 s, live-card demo as the focal point, platform download from `downloads.json`, "Talk to us" link) → the two audio tracks (R4) → "Around the call": before (Zoho brief), no safe answer (R2), after (R12 approvals), each beside its real `shot-*.png` → "What it will not do" (5 product rules) → one download section (per-platform files, size, SHA-256, requirements, first-open steps in `<details>`) → Zoho Forms contact. Removed: eyebrow Zoho badge, four identical feature cards, separate "See it" / requirements / install sections. Motif: the bubble-tail shape on transcript, card and screen frames. Theme button names its target with `aria-pressed`; skip link; downloads show loading and error (mailto) states; strings escaped. Shot sizes unchanged, so `scripts/landing-shots.mjs` not rerun. Fonts stay self-hosted; no CSP change needed.
- **Evidence:** `node scripts/landing-check.mjs docs/design/screens/landing` → 18/18 runs (index, privacy, terms × light/dark 1280/390, RTL light 1280, RTL dark 390) axe serious/critical 0, no horizontal overflow; extra `light-768.png`; no overflow at 768/390/320. Click-through (Playwright): theme toggles both ways, language toggles to ar/rtl and back, skip link → `#main`, header Download → `#download`, `<details>` opens, hero/mac/win links point at the manifest files, phones get "Get the desktop app" → `#download`, a 404 manifest shows the error state, no other console errors. `biome check apps packages scripts docs`: 0 errors, no warnings in `apps/landing`.
- **For the master:** (1) `downloads.json` says 0.3.1 but its Windows file is `Setup 0.3.0.exe`: the page shows "Version 0.3.1" over a 0.3.0 installer; regenerate the manifest when the Windows build catches up. (2) The app string "Not in playbook — check before promising" has an em dash and appears in `shot-call-card.png`; if the app copy adopts antislop R-02, change it and rerun the shots. (3) The screenshots are English, light-only; in dark/RTL they sit in a neutral frame. Deploy not done.

### 2026-11-14 (d) · local · Opus 5.5 · phase9/redesign-app
- **Done (T-085):** merged `phase9/design-system`; restyled the app in `apps/app/components` (AppShell, PageHeader, Plan/Health banners, CommandPalette, ProfilePopup, CallPeek, Tutorial, FeatureGate), `features/home`, `features/call/components` (CallHeader, Composer, ListenBar, ConfirmEnd, ScenarioPicker), settings/reports/inbox/history, review, meetings; `apps/desktop/main.cjs` window background = canvas (light/dark). Behaviour, copy and test ids unchanged; card render code untouched (SuggestionCard from `@sotto/ui`). `scripts/screenshots.mjs`: `SOTTO_SHOT_ALL=1` adds dark Arabic, `SOTTO_SHOT_SCALE`.
- **Evidence:** app jest 466 pass; `@sotto/ui` vitest 189 + jest 96; typecheck green; biome clean on changed files; a11y 64 checks 0 serious; replay p50 576 / p95 978 ms, R4 0; 88 screenshots (10 screens + menus × light/dark × en/ar × 390/1280) in `docs/design/screens/app/`.
- **Note for master:** `pnpm lint` cannot run inside a `.claude/worktrees/*` checkout (biome `!**/.claude` include drops everything) — run it in the master checkout. Mock call screenshots need the dev server (`expo start --web`), since `?mock=1` is dev-only.

### 2026-11-14 (d) · local · Opus 5.5 · phase9/redesign-panels
- **Done (T-086, D-041):** owner console rebuilt on copies of `packages/ui` `tokens.css` + `components.css` (248 px sidebar, 34 px page titles with leads, stat tiles, hairline tables, dot badges for plan states, glass drawer/sheets/toast, search pill; `owner.js` untouched). Zoho connect/cancel/done pages inline the same tokens (CSP is inline-only). Landing + privacy/terms: glass top bar, 48 px display hero with a static suggestion-card demo (new `demo.*` strings, en + ar), wells, pill buttons. Web admin: `@sotto/ui` `PageHeader`, groups as neutral pill tabs, pages as smaller pills; Keys: glass add-provider menu, neutral vendor/model chips, step marks get `role="img"` (axe fix).
- **Copies:** `scripts/sync-ui-css.sh` copies the two CSS files to `cloud/owner/` and `apps/landing/`; `tests/cloud/test_ui_css_copies.py` fails when stale. Owner route serves `tokens.css`/`components.css` (whitelist only). `biome.json` ignores the two `tokens.css` copies.
- **Evidence:** worker pytest 597; app jest 466 (72 suites); typecheck green; biome (explicit paths) + ruff + boundaries green. `scripts/panels-shots.mjs` (owner, Zoho, landing) and `scripts/admin-shots.mjs` (signed-in web admin against a local server): 156 pages × modes light/dark × LTR/RTL × 390/1280, axe 0 serious/critical, no horizontal overflow; logs + 154 screenshots in `docs/design/screens/panels/`.
- **For the master:** (1) `pnpm lint` checks 0 files inside a `.claude/worktrees/*` checkout (`biome.json` ignores `**/.claude`); I ran biome on explicit paths. (2) HTML pages fall back to system fonts: the owner CSP (`font-src 'self'`), Zoho CSP and the landing Caddy CSP block Google Fonts; self-host Inter/Plex woff2 or widen `font-src` if Inter is wanted there. (3) Landing `shot-*.png` still show the old green UI; refresh after the app redesign merges. (4) The app shell sidebar (blue active bar) and `components/PageHeader.tsx` belong to the redesign-app session.

### 2026-11-14 (c) · local · Opus 5.5 · phase9/design-system
- **Done (T-084, D-041):** reference copied to `docs/design/reference/muse-ai/`; `docs/design/DESIGN-SYSTEM.md` (principles, light/dark tokens, type, spacing, radius, elevation, motion, icons, component specs, page templates, a11y, screen-by-screen mapping in §7). `packages/ui`: new token values (canvas `#fcfcfc`, gray ramp, one `#005bbf` accent, glass, pill radii, 100–300 ms motion), new keys (`bubble`, `textTertiary`, `glass`, `gray`, `easing`, `radius.sheet/composer`, type roles `timestamp/secondary/pageTitle/display`); hero card = accent bubble (warning red, holding neutral); restyled Button/IconButton/TextField/Panel/Table/Sheet/Toast/TranscriptLine/SegmentedControl; new `GlassSurface`, `PageHeader`, `NavRow`, `ListRow`, `Skeleton`, `useGlassStyle`; `tokens.css` generated (`pnpm --filter @sotto/ui gen:css`, staleness test) + `components.css`. App loads Inter + IBM Plex Sans Arabic (Readex Pro removed); gallery updated.
- **Evidence:** `@sotto/ui` vitest 189 + jest 96 pass; app jest 466 pass; lint + typecheck green; screenshots light/dark × LTR/RTL × 390/1280 in `docs/design/screens/`. No replay (card timing untouched; only styles).
- **Outside the owned list:** `apps/app/app/_layout.tsx` (fonts), `apps/app/app/gallery.tsx`, `apps/app/package.json` + lockfile, `biome.json` (ignore generated `tokens.css`).
- **For the redesign sessions:** the app's own `components/PageHeader.tsx` should move to `@sotto/ui` `PageHeader`; `cloud/owner/owner.css` still names Readex Pro; HTML pages link `tokens.css` + `components.css` (DESIGN-SYSTEM §8).

### 2026-11-13 · local · Opus 5.5 · phase9/review-post-call
- **Done (T-076):** after the call: review line (tip + mascot mood + Likely/Unclear/Unlikely, risk signals "AI-estimated", scores/talk time/strengths under Details) → "Suggested updates (n)" checklist (`features/actions/{checklist.ts,AfterCallChecklist.tsx}`: nothing pre-ticked, Edit per row, one "Save n to Zoho", own key per row, call log via `saveCallLog`, meeting prefilled from the review's agreed date and tickable only after date/time/time zone are confirmed, "Note on <deal>" in an LTR run, Skip + 5 s Undo) → one "Follow up with <name>" card (draft = email body, WhatsApp tab, copy fallback without SMTP) → done state + "Open in Zoho"; "Start another call" secondary until all are saved/skipped. Email preview as From/To/Subject rows with attachment and [placeholder] warnings. History detail: AI cards rateable (R11), saved/skipped list. Engine review v3 (objections, commitments, next_step, risks, `chanceBand`); prompts review v3, followup v2 (body only). Default email formats per action incl. proposal/booking links as static blocks.
- **Outside the owned list:** `tests/cloud/test_email.py` line 346 (default format ids now 4).
- **For the master:** `features/call/local.ts` should save the live card `id` in device card entries (History ratings then match live ones; synthetic ids until then); `app/call.tsx` still renders the CardStack under the ended view (UX-04 moves cards to History); `cloud/zoho/actions.py` could take `agent_note` + `risks` fields (today they ride in `summary`, ≤ 800 chars).

### 2026-11-13 (d) · local · Opus 5.5 · phase9/review-live-call
- **Done (T-075):** rail has two stages (`CrmRail stage`): before the call the Zoho pick + full brief editor (help text carries the timing note, UX-16); live a 4-line read-only brief + Edit, "Linked to this call.", Zoho details behind `Disclosure` "More from Zoho", "Not linked to Zoho · Link" only when unlinked (UX-01, UX-03r); no CRM forms live, one "Note for after the call" (`CallNotes` → `lib/callNotes.ts`); unknown caller → dedupe search then a prefilled Lead `ActionCard`, written only on approval (UX-19). Phones: rail in `Sheet`. `/call?prepare=1` opens the editor; `/call?check=audio` opens the 5 s check. `lib/format.ts` formatNumber/parseAmount/formatMoney/formatDay/formatWhen (UX-17). TalkMeter `variant="alert"` (live, only when too much) / `"full"` (review, UX-18). One start screen, "Start listening" (UX-20); desktop permission copy + `openPrivacySettings` button (UX-21). ZC-08 `features/call/audioSetup.ts`: OS default mic fallback, per-track level check, result per device; R4 test (agent mic never reaches the customer track). W1-L1 `Desktop` type + `useZoho` re-reads on `zoho/connected`.
- **For other streams:** `review-post-call` mounts `<TalkMeter variant="full" />` and reads `callNotes()`; `QuickActions` in `features/actions/PostCallPanel.tsx` is now unused (its owner may delete it). Deals show a currency only when the server sends `deals[].currency` (not sent today).
- **Not built:** practice on the start screen for real accounts (Q15).

### 2026-11-13 (d) · local · Opus 5.5 · phase9/review-home-shell
- **Done (T-077):** Home: role-based first-run checklist from data (`features/home/setup.ts`; agent: Connect Zoho via `useZoho`, Test audio → `/call?check=audio`; manager: playbook; admin: playbook, invite, email/WhatsApp), hidden when done, ticking marks a step done by hand (UX-10). Next meetings: three, "Prepare" → bind + `/call?prepare=1`, "Start call with this meeting" → bind + `/call` (UX-03h). Agent Home: questions they sent (from on-device calls), last call's tip, no company block/model names; admin/manager: one status line (UX-25). Neutral `StatTile` (UX-26). Title "Next: <meeting> at <time>" via `lib/format.ts`, no greeting or mascot (UX-43b). Admin in four groups People / Connections / AI / Company with a second row per group; Keys & providers web only; `/admin/company` = Recordings + Devices + Activity; `code="pnpm demo"` removed from keys.tsx (UX-29). Sign in / Create a company / Forgot password as separate screens + "You'll stay signed in on this computer." (UX-39); `/reset-password` drops `#token` with `history.replaceState` and adds `<meta name="referrer" content="no-referrer">` before any request, outside the sign-in gate (UX-39r). `ShellBanner`: paused > health (with fix link, agents only Zoho) > plan line (ZC-14c). Agents: no Inbox/Playbook in nav, and AppShell shows No access for any URL outside the role (page stays mounted, hidden) (ZC-map-agent). Settings: Appearance, Audio (check + microphone), own Zoho connection (`#zoho`), Advanced fold (mini window, sounds, auto pick-up, recording, tutorial), About; "Soon" rows gone; OS language on first start; `card.shownAfter` deleted. Tutorial opens only on request (ZC A15; it covered the checklist). Health is read once at sign-in (`refreshFeatures`), not only after the first 10-minute refresh.
- **Needs the master:** `review-live-call` should `setPrefs({ audioChecked: true })` after a passing audio check (the Home step re-checks that pref); Caddy `Referrer-Policy no-referrer` on `/reset-password`. Server reset errors are one code (`reset_invalid`), so the page shows one line for expired or used.

### 2026-11-13 (c) · local · Opus 5.5 · phase9/review-server-core
- **Done (T-074):** ZC-02 OAuth starts on the global accounts host; the callback's `accounts-server`/`location` sets the DC (per person + org default), manual "Change" kept, probe only when Zoho names none. UX-35 connect page (reads/writes, DC + Change, Cancel → `/auth/zoho/cancel`), done page "Zoho is connected. You can close this tab." + `agn-sales-shield://zoho/connected`. W1-DESK `apps/desktop/deep-link.cjs`: scheme registered by the installed app only (never dev runs), single instance, `onDeepLink`, `openPrivacySettings(mic|system-audio)`. ZC-14s `health` in `/api/v1/features`. UX-39s `POST /api/v1/auth/reset/request|confirm`. ZC-11s `GET/PUT /api/v1/company/defaults`. INT-01s Zoho action `call_log`. INT-03 stage guidance as data in `crm_brief` v3; INT-16 Lead_Source + Campaign_Source in the brief.
- **Outside the owned list:** `packages/engine/src/__tests__/bundle.json` regenerated (`pnpm gen`, seed change); `tests/cloud/test_zoho.py` and `test_zoho_actions.py` (helper picks the Continue button; "Zoho is connected" copy).
- **Needed by waves 2–3:** `apps/app/lib/desktop.ts` types for `openPrivacySettings` / `onDeepLink`; a `/reset-password` web page (read `#token`, then `history.replaceState`; `Referrer-Policy: no-referrer`). OAuth pages are English only.

### 2026-11-13 (c) · local · Opus 5.5 · phase9/review-ui-core
- **Done (T-072):** live card: no rating under the live hero; thumbs = two 44 pt icon buttons ("Helpful"/"Not helpful", no visible question) on collapsed cards on hover/focus and on every AI card after the call; reason chips only after thumbs-down (UX-02). No timing line (UX-11). Header icon only; R2 line under the sentence ("Not in playbook — check first"; the worker label still wins; full text for screen readers) (UX-12). 2 earlier cards + "Show earlier (n)", background-tone fill (UX-13). Holding dropped once its turn has a real card, dashed edge kept otherwise (UX-14). "Context" toggle on the start side, End call alone at the end (UX-15). "Practice" only on practice calls, mode in the live-dot tooltip, mock badge behind `demoEnabled()` (UX-06a). Escalation toast top-end/above composer, title only (UX-07). Dark toast = `surfaceRaised` + border (UX-40). Live dot instead of the mascot (UX-43a). `IconButton`, focus rings, `Button.helper` (UX-44a). New `Disclosure`, `Sheet`, `ChecklistRow`, `Toast.action`, `StatTile`, `LtrRun` + gallery (W1-UI). `EndedView.tsx` split (W1-SPLIT).
- **Evidence:** see T-072. One a11y run flagged `aria-modal` on /playbook (untouched page, timing flake); the re-run was clean.
- **Notes:** new strings in `features/call/strings.ts`; `card.shownAfter` no longer used (copy-brand may delete it). History rating (UX-02 "in History") is left to wave 2 (`app/history/**`, using `RatingControls`). `pnpm lint`'s `biome check .` processes no files inside a worktree.

### 2026-11-14 (b) · local · Opus 5.5 · phase9/zoho-meetings
- **Done (owner request 14 Nov):** meetings are the main way to get call context. Server: `GET /zoho/meetings?page=` lists only Events owned by the connected Zoho user (`users?type=CurrentUser`, new scope `ZohoCRM.users.READ` → older connections are asked to reconnect, nothing listed until they do), not yet over, next 14 days, soonest first, 20/page; `GET /zoho/meetings/{id}/detail` view-only (someone else's → 404); meeting brief pulls Who_Id contact (else related/participant contact or lead), related Deal + its Account, notes. App: Home "Your upcoming meetings" (when connected) with expandable view-only detail and "Use for my next call" (brief carried into the next call via `bindCall`); rail lists the same meetings first, name/email/phone search under it.
- **Evidence:** worker 530 (7 new meeting tests incl. owner filter + isolation), app 334, engine 65, desktop 17; lint/typecheck/boundaries green; a11y 39 checks 0 serious; replay ALL p50 576 / p95 978 ms, R4 0. Screenshots `docs/evidence/phase9/zoho-meetings/` (home list/detail, rail; light/dark/ar; 390/1280).
- **Outside the owned list:** `features/home/HomeScreen.tsx` (one mount line), `app/call.tsx` (`bindCall`).
- **Owner:** after deploy, Reconnect Zoho once more (users.READ) — the app prompts.

### 2026-11-14 · local · Opus 5.5 · phase9/zoho-actions
- **Done:** owner bugs (OAuth page CSS leaked as text → all CSS in `<head>`, branded light/dark page; app didn't notice the finished connect → status re-read on focus/visibility + 2 s poll while pending + "Connected to Zoho" confirmation). Meetings in the rail + meeting in the brief (T-054/055), structured brief saved with the call (T-056 part), post-call panel + quick actions shell with messaging slot (T-061 part), approved idempotent Zoho writes with write scopes and reconnect prompt (T-062).
- **Evidence:** worker 137 cloud tests (39 Zoho), app 301, engine 63, desktop 17; replay ALL p50 576 / p95 978 ms, R4 0, R2 drill p95 1270; security-auditor on the writes: H1 ambiguous failure could double-write → `unknown` status keeps the key; M1 lead upsert overwrote → plain create; L1–L3 (brief squat, failed-write audit, granted scope) fixed. Screenshots `docs/evidence/phase9/zoho-actions/`.
- **Outside the owned list:** `features/call/local.ts` (save brief at call end), `cloud/features.json` (`prep` built), `tests/cloud/test_features.py` (prep moved to built). Messaging: mount email/WhatsApp in `PostCallPanel`'s `slot` prop (or replace the placeholder View in `features/actions/PostCallPanel.tsx`).
- **Owner:** after deploy, everyone who connected on 0.3.1 sees "Reconnect Zoho" (new write scopes). Verify Events search and a test write on the real org.

### 2026-11-13 (c) · local · Sonnet 5.5 · phase9/review-copy-brand
- T-073 done: product-voice strings (en+ar), Features page switches (disabled+reason, plumbing hidden), owner console rebrand + kill-switch status table with confirm dialog + sticky matrix, History "Your calls" + sample link, Settings web-admin row, landing (Zoho story, real screenshots, platform CTA, form skeleton + mailto), `pnpm a11y` covers `/owner`. No live-path change, no replay.
- Open: `admin/keys.tsx` still passes `code="pnpm demo"` (not my file); landing mailto uses `sotto@agncompu.com` (unconfirmed address); Windows build is 0.3.0 while the page shows manifest version 0.3.1.

### 2026-11-13 (b) · local · Opus 5.5 · phase9/learning-admin
- **Done:** T-058/T-059/T-060 and D-038. Server: `cloud/learning/{store,routes}.py` adds the tables `card_ratings`, `learned_versions`, `learning_state` and `learning_seen`, with company cascade. Ratings carry no call words. Instructions are versioned per org, with the review switch, revert, approve and badge. The bundle carries `learned`, and `/features` carries `learned_version`. The flags `card_ratings` and `learned_instructions` are now `built: true`. Prompts: `learned_extract` (summary stage, minimised packet) and `learned_instructions` (appended to the cacheable system part of the live suggestion, playbook wins). App: rating pills under the finished hero AI card; the after-call learning run on the device (≥ 3 ratings); Admin › Instructions editor and the tab badge. On desktop, Keys, models and prompts become a "Manage models in the web admin panel" link (D-038).
- **Evidence:** worker 477 passed, app jest 308, engine 65, desktop 17; a11y 39 checks 0 serious; replay p50 576 / p95 978 ms, R4 0; lint, typecheck and boundaries green.
- **Outside the owned list (master approved, additive):** `packages/engine/src/{types,call,session}.ts` (+ `engine.test.ts`, `__tests__/bundle.json` via `pnpm gen`), `features/call/local.ts` (learning hook), `features/call/components/CardStack.tsx` (one line), `lib/cloud.ts` (`learned_version` in `refreshFeatures`), `cloud/app.py` (mount, bundle, features, 2 status codes), `cloud/features.json` (2 × built), `tests/cloud/test_features.py`, `scripts/a11y.mjs`, `lib/i18n.ts` (`admin.webPanel.*`), new `features/webadmin/webAdmin.tsx`.
- **Next:** the owner runs a test call on the Mac with ≥ 3 ratings, then the next call shows the instructions applied. The master merges and deploys the server before the 0.5.0 clients ship.
### 2026-11-13 (b) · local · Opus 5.5 · phase9/messaging
- **Done:** T-063/T-064/T-065 and the Gallabox part of T-071. Server: `cloud/email/{data,render,routes}.py`, `cloud/gallabox/{data,routes}.py`, `adapters/email/smtp.py` (`SmtpAccount`, `send_mail`, exact errors), `adapters/whatsapp/gallabox.py`; own tables (`smtp_accounts`, `email_formats`, `email_sends`, `company_gallabox`, `gallabox_templates`, `whatsapp_sends`) created on first use; flags `gallabox`, `email_send`, `whatsapp` built (needs_connection until configured). Owner console › Account: platform SMTP form. App: `features/email/**`, `features/whatsapp/**` (own strings files en/ar), Integrations sections. Evidence: worker 492, app 299, desktop 17 tests; axe 0 serious on the new states; `pnpm a11y` 0; screenshots in `docs/evidence/phase9/messaging/`. Live path untouched (no replay needed).
- **Next:** zoho-actions imports `EmailAction`/`WhatsAppAction` into the post-call panel; owner enters SMTP + Gallabox after deploy; verify the Gallabox template shape and `language` field on the real account.

### 2026-11-13 · local · Opus 5.5 · phase9/zoho-slice
- **Done:** Saturday Zoho demo slice (T-053/T-054/T-055 slice, T-057, Zoho part of T-071). Server: `cloud/zoho/{oauth,routes,lookup}.py`, `adapters/crm/zoho.py`, store tables `zoho_platform_client`, `company_zoho_client`, `zoho_connections`, `zoho_states`; `zoho` flag `built: true`, needs_connection until the person connects (per-person layer). Owner console › Account: platform client form. App: `features/crm/**`, `CrmRail`, `/admin/integrations`, `crm.*` strings (en/ar). Engine: `crmBrief` + `crm_brief` prompt appended to the per-turn message only.
- **Evidence:** worker 465 passed (21 Zoho), app jest 290 (6 rail), engine 63 (2 brief), desktop 17, a11y 36 checks 0 serious; replay ALL p50 576 / p95 978 ms, R4 0; lint, typecheck, boundaries green; security-auditor: M1 (forwarded link links someone else's Zoho) fixed with a browser cookie + "for <email>" page, L1 callback re-checks the flag, L2 60 lookups/min; screenshots in `docs/evidence/phase9/zoho-slice/`.
- **Decisions for the master to record (D-037):** (a) the brief rides a separate `crm_brief` prompt appended to the per-turn message, because 0.3.0 clients throw on an unknown `{{variable}}` in `suggest`; (b) OAuth state bound to the person and to the browser that opened `/auth/zoho/start`.
- **Outside the owned list (please review):** `packages/engine/src/{session,call}.ts` (+ test, `__tests__/bundle.json` via `pnpm gen`), `apps/app/features/call/local.ts` (one line), `apps/app/app/admin/_layout.tsx` (Integrations tab), `cloud/features.json` (`zoho` built), `cloud/owner/index.html|owner.js`. Suggest adding `/admin/integrations` to `scripts/a11y.mjs`.
- **Next:** owner pastes the client, adds the sslip redirect, connects; then `GET /api/v1/zoho/modules` → REFERENCES. Master deploys the server.

### 2026-11-12 (b) · local · Opus 5.5 · phase9/flags-auth-fixes
- **Done:** the master's 5 review findings, tests first, on `phase9/flags-auth-fixes` (from `claude/friendly-gates-fbhqdv` @ c17c579). (1) HIGH: `sessions.prev_refresh_hash` + `pair_used`: the predecessor refresh token renews again while the successor pair is unused (no time window); reuse after use revokes; 401s now carry `device_removed` vs `signed_out`, and the app wipes local calls/recordings only on manual sign-out or `device_removed` (D-029 amendment). (2) MED: `legacy_hash`: a repeat `/auth/migrate` with the 0.2.0 token gets a fresh pair until the pair is used. (3) MED: a changed feature map re-reads the bundle, deferred while a call is live (`setCallLive`). (4) MED: `features/call/local.ts` skips the review unless `call_review` is available. (5) LOW: `writeSecret`/`saveTokens` report whether the pair was saved; the 0.2.0 token is deleted only then, and a desktop without safeStorage never migrates.
- **Also:** the 10-minute feature timer is `unref`'d so test runs and quit never wait on it; a 0.2.0-only session is no longer written to `sotto.session` (it stopped later migrations).

### 2026-11-12 · local · Opus 5.5 · phase9/logo-c

- **T-048 done:** direction (c) replaces placeholder (a) everywhere: `apps/desktop/build-assets/` (icon.icns, icon.ico, icon.png, trayTemplate.png + @2x, tray.ico), `apps/app/assets/` (icon, favicon, `brand/`), `Wordmark` `symbolSvg`, the About row in Settings (brand mark instead of the mascot), `apps/landing/` (logo.svg, logo-dark.svg, favicon.svg/png, icon-512, inline header mark in 3 pages; master cleared this edit).
- **16 px check** found two issues, fixed: the mac tray now uses the heavy mono variant (`c-mono-small.svg`); favicons and the Windows tray use a mid-teal `#178680` (4.4:1 on white, 3.7:1 on a dark tab or taskbar); the landing `favicon.svg` switches ink with `prefers-color-scheme`.
- electron-builder: `mac.icon` = icon.icns, `win.icon` = icon.ico, tray files in `build.files` (checked on disk; installers not built, per the master).
- Gate: `pnpm test` (app 284, ui 53, worker coverage ok), typecheck, Biome on explicit paths (pre-existing warnings only), boundaries, desktop 17/17, a11y 36 checks 0 serious. About shows 0.2.0: the version bump is the master's.

### 2026-11-12 · local · Opus 5.5 · phase9/brand-ui

- **T-048:** three no-letter directions (handset shield, handset + check, shield monogram) at 16/32/512, light/dark, app tile and mono tray, on `docs/design/logo/index.html` (`build.mjs`). `export.mjs` makes `.icns`, `.ico`, `trayTemplate(@2x).png`, `tray.ico`, favicon and landing assets; (a) exported as placeholder. Waiting for the owner's pick.
- **T-049:** user-facing "Sotto" → "AGN Sales Shield" / "Sales Shield" (en, ar incl. "سوتو"), productName, window titles, tray tooltip and menu, About, web title, mic permission strings. `app.setPath("userData", …/sotto-desktop)` unless `--user-data-dir`. Grep check is a vitest in `packages/ui`.
- **T-050:** tokens add `signal*` and `hero*` (contrast-tested); solid hero card with a warm voice bar; quieter shell; status as text; live call keeps card + status + one collapsed context rail (transcript, notes); older cards open one at a time and step back by colour (the old 0.45 opacity failed axe on the live call). Card glow removed (no render-path work added).
- **T-051 (subagent):** `Mascot mood` + `moodFor(success, sentiment)`; shown in the review result (call end, History detail via `CallReviewPanel`).
- **Evidence:** `docs/evidence/phase9/brand-ui/{before,after,before-live,after-live}`; `pnpm test`, typecheck, boundaries, desktop tests green; a11y 33 checks + 8 live-call checks 0 serious; replay ALL p50 576 / p95 978 ms. Bundle 476 → 477 KB on the base (+1 KB: mood faces, tokens, strings); 483 KB after rebasing on flags-auth. Biome from a worktree path needs explicit paths (`!**/.claude` in biome.json).
- **Outside owned files (master to review):** `apps/app/lib/cloud.ts` (2 error strings), `apps/app/app.json` (name, iOS mic string), `apps/desktop/package.json` description/author/mic strings/`files`, `apps/app/__tests__/*` string and density updates. Not done: `call-apps.cjs` still excludes `Sotto.exe` by name (harmless, no call pattern matches "AGN Sales Shield.exe"); flags-auth's `secure-store.cjs` in `build.files` is still for the master.

### 2026-11-12 · local · Opus 5.5 · phase9/flags-auth
- **Done:** T-045/T-046/T-047 on branch `phase9/flags-auth` (local worktree branch `claude/phase9-flags-auth-58bf91`, pushed as `phase9/flags-auth`).
  - Server: `cloud/features.json` + `features.py` (catalog, five states in D-028 order, dependencies), `store.py` tables `company_features`, `company_entitlements`, `feature_kill` (platform-wide) and `spent_refresh`; routes `/api/v1/features`, `/api/v1/company/features[/{id}]`, `/api/owner/features`, `/api/owner/features/{id}/kill`, `/api/owner/companies/{id}/features`; 403 `feature_unavailable` on review, recordings, usage (reports / `?for=recordings`), settings `context`; bundle withholds company knowledge and the after-call key when off (D-036).
  - Auth (`cloud/auth.py`): login/signup with `"session":"pair"` → 1 h access + rotating refresh (90-day sliding); reuse after a 30 s grace revokes the device session; `/auth/migrate` turns a 0.2.0 token into a pair in place (no extra time); 0.2.0 clients still get their 30-day token. Owner cookie unchanged.
  - App: `lib/cloud.ts` silent renewal (single-flight + web lock), never signs out on network/5xx, offline start opens with the last profile, feature map refresh on sign-in/focus/10 min; `components/FeatureGate.tsx`, `app/admin/features.tsx`, `features/flags/{catalog,strings}.ts` (en + ar); one-line gates in call, history detail, reports, admin/recordings, settings.
  - Desktop: `secure-store.cjs` (safeStorage, ciphertext only, key allowlist, origin-checked IPC), preload `secureStore`, 4 lines in `main.cjs`. Owner console: Features tab (kill switch + matrix).
- **Evidence:** worker 438 passed, coverage floors ok; app jest 47 suites / 276 tests passed (`--maxWorkers=3`; the default run timed out on a loaded machine); desktop 17 passed; typecheck, ruff, mypy, boundaries ok; biome clean on `apps packages scripts` (only pre-existing warnings); `pnpm a11y` 33 checks 0 serious; axe on Admin → Features, greyed Reports/Recordings (light, dark, ar) and the owner Features tab: 0 serious. Replay (synthetic) p50 576 ms / p95 978 ms. Dev Electron: 0.2.0 localStorage token migrated, `secure-store.json` keys = `["sotto.session"]`, localStorage keys = `sotto.prefs`, `sotto.viewRole` (no token), still signed in after reload. security-auditor: 0 critical/high; M1 (reports via `?for=recordings`), M2 (reuse grace), L3 (settings context), L4 (migration extension) fixed with tests; L5 accepted (D-036 limit).
- **Needs the master (files outside my list):** (1) `apps/app/app/admin/_layout.tsx` add the tab `{ href: "/admin/features", label: "admin.features", icon: "settings" }` + i18n key `admin.features` (en "Features", ar "الميزات") — brand-ui owns i18n; (2) `apps/desktop/package.json` `build.files` add `"secure-store.cjs"`, or packaged apps fail to start; (3) `scripts/a11y.mjs` add `/admin/features`; (4) optional: `features/call/local.ts` skip the local review when `call_review` is off.
- **Notes:** `pnpm lint` fails inside `.claude/worktrees/*` because `biome.json` ignores `**/.claude`; run biome on `apps packages scripts` there. Access-token TTL 1 h, grace 30 s are in `cloud/auth.py`.
- **Next:** master reviews (code-reviewer + security-auditor), merges flags-auth before brand-ui.

### 2026-11-12 · local · Opus 5.5 · phase 9 recorded (master)
- **Done:** recorded the owner's product-round brief as `docs/phases/phase-9-product-round.md`; REQUIREMENTS R5 superseded by R5a, new R7–R12; DECISIONS D-026…D-036; tracker Phase 9 board T-045…T-069; CLAUDE.md § Session orchestration; MASTER-PROMPT points at phase 9; Zoho and Gallabox research (subagents) in REFERENCES; child prompts in `docs/prompts/`.
- **Evidence:** docs only; no code changed. App jest on a loaded machine timed out on 6 suites (load avg 9); `screens` + `no-samples` re-run alone: 30/30 passed in 4 s.
- **Conflicts found:** (1) the brief says "never silently create an Event", but Zoho's Meetings module *is* api_name `Events` (label "Meetings") — mapped per the brief's own rule, still to verify on the owner's org; (2) "server rejects every non-available action" vs D-022 client-run calls — resolved by D-036; (3) R3's RLS rule vs the SQLite server — already resolved by D-022 (data-access isolation tests); (4) the owner's Zoho Partner demo on Saturday 14 Nov vs Zoho in 0.4.0 — raised with the owner.
- **Next:** child sessions build 0.3.0; master reviews and merges; T-052.


### 2026-10-22 (c) · local · DeepSeek Harness · desktop 0.2.0: Windows parity, installers, video fixes
- Done: Windows desktop parity (`apps/desktop/win-mic.cjs` + tests, `main.cjs` tray/1 s registry watcher/`Ctrl+Shift+Alt` shortcuts, Windows app names in `call-apps.cjs`, Windows microphone message, mini window 520×260); owner's four video fixes (pointer-following eyes + breathing + lower smile in `packages/ui/src/components/Mascot.tsx`, custom icon set `Icon.tsx` used across nav/pages/settings/history/sources, History hover card `CallPeek.tsx`, list starts at the top); Settings → Health check (`features/settings/Health.tsx`); version 0.2.0 (`apps/app/lib/cloud.ts`, `app.json`, `apps/desktop/package.json` + lock); built and published the Mac DMGs and Windows `.exe` with `deploy/publish-apps.sh` (also rebuilt the Linux AppImage; old 0.1.0 APK/extension were left in the folder).
- Evidence: `pnpm test` exit 0 (app 253, worker 410, engine/ui/shared/functions green); `pnpm typecheck` exit 0 (126 mypy files); `pnpm lint` exit 0 (5 warnings); `pnpm a11y` 33 checks, 0 serious/critical; `bash scripts/check-boundaries.sh` ok; `cd apps/desktop && npm test` 12/12; demo web screenshots `docs/evidence/desktop-0.2.0/`; Mac app 0.2.0 via CDP: `app://sotto/`, bridge keys, `callState {app:null}`, mini window 520×228; `release/Sotto-0.2.0-arm64.dmg`, `Sotto-0.2.0.dmg`, `Sotto Setup 0.2.0.exe`; downloads page 200 and each of the four desktop links 200. Bundle check: 476 KB gzipped vs 450 (over; T-044).
- Installed: replaced `/Applications/Sotto.app` 0.1.0 with the 0.2.0 arm64 build (`ditto`), verified Info.plist 0.2.0, launched it; `~/Library/Application Support/sotto-desktop` untouched.
- A11y: the axe run exposed pre-existing label/ARIA issues (profile name, inbox count, mascot label, tutorial checkbox/dots); fixed and the whole 33-screen check is clean. A second `deploy/publish-apps.sh` run published the accessible build (Mac/Windows/Linux + extension/APK as before).
- Not verified: no Windows PC (registry `Stop=0`/`Start≠0` semantics are from Microsoft Q&A + real dumps, not a Windows run; tray/auto pick-up/shortcuts/loopback need a real PC); no real Zoom/Teams/3CX/Linkus call on the Mac either; no code signing (SmartScreen expected); the DMG/EXE were not installed from the downloads page; the Health check was unit-tested and typechecked but its admin panel needs a signed-in account to see.
- Next: owner tests; then the four server/engine items from the hub; republish the hub source from Claude.
### 2026-10-22 (b) · local · Opus 5.5 · Mac round 2
- Done: owner's 12 fixes + ticked suggestions (see Now); deployed us3 (backup cloud.db.pre-2026-10-22c) and the Mac app; hub v18.
- Evidence: app jest 246, worker pytest 410 + coverage ok, engine 61, ui 34+112, shared 25; live replay p50 566 / p95 1053; desktop e2e via CDP (auto pick-up, mini window, capture, Opus 13 s → 35 KB, upload, shortcut end); sections ~50 ms with no reload.
- Tried and rejected: reading Electron `screen` at load time (broke getDisplayMedia: 'Could not start video source').
- Mistakes: changed replay expectations after only the live replay (worker replay tests broke until fixed with 'any'); dev Electron shared the installed app's profile and signed the owner out.
- Next: owner's hub answers (round 2026-10-22b).

### 2026-10-22 · local · Opus 5.5 · Mac round 1 B3/B4, deploy, lean hub
- Done: auto pick-up on macOS; call recording on device + idle upload to server (owner chose upload); deployed server + Mac app with owner OK; hub rewritten to decisions + suggestions only.
- Evidence: app jest 224 passed; worker pytest 394 passed, coverage floors ok; desktop `node --test` 2 passed; Electron e2e via CDP: simulated Zoom mic → call screen opened and listened, hang-up ended it, 18 s WAV saved, played in History, uploaded after 30 s idle to local server; us3 healthz 200, no log errors, `usage.recording_bytes` column present.
- Tried and rejected: plain `cp` of cloud.db as backup (misses WAL) → sqlite backup API.
- Next: owner's hub answers (round 2026-10-22), then C/D.
- Notes: computer-sound capture is quiet (RMS ~500); recordings are normalised (≤8×) but STT input is not — worth checking on a real call.

### 2026-10-21 · local · Opus 5.5 · review brief Batches 0–6 (T-022…T-043)
- **Done:** B0.1–B0.6, B1.1, B1.3, B1.4, B2.1, B2.2, B3.1, B4.1, B4.2, B5.1–B5.3, B6.1, B6.2 — one commit each (B5.2+B5.3 share one), plus three small style/lint follow-up commits. B2.1 also fixed a bug: the AI path re-ran the confident-only lookup, so the model's `playbook.match` slot was always empty.
- **Evidence:** pnpm test green (app jest 202, engine 50 with coverage 92.6% stmts / 82.0% branches, worker pytest 373); typecheck + lint green; synthetic replay p50 567 / p95 1148 ms, holding 45%, 0 agent cards, R2 drill p95 1285 ms (unchanged — it cannot see engine-only changes); LIVE replay holding 36% → 27% / 18% after B2.1, p95 1342 → 1203 / 1130 ms; web bundle 430 / 450 KB; screenshots `docs/evidence/brief-2026-10-21/` (local `.test` account, light/dark/Arabic, 390 and 1280 px).
- **Tried and rejected:** a test fixture with natural questions for B2.1 (lexical scores land above 0.42 or at 0) — used six alike entries whose scores are exact by construction.
- **Not done:** B1.2, B3.2, B4.3, B6.3 and Batch 7 wait for the owner; nothing deployed (production untouched); the Python worker's D-020 server still has the old key-name notices (reference only); the CRM link in escalations waits for the CRM module; B2.3 embeddings not started (holding 18–27% on live, near the brief's ~20% line — measure on real calls first).
- **Next:** owner decisions on the hub; then deploy on a yes.
- **Notes:** a vendor that splits one turn into two finals after the end of speech would now lose the second piece (B1.1); AssemblyAI does not, Speechmatics flushes on ForceEndOfUtterance — watch on real Speechmatics calls.

### 2026-10-20 · local · Opus 5.5 · T-021 (D-024)
- **Done:** computer-sound capture in the desktop app (Electron loopback, own window as picture, Info.plist key); "Start listening" panel + listening bar for real accounts; mock stream dev-only; cloud bundle without sample playbook/scenarios and with neutral company defaults; installed `/Applications/Sotto.app`; `deploy/push.sh` to us3 (app 200, API 401).
- **Evidence:** live test on this Mac against a local `.test` account: a recorded customer played through the speakers was transcribed word for word (AssemblyAI); 4 cards (1 playbook, 3 AI), p50 1166 / p95 1253 ms; replay `--all` R1 PASS, R4 0 agent cards, R2 drill p95 1285 ms; pnpm test all green (app 180, engine 23, worker 365).
- **Tried and rejected:** a screen source from `desktopCapturer` needs screen-recording permission ("Failed to get sources"); launching the app from a terminal makes macOS check the terminal's permission (track ends at once) — launch it as an app.
- **Next:** owner tests Zoom/Meet/Yeastar with Zylker; then ask before uploading the new Mac installers to `/downloads/`; agent track on desktop (mic as context) and voice-sample matching for the microphone source.
- **Notes:** without a playbook the AI correctly refuses to invent company facts (holding line + manager email) — Zylker needs its playbook docs.

### 2026-10-20 (19:30–21:00) · local · Claude Opus 5.5 · T-020 phone navigation drawer (side session)
- **Done:** D-023 + DESIGN.md §6; `AppShell` top bar + drawer (shared `NavPanel` with the sidebar); `scrim`, `drawerMaxWidth`, `topBarHeight` tokens; segmented control shrinks on phones; small-screen polish (call, inbox, account); 10 new shell tests; `scripts/screenshots.mjs`; APK rebuilt with `build-phones.sh`.
- **Evidence:** app jest 174 passed (10 of them new shell tests), full `pnpm test` green (worker 365), typecheck + lint green, bundle 428 KB / 450 KB, `pnpm a11y` 33 checks 0 serious; a browser check confirmed Escape closes the drawer and Tab stays inside it; screenshots `docs/evidence/d023/`.
- **Not done:** no device or emulator test of the new APK; the "sample answers: add GROQ_API_KEY…" call notice still shows a key name (engine text, left for a follow-up).
- **Next:** owner reinstalls the APK and checks the menu; T-016 rest; T-011.

### 2026-10-20 (15:40–17:00) · local · Claude Opus 5.5 · T-016 phone builds, hub round
- **Done:** read hub decisions (all six = recommendations, saved 11:38); deleted the two old artifacts (Owner Decisions, Live Sales Copilot Plan) at the owner's request; app.json ids `com.sotto.app` + mic permission; `expo prebuild`; Android APK and iOS simulator build; `apps/app/build-phones.sh`; APK published to `/downloads/`; SecureStore fallback fix; hub v10.
- **Evidence:** APK `com.sotto.app` 0.1.0 contains the server origin; iOS sim screenshot shows the sign-in screen; jest 162 passed; typecheck + lint green.
- **Tried and rejected:** emulator test (not enough disk); all four Android ABIs (needs ~10 GB build space).
- **Next:** ask the owner where the playbook docs are; Android on a real phone; iPhone on device once an Apple ID is in Xcode; T-011.
- **Notes:** the Mac's disk was full (0.9 GB) and broke both first builds; only Claude-made build output was deleted.

### 2026-10-20 (10:00–13:45) · local · Claude Opus 5.5 · D-022 client-side calls, management server, desktop, extension, owner hub
- **Done:**
  - One owner hub artifact replaces the three earlier pages. Its report format is saved in `~/.claude/ARTIFACT-REPORTS.md`, which `~/.claude/CLAUDE.md` imports.
  - D-022 is recorded.
  - Management server `sotto_worker.cloud`:
    - sign-up, log-in, devices, plans, seats and usage;
    - encrypted keys, the call bundle and STT tokens;
    - inbox and playbook, team invites;
    - the owner console.
  - Deployed natively on us3: systemd + Caddy + ufw + a nightly backup (no Docker).
  - `packages/engine`, the client call engine.
  - The app now has accounts, an Account page, the real plan banner and on-device calls; the existing screens are served through cloudCompat.
  - Web bundle trimmed to 426 KB (zod locales stubbed).
  - Electron desktop app: Mac arm64/x64 dmg, Windows nsis, Linux AppImage.
  - Chrome MV3 side-panel extension.
  - Downloads page on the server.
- **Evidence:**
  - pytest `tests/cloud`: 28 passed. This includes API-level tenant isolation and the engine-fixture drift test.
  - vitest engine: 18 passed. The playbook matches the Python worker on 27 lines; the router race, adapters, STT and spoken turns are covered.
  - Live engine on Groq/Gemini: first card 639/721/731 ms warm, 1264 ms cold.
  - Browser E2E on a local cloud server: sign-up → call → playbook card + holding line + escalation → inbox answer added to the playbook → the next call answers it from the playbook (0 s). The owner console shows the company, minutes, devices and calls.
  - The desktop app loads and reaches the server API (CDP).
  - The extension loads in Chromium and reaches the API.
  - us3 healthz OK, valid TLS.
  - Every vendor accepts browser CORS (Groq, Gemini, OpenAI, OpenRouter, Anthropic).
  - All gates are green.
- **Tried and rejected:**
  - Metro tree shaking flags: the bundle went from 466 to 463 KB only.
  - Docker on a 1 GB server.
  - Accepting the Android SDK licence for the owner.
- **Next:** T-016 phone builds; T-017 security review; owner hub decisions; T-011.
- **Notes:**
  - No account was created on the production server. Tests used a local server and `.test` addresses.
  - The owner's one-time password is only on the server, in `/root/sotto-owner-password.txt`.

Newest first. Use this format:
`### YYYY-MM-DD · cloud|local · <model> · <phase/task>`
followed by the lines **Done**, **Evidence**, **Tried and rejected**, **Next** and **Notes** (see `docs/HANDOFF.md`).

### 2026-10-20 (04:50–05:00, same overnight run) · local · Claude Opus 5.5 · T-014, custom endpoints (P6.4), R6 Ollama acceptance
- **Done:** model clients shared across calls + warmed at start-up (T-014); your own OpenAI-compatible endpoints in the panel; R6 acceptance run live on Ollama.
- **Evidence:** first call after restart: AI card 1008 ms (was 2.7 s); `tests/server` 77 passed; Ollama gemma3:1b via the panel: test OK, speed p50 453 ms, a typed call got its card from the local model (first word 465 ms); replay p95 1148 ms PASS.
- **Next:** see Now.
- **Notes:** the Ollama endpoint used for the run was removed again; Ollama and the demo server were stopped; local `.sotto-data/sotto.db` reset.

### 2026-10-20 (04:00–04:50, same overnight run) · local · Claude Opus 5.5 · P3.3 axe CI, playbook editor, P6.4 speed check, T-011 step, review fixes
- **Done:** axe-core on 11 screens × light/dark/Arabic in CI (`pnpm a11y`; fixed lost ARIA state on react-native-web); playbook editor (P3.5); "Measure speed" + R1 guard per stage (P6.4); `CallSession.drain` busy-loop fix (T-012); mid-thought pause keeps one turn (T-011 step); code-reviewer findings 3H/3M/3L fixed (T-013); build map artifact v4 (https://claude.ai/artifact/JV2NzAysf1dCB9kEdHCc2s).
- **Evidence:** CI green incl. "33 page checks, 0 serious/critical"; `tests/server` 69 passed; app jest ~160 passed; `pnpm replay --all` p50 567 / p95 1148 ms PASS, R2 drill PASS; `pnpm spoken:live` (warm) 5/5 cards, transcripts ~0.52–0.55 s, worst card 1005–1309 ms; speed check live: Groq gpt-oss-20b p50 490 ms, Gemini 2.5 Flash-Lite p50 677 ms.
- **Tried and rejected:** holding the turn on the *partial* text (partials lag, so it would add 500 ms to many complete sentences); decided on the final text instead.
- **Next:** owner deploys (T-010); T-014 warm at server start; custom endpoints (Ollama) in the panel; end-of-turn model (T-011).
- **Notes:** local `.sotto-data/sotto.db` reset again after testing (no keys ever stored; `secret.key` kept). No demo server left running on port 8787.

### 2026-10-20 (03:00–04:00, same overnight run) · local · Claude Opus 5.5 · R1 spoken path, security fixes, R2 inbox loop, settings, trial banner
- **Done:**
  - Spoken path inside R1: keep-alive 120 s + per-call re-warm (T-005), late forced-final tails matched by audio start time, D-021 AssemblyAI main STT.
  - Prompt suggest v2: yes/no questions about what the company offers are company facts (no invented "yes, we welcome pets").
  - security-auditor review of the server + deploy kit: 0 critical / 1 high / 2 medium / 6 low, all fixed (see P6.7 line).
  - R2 loop on the server: escalations → Inbox → answer / add to playbook → the next call answers from it (P7.2).
  - Company settings saved on the server and applied per call (P6.5 partial); trial banner (P3.5); History from the server's call log; mic permission states; display name for the STT vendor.
- **Evidence:**
  - `pnpm spoken:live` ×3 (AssemblyAI, live models): off-playbook AI card 831 / 948 / 1168 ms after end of speech (was 1.8–2.1 s); playbook cards ~0.5 s; all sentences whole.
  - `pnpm replay:live`: p50 578, p95 1069 ms, R1/R4/expectations PASS. `pnpm replay --all`: p95 1148 ms PASS; R2 drill PASS.
  - Browser QA (local): typed call, live AI card 0.51 s; holding line + escalation → Inbox → added → reworded question answered "From your playbook"; Keys page at 375 px dark and Arabic RTL; hosted-mode sign-in (wrong code refused, right code opens the app, socket connects); CSP on, no console errors.
  - Worker pytest ~300 passed, coverage floors ok; app jest 158 passed; CI green (3.12, 3.13, audit, pgTAP, secrets scan).
- **Tried and rejected:** drafting the turn from partials (data: partials lack the last 1–3 words at the cut); Gemini 3.1 Flash-Lite (2.7 s first token); Qwen on Groq (no answers).
- **Next:** owner deploy (T-010); P3.3 axe CI; playbook editor; end-of-turn model (T-011).
- **Notes:** local `.sotto-data/sotto.db` was reset to empty after testing (no keys were ever stored there; `secret.key` kept).

### 2026-10-20 (overnight, 02:00–04:00+) · local · Claude Opus 5.5 · T-007, D-020 server + P6.7 keys panel + deploy kit
- **Done:**
  - T-007 step 1: `finalize()` on all four STT adapters; `stt:live` runs a forced-final pass. T-008 resolved by a pause between sessions.
  - D-020: the D-013 bridge became the Sotto server (Starlette + uvicorn) — web app, calls over `/ws` (typed, scripted or **spoken**), admin API. Local mode = `pnpm demo`; hosted mode needs an access code, secret and public origin.
  - P6.7 Keys & providers: encrypted write-only keys, "Get a key" links and steps from `seed/models/providers.yaml`, Test (models list / real-time session), vendor + model per stage, audit log, call history.
  - Spoken customer track: browser mic → PCM16 16 kHz → energy VAD (300 ms) → `finalize()` → settle 150 ms → pipeline with t0 = end of speech; primary STT falls back to the backup.
  - App: Admin → Keys & providers, access-code sign-in, "Speak as the customer" on web, partial "Hearing: …" line, info toasts.
  - `pnpm spoken:live [--url --code]`: R1 on the spoken path, locally or against the hosted server.
  - `deploy/`: Dockerfile, compose (Caddy HTTPS via sslip.io), `install.sh` (server), `push.sh` (Mac), README.
- **Evidence:**
  - `pnpm stt:live` forced final: Deepgram p50 771 → 471 ms, AssemblyAI 625 → 330 ms (STT-OPTIONS.md).
  - Panel Test on the owner's keys: Deepgram, AssemblyAI, Speechmatics, Groq (11 models), Gemini (63 models) all OK.
  - `pnpm spoken:live` local, live models: 5/5 cards, playbook cards 0.6–0.7 s; AI card see T-009.
  - `pnpm replay:live`: p50 609, p95 880 ms, R1 PASS, R4 PASS.
  - Worker pytest 290 passed, coverage floors ok; app jest 145 passed; lint, typecheck green.
  - Hosted-mode rehearsal of the image layout (clean export, no-dev install): `/api/me` auth_required, 401 without the code, 403 from a foreign origin, sign-in OK.
- **Tried and rejected:** see D-020 (websockets-only server; Node backend; copying `.env` to the server). Flushing a turn on the first post-end final split sentences ("apartment?" leaked into the next turn) → settle window.
- **Next:** owner deploys; T-004 drafting on partials (T-009); History from the server call log.
- **Notes:**
  - Claude could not reach us3: both `ssh` attempts were blocked by the auto-mode classifier ("Production Reads"), so the deploy kit is ready but not yet run on the server.
  - Lesson (again): twice a `;`-chained command committed after a failed check (36cfc84, a5a25c4; both fixed or rerun clean right after). Commits now go through a gate script that stops on any failed step.

### 2026-10-20 (night) · local · Claude Opus 5.5 · P2.3 STT adapters ×4, `pnpm stt:live`
- **Done:**
  - Spec `spec/phase-2-stt.md`, from each vendor's official docs.
  - Real-time STT adapters for Deepgram, AssemblyAI, Speechmatics and ElevenLabs, on one WebSocket runner (no vendor SDKs).
  - `make_stt` binds each key to its vendor's host, over wss only, in a header.
  - New `stt_backup` stage; the seed default is Deepgram primary + AssemblyAI backup (switchable, D-019).
  - `pnpm stt:live` smoke test using macOS `say` speech.
  - code-reviewer fixes.
- **Evidence:**
  - Worker pytest 242 passed (20 STT tests); `pnpm test`, `pnpm lint` and `pnpm typecheck` all exit 0.
  - `pnpm stt:live`:

    | Vendor | Final p50 | Max | WER |
    |---|---|---|---|
    | Deepgram | 829 ms | 892 ms | 0% |
    | AssemblyAI | 667 ms | 733 ms | 0% |

    Speechmatics: 2 of 3 clips, then a quota error (T-008).
- **Tried and rejected:**
  - Default model names in `replay/stt_live.py`: the boundary check forbids them, so they live in the adapters (a56bdd1).
  - ElevenLabs treating the first commit after our end as "done": a VAD commit in flight could drop the last words.
- **Next:** T-007, a force-finalize at our end-of-turn to bring STT finals under the 350 ms budget.
- **Notes:**
  - Lesson: the earlier `pnpm lint | grep` filter hid a boundary failure. Check exit codes, not filtered output.
  - The audio is synthetic, so accuracy here is not the benchmark (P2.8).

### 2026-10-20 (later) · local · Claude Opus 5.5 · P2.3 live smoke test, R2 timer fix, D-019 plan
- **Done:**
  - Owner keys guide `docs/PROVIDER-KEYS.md`.
  - D-019: the owner picks vendors, STT adapters will be built for all four vendors, and a Keys & providers panel is planned (P6.7, R6).
  - Live smoke test run on Groq + Gemini.
  - Fixed a real R2 bug: SDK imports inside the first live turn froze the holding-line timer.
- **Evidence:**
  - `pnpm replay:live` (real models):
    - model IDs ok for trigger, suggest, suggest_backup, summary and judge;
    - first run before the fix: p95 1761 ms with no holding line (FAIL);
    - after the fix: p50 549 / p95 837 ms and p50 613 / p95 848 ms, agent cards 0, expectations PASS.
  - Probe: importing the OpenAI SDK takes 603 ms and Anthropic's 1139 ms; the first client build takes 71 ms.
  - Worker pytest 223; `pnpm test`, `pnpm lint` and `pnpm typecheck` all green.
  - latency-guardian: PASS WITH NOTES (T-005).
- **Tried and rejected:** blaming slow Groq responses. The missing holding line proved the event loop itself was blocked, and the probe confirmed it.
- **Next:** P2.3 STT adapters (`/spec` first).
- **Notes:** none of the keys were read or printed; only whether each is set was checked. ElevenLabs has no key, which is fine.

### 2026-10-20 · local · Claude Opus 5.5 · owner answers applied, P2.3 live smoke tooling
- **Done:**
  - Applied `docs/OWNER-ANSWERS.md` items 1–9:
    - D-017 (owner approvals of D-009–D-016 and the architecture) and D-018 (English-only calls and cards; the UI keeps Arabic RTL per R5);
    - BRIEF rewritten from the answers;
    - cards default to English in the worker and the admin screen;
    - `.claude/settings.json` hook fixes, and `.env.example` readable;
    - `.env.example` created;
    - `docs/STT-OPTIONS.md` pick-list, checked on the vendors' own pages.
  - Built `pnpm replay:live` (P2.3): checks the model IDs against each provider's `/models`, then replays the demo calls on real models with a real clock.
  - Item 10: the build map page updated to show the answers.
- **Evidence:**
  - Worker pytest 219 passed.
  - `pnpm test`, `pnpm lint` and `pnpm typecheck` all green.
  - Synthetic replay p50 567 / p95 1148 ms, agent cards 0, outage drill p95 1285 ms PASS.
  - Stop hook: exit 2 with the tsc error shown on a planted type error; exit 0 when clean; exit 0 when `stop_hook_active`.
  - security-auditor review of the live smoke test: no key can reach another host or be printed. One robustness note fixed (821543e).
- **Tried and rejected:**
  - Only adding an allow rule for `.env.example`. Deny rules win over allow rules, so the broad `.env.*` deny was replaced by explicit names (`.env`, `.env.local`, `.env.*.local`, `.env.development`/`.production`/`.staging`/`.test`/`.prod`/`.dev`).
  - `pnpm -s` in the Stop hook. It hides the tsc output entirely, so the hook now captures the output and prints the last 80 lines on failure.
- **Next:** `pnpm replay:live` once the keys are in `.env`; the STT adapters after the owner's pick; without the owner, P3.3 axe checks.
- **Notes:**
  - There is no `.env` in the repo on this Mac. Keys were not looked for anywhere else.
  - `pnpm test:db` was not run: Docker isn't running.
  - The live replay builds OpenAI clients per scenario without closing them. That is fine for a one-off CLI; revisit if it becomes long-running.

### 2026-10-19 (evening) · cloud · Claude · handoff after owner answers
- **Done:**
  - The owner submitted the decisions page. Answers and notes are copied verbatim into `docs/OWNER-ANSWERS.md`, with a 10-item apply list.
  - Waiting-on-owner list updated, with new open items.
  - No code changes: the owner asked for a handoff only (session credit).
- **Evidence:** CI green on ae405a7 (all 5 jobs); PR #1 mergeable, no comments.
- **Tried and rejected:** applying the answers in this session. The owner asked to stop building; a local session applies them.
- **Next:** `docs/OWNER-ANSWERS.md` → "What these change", items 1–10, in order; then the P2.3 live smoke test locally with the Groq/Gemini keys and a check of the model IDs in `seed/models/default.yaml`; then the STT pick-list for the owner.
- **Notes:**
  - English-only conflicts with nothing in R1–R6, but R5's Arabic RTL UI stays until the owner changes R5.
  - Retention with audio needs a duration and a consent note; keep no-audio in code until answered.

### 2026-10-19 · cloud · Claude Opus 5.5 · owner pages, D-016 free providers, P3.5, P6.2, P7.2
- **Done:**
  - Two owner pages:
    - **Sotto Owner Decisions**, https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6: every open question in a quick view and an explained view, with recommendations pre-picked. Answers are saved to the page's database (`answers/owner`).
    - **Sotto Build Map**, https://claude.ai/artifact/JV2NzAysf1dCB9kEdHCc2s: a playable 1.5 s timeline, phases, the owner's unlock steps, the safe key handover and free AI providers.
  - **D-016:** no Claude models; Groq is primary and Gemini the backup/judge, both through the OpenAI-compatible adapter. Platform keys are bound to their provider's host. Company rows can't use the platform-keyed adapters, and the adapter and circuit caches are keyed by key name. A security review found 3 real gaps; all are fixed, each with a test.
  - **P3.5:** a role switch (agent, manager, admin) gates navigation and pages per R3.
  - **P7.2 app side:** the inbox answers a question and adds it to the playbook on an in-memory store, with the same rules as `approve_escalation()`.
  - **P6.2 app side:** prompt studio with versions, draft editor, variable chips, strict variable check, diff, publish and one-click rollback.
- **Evidence:**
  - Tests: worker pytest 210 (coverage floors ok), app 132, ui 102 + 34, shared 25, functions 12.
  - `pnpm replay --all` (synthetic): p50 567 / p95 1148 ms, agent cards 0, outage drill p95 1285 ms PASS.
  - Bundle: 434 / 450 KB.
  - Screenshots: `docs/evidence/p3.5/`, `p7.2/`, `p6.2/`.
  - CI green on 48af454, 9586d36 and 87bcfa7.
- **Tried and rejected:**
  - Gating pages by replacing the root `<Slot/>`: it unmounted the navigator and lost the route. A `RoleGate` around the gated screen or layout keeps the navigator mounted.
  - Full role names in the sidebar switch overflowed at 1280 px; it uses short labels now.
- **Next:**
  1. Read the owner's answers (ArtifactData `get` `answers`/`owner`). Apply them to BRIEF.md and DECISIONS.md, and to `.claude/settings.json` only if the owner approved the hook and `.env.example` changes on that page.
  2. With `GROQ_API_KEY`/`GEMINI_API_KEY` set: run a live smoke test (P2.3) and confirm the model IDs in `seed/models/default.yaml`.
  3. Without the owner: axe accessibility checks in CI (P3.3), a plan/trial banner (P3.5 leftover), P6.4 model settings with custom endpoints.
- **Notes:**
  - gitleaks isn't installed in this container (`go install github.com/zricethezav/gitleaks/v8@v8.30.1` works); CI scans every push.
  - One commit (9d939e5) went out with a failing app test; it was fixed in the next commit. The gate now runs as an `&&` chain before every commit.

### 2026-10-18 (overnight) · cloud · Claude Opus 5.5 · autonomous run (D-013): P2.1–P2.8, P3.1–P3.5, P4.2/P4.4 core, P5.1–P5.2, P6.1/P6.4, P7.1/P7.3/P7.5
- **Done:**
  - **Engine (Phase 2):**
    - contracts, injectable clock and fakes;
    - model router with an absolute-t0 backup race, a per-(company, endpoint) circuit breaker and the R1 benchmark guard;
    - prompt registry with scopes and rollback;
    - playbook index and trigger rules (en + ar);
    - CallSession with the full R2 chain (holding at t0+1400, late answer ≤ 5 s, one escalation per question, hard cap 8 s), per-card telemetry and a cacheable prompt prefix;
    - Anthropic and OpenAI/OpenAI-compatible adapters (mocked HTTP);
    - synthetic replay with per-stage stats and an all-providers-down drill.
  - **Local demo (D-013):**
    - dev-only WebSocket bridge plus static web serving on 127.0.0.1:8787, with an origin allowlist;
    - `pnpm demo`; fictional demo company and scenarios in `seed/demo/`;
    - optional real models via `ANTHROPIC_API_KEY`.
  - **UI (Phase 3, built by a sub-agent):** design system "Prompter's box" (D-014); in-call screen live on the bridge; history, playbook, inbox and admin on mock data; en/ar RTL.
  - **Database (Phase 5):**
    - one tenancy migration covering every ARCHITECTURE §3 table;
    - RLS per R3 role and a worker JWT (D-012);
    - audit triggers and an escalation → outbox trigger;
    - a 284-assertion pgTAP matrix, runnable locally (`pnpm test:db`) and in CI.
  - **Phases 4, 6 and 7 (parts):**
    - livekit-token call-start policy (D-015);
    - R4 track selection and echo gate;
    - DB config loader with SSRF guard;
    - outbox with Resend;
    - CRM interface and fake;
    - after-call summary.
  - **Reviews:** latency, tenancy and two code reviews. All required findings were fixed with tests; the UI fixes went back to the UI agent.
- **Evidence:**
  - worker `pytest` 199 passed, coverage floors ok;
  - TS: shared 25, ui 102 + 34, app 112, functions 12;
  - `pnpm replay --all` (SYNTHETIC): p50 567 / p95 1148 ms, agent-triggered 0, outage drill p95 1285 ms PASS;
  - `pnpm test:db`: 293 assertions (RLS matrix + escalation approval); mutation checks on two policies fail as expected;
  - web bundle 428/450 KB;
  - e2e screenshots `docs/evidence/demo/`, with no console errors.
- **Tried and rejected:**
  - Writing `.env.example`: the agent's deny rule blocks it, so the list is in `docs/ENV.md`.
  - Rebuilding the runtime per WebSocket connection: it blocked the event loop.
  - Lexical playbook lookup with a 0.42 cosine floor is kept for now; re-tune it on the owner's playbook.
  - Pushing after every small commit cancels CI runs (concurrency). Batch pushes.
- **Next:**
  1. The owner tries the demo (`docs/RUN-ON-MAC.md`) and reviews D-009…D-015.
  2. Check the tracker's T-items (T-003 bundle headroom, T-004 drafting on partials).
  3. P3.5 role switch, P6.2 prompt studio, P7.2 escalation → playbook.
  4. With accounts: P2.3 STT, P4.1 to P4.4 live calls.
- **Notes:**
  - pgTAP is installed in-session via `apt-get install postgresql-16-pgtap`; a new cloud container needs it again (`scripts/db-test.sh` explains).
  - Demo scenarios are ordered by file prefix (`01-…`).
  - The fake models answer objections and decline factual questions, so the holding line and escalations show up.

### 2026-10-18 · cloud · Claude Opus 5.5 · P0.1–P0.6 (assumptions), P1.1–P1.9
- **Done:**
  - The owner skipped the interview, so the build runs on recorded assumptions (D-009): `docs/BRIEF.md` (`ASSUMED:` / `OPEN:` markers), `test-calls/PLAN.md` draft.
  - D-010: Expo (resolves D-005). D-011: Biome. D-012: the worker uses a per-call JWT, not the service role.
  - Monorepo skeleton:
    - Expo app with a web hello screen;
    - `packages/ui` tokens (AA contrast tests);
    - `packages/shared` card protocol (zod → JSON Schema → strict pydantic, shared fixtures);
    - uv worker with the replay stub;
    - seed models and prompts;
    - `supabase init`.
  - Real commands and hooks. `scripts/check-boundaries.sh`: 7 rule IDs, 34 fixture trees.
  - Coverage and bundle floors; `CONSTRAINTS.md`.
  - CI: typecheck, lint and test on Python 3.12 and 3.13; codegen drift; web export and bundle budget; npm and pip audits; gitleaks. Pre-commit gitleaks hook.
  - `docs/ARCHITECTURE.md` written in full. `docs/handoffs/phase-1.md` written (gate pending).
  - Two fresh-context reviews:
    - the architecture review found R1, R2, R4 and tenancy problems, all fixed in the doc;
    - the code review found checker, coverage and protocol holes, all fixed with fixtures.
- **Evidence:**
  - Clean clone: `pnpm install` + `uv sync`, then typecheck ✓, lint ✓, test ✓. That is vitest 14 + 14, jest-expo 3, pytest 39, boundary/bundle fixtures 36, and `coverage floors: ok` (worker 96%).
  - The Stop hook exits 2 on a broken type. The pre-commit hook exits 1 on a planted token.
  - Web bundle 291 KB gzipped (budget 450).
  - CI green, 4/4 jobs: https://github.com/Hasdro/sotto/actions/runs/39166712190. Later pushes are re-run on PR #1.
  - Screenshots: `docs/evidence/p1.3/`.
- **Tried and rejected:**
  - `expo install` fails in the cloud (api.expo.dev blocked by the proxy). Use the versions in `node_modules/expo/bundledNativeModules.json` with `pnpm add`.
  - The datamodel-codegen `UUID` type with `pattern` crashes pydantic. UUIDs are mapped to strings with the pattern instead.
  - The codegen builtin formatter reads the nearest pyproject, so its output changed by location. It is now piped through `ruff format --isolated`.
  - Ignoring the two Expo-tooling audit advisories by raising the threshold was rejected. They are ignored by GHSA ID instead (T-001).
  - Declined review suggestions:
    - catching `o1`/`o3` model names (too many false positives);
    - skipping `.json`/`.toml` dependency names in the model-name rule (no hits today; revisit if one appears).
- **Next:** see Now (P2.1 via `/spec`). Owner items are in *Waiting on owner*.
- **Notes:**
  - Cloud sessions:
    - Python 3.12 cannot be downloaded (github.com 403); uv uses the system 3.13, and CI covers 3.12;
    - gitleaks installs via `go install github.com/zricethezav/gitleaks/v8@v8.30.1` (the Go proxy works);
    - `docs.expo.dev` and `docs.livekit.io` are blocked, but WebFetch on GitHub READMEs works.
  - React Native Testing Library v14 has an async `render`, so write `await render(...)`.
  - `pnpm install` sets `core.hooksPath=.githooks`. The pre-commit hook only warns when gitleaks is missing.

### 2026-10-19 · local · Claude Opus 5.5 · setup (handoff kit)
- **Done:**
  - Added `docs/RESEARCH.md`, the planning research (market, stack, latency, UX, legal, interview questions), moved from the plan artifact into the repo.
  - Added `docs/HANDOFF.md`: checkpoints, the cold-start test, and the phase handoff template in `docs/handoffs/`.
  - Wired them into CLAUDE.md, `/next-task`, `/handoff`, WORKFLOW and the master prompt (new cloud first-run prompt).
- **Evidence:** docs only; no code yet.
- **Next:** first cloud session. Use the master prompt, start P0.1.
- **Notes:**
  - Docker Desktop and Xcode are still not installed on the Mac (checked 2026-10-19); Android Studio is.
  - The first cloud session will get a `claude/…` branch; it must record that branch in Now.

### 2026-10-13 · local · Claude Opus 5.5 · setup (planning session)
- **Done:**
  - Planning repo created.
  - agent-skills (v0.6.12 @ 1be8e34) and frontend-design are vendored into `.claude/`.
  - Added: WORKFLOW, ENGINEERING, REFERENCES, phase briefs 0–8, this tracker, the master prompt, and the `/next-task` and `/handoff` commands.
  - Added the subagents `latency-guardian` and `tenancy-guardian`, and `scripts/doctor.sh`.
  - Mac tools installed: pnpm, supabase CLI, LiveKit CLI, EAS CLI, watchman, OpenJDK 17, Android Studio.
- **Evidence:** `scripts/doctor.sh` output is in the planning artifact report.
- **Next:** P0.1 interview (run the master prompt in `docs/MASTER-PROMPT.md`).
- **Notes:** Docker Desktop needs the owner's password to install, and Xcode needs the App Store (see *Waiting on owner*).

### 2026-11-12 · local · Claude Sonnet 5.5 · phase9/landing-infra
- **Done:** T-066/T-067 groundwork: `apps/landing/` (EN/AR, light/dark, placeholders), `scripts/downloads-manifest.mjs` (+ node test), `scripts/landing-check.mjs`, Caddy block, `deploy/publish-landing.sh`, `deploy/downloads-cleanup.txt`, `scripts/release.sh`, README section.
- **Evidence:** `docs/evidence/phase9/landing/` (6 screenshots, `axe.txt` 0 serious on 18 page runs, publish and release dry runs); manifest from the 0.2.0 release folder.
- **Next:** master swaps in logo/tokens and 0.3.0 screenshots, owner supplies Zoho form and legal text and DNS, then `publish-landing.sh --apply`.
- **Notes:** `install.sh` overwrites the Caddyfile and needs the `import /etc/caddy/sites/*.caddy` line (outside my files). Legal drafts are English only.
