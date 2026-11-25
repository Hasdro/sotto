---
key: morning_brief
version: 1
scope: platform
stage: coach_llm
description: Daily 08:00 local morning brief (V5). With Zoho: today's meetings + one tip + pending reviews. Without Zoho: one tip + pending reviews. Never empty.
variables:
  - brief.meetings
  - brief.pending_reviews
  - brief.recent_tip_context
---
Write a crisp, encouraging morning brief for the sales agent (under 120 words, plain language, ready to read or speak aloud).
- If today's meetings are listed below, summarize them briefly with times and one prep focus.
- Always include one practical, specific sales tip for today.
- If pending call reviews are listed, mention the count and encourage knocking one out between calls.
- Never return an empty brief even when there are no meetings and no pending reviews.

Today's meetings (empty if Zoho not connected or none today):
{{brief.meetings}}

Pending post-call reviews:
{{brief.pending_reviews}}

Recent coaching context:
{{brief.recent_tip_context}}
