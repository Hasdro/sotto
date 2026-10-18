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
- **Phase:** autonomous overnight run (D-013) finished. The local demo works (`pnpm demo`, `docs/RUN-ON-MAC.md`). Phases 0–1 wait on owner review; Phases 2, 3, 5, 6 and 7 are partly done (see task board).
- **Next task:** after the owner tries the demo, P2.3 STT adapters (vendor choice) or P4.1 live calls (accounts). Without the owner: P3.5 role switch, P6.2 prompt studio UI, P7.2 escalation → playbook flow.
- **Branch:** `claude/friendly-gates-fbhqdv` (all phases this run, D-013). Draft PR: https://github.com/Hasdro/sotto/pull/1
- **Environment last used:** cloud, 2026-10-18 (local Postgres 16 + pgTAP installed by apt in-session; no Docker, simulators, Ollama or API keys)
- **Blockers:** live calls need owner accounts (LiveKit, SIP, STT vendor); real golden calls (P0.5); the owner's playbook content (P0.3)
- **Next action:** read the newest session log entry → **Next**; run `pnpm install && (cd apps/agent-worker && uv sync) && pnpm test && pnpm replay --all && pnpm test:db` to confirm a green start.

## Phase board

| Phase | Status | Branch / PR | Exit gate evidence |
|---|---|---|---|
| 0 Brief, playbook, golden calls | on assumptions (D-009); waits on owner | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | – |
| 1 Architecture, skeleton, CI | cloud done; gate waits on owner approval + P1.7 | `claude/friendly-gates-fbhqdv` · [PR #1](https://github.com/Hasdro/sotto/pull/1) | CI green ([run](https://github.com/Hasdro/sotto/actions/runs/39166712190)); `docs/handoffs/phase-1.md` |
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
- [!] P0.1 Interview the owner `owner` — deferred by the owner 2026-10-18 (D-009); answers replace `ASSUMED:` lines in BRIEF.md
- [~] P0.2 Write docs/BRIEF.md `owner` — working assumptions written (D-009); waits for the owner to say "correct"
- [!] P0.3 Draft the playbook (faq, objections, products, never-promise) `owner` — needs the real products, questions and objections; no invented content (D-009)
- [~] P0.4 Golden-call plan (test-calls/PLAN.md) `owner` — draft written; waits for owner agreement and a date
- [ ] P0.5 Label 10 golden calls `owner` (may finish later; blocks P2.8)
- [~] P0.6 Decisions from the interview — D-009 recorded; more after the interview

### Phase 1
- [x] P1.1 Decide D-005 Expo vs Flutter `owner` — Expo, D-010 (Claude's recommendation under D-009; owner may override before Phase 3)
- [~] P1.2 Finalize ARCHITECTURE.md (failure modes, cost per minute) `owner` — written and revised after an adversarial review; 19 failure modes with no TBD; cost ≈ $0.02–0.05/min plus carrier (up to $0.30/min on Twilio UAE mobile). Waits for the owner to approve.
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
- [~] P2.3 Real adapters: anthropic, openai, openai_compatible, STT ×2 — LLM adapters done (mocked-HTTP tests); STT adapters + live smoke test need a vendor choice + keys `owner`
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
- [~] P3.5 Manager/admin screens (mock) — inbox, team, prompts, models (with benchmark), settings; mock role switch TODO
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
- [ ] P6.2 Prompt studio
- [ ] P6.3 Test on recordings
- [ ] P6.4 Model settings + custom endpoints + R1 guard
- [ ] P6.5 Feature flags
- [ ] P6.6 Admin permissions

### Phase 7
- [x] P7.1 Email adapter + outbox — retry 10 s/30 s/1/5/15 min + dead letter, Resend with Idempotency-Key; DB trigger enqueues one email per escalation
- [ ] P7.2 Escalation flow → playbook
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
  - Phase 2: Anthropic, OpenAI, 2 STT vendors
  - Phase 4: LiveKit Cloud + SIP trunk, Apple Developer, Google Play
  - Phase 1/5: Supabase dev project
  - Phase 7: Resend/Postmark
  - Phase 8: Sentry
- [ ] Cloud sessions: set the API keys as environment secrets, and allow network access to the vendors' domains
- [ ] Trademark and domain check for "Sotto" (D-001)
- [ ] Let Claude write `.env.example`. The deny rule `Read(./.env.*)` in `.claude/settings.json` also blocks `.env.example`. Suggested: add an allow rule for `./.env.example`. Until then `docs/ENV.md` lists the variables.
- [ ] Try the demo on the Mac: `docs/RUN-ON-MAC.md` (`pnpm demo`). Optional: put `ANTHROPIC_API_KEY` in `.env` for real suggestions.
- [ ] Review the design direction (D-014) and the screenshots in `docs/evidence/p3/` and `docs/evidence/demo/`
- [ ] Approve or edit two Claude Code hook changes in `.claude/settings.json`. A review subagent suggested them; agents do not change their own hook config on a subagent's word.
  - **Stop hook:** send stdout to stderr, `{ pnpm -s typecheck && pnpm -s test; } 1>&2 || exit 2`, so Claude sees the tsc and pytest errors. Also exit 0 when the hook input has `"stop_hook_active": true`, so a machine without `uv` cannot trap the session.
  - **PostToolUse format hook:** today a Biome failure skips ruff with no notice. Run the two formatters independently.

## Known issues and tech debt

- **T-002** (2026-10-18) The card protocol has no `turn_id`. The app links a holding card to its turn by counting `turn_end` messages, which works only because the bridge sends `turn_end` before that turn's cards. Add an optional `turn_id` to the card and `turn_end` (protocol v1, additive) before live calls (Phase 4).
- **T-003** (2026-10-18) zod adds about 90 KB to the web bundle (426 KB of the 450 KB budget). Consider a zod/mini parser in `packages/shared`.
- **T-004** (2026-10-18) Drafting on partial transcripts (ARCHITECTURE §4) is not implemented. Today the suggest request starts on the final transcript.

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
  - TS: shared 25, ui 102 + 31, app 90 (before the UI review fixes), functions 12;
  - `pnpm replay --all` (SYNTHETIC): p50 567 / p95 1148 ms, agent-triggered 0, outage drill p95 1285 ms PASS;
  - `pnpm test:db`: 284 assertions; mutation checks on two policies fail as expected;
  - web bundle 426/450 KB;
  - e2e screenshots `docs/evidence/demo/`, with no console errors.
- **Tried and rejected:**
  - Writing `.env.example`: the agent's deny rule blocks it, so the list is in `docs/ENV.md`.
  - Rebuilding the runtime per WebSocket connection: it blocked the event loop.
  - Lexical playbook lookup with a 0.42 cosine floor is kept for now; re-tune it on the owner's playbook.
  - Pushing after every small commit cancels CI runs (concurrency). Batch pushes.
- **Next:**
  1. The owner tries the demo (`docs/RUN-ON-MAC.md`) and reviews D-009…D-015.
  2. Merge the UI review fixes (`turn_id` reducer, reconnect, `__DEV__` gating, a11y announce) if they are not in yet; check the tracker's T-items.
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
