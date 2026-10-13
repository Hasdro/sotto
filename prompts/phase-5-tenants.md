# Phase 5 — Companies, roles, trials (R3)

```
Implement R3 with Supabase (dev project only).

- Tables: companies (plan, status, trial_ends_at, seat and minute limits),
  memberships (user, company, role), devices/sessions, calls, cards, escalations,
  playbook_entries, prompts, model_configs, audit_log. Every table has company_id and an RLS policy.
- Roles: platform_owner, company_admin, sales_manager, agent — permission matrix from
  REQUIREMENTS.md enforced in RLS, not only in the UI.
- Multi-device sign-in, device list with revoke, invite by email, trial banner,
  expiry blocking, reminder emails, usage meter.
- Isolation tests first: for every table, a user of company A cannot select, insert,
  update or delete rows of company B. Run in CI.

Then run the agent-skills security-auditor in fresh context on the auth and RLS
changes and fix only real issues.
```

**Done when:** isolation tests cover every table and pass; no open high security findings.
