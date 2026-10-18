# How to work on Sotto (for Claude and any other agent)

This is the operating manual. `CLAUDE.md` holds the rules. This file explains how to apply
them day to day so that every session — cloud or local, today or in three months —
leaves the project coherent.

---

## 1. Your two hats

| Hat | You are responsible for | You produce |
|---|---|---|
| **Project manager** | Order of work, scope, risks, the owner's time, the truth of the tracker | `docs/TRACKER.md`, phase status, owner questions, decision entries |
| **Senior engineer** | Correct, tested, secure, fast, simple code that matches the architecture | Specs, plans, code, tests, evidence, reviews |

Switch hats on purpose:
- **Start and end of a session:** PM.
- **Inside a task:** engineer.
- **When a task grows, gets blocked, or conflicts with a document:** PM again.

The owner is a business person, not a full-time engineer. When you need the owner:
- Write questions in plain language.
- Give at most 3 options, each with a short recommendation and its trade-off.
- Batch your questions. Do not drip them one by one, except during the Phase 0 interview.

---

## 2. Session start (always)

1. `git fetch --all --prune`, then `git status`.
2. Find the newest work:
   - Check `docs/TRACKER.md` → **Now** → *Branch*.
   - If that branch is not `main`, check whether it has been merged (`git branch -r --merged origin/main`).
   - If it has not been merged, check it out and continue there.
   - Never start the same phase on a second branch.
3. Run `scripts/doctor.sh`. Note what this environment can do; cloud sessions usually have no Docker, no simulators and no audio devices.
4. Read `docs/TRACKER.md` fully, then the current phase brief in `docs/phases/`.
5. Say, in at most 5 lines:
   - the phase;
   - the task ID;
   - the goal of this session;
   - what you will verify;
   - anything blocked.
6. If the next task needs something this environment lacks, choose the next task that does not need it. Mark the skipped task in the tracker as `blocked: local-only`, then continue.

`/next-task` automates these steps.

## 3. The task loop

Every task in a phase brief has an ID (`P2.3`) and acceptance criteria.

1. **Understand.** Re-read the requirement(s) it serves. Check `docs/DECISIONS.md` for constraints.
2. **Ground.** For any external API or SDK, check the current official docs first: `source-driven-development` with Context7, plus `docs/REFERENCES.md`. Cite the URL in the code comment or spec where it matters.
3. **Spec** (new capability or anything spanning more than one module).
   - Run `/spec`. Save it to `spec/phase-N-<slug>.md`.
   - Small tasks inside an existing spec skip this step.
4. **Plan.**
   - Run `/breakdown`, which writes `tasks/plan.md` and `tasks/todo.md`.
   - Each step must be small enough for one commit and have a check.
   - Use plan mode for anything touching more than 3 files.
5. **Build.**
   - Use `/build`, which is TDD: write a failing test, make it pass, then refactor.
   - Make one slice per commit. Never write code that no test exercises.
6. **Verify.**
   - Run the relevant commands: unit tests, typecheck, lint, replay, `supabase test db`, screenshots.
   - Paste the key lines of output into the session log as evidence.
7. **Review.** Use a fresh context (a subagent), never self-review in the same breath:
   - `code-reviewer` on every PR-sized change;
   - `security-auditor` on auth, RLS, keys, webhooks or anything that handles untrusted input;
   - `latency-guardian` on worker, STT, LLM or prompt changes;
   - `tenancy-guardian` on schema, RLS, queries or new tables;
   - `test-engineer` when coverage is thin or tests are flaky.
   Fix the real findings and record the dismissed ones with a reason.
8. **Close.**
   - Tick the task in the tracker and add its evidence line.
   - Commit (`type(scope): summary`) and push.

## 4. When to stop and ask the owner

Stop and ask in any of these cases:
- A requirement looks wrong or impossible (for example, a local model cannot meet R1). Bring numbers.
- You are about to choose something hard to reverse: a vendor, a data model change after data exists, a paid service, or anything in production.
- A phase exit gate needs a human:
  - device tests;
  - real recordings;
  - store accounts;
  - the design direction choice;
  - the security sign-off.
- You have tried two approaches to the same failure and both failed. Use `debugging-and-error-recovery` first, then report.

Never stop for things the docs already answer. Never stop just to ask "shall I continue?".

## 5. Decisions

- Anything that a future session might otherwise redo differently becomes a `D-NNN` entry in `docs/DECISIONS.md`. Use the `documentation-and-adrs` skill.
- Never edit an accepted entry. Supersede it, and link both ways.
- Record the date, the options, the choice, and the reason (with numbers where possible).

## 6. Git and branches

- One branch per phase: `phase-N-<slug>`. Within a phase, make small commits; open a draft PR early.
- **Cloud sessions:** Claude Code on the web may create its own branch name. Record it in the tracker (**Now** → *Branch*) and keep using it for the rest of the phase.
- The owner reviews and merges PRs into `main`.
- The tracker lives on the branch with the work. After a merge, `main` holds the truth.
- If two branches both touched `docs/TRACKER.md`, merge them by hand:
  - keep both session-log entries;
  - for the task board, keep the furthest state of each task.
- Never commit any of these:
  - `.env*` (except `.env.example`);
  - recordings or transcripts;
  - `node_modules`, build output, or local Claude settings.
- Before every push, run `git diff --cached --stat` and scan for secrets. gitleaks is added in Phase 1.

## 7. Cloud vs local

| Need | Cloud session (claude.ai/code) | Local Mac session |
|---|---|---|
| Docs, specs, plans, TS/Python code, unit tests | yes | yes |
| Real STT / LLM calls in replay | only with network access and keys set as environment secrets | yes (`.env`) |
| Supabase local DB, RLS tests (Docker) | usually no — mark `blocked: local-only` | yes |
| iOS simulator / Android emulator / real devices | no | yes |
| Local models (Ollama) | no | yes |
| Screenshots of web build | yes, if Playwright can install browsers | yes |

Plan cloud sessions around the "yes" column. Phases 1–2 are mostly cloud-friendly. Phases 3–4 need the Mac.

**Budget.** Cloud credit is limited.
- Prefer one focused phase task per session.
- Use subagents for reviews, not for re-reading the whole repo.
- Clear the context between tasks.

## 8. Context hygiene

- `CLAUDE.md` is loaded every session. Keep it short. Detail belongs in `docs/`.
- Read what you need when you need it. Do not paste whole documents into chat.
- Run `/clear` or start a new session between tasks. The tracker is your memory, not the conversation.
- If quality drops (repeated mistakes, forgotten rules), hand off and start fresh.

## 9. Session end (always)

`/handoff` automates these steps:
1. All tests that ran are green, or the failure is recorded as the next action.
2. Update `docs/TRACKER.md`:
   - **Now:** phase, task, branch, next action, blockers.
   - **Task board:** the task states.
   - **Session log:** add the newest entry first, with date, environment (cloud or local), what was done, evidence, and what is next.
   - **Waiting on owner:** any new asks.
3. Make sure `docs/DECISIONS.md` has an entry for anything decided.
4. Commit and push. Run `git status` and confirm it is clean.
5. Print a 5-line summary for the owner: done, evidence, next, what you need from them.

The full protocol is in `docs/HANDOFF.md`:
- **checkpoints** mid-task (WIP commits; hand off at ~70% context);
- the **cold-start test** every handoff must pass;
- **phase handoffs** in `docs/handoffs/phase-N.md` when an exit gate is met;
- moving work between cloud and local.

## 10. Skills, commands and subagents in this repo

They are vendored in `.claude/`, so they work identically in the cloud and locally (D-006).

| When | Use |
|---|---|
| Session start / end | `/next-task`, `/handoff` |
| Unclear ask or new phase | `interview-me`, `idea-refine`, `/spec` |
| Turning a spec into steps | `/breakdown` (`planning-and-task-breakdown`) |
| Writing code | `/build` (`incremental-implementation` + `test-driven-development`) |
| Any external SDK/API | `source-driven-development` (+ Context7 MCP) |
| Interfaces between modules (router, adapters, data channel, DB API) | `api-and-interface-design` |
| Quality bar | `/constraints` (`constraint-driven-development`) → `CONSTRAINTS.md` |
| UI | `frontend-design` (look) + `frontend-ui-engineering` (structure, a11y) + `browser-testing-with-devtools` |
| Performance (R1) | `performance-optimization`, `/webperf` for the web build |
| Auth, RLS, keys, PII | `security-and-hardening`, `security-auditor` subagent |
| Logs, metrics, alerts | `observability-and-instrumentation` |
| CI | `ci-cd-and-automation` |
| Bugs | `debugging-and-error-recovery` |
| Risky or irreversible steps | `doubt-driven-development` |
| Decisions | `documentation-and-adrs` |
| Git hygiene, releases | `git-workflow-and-versioning` |
| Before merge | `/quality-review`, `/code-simplify` |
| Release | `/ship` (`shipping-and-launch`) |
| Context trouble | `context-engineering` |

Note: `/breakdown` and `/quality-review` are agent-skills' `/plan` and `/review` under new names. The original names clash with Claude Code's built-in `/plan` and `/review`.
