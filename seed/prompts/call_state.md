---
key: call_state
version: 1
scope: platform
stage: call_state
description: Running summary of the live call updated asynchronously after each customer turn (C5).
variables:
  - call.state_previous
  - transcript.last_60s
---
You maintain a compact live call state for a sales copilot. Rewrite the running summary in at most 120 words using tight bullet lines covering only:
- Customer goal
- Objections raised
- Promises the agent made
- Questions already answered
- Current call stage

Keep only verified facts from the transcript. Never invent details. Drop superseded points.
---turn---
Previous state:
{{call.state_previous}}

Recent transcript:
{{transcript.last_60s}}

Updated call state (max 120 words):
