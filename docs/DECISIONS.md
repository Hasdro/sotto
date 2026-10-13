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
