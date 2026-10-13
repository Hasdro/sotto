# Roadmap

This is the one-line view. Details, tasks and exit gates are in `docs/phases/`. Live status is in `docs/TRACKER.md`.

- **Phase 0 — Brief and playbook** · done when: BRIEF.md filled, playbook has real answers, 10 recorded calls labelled.
- **Phase 1 — Architecture and skeleton** · done when: ARCHITECTURE and D-005 are approved, and CI is green on the skeleton (types, tests, boundaries, gitleaks).
- **Phase 2 — Engine, model router, replay** · done when:
  - replay p95 ≤ 1500 ms and agent triggers = 0;
  - the R2 fallback tests pass;
  - a local Ollama model runs through the router.
- **Phase 3 — Design system and screens** · done when: the in-call screen is approved on phone and laptop, in light and dark, LTR and RTL.
- **Phase 4 — Live calls** · done when: real calls on iPhone, Android and laptop show cards with live p95 ≤ 1.5 s, and the agent's speech never triggers a card.
- **Phase 5 — Companies, roles, trials** · done when: isolation tests cover every table and the security review is clean.
- **Phase 6 — Prompt studio and model settings** · done when: the R6 acceptance tests pass.
- **Phase 7 — Escalations and Zoho CRM** · done when: an unanswered question goes to the manager, the answer goes into the playbook, and the next replay uses it.
- **Phase 8 — Hardening and release** · done when: load test, failure drills, alerts and store builds are done, plus a one-week pilot.
