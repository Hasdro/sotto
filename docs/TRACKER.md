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
- **Phase:** 0 — Brief, playbook, golden calls (in progress)
- **Task:** P0.1 Interview the owner `[~]`
- **Branch:** `claude/friendly-gates-fbhqdv` (cloud-generated; use it for all of Phase 0, D-008)
- **Environment last used:** cloud (no Docker, simulators, Ollama, supabase/lk CLIs or API keys)
- **Blockers:** none for Phase 0
- **Next action:** Continue the P0.1 interview (one question at a time); answers are logged in `docs/BRIEF.md` as they arrive.

## Phase board

| Phase | Status | Branch / PR | Exit gate evidence |
|---|---|---|---|
| 0 Brief, playbook, golden calls | in progress | `claude/friendly-gates-fbhqdv` | – |
| 1 Architecture, skeleton, CI | todo | – | – |
| 2 Engine, router, registry, replay | todo | – | – |
| 3 Design system and screens | todo | – | – |
| 4 Live calls | todo | – | – |
| 5 Tenants, roles, trials | todo | – | – |
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
- [ ] P1.2 Finalize ARCHITECTURE.md (failure modes, cost per minute) `owner`
- [x] P1.3 Monorepo skeleton — `pnpm install && pnpm typecheck && pnpm test` green (vitest 28, jest-expo 3, pytest 30); web screenshots in `docs/evidence/p1.3/`
- [x] P1.4 Commands + hooks working — CLAUDE.md table updated; Stop hook exits 2 on a broken type, 0 when clean (~8 s); format hook ~0.6 s
- [x] P1.5 scripts/check-boundaries.sh with fixtures — 7 rules, 8 failing + 1 passing fixture trees, repo clean (`bash scripts/tests/run.sh`)
- [ ] P1.6 GitHub Actions CI + gitleaks
- [!] P1.7 Local Supabase smoke test `local-only` — blocked in cloud: needs Docker + supabase CLI (Mac)
- [ ] P1.8 CONSTRAINTS.md
- [ ] P1.9 Roadmap + tracker refresh

### Phase 2
- [ ] P2.1 Contracts and fake adapters
- [ ] P2.2 Model router (per stage, per company, deadlines, fallback)
- [ ] P2.3 Real adapters: anthropic, openai, openai_compatible, STT ×2
- [ ] P2.4 Prompt registry (seed/prompts, scopes, variables)
- [ ] P2.5 Pipeline: turn → trigger → playbook → suggest → stream
- [ ] P2.6 R2 chain: backup, holding line, escalation record
- [ ] P2.7 Telemetry events per card
- [ ] P2.8 Replay harness + judge, p95 ≤ 1500 ms (needs P0.5 + keys)
- [!] P2.9 Local model (Ollama) benchmark `local-only` — blocked in cloud: needs Ollama (Mac)

### Phase 3
- [ ] P3.1 Two visual directions `owner`
- [ ] P3.2 docs/DESIGN.md
- [ ] P3.3 packages/ui + gallery
- [ ] P3.4 Agent screens (mock)
- [ ] P3.5 Manager/admin screens (mock)
- [ ] P3.6 Visual QA loop `owner`

### Phase 4
- [ ] P4.1 Telephony: LiveKit + SIP trunk `local-only` `owner`
- [ ] P4.2 Token service (edge function)
- [ ] P4.3 App calling: dev build, CallKit/ConnectionService, web `local-only`
- [ ] P4.4 Worker in the room, customer track only
- [ ] P4.5 Desktop + other softphone (optional)
- [ ] P4.6 Live latency vs replay `local-only` `owner`
- [ ] P4.7 Robustness cases

### Phase 5
- [ ] P5.1 Schema
- [ ] P5.2 RLS + isolation test matrix `local-only` (to run)
- [ ] P5.3 Auth + devices + revoke
- [ ] P5.4 Invitations and roles UI
- [ ] P5.5 Plans and trials
- [ ] P5.6 Billing hook (optional) `owner`
- [ ] P5.7 Security review

### Phase 6
- [ ] P6.1 Registry + router read from DB
- [ ] P6.2 Prompt studio
- [ ] P6.3 Test on recordings
- [ ] P6.4 Model settings + custom endpoints + R1 guard
- [ ] P6.5 Feature flags
- [ ] P6.6 Admin permissions

### Phase 7
- [ ] P7.1 Email adapter + outbox
- [ ] P7.2 Escalation flow → playbook
- [ ] P7.3 CRM interface + fake
- [ ] P7.4 Zoho implementation `owner`
- [ ] P7.5 After-call summary

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

## Known issues and tech debt

_None yet._

## Ideas (not scheduled; need a requirement or decision first)

_None yet._

## Session log

Newest first. Use this format:
`### YYYY-MM-DD · cloud|local · <model> · <phase/task>`
followed by the lines **Done**, **Evidence**, **Tried and rejected**, **Next** and **Notes** (see `docs/HANDOFF.md`).

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
