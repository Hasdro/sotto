# Phase 7 — Escalations and Zoho CRM

## Goal

Close the R2 loop. When an agent is left with only the holding line, the manager gets an email within a minute, answers in the app, and the approved answer joins the playbook and serves the next call.

In the same phase, connect the CRM so that suggestions know who the customer is and calls write back a useful note.

## Entry criteria

- Phase 5 gate met.
- Phase 6 met, or at least P6.1.

## Read first

- `docs/REQUIREMENTS.md` R2, R6 (modules)
- `docs/ARCHITECTURE.md`: the email and CRM adapters
- `docs/REFERENCES.md`: Resend/Postmark, Zoho CRM v8 API (OAuth, rate limits)

## Skills and subagents

- `api-and-interface-design` (CRM interface)
- `security-and-hardening` (OAuth tokens)
- `observability-and-instrumentation`
- Subagents: `security-auditor`, `code-reviewer`

## Environment

- Cloud or local.
- A Zoho sandbox org is needed for P7.4.

## Tasks

### P7.1 — Email adapter and outbox
- Send email through an outbox table plus a worker or cron with retries.
- Build a fake adapter and one real one (Resend or Postmark, chosen in a D-NNN decision).
- Use templates from the prompt registry where AI writes the text. Fixed templates otherwise.

**Acceptance:**
- An email is sent within 60 s of the escalation (timed test).
- Retries and the dead-letter path are tested.

### P7.2 — Escalation flow
An escalation email contains:
- the customer;
- the question;
- a transcript excerpt (with the PII policy from BRIEF applied);
- a CRM link;
- the agent;
- a deep link into the app.

The manager answers in the app. On approval, the answer becomes a `playbook_entries` row (with a source link). The inbox has three states: open, answered, added to playbook.

**Acceptance:** the R2 test passes. One email is sent per unanswered question, and the answered question is served from the playbook in the next replay.

### P7.3 — CRM interface and fake
Define the interface:
- `find_contact(phone)`
- `get_context(contact)`: lead, deals, stage, owner, last notes
- `write_call_note(...)`
- `create_task(...)`

Build a fake implementation for tests.

**Acceptance:**
- Contract tests pass.
- The suggestion prompt receives `{{crm.*}}` variables.
- The pipeline never waits for the CRM on the live path: prefetch at call start, with a 300 ms budget, and continue without it if the budget runs out.

### P7.4 — Zoho implementation
- OAuth per company, with tokens encrypted and refreshed.
- Respect rate limits.
- Map these fields: Leads, Contacts, Deals, Notes, Tasks.
- After a call, write a note with the summary, the objections, the next step, and a link to the call in Sotto.

**Acceptance:**
- Works against one real Zoho sandbox org.
- Token refresh and rate limiting are tested with the fake.

### P7.5 — After-call summary
The summary stage runs on the full transcript asynchronously. The output is stored with the call, shown in the app, and sent to the CRM.

**Acceptance:** a summary exists within 2 minutes of hang-up and never blocks the live path.

## Exit gate
- [ ] An unanswered question goes to the manager email (< 60 s), is answered, added to the playbook, and served in the next replay. Evidence recorded.
- [ ] CRM context appears in suggestions, and the call note is written in the Zoho sandbox.
- [ ] Security review of OAuth and token storage is clean.

## Out of scope
- HubSpot and Salesforce. Their adapters come later, under the same interface.

## Pitfalls
- Escalation storms: deduplicate the same question within a call.
- Putting PII in email bodies against company policy.
- Zoho data centre domains (.com/.eu/.in/.ae…). Store the DC per company.

## Owner actions
- Choose the email provider and verify the sending domain.
- Create a Zoho sandbox or test org.
- Define who receives escalations per team.
