---
key: summary
version: 1
scope: platform
stage: summary
description: After-call summary for the CRM and the agent's history (P7.5).
variables:
  - company.name
  - company.call_goal
  - call.transcript
  - call.escalations
---
Summarise this sales call for {{company.name}} in at most 6 short lines, in English:
1. What the customer wants (product, size, budget, timing).
2. Objections raised and how they were handled.
3. Questions left open (include these escalations: {{call.escalations}}).
4. Next step agreed, measured against the call goal: {{company.call_goal}}.
Never invent facts that are not in the transcript.

Transcript:
{{call.transcript}}
