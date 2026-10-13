# Phase 6 — Prompt studio, model settings, feature flags (R6)

## Goal

Let the platform owner and company admins change prompts and models without a code release. Each change is tested on recordings, then published, and can be rolled back. Any OpenAI-compatible endpoint, including local Ollama, can be added from the UI. Live stages can only use models that meet R1.

## Entry criteria

- Phase 2 gate met (router and registry exist on files).
- Phase 5 gate met (tables, roles, audit).

## Read first

- `docs/REQUIREMENTS.md` R6
- `docs/ARCHITECTURE.md`: registry and router
- `seed/prompts/`, `seed/models/`
- The Phase 2 benchmark format (P2.9)

## Skills and subagents

- `/spec`
- `api-and-interface-design`
- `frontend-ui-engineering`
- `security-and-hardening`, because it stores keys
- Subagents: `latency-guardian`, `tenancy-guardian`

## Environment

- Cloud works for code and tests.
- A local machine is needed to prove the Ollama endpoint.

## Tasks

### P6.1 — Registry and router read from the DB
- Prompts and model configs are read from the DB.
- They are seeded from `seed/` on first run, and the file path is kept for tests.
- Config is cached per call with a short TTL.

**Acceptance:**
- The next call after a change uses the new config, with no deploy.
- Tests cover cache invalidation.

### P6.2 — Prompt studio
- List prompts by stage.
- Editor with `{{variable}}` autocomplete, using the variable catalogue from the registry.
- Versions with diff.
- Scope selector: platform, company, team or campaign.
- Draft → test → publish workflow.
- One-click rollback.
- Every action is written to `audit_log`.

**Acceptance:** this R6 test passes end to end and is recorded as evidence: create v2 → test on recordings → publish → roll back to v1.

### P6.3 — "Test on recordings"
- Runs the replay server-side for the selected calls with the draft prompt or model.
- Shows quality (judge) and latency (p50/p95) next to the current published version.

**Acceptance:** results are stored per version and visible in the UI.

### P6.4 — Model settings
For each stage, choose provider, model and parameters.

To add a custom provider:
- Enter a name, an OpenAI-compatible base URL, and a key. The key is encrypted server-side and never returned to the client.
- Test the connection.
- Run a benchmark.

The settings screen shows each model's last benchmark. It blocks a live stage (turn, trigger, suggest, suggest_backup) from using a model whose p95 breaks R1, with a clear explanation.

**Acceptance:**
- The R6 tests pass: switch a company's suggest model, and add an Ollama endpoint and run a replay with it.
- `security-auditor` signs off on key storage.

### P6.5 — Feature flags
- Flags per company: drafting on partials, AI outside playbook, backup provider, agent-track context, CRM, voice-sample mode.
- The worker and the app read flags at call start.

**Acceptance:** flag tests pass, and every flag is documented in ARCHITECTURE.md.

### P6.6 — Admin permissions
- Company admins edit their company's scope.
- Sales managers edit the playbook only.
- The platform owner edits platform defaults.
- All of this is enforced by RLS.

**Acceptance:** isolation tests are extended to the new tables.

## Exit gate
- [ ] All R6 acceptance tests in REQUIREMENTS.md pass, with screenshots and replay output.
- [ ] The boundaries check is still green: no model names or prompt text in code.

## Out of scope
- Fine-tuning
- Hosting models for customers

## Pitfalls
- Letting an untested prompt go live: publishing requires a test run less than 24 h old.
- Variable typos discovered only during a live call: validate when saving.
- Exposing provider keys in API responses or logs.

## Owner actions
- Decide who may edit what, if this differs from R3.
- Provide or approve the local model endpoint used for the demo.
