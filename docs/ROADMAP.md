# Roadmap

This is the one-line view. Details, tasks and exit gates are in `docs/phases/`. Live status is in `docs/TRACKER.md`.

- **Phase 0 — Brief and playbook** · done when:
  - the owner confirms BRIEF.md (today it holds working assumptions, D-009);
  - the playbook has ≥ 20 FAQs and ≥ 10 objections with real content;
  - 10 labelled golden calls exist, or the owner waives this until P2.8.
- **Phase 1 — Architecture and skeleton** · done when:
  - D-005 is accepted (D-010, Expo) and the owner approves ARCHITECTURE.md, with no TBD failure modes;
  - from a clean clone, `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass;
  - CI is green on the PR: types, tests, boundaries, codegen drift, web export and bundle budget, audits, gitleaks;
  - `supabase test db` passes on the Mac (P1.7, local-only).
- **Phase 2 — Engine, model router, replay** · done when:
  - every adapter passes the shared contract tests; the fakes are used everywhere else;
  - router unit tests (fake clock) cover per-stage selection, company override, the 700 ms backup race, the disabled-backup path and the R1 benchmark guard;
  - prompt rendering and scope tests pass, and the boundary check finds no prompt text in code;
  - the R2 chain tests cover each branch, with exactly one escalation per unanswered question;
  - `pnpm replay --all` on the golden set gives p95 ≤ 1500 ms, zero agent-triggered cards, and a judge score per call;
  - the Ollama benchmark table is logged, with a decision on which local models may serve live stages.
- **Phase 3 — Design system and screens** · done when: the in-call screen is approved on phone and laptop, in light and dark, LTR and RTL.
- **Phase 4 — Live calls** · done when: real calls on iPhone, Android and laptop show cards with live p95 ≤ 1.5 s, and the agent's speech never triggers a card.
- **Phase 5 — Companies, roles, trials** · done when: isolation tests cover every table and the security review is clean.
- **Phase 6 — Prompt studio and model settings** · done when: the R6 acceptance tests pass.
- **Phase 7 — Escalations and Zoho CRM** · done when: an unanswered question goes to the manager, the answer goes into the playbook, and the next replay uses it.
- **Phase 8 — Hardening and release** · done when: load test, failure drills, alerts and store builds are done, plus a one-week pilot.
