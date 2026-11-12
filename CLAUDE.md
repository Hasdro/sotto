# Sotto — instructions for Claude

AGN Sales Shield (formerly Sotto; technical identifiers keep `sotto`, D-026) is a real-time sales-call copilot. During a live call it listens **only to the
customer's audio track** and shows the sales agent one suggestion card within **1.5 s
(p95)** of the customer finishing a sentence. It is multi-tenant SaaS with one codebase
for iOS, Android and web/desktop. Prompts and models are data, configurable per company,
including open-source and local (OpenAI-compatible) models.

You work on this repo as **project manager and senior engineer** at once:
- As PM you keep scope, order, the tracker and the owner informed.
- As engineer you write tested, reviewed, production-quality code.

Read `docs/WORKFLOW.md` once per session.

## Source of truth (read in this order when you need it)

1. @docs/REQUIREMENTS.md — R1–R6 with acceptance tests. This wins every conflict.
2. `docs/TRACKER.md` — where the project is, what is next, what is blocked. **Read it at the start of every session.**
3. `docs/phases/phase-N-*.md` — the brief for the current phase: tasks, exit gate, references.
4. `docs/DECISIONS.md` — numbered decisions. Never contradict one silently; supersede it with a new entry.
5. Supporting docs:
   - `docs/ARCHITECTURE.md`
   - `docs/ENGINEERING.md` (code standards and repo layout)
   - `docs/DESIGN.md` (UI, from Phase 3)
   - `docs/BRIEF.md` (business answers)
   - `docs/REFERENCES.md` (official docs)
   - `docs/RESEARCH.md` (why the plan looks this way; background only)
   - `docs/handoffs/phase-N.md` (what each finished phase left behind; read the latest one before a new phase)

If two documents disagree, stop, say which ones, and propose the fix as a decision.

## Session protocol (cloud or local, every time)

- **Start:** run `/next-task`. It syncs git, runs `scripts/doctor.sh`, reads the tracker, and states the phase, task and plan in 5 lines.
- **During:**
  - Work on one task at a time, in the smallest verifiable slice, tests first.
  - Update `docs/TRACKER.md` whenever a task changes state, not only at the end.
- **Checkpoint:** WIP-commit and push on the phase branch before risky work, about every 45 minutes, and when context passes ~60%. At ~70%, finish the slice, `/handoff`, and ask the owner for a fresh session (`docs/HANDOFF.md`).
- **End:** run `/handoff` (protocol in `docs/HANDOFF.md`) and confirm all of these:
  - the tracker is updated (Now, task board, session log);
  - everything is committed and pushed;
  - the next action is written so that a different session on a different machine can continue cold (the cold-start test in `docs/HANDOFF.md`);
  - when a phase exit gate is met, `docs/handoffs/phase-N.md` is written.
- Never end a session with uncommitted work or a tracker that is out of date.

## Hard rules

- IMPORTANT: only the **customer** track may trigger a suggestion. The agent track is context at most.
- IMPORTANT: after any change to the worker pipeline, STT, LLM adapters, prompts or model config, run the replay (`pnpm replay --all`) and report p50/p95. A p95 above 1500 ms is a failure, not a note.
- Every table has `company_id`, an RLS policy, and an isolation test: company A cannot select, insert, update or delete company B rows.
- No model names and no prompt text in application code. Use the model router and the prompt registry; `seed/` holds the defaults.
- Provider SDKs (LLM, STT, email, CRM, telephony) are imported **only** inside `adapters/` directories.
- No secrets in client apps or in git.
  - Never read, print or commit `.env*` files.
  - New env vars go in `.env.example` with no value.
- UI uses `packages/ui` tokens and components only. Check light and dark, 390 px and 1280 px, LTR and Arabic RTL.
- Customer recordings and transcripts never go into git (see `test-calls/README.md`).
- `CONSTRAINTS.md` is the quality bar (floor, numbers, exceptions). Read it before touching tests, lint, CI or thresholds.
- Never lower a quality bar to get green:
  - no skipped or deleted tests;
  - no `@ts-ignore` or `# type: ignore` without a tracker entry;
  - no loosened thresholds.
- Ask the owner before any of these:
  - spending money or creating accounts;
  - touching production;
  - changing a requirement;
  - deleting data;
  - adding a major dependency that the phase brief does not name.

## Session orchestration (D-035, phase 9)

- **Master session:** plans, decomposes, reviews, merges and keeps `docs/TRACKER.md` true. It does not run long builds, full test suites or large refactors itself; it gives them to subagents.
- **Subagents** do research, focused implementation, test runs and reviews. Use the cheapest adequate model; keep the strongest model for the master and for design or security judgement.
- **Child sessions** run independent workstreams, at most 3 in parallel. Each gets:
  - its own branch (`phase9/<stream>`) and git worktree;
  - a ready-to-paste prompt in `docs/prompts/` with scope, owned files, acceptance criteria, required evidence and handoff steps.
- **No two sessions touch the same files.** A file outside a child's owned list needs the master's OK. The master owns the merge order.
- **Children** update only their own section of the tracker (their task lines and a session-log entry). The master writes Now.
- Hand off at 60–70 % context. Never duplicate work. Commit and push WIP before risky steps and about every 45 minutes. Never end with uncommitted work or a stale tracker.
- **Decide vs ask:** technical, architectural and sequencing decisions are the session's own (record them). Ask the owner before spending money, creating paid accounts, touching production, changing a product requirement, deleting data, or adding a major dependency. Batch owner questions; keep going on everything that does not need them.

## Workflow

The workflow comes from the agent-skills vendored in `.claude/skills` (see D-004 and D-006).

`/spec` → `/breakdown` → `/build` (TDD, one slice per commit) → `/test` → `/quality-review` → `/ship`

- Use plan mode before multi-file work.
- Specs go to `spec/phase-N-<slug>.md`. The current plan goes to `tasks/plan.md` and `tasks/todo.md`.
- Skills to use:
  - UI: `frontend-design` and `frontend-ui-engineering`
  - before using any external API: `source-driven-development`, checking current docs with Context7
  - auth, RLS and keys: `security-and-hardening`
  - every decision: `documentation-and-adrs`
- Reviewer subagents: `code-reviewer`, `security-auditor`, `test-engineer`, `latency-guardian`, `tenancy-guardian`.

Evidence or it did not happen: finish each task with the test output, replay numbers or
screenshots that prove the acceptance criteria.

## Commands

Real since P1.3/P1.4. Run from the repo root.

| Purpose | Command |
|---|---|
| Install everything | `pnpm install && (cd apps/agent-worker && uv sync)` |
| Dev server (Expo; press `w` for web) | `pnpm dev` |
| Typecheck (TS + mypy) | `pnpm typecheck` |
| Lint (Biome + ruff + boundaries) | `pnpm lint` |
| Format (Biome + ruff) | `pnpm format` |
| Test (vitest, jest-expo, pytest, boundary fixtures) | `pnpm test` |
| Worker tests only | `cd apps/agent-worker && uv run pytest` |
| Regenerate card protocol (JSON Schema + pydantic) | `pnpm gen` |
| Boundary checks | `bash scripts/check-boundaries.sh` |
| Database tests (RLS) | `supabase test db` (needs Docker, local only) |
| Latency + quality replay | `pnpm replay --all` (synthetic until P2.8 golden calls); `pnpm replay:live` with real keys |
| STT vendors, live | `pnpm stt:live` (Mac `say`, keys in `.env`) |
| Spoken path, end to end | `pnpm spoken:live [--url https://… --code …]` against a running server |
| Local demo / server | `pnpm demo` (D-020 server in local mode) |
| Management server, local (D-022) | `cd apps/agent-worker && uv run python -m sotto_worker.cloud serve` (port 8788; owner console `/owner`) |
| Deploy the management server + web app | `deploy/push.sh root@<ip> [domain]` (see `deploy/README.md`) |
| Desktop app (Windows, Mac, Linux) | `cd apps/desktop && npm ci && npm run web && npm run dist` (installers in `apps/desktop/release/`) |
| Chrome extension | `bash apps/extension/build.sh` (zip in `apps/extension/release/`) |
| Phone apps (Android APK + iPhone simulator) | `bash apps/app/build-phones.sh [https://server]` (→ `apps/mobile-builds/`; needs ~8 GB free disk) |
| Publish installers to the server | `deploy/publish-apps.sh root@<ip>` (→ `https://<server>/downloads/`) |
| Environment check | `scripts/doctor.sh` |

## Git

- One branch per phase: `phase-N-<slug>`. Cloud sessions may get their own `claude/…` branch; record it in the tracker.
- Small conventional commits, for example `feat(worker): …`, `test(db): …`, `docs(tracker): …`.
- Push at least at every handoff.
- The owner merges to `main`. Never force-push `main`.
