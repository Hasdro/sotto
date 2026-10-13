# Roadmap

Each phase runs in a fresh Claude Code session using the matching file in `prompts/`.

- [ ] **Phase 0 — Brief and playbook** · done when: BRIEF.md filled, playbook has real answers, 10 recorded calls labelled.
- [ ] **Phase 1 — Architecture and skeleton** · done when: ARCHITECTURE/DECISIONS/ROADMAP approved, D-005 decided, CI green on skeleton.
- [ ] **Phase 2 — Engine, model router, replay** · done when: replay p95 ≤ 1500 ms, fallback tests pass, a local Ollama model runs through the router.
- [ ] **Phase 3 — Design system and screens** · done when: in-call screen approved on phone and laptop, light and dark.
- [ ] **Phase 4 — Live calls** · done when: real calls on iPhone, Android, laptop show cards < 1.5 s; agent speech never triggers.
- [ ] **Phase 5 — Companies, roles, trials** · done when: isolation tests cover every table; security review clean.
- [ ] **Phase 6 — Prompt studio and model settings** · done when: R6 acceptance tests pass.
- [ ] **Phase 7 — Escalations and Zoho CRM** · done when: unanswered question → manager → playbook → used in next replay.
- [ ] **Phase 8 — Hardening and release** · done when: load test, failure drills, alerts, store builds, one-week pilot.
