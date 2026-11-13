---
key: crm_brief
version: 2
scope: platform
stage: suggest
description: Appended to the live suggestion's per-turn message when the call has a brief — the CRM record the agent confirmed and/or the structured brief they wrote (context rail, R10, T-056). Clients without it simply skip the block.
variables:
  - crm.brief
---
Call brief (from the CRM record the agent confirmed and the agent's own prep notes; use it to stay relevant, never read it out, and never promise anything from it that the playbook or company facts do not support):
{{crm.brief}}
