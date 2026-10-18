---
key: escalation_email
version: 1
scope: platform
stage: summary
description: Email to the sales manager when the agent had no safe answer (R2 step 4). Rendered, not sent to a model.
variables:
  - company.name
  - escalation.question
  - escalation.transcript
  - escalation.agent
  - escalation.customer
  - escalation.crm_link
  - escalation.inbox_link
---
Subject: Unanswered question from {{escalation.customer}}

{{escalation.agent}} could not answer this question on a call, and the customer is waiting for a reply today:

"{{escalation.question}}"

Last moments of the call:
{{escalation.transcript}}

Customer: {{escalation.customer}}
CRM: {{escalation.crm_link}}

Answer it in Sotto: {{escalation.inbox_link}}
Once you approve the answer, it is added to the {{company.name}} playbook.
