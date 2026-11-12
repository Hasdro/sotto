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
- **Phase:** 9 — AGN Sales Shield product round (`docs/phases/phase-9-product-round.md`), version ladder 0.3.0 → 0.8.0 (D-030). Entry: desktop 0.2.0 published (owner's Windows test still open).
- **Version now:** building **0.3.0 Foundation** (T-045…T-052). Three child workstreams, prompts in `docs/prompts/`: `brand-ui` (T-048…T-051), `flags-auth` (T-045…T-047), `landing-infra` (T-066/T-067 plan, starts after 0.3.0 assets). Master (this branch) reviews and merges: flags-auth → brand-ui → landing.
- **Research done (12 Nov):** Zoho v8 in `docs/REFERENCES.md` § Zoho CRM (Meetings = api_name `Events`, per-user OAuth, upsert for idempotency); Gallabox in § Gallabox.
- **Next action (master):** wait for the child sessions' evidence; review each with `code-reviewer` (+ `security-auditor` for flags-auth), merge, then T-052 release gate (replay, a11y, screenshots, tag v0.3.0, both installers).
- **Branch:** master `claude/friendly-gates-fbhqdv` (draft PR https://github.com/Hasdro/sotto/pull/1); children `phase9/brand-ui`, `phase9/flags-auth`, `phase9/landing-infra` in their own worktrees.
- **Environment:** local Mac. ssh to us3 works (root@104.168.48.116). Electron dev runs need `env -u ELECTRON_RUN_AS_NODE` and an explicit `--user-data-dir`.
- **Owner (batched, Phase 9 § Owner actions):** logo choice (after T-048), DNS for salesshield.agncompu.com, Zoho OAuth client, Zoho Forms embed, Hostinger SMTP, Gallabox key/channel/templates.
- **Note:** the owner mentioned a Zoho Partner demo "by Saturday" (14 Nov). The ladder puts Zoho in 0.4.0; see the session log 2026-11-12.

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
- [ ] T-038 B4.3 60-second practice call in real accounts `[OWNER]` (conflicts with D-024)
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
- [ ] T-045 Feature-flag catalog, five states, server enforcement (D-028, D-036), retrofit existing features — `flags-auth`
- [ ] T-046 Owner entitlement matrix + global kill switch; Admin → Features; greyed-state UI component — `flags-auth`
- [ ] T-047 Persistent login: rotating refresh tokens, 90-day sliding, `safeStorage`, 0.2.0 token migration (D-029) — `flags-auth`
- [ ] T-048 Logo: three vector directions `owner` (choice) — `brand-ui`
- [ ] T-049 Rebrand to AGN Sales Shield: strings (en + ar), installers, tray, window, About, favicon (D-026) — `brand-ui`
- [ ] T-050 Global reskin + live-call polish + information-density rules — `brand-ui`
- [ ] T-051 Mascot five result moods from the review score — `brand-ui`
- [ ] T-052 0.3.0 release gate: merge, replay, a11y, screenshots, both installers, tag v0.3.0 — master
0.4.0 Pre-call
- [ ] T-053 Zoho per-user OAuth via the server, data centres, encrypted tokens, permission matrix (D-031) `owner` (OAuth client)
- [ ] T-054 Meeting/contact matching: ≤ 3 candidates with evidence, manual search, skip
- [ ] T-055 Context pull (deal, contact, account, meeting, last 5 notes / 90 days) with a token budget
- [ ] T-056 Prep chat + structured brief, saved with the call, injected into the live prompt (replay)
- [ ] T-057 Live context rail (collapsed; no latency regression)
0.5.0 Learning loop
- [ ] T-058 Ratings on AI advice cards with reason chips; admin aggregates
- [ ] T-059 Learned instructions: minimised packet, 8 × 25 words, registry variable, next-call only (D-034; replay)
- [ ] T-060 Settings instruction editor: edit, reorder, disable, delete, versions, revert, review switch, badge
0.6.0 Post-call actions
- [ ] T-061 Post-call panel + during-call side panel (lead, contact only)
- [ ] T-062 Zoho writes: Meeting, Lead, Contact, Deal note — approval, audit, idempotency
- [ ] T-063 Email: senders, formats, static blocks, To/CC, preview, send, audit (D-032) `owner` (SMTP)
0.7.0 WhatsApp
- [ ] T-064 Gallabox adapter: template list + allow-list, `window_status()`, last 100 messages (D-033) `owner` (key)
- [ ] T-065 Approved WhatsApp sends from the post-call panel
0.8.0 Release
- [~] T-066 Landing page, Privacy, Terms, Zoho Forms slot `owner` (form, legal review) — `apps/landing/` built with placeholders (logo, screenshots, Zoho form, DRAFT legal); axe 0 serious, evidence `docs/evidence/phase9/landing/`; waits for logo/tokens, 0.3.0 screenshots, owner form + legal text
- [~] T-067 DNS + Caddy for salesshield.agncompu.com; clean `/downloads/` `owner` (DNS) — `deploy/caddy/salesshield.caddy`, `deploy/publish-landing.sh` (dry run), `scripts/release.sh` (dry run) written; nothing run on us3; `caddy validate` not run (Caddy not installed locally)
- [ ] T-068 GitHub Releases v0.3.0…v0.8.0 with installers
- [ ] T-069 Local Mac cleanup + clean install keeping data `local-only`

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

_None yet._

## Session log

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
