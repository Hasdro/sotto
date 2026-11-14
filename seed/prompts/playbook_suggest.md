---
key: playbook_suggest
version: 1
scope: platform
stage: summary
description: The reason line on a playbook suggestion card for a manager (INT-15). Rendered on the server, not sent to a model. Nothing reaches the playbook until a manager approves it.
variables:
  - suggestion.count
  - suggestion.days
---
Came up on {{suggestion.count}} calls in the last {{suggestion.days}} days. Write the answer your team should give, then approve it to add it to the playbook.
