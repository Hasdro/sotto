# Sotto

**The quiet voice in your ear on every sales call.**

Sotto listens to the customer during a live call and, within 1.5 seconds, shows the
sales agent what to say next: the answer, the next question, or how to handle the
objection. It runs on iPhone, Android, Windows, Mac and Linux, serves many companies
from one system, and lets each company tune its own prompts and AI models, including
open-source and local ones.

> *Sotto voce*: Italian for "in a low voice", a remark meant for one listener only.

## Status

Planning. No application code yet. This repository holds the requirements, the plan,
and the prompts for building it with Claude Code.

## Map

| Path | What it is |
|---|---|
| `CLAUDE.md` | Short rules Claude Code reads every session |
| `docs/REQUIREMENTS.md` | R1–R6 with acceptance tests (source of truth) |
| `docs/BRIEF.md` | Business brief, filled in during Phase 0 |
| `docs/ARCHITECTURE.md` | Draft architecture, finalized in Phase 1 |
| `docs/DECISIONS.md` | Numbered decisions with reasons |
| `docs/ROADMAP.md` | Phases with "done when" checks |
| `docs/design/refs/` | Screenshots of apps whose design you like |
| `prompts/` | The prompt to paste into Claude Code for each phase |
| `playbook/` | FAQ, objections, products, things never to promise |
| `test-calls/` | Labels for golden recorded calls (audio kept outside git) |
| `.claude/settings.json` | Permissions, hooks, plugins for this project |

## How to work on it

1. Open this folder in Claude Code. Accept the prompt to install the project plugins
   (`agent-skills`, `frontend-design`).
2. Run the prompt in `prompts/phase-0-brief.md`.
3. One phase per fresh session. Plan mode first, evidence at the end, `/clear` between phases.

Interactive plan: https://claude.ai/artifact/FwbdmXrYKxWEdV9Dtn2jHQ
