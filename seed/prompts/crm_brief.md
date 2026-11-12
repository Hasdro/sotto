---
key: crm_brief
version: 1
scope: platform
stage: suggest
description: Appended to the live suggestion's per-turn message when the agent attached a CRM record to the call (context rail, R10). Clients without it simply skip the block.
variables:
  - crm.brief
---
What the CRM says about this customer (the agent confirmed this record; use it to stay relevant, never read it out, and never promise anything from it that the playbook or company facts do not support):
{{crm.brief}}
