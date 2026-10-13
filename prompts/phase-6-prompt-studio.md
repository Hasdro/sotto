# Phase 6 — Prompt studio and model settings (R6)

```
Move prompts and model config from files into the database and build the admin UI.

- Prompt studio: list prompts by stage, edit with variable autocomplete, versions with
  diff, scope (platform / company / team / campaign, most specific wins), "test on
  recordings" (runs the replay for the chosen calls and shows quality + latency),
  publish, one-click rollback. Every change in audit_log.
- Model settings: per stage choose provider + model + parameters. Add custom provider:
  name, OpenAI-compatible base URL, key (stored server-side, encrypted), test
  connection. Show each model's last replay benchmark; block a live stage from using a
  model whose p95 for that stage breaks R1.
- Feature flags per company.

Prove every R6 acceptance test with evidence (screens + replay output).
```

**Done when:** all R6 acceptance tests pass.
