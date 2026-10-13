# Phase 1 — Architecture, decisions, skeleton, CI

## Goal

Freeze the architecture and the interfaces, decide D-005, and create a monorepo skeleton
whose CI already enforces the rules (types, tests, boundaries, secrets).
Every later phase then adds features into a structure that cannot drift.

## Entry criteria

- Phase 0 exit gate met. The recordings may be waived.

## Read first

- `docs/BRIEF.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` (draft)
- `docs/ENGINEERING.md` (target layout, interfaces, standards)
- `docs/DECISIONS.md`, `docs/REFERENCES.md` (sections: Expo, LiveKit, Supabase, OpenAI-compatible)

## Skills and subagents

- `source-driven-development` + Context7: verify current Expo SDK, LiveKit Agents, LiveKit SIP, LiveKit RN/Expo SDK, Supabase CLI, Ollama/vLLM OpenAI API.
- `api-and-interface-design`: router, adapters, card protocol, DB access.
- `documentation-and-adrs`: decisions.
- `ci-cd-and-automation`, `/constraints`, `doubt-driven-development` (the architecture is the expensive thing to get wrong).
- Review: `code-reviewer` + `doubt-driven-development` cross-examination of ARCHITECTURE.md before the owner sees it.

## Environment

- Cloud is fine for everything except P1.7's local Supabase check, which needs Docker.

## Tasks

### P1.1 — Decide D-005 (Expo vs Flutter)

Write a one-page comparison for *this* project covering:
- LiveKit SDK maturity on each;
- CallKit / ConnectionService support;
- web and desktop story;
- Claude's strength in the language;
- hiring;
- RTL support.

Recommend one. The owner decides.

**Acceptance:** D-005 is recorded as accepted.

### P1.2 — Finalize `docs/ARCHITECTURE.md`

It must cover:
- components and data flow, with a sequence diagram for one card from customer speech to render;
- the model router and adapter interfaces;
- the prompt registry schema and scope resolution (platform → company → team → campaign);
- the card protocol;
- the token minting flow;
- the data model outline: tables, owner, `company_id`, retention;
- the latency budget per stage;
- the R2 fallback chain as a state machine;
- **every failure mode** with detection, user-visible behaviour, recovery and the test that proves it. At minimum:
  - LLM slow or down
  - STT down
  - LiveKit reconnect
  - DB unreachable
  - email down
  - CRM rate-limited
  - local model too slow
  - agent offline mid-call
  - a duplicate worker joining
- a cost estimate per call minute (STT + LLM + LiveKit + SIP), using the BRIEF numbers.

**Acceptance:** the owner approves, and there are no "TBD" entries in the failure-mode table.

### P1.3 — Monorepo skeleton

Use the layout in ENGINEERING §1:
- pnpm workspaces;
- an Expo app (or Flutter, per D-005) with expo-router and a "hello" screen on web;
- an `agent-worker` package with uv, ruff, mypy and pytest, and one passing test;
- `packages/ui` with a token stub;
- `packages/shared` with the card protocol schema (zod) and generated Python models or a JSON schema;
- `seed/prompts/` with front-matter format and one example;
- `seed/models/default.yaml`;
- `supabase/` initialised.

**Acceptance:** `pnpm install && pnpm typecheck && pnpm test` and `uv run pytest` pass from a clean clone.

### P1.4 — Commands

Wire up these commands and list them in the CLAUDE.md **Commands** table, replacing the placeholder text:
- `pnpm dev`, `test`, `typecheck`, `lint`, `format`;
- `pnpm replay` (a stub that exits 0 with "no golden calls yet").

The PostToolUse and Stop hooks in `.claude/settings.json` start working as soon as `package.json` exists. Check that they run fast (under 20 s).

**Acceptance:** the hooks fire, and a deliberately broken type makes the Stop hook block.

### P1.5 — Boundary checks

Write `scripts/check-boundaries.sh` covering:
- provider SDK imports outside `adapters/`;
- model names outside `seed/models/` and the adapters;
- prompt-like strings in code (heuristic: multi-line strings with "You are");
- `apps/app` importing the worker.

**Acceptance:** each rule has a failing fixture test, and CI runs the script.

### P1.6 — CI (GitHub Actions)

The pipeline runs, on each PR:
- install, typecheck, lint, unit tests (TS + Python);
- the boundaries check;
- gitleaks;
- dependency audit;
- the Supabase migration lint (once there are migrations).

Add a pre-commit gitleaks hook too.

**Acceptance:** CI is green on a PR, with a link in the tracker.

### P1.7 — Local Supabase check (local-only)

Run `supabase start`, apply an empty migration, and run one pgTAP smoke test.

**Acceptance:** `supabase test db` passes on the Mac.

### P1.8 — Quality bar

Run `/constraints` and write `CONSTRAINTS.md`:
- coverage floor for `pipeline/`, `router/` and `adapters/`;
- p95 1500 ms;
- zero `@ts-ignore`;
- accessibility AA;
- bundle size budget for web.

**Acceptance:** `CONSTRAINTS.md` is committed and referenced from CLAUDE.md.

### P1.9 — Update the roadmap

Update the ROADMAP.md "done when" lines from the acceptance tests, and refresh the tracker for Phase 2.

## Exit gate

- [ ] D-005 accepted. ARCHITECTURE.md approved by the owner.
- [ ] CI green: typecheck, tests, boundaries, gitleaks.
- [ ] CLAUDE.md lists the real commands; the hooks work.
- [ ] `supabase test db` passes locally, or is recorded as pending local in the tracker.

## Out of scope

Feature code, UI design, real provider calls.

## Pitfalls

- **Over-engineering the skeleton.** Packages exist, but they are thin.
- **Shared types drifting.** The card protocol is generated from one schema, never written twice.
- **Outdated SDK APIs from memory.** Always check Context7 or the official docs first.

## Owner actions

- Choose D-005.
- Approve ARCHITECTURE.md.
- Create the GitHub Actions secrets (none are needed yet).
- Install Docker Desktop on the Mac if it is missing.
