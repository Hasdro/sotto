# Phase 7 — Escalations and Zoho CRM

```
1. Escalations: when the chain ends in a holding line, email the company's sales manager
   within 1 minute (customer, question, transcript excerpt, CRM link, agent). Manager
   answers in the app; on approval the answer is added to the playbook.
2. CRM adapter interface + Zoho implementation (OAuth per company): at call start load
   the lead/contact/deal summary into context; after the call write a note with summary,
   objections and next step. Respect rate limits, refresh tokens.
Test with a fake CRM adapter, then one real Zoho sandbox org.
```

**Done when:** an unanswered question reaches the manager, is answered, and the next replay uses it.
