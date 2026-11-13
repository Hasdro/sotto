---
key: crm_brief
version: 3
scope: platform
stage: suggest
description: Appended to the live suggestion's per-turn message when the call has a brief — the CRM record the agent confirmed and/or the structured brief they wrote (context rail, R10, T-056). Clients without it simply skip the block.
variables:
  - crm.brief
# INT-03 (D-048): one short line keyed by the Deal stage, added to {{crm.brief}} by the server
# when the brief is built ("as of prep": the stage can change during the call). Matched by the
# start of the stage name, case-insensitive; an unknown stage adds nothing. Each ≤ 150 tokens.
stage_label: "Stage guidance (stage as of prep: {stage})"
stage_guidance:
  qualification: "Confirm need, budget, timing and who decides; ask before pitching."
  needs analysis: "Dig into the problem and its cost; play back what you heard before proposing."
  value proposition: "Tie each benefit to a need they named; keep it to one or two points."
  id. decision makers: "Find who else decides or signs, and what each of them needs to see."
  perception analysis: "Check how they see us against other options; address doubts directly."
  proposal: "Walk through the proposal against their needs; agree on the open points and a date."
  negotiation: "Trade, do not give: tie any concession to a commitment; confirm the close date."
  closed won: "Focus on onboarding and next steps; look for referrals or expansion."
  closed lost: "Stay helpful; learn why, and ask if you may check back later."
---
Call brief (from the CRM record the agent confirmed and the agent's own prep notes; use it to stay relevant, never read it out, and never promise anything from it that the playbook or company facts do not support):
{{crm.brief}}
