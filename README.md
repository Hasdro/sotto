# Sotto

**The quiet voice in your ear on every sales call.**

Sotto listens to the customer during a live call. Within 1.5 seconds, it shows the
sales agent what to say next: the answer, the next question, or how to handle the
objection.

- It runs on iPhone, Android, Windows, Mac and Linux.
- It serves many companies from one system.
- Each company can tune its own prompts and AI models, including open-source and local ones.

> *Sotto voce*: Italian for "in a low voice", a remark meant for one listener only.

## Status

There is no application code yet; it is ready to build. This repository holds:

- the requirements;
- the plan;
- the instructions, skills and tracker that Claude Code uses to build it.

Live progress is in [`docs/TRACKER.md`](docs/TRACKER.md).

## Start building

1. Open the repo in Claude Code:
   - **Cloud:** choose this repo at claude.ai/code.
   - **Local:** run `cd ~/Documents/GitHub/sotto && claude`.
2. Paste the master prompt from [`docs/MASTER-PROMPT.md`](docs/MASTER-PROMPT.md).
3. At every handoff, the agent updates the tracker and pushes. The next session, on any machine, continues from there.

## Map

| Path | What it is |
|---|---|
| `CLAUDE.md` | Rules Claude Code reads every session |
| `docs/MASTER-PROMPT.md` | The prompt to start or continue any session |
| `docs/TRACKER.md` | Where the project is: phase, tasks, blockers, session log |
| `docs/WORKFLOW.md` | How the agent works: session start/end, task loop, git, cloud vs local |
| `docs/REQUIREMENTS.md` | R1–R6 with acceptance tests (source of truth) |
| `docs/phases/` | Detailed brief per phase (0–8): tasks, acceptance, exit gate, pitfalls |
| `docs/ENGINEERING.md` | Repo layout, interfaces, coding, testing, security standards |
| `docs/ARCHITECTURE.md` | Architecture (draft, finalized in Phase 1) |
| `docs/DECISIONS.md` | Numbered decisions with reasons |
| `docs/REFERENCES.md` | Official documentation links per topic |
| `docs/BRIEF.md` | Business brief, filled in during Phase 0 |
| `docs/ROADMAP.md` | One-line view of the phases |
| `docs/design/refs/` | Screenshots of apps whose design you like |
| `playbook/` | FAQ, objections, products, things never to promise |
| `test-calls/` | Labels for golden recorded calls (audio kept outside git) |
| `spec/`, `tasks/` | Specs and the current plan, written by the agent |
| `scripts/doctor.sh` | What this machine or cloud session can do |
| `.claude/` | Settings, hooks, vendored skills, commands and reviewer agents |

Interactive plan and report: https://claude.ai/artifact/FwbdmXrYKxWEdV9Dtn2jHQ
