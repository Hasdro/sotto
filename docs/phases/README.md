# Phase briefs

Each phase has a brief with the same sections:

- **Goal**
- **Entry criteria**
- **Read first**
- **Skills and subagents**
- **Environment**
- **Tasks** (IDs + acceptance)
- **Exit gate**
- **Out of scope**
- **Pitfalls**
- **Owner actions**

`docs/TRACKER.md` mirrors the task IDs and their state.

| Phase | Brief | Serves | Where it can run |
|---|---|---|---|
| 0 | [Brief, playbook, golden calls](phase-0-brief.md) | all | cloud or local (interview) |
| 1 | [Architecture, decisions, skeleton, CI](phase-1-architecture.md) | all | cloud (+ local for Supabase/Docker check) |
| 2 | [Engine, model router, prompt registry, replay](phase-2-engine.md) | R1 R2 R4 R6 | cloud for code + fakes; local or keyed cloud for real replay; local for Ollama |
| 3 | [Design system and screens](phase-3-design.md) | R5 | local preferred (simulators); web screenshots in cloud |
| 4 | [Live calls on real devices](phase-4-live-calls.md) | R1 R4 R5 | local + devices + owner |
| 5 | [Companies, roles, devices, trials](phase-5-tenants.md) | R3 | code in cloud; RLS tests local (Docker) |
| 6 | [Prompt studio, model settings, flags](phase-6-prompt-studio.md) | R6 | cloud + local |
| 7 | [Escalations and Zoho CRM](phase-7-escalations-crm.md) | R2 | cloud + local |
| 8 | [Hardening, release, pilot](phase-8-hardening.md) | all | local + owner |

## Rules

- **Phase order.** Phases run in order. Inside a phase, tasks run in the order listed unless the brief marks them *parallel-safe*.
- **Starting a phase.** A phase starts only when the previous exit gate is met, or when the owner has explicitly waived it in `docs/DECISIONS.md`.
- **Pre-agreed exception.** Phase 0's golden recordings may arrive late. Phase 1 and the fake-based part of Phase 2 may start without them. The real replay task (P2.8) waits.
- **Coherence.** Every task must trace to a requirement (R1–R6) or a decision. If a task has neither, it is scope creep: add it to *Ideas* in the tracker instead of building it.
