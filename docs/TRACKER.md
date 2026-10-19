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
- **Phase:** owner answers applied (D-017, D-018, BRIEF, settings, `.env.example`). Phases 2, 3, 5, 6 and 7 are partly done (see task board).
- **Next task:** P2.3 STT adapters for the four vendors (D-019); Deepgram, AssemblyAI and Speechmatics keys are in `.env`, ElevenLabs is not. The live LLM smoke test passed on 2026-10-20 (p95 ~840 ms).
- **Without the owner:** axe accessibility checks in CI (P3.3), plan/trial banner (P3.5), P6.4 model settings with custom endpoints.
- **Owner open items:** STT pick; keys into `.env`; retention audio duration; free-tier data choice before real customers; Yeastar admin details (P4); first companies; playbook documents.
- **Branch:** `claude/friendly-gates-fbhqdv` (D-013). Draft PR: https://github.com/Hasdro/sotto/pull/1
- **Environment last used:** local Mac, 2026-10-20 (no Docker running, so `pnpm test:db` was not run; gitleaks now installed).
- **Blockers:** live calls need LiveKit + the Yeastar trunk; playbook documents (P0.3); real recordings later.
- **Next action:** `/spec` the STT adapter interface (streaming, finals, end-of-turn events), then build Deepgram first with mocked-WebSocket tests.

## Phase board

| Phase | Status | Branch / PR | Exit gate evidence |
|---|---|---|---|
| 0 Brief, playbook, golden calls | owner answers applied 2026-10-19 (BRIEF, D-017/D-018); playbook docs + golden calls later | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | – |
| 1 Architecture, skeleton, CI | architecture owner-approved (D-017); gate waits on P1.7 (Docker) | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | CI green ([run](https://github.com/Hasdro/sotto/actions/runs/39166712190)); `docs/handoffs/phase-1.md` |
| 2 Engine, router, registry, replay | mostly done (STT, audio replay, Ollama pending) | `claude/friendly-gates-fbhqdv` · PR #1 | synthetic replay p95 1148 ms, outage drill PASS |
| 3 Design system and screens | mostly done (role switch, axe CI, owner QA pending) | same | `docs/evidence/p3/`, `docs/evidence/demo/` |
| 4 Live calls | todo | – | – |
| 5 Tenants, roles, trials | schema + RLS done; auth/UI pending | same | 284 pgTAP assertions |
| 6 Prompt studio, model settings | todo | – | – |
| 7 Escalations, Zoho CRM | todo | – | – |
| 8 Hardening, release, pilot | todo | – | – |

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
- [~] P2.3 Real adapters: anthropic, openai, openai_compatible, STT ×2 — LLM adapters done (mocked-HTTP tests); defaults are Groq + Gemini with host-bound keys (D-016); `pnpm replay:live` built and run live 2026-10-20: all 5 model IDs ok; p50 549–613 / p95 837–848 ms, agent cards 0 (after fix d8b10d1); STT pick-list in `docs/STT-OPTIONS.md`; per D-019, STT adapters for all four vendors (Deepgram, AssemblyAI, Speechmatics, ElevenLabs), selectable by setting; keys from the owner (`docs/PROVIDER-KEYS.md`) `owner`
- [x] P2.4 Prompt registry (seed/prompts, scopes, variables) — scopes, publish/rollback, strict render, platform fallback; 8 tests
- [x] P2.5 Pipeline: turn → trigger → playbook → suggest → stream — CallSession + trigger rules + playbook index (drafting on partials still TODO)
- [x] P2.6 R2 chain: backup, holding line, escalation record — holding at t0+1400, late answer ≤ 5 s, one escalation per question; session tests
- [x] P2.7 Telemetry events per card — CardTimingRecord per card + nearest-rank p50/p95
- [~] P2.8 Replay harness + judge, p95 ≤ 1500 ms (needs P0.5 + keys) `owner` — SYNTHETIC replay done (p50 567, p95 1148 ms, agent cards 0); audio replay + judge wait for golden calls + keys
- [!] P2.9 Local model (Ollama) benchmark `local-only` — blocked in cloud: needs Ollama (Mac)

### Phase 3
- [x] P3.1 Two visual directions `owner` — Claude chose "Prompter's box" (D-014, under D-013); owner reviews `docs/evidence/p3/`
- [x] P3.2 docs/DESIGN.md — tokens, card anatomy, layouts, motion, RTL, a11y
- [x] P3.3 packages/ui + gallery — components + `/gallery`; vitest 102 + jest 31; axe-core in CI still TODO
- [x] P3.4 Agent screens (mock) — in-call screen live on the demo bridge (e2e screenshots `docs/evidence/demo/`), history, playbook; app jest 90
- [x] P3.5 Manager/admin screens (mock) — inbox, team, prompts, models (with benchmark), settings; mock role switch (agent / manager / admin) gates navigation and pages per R3 (`lib/role.tsx`, `components/RoleGate.tsx`); screenshots `docs/evidence/p3.5/`. Playbook editor and plan/trial banner remain for Phase 5
- [ ] P3.6 Visual QA loop `owner`

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
- [ ] P6.4 Model settings + custom endpoints + R1 guard
- [ ] P6.5 Feature flags
- [ ] P6.6 Admin permissions
- [ ] P6.7 Keys & providers panel: add/test/replace keys with "Get a key" links, vendor per stage (owner request 2026-10-20, D-019)

### Phase 7
- [x] P7.1 Email adapter + outbox — retry 10 s/30 s/1/5/15 min + dead letter, Resend with Idempotency-Key; DB trigger enqueues one email per escalation
- [~] P7.2 Escalation flow → playbook — DB: `approve_escalation()` turns an answered escalation into a playbook entry (team-scoped, ≤ 25 words, once, audited; 9 pgTAP). App: the inbox answers and adds to the playbook on an in-memory store with the same rules (`features/escalations/`, evidence `docs/evidence/p7.2/`). Pending: swap the store for Supabase once auth exists (P5.3)
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

## Waiting on owner

Things only the owner can do, so the agent never waits silently.

- [ ] Answer the Phase 0 interview, or simply correct the `ASSUMED:` lines in `docs/BRIEF.md` (D-009)
- [ ] Agree to `test-calls/PLAN.md` and set a recording date; check whether Yeastar can record split channels
- [ ] Supply playbook content: products and prices, top 20 questions, top 10 objections, never-promise list (P0.3)
- [ ] Record 10 golden calls with consent (separate customer and agent tracks)
- [ ] Add 5–10 design references to `docs/design/refs/`
- [ ] Install Docker Desktop: run `brew install --cask docker-desktop` in a terminal (it needs your password), then open Docker once
- [ ] Install Xcode:
  - run `mas install 497799835`, which needs your password; or install it from the App Store;
  - then run `sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -license accept`.
- [ ] Open Android Studio once and let it install the Android SDK and an emulator
- [ ] Accounts, when their phase arrives:
  - Phase 2: Groq + Google AI Studio (free, D-016); 3 STT vendors for the comparison (Deepgram, Speechmatics, AssemblyAI; free credits)
  - Phase 4: LiveKit Cloud + SIP trunk, Apple Developer, Google Play
  - Phase 1/5: Supabase dev project
  - Phase 7: Resend/Postmark
  - Phase 8: Sentry
- [-] Cloud sessions: set the API keys as environment secrets (owner: keys only in the Mac's `.env`), and allow network access to the vendors' domains
- [ ] Trademark and domain check for "Sotto" (D-001)
- [x] Let Claude write `.env.example` (owner approved 2026-10-19; apply next session). The deny rule `Read(./.env.*)` in `.claude/settings.json` also blocks `.env.example`. Suggested: add an allow rule for `./.env.example`. Until then `docs/ENV.md` lists the variables.
- [x] Try the demo on the Mac (owner, 2026-10-19: "looks nice")
- [x] Answer the decisions page (submitted 2026-10-19; see `docs/OWNER-ANSWERS.md`): https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6. It replaces the Phase 0 interview and covers BRIEF, D-009 to D-015, accounts, hooks and `.env.example`.
- [ ] Free AI keys: `GROQ_API_KEY` (console.groq.com) and `GEMINI_API_KEY` (aistudio.google.com) in `.env` at the repo root on the Mac (`~/Documents/GitHub/sotto/.env`; copy `.env.example`). Only `.env` on the Mac (D-017). Not present on 2026-10-20.
- [x] Groq, Gemini, OpenRouter, Deepgram, AssemblyAI and Speechmatics keys in `.env` (2026-10-20). ElevenLabs is optional.
- [ ] (done above) Get the keys you choose (links and steps: `docs/PROVIDER-KEYS.md`) and put them in `.env`. Speech-to-text: pick any two of Deepgram, AssemblyAI, Speechmatics or ElevenLabs (recommended: Deepgram + AssemblyAI)
- [ ] Retention: how long to keep call audio (owner chose "also keep audio" without a duration)
- [ ] Free tiers and customer data: choose before the first real customer call (owner: "not sure, explain more when it matters")
- [ ] Yeastar admin details and whether it can send a SIP trunk to LiveKit (P4)
- [ ] First 1–3 companies and agent counts
- [x] Review the design direction (D-014; approved on the decisions page) and the screenshots in `docs/evidence/p3/` and `docs/evidence/demo/`
- [x] Approve or edit two Claude Code hook changes (owner approved both 2026-10-19; applied 2026-10-20, commit d22c2cc) in `.claude/settings.json`. A review subagent suggested them; agents do not change their own hook config on a subagent's word.
  - **Stop hook:** send stdout to stderr, `{ pnpm -s typecheck && pnpm -s test; } 1>&2 || exit 2`, so Claude sees the tsc and pytest errors. Also exit 0 when the hook input has `"stop_hook_active": true`, so a machine without `uv` cannot trap the session.
  - **PostToolUse format hook:** today a Biome failure skips ruff with no notice. Run the two formatters independently.

## Known issues and tech debt

- **T-002** (2026-10-18) — resolved the same night: cards and `turn_end` carry `turn_id`, and the app groups by it (commits a300a22, b5d81aa).
- **T-003** (2026-10-18) zod adds about 90 KB to the web bundle (426 KB of the 450 KB budget). Consider a zod/mini parser in `packages/shared`.
- **T-004** (2026-10-18) Drafting on partial transcripts (ARCHITECTURE §4) is not implemented. Today the suggest request starts on the final transcript.

- **T-005** (2026-10-20) Blocking work on the live event loop defeats the R2 timers. Provider SDK imports (OpenAI ~0.6 s, Anthropic ~1.1 s) are now done at start (`preload_adapters`, d8b10d1). Still open (latency-guardian review, carried to P4.4 and P6.7):
  - the Phase 4 worker entry must call preload, plus warm at room join;
  - company-specific routes must be preloaded at call start;
  - HTTP keep-alive (httpx default 5 s) must outlast silences, or the first question after a pause pays TLS setup again;
  - `router.warm` must warm each stage separately (one `ModelFailsR1` skips both);
  - playbook lookup runs twice per turn; pass the result through.
- **T-006** (2026-10-20) On Groq the primary misses its 700 ms first-token deadline in about 18% of turns. The backup (Gemini) races but has not won yet. Watch this on real recordings, and consider a lower `reasoning_effort` or a non-reasoning model for `suggest` if p95 climbs.
- **T-001** (2026-10-18) `pnpm audit` ignores two high advisories that have no patched version and are reachable only through Expo build tooling:
  - GHSA-86w9-cpqp-85rv: node-forge via `@expo/cli`;
  - GHSA-vfj7-8cjw-p6xm: braces via `metro-file-map`.

  Both are listed in `pnpm-workspace.yaml` → `auditConfig.ignoreGhsas`. Remove them when Expo ships a fix; re-check at every Expo SDK upgrade.

## Ideas (not scheduled; need a requirement or decision first)

_None yet._

## Session log

Newest first. Use this format:
`### YYYY-MM-DD · cloud|local · <model> · <phase/task>`
followed by the lines **Done**, **Evidence**, **Tried and rejected**, **Next** and **Notes** (see `docs/HANDOFF.md`).

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
