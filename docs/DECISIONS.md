# Decisions

One entry per decision. Never edit an old entry; supersede it with a new one.

Format: `D-NNN — Title` · date · status · decision · why · rejected options.

---

## D-001 — Product name: Sotto
2026-10-13 · accepted
- **Decision:** The product is called Sotto (from *sotto voce*, "in a low voice").
- **Why:** Short, works in English and Arabic markets, describes the product (a private
  whisper to the agent), no conflicting sales product found in a first search.
- **Open:** Trademark and domain check before public launch.

## D-002 — The app is the phone
2026-10-13 · accepted
- **Decision:** Calls go through the app (WebRTC media server + SIP trunk), not the phone's own dialer.
- **Why:** iOS and Android do not let apps read normal call audio. Running the call
  through our media server gives a separate customer track on every platform (R4, R5).
- **Rejected:** Recording the phone's dialer calls (blocked), single-mic diarization only (unreliable).

## D-003 — Prompts and models are data, not code
2026-10-13 · accepted
- **Decision:** All prompts come from a versioned prompt registry; all model calls go
  through a model router with provider adapters, including OpenAI-compatible endpoints
  (Ollama, vLLM, LM Studio, Groq, OpenRouter).
- **Why:** R6 — per-company customization, open-source and local models, safe rollback.

## D-004 — Engineering workflow: addyosmani/agent-skills
2026-10-13 · accepted
- **Decision:** Use the agent-skills plugin (spec → plan → build → test → review → ship)
  as the single workflow framework, plus Anthropic's frontend-design plugin for visual design.
- **Why:** Covers spec, TDD, ADRs, security, observability and shipping with verification
  gates; MIT; widely used. One framework only, to keep context small and behaviour consistent.
- **Rejected:** Stacking Superpowers / Spec Kit / BMAD on top (overlapping instructions).

## D-005 — Client framework (OPEN)
- **Options:** Expo (React Native, TypeScript; recommended) vs Flutter (Dart).
- **Decide in:** Phase 1, before any app code.

## D-006 — Skills are vendored into the repo, not installed as plugins
2026-10-13 · accepted · refines D-004
- **Decision:** These are copied into the repo:
  - agent-skills v0.6.12 (`1be8e34`): skills, references, agents and commands;
  - the official `frontend-design` skill.

  They live under `.claude/`. Two commands are renamed to avoid clashing with built-ins: `/plan` → `/breakdown`, `/review` → `/quality-review`.

  Plugins stay enabled only for:
  - tools that are not instructions: `context7`, `playwright`, `typescript-lsp`, `pyright-lsp`;
  - `security-guidance`, which is a hook.
- **Why:**
  - The same skills load in cloud sessions (claude.ai/code) and locally, with no install step.
  - The version is pinned and reviewable in git.
- **Rejected:** Installing the agent-skills plugin from its marketplace. Cloud availability is uncertain, the version can drift, and having both plugin and vendored copies would load every skill twice.
- **Update procedure:** `.claude/skills/README.md`.

## D-007 — The tracker is the project's memory
2026-10-13 · accepted
- **Decision:**
  - `docs/TRACKER.md` is the single status file: Now, phase board, task board with IDs from `docs/phases/`, waiting on owner, and an append-only session log.
  - Every session starts with `/next-task` and ends with `/handoff`.
  - A SessionStart hook prints the tracker's Now section.
- **Why:** Work moves between cloud sessions and the local Mac. Conversation memory does not carry over; the repo does.
- **Rejected:**
  - Status only in PR descriptions, which are not visible offline or to a fresh agent.
  - `tasks/todo.md` as the master list. It is per-task and is overwritten by `/breakdown`.

## D-008 — Branch per phase; the owner merges
2026-10-13 · accepted
- **Decision:**
  - Each phase gets its own branch, `phase-N-<slug>`. A cloud-generated `claude/…` branch is acceptable if it is recorded in the tracker.
  - A draft PR is opened early. The owner merges to `main`.
  - A new session continues an unmerged phase branch instead of starting a second one.
- **Why:** Cloud and local sessions alternate. One branch per phase avoids diverging trackers. It also gives the owner one review point per phase.
