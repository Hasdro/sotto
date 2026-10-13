# Phase 5 — Companies, roles, devices, trials (R3)

## Goal

Run many companies safely on one system. Isolation is enforced by the database (RLS), not only by the UI, and is proven by tests for every table. Roles, multiple devices, trials, plan limits and the audit log all work.

## Entry criteria

- Phase 1 gate met. Can run in parallel with Phases 3 and 4 if the owner wants. Mark it parallel in the tracker.

## Read first

- `docs/REQUIREMENTS.md` R3 (permission matrix, plan states) and R2/R6 tables
- `docs/ARCHITECTURE.md` data model
- `docs/ENGINEERING.md` §10, §12
- `docs/REFERENCES.md`: Supabase RLS, Auth, testing (pgTAP)

## Skills and subagents

- `/spec` (data model + permission matrix as a table), `security-and-hardening`, `api-and-interface-design`
- `tenancy-guardian` on every migration, `security-auditor` at the end, `test-engineer`

## Environment

- Cloud: write migrations, policies and tests.
- Local (Docker): run `supabase test db`. Never use a remote production project.

## Tasks

### P5.1 — Schema
Create these tables:
- companies: plan, status, trial_ends_at, seat_limit, minute_limit, settings jsonb
- profiles
- memberships: user, company, role, team
- teams
- devices: device_id, platform, last_seen, revoked_at
- calls
- cards and card_timings, where card_timings replaces the Phase 2/4 file sink
- escalations
- playbook_entries
- prompts and prompt_versions (structure only; the UI comes in Phase 6)
- model_configs
- feature_flags
- audit_log
- usage_counters

**Acceptance:** migrations apply cleanly, and generated types are committed to `packages/shared`.

### P5.2 — RLS policies from the R3 matrix
- Write helper SQL functions such as `is_member(company)` and `has_role(company, role)`.
- Support access by the platform owner is explicit and audited.

**Acceptance:** pgTAP tests cover each table × role × operation (select/insert/update/delete), plus a cross-company denial test for every table. Generate the test matrix so a new table cannot skip it: CI fails if a table has no test file.

### P5.3 — Auth and devices
- Supabase Auth (email magic link + password; SSO later)
- Device registration and a device list
- Revoke a device, which kills its sessions and LiveKit tokens
- The same profile and history on every device

**Acceptance:** tests prove a revoked device cannot get a new call token.

### P5.4 — Invitations and roles UI
Wire the Phase 3 screens to real data: invite by email, change role, remove user.

**Acceptance:** every change writes to audit_log, and tests check it.

### P5.5 — Plans and trials
- Trial banner showing days left
- Calls blocked the day after expiry (enforced in `livekit-token`, not only in the UI)
- Reminder email 3 days before expiry (email adapter; may stub delivery until Phase 7)
- Usage meter for minutes and seats
- Suspended status

**Acceptance:** time-travel tests (fake clock in SQL or function) cover trial → expired → reactivated.

### P5.6 — Billing hook (optional, owner decides)
A Stripe checkout and webhook to move trial → active.

**Acceptance:** either a D-NNN records that billing is deferred, or webhook tests pass with signature verification.

### P5.7 — Security review
Run the `security-auditor` subagent in fresh context on auth, RLS, edge functions and the token service. Fix real issues and record any you dismiss.

**Acceptance:** no open high or critical findings.

## Exit gate
- [ ] Every table has RLS and isolation tests, and CI enforces that a test exists for each table.
- [ ] Device revoke, trial expiry and the audit log are proven by tests.
- [ ] The security review is clean (no high or critical findings).

## Out of scope
- Prompt studio logic (Phase 6)
- Escalation emails (Phase 7)

## Pitfalls
- Service role key leaking into the app. Grep CI for it.
- RLS policies that use `auth.uid()` without checking membership.
- Forgetting `company_id` on join tables.
- Trial enforcement done only in the UI.

## Owner actions
- Decide trial length, limits and billing now or later.
- Create the Supabase dev project. Only the dev project is ever connected to Claude.
