# Phase 8 — Hardening and release

```
/ship checklist from agent-skills, plus, with evidence for each:
- Load test: 25 and 100 concurrent replayed calls; p95 latency and error rate.
- Failure drills: block primary LLM, primary STT, database, email provider, a local
  model endpoint — confirm each behaves as ARCHITECTURE.md says.
- Monitoring: Sentry in app and worker; dashboard of card p95, fallback rate,
  escalations per company; alert when p95 > 1500 ms for 10 minutes.
- Release: EAS builds (TestFlight, Play internal), installable web app, staging and
  production, backup/restore check.
- /security-review and /code-review on the full diff since Phase 1.
```

**Done when:** two real agents use it for a week and every alert and drill behaves as documented.
