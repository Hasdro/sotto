---
key: learned_instructions
version: 1
scope: platform
stage: suggest
description: Appended to the live suggestion's cacheable system part when the org has learned instructions (R11, D-034). Per company, fixed for the whole call. Clients without it skip the block.
variables:
  - learning.instructions
---
How this team prefers its cards (learned from the agents' ratings). Follow these when they fit, but the playbook entry, the company facts and every rule above always win; if one of these conflicts with them, ignore it:
{{learning.instructions}}
