# Default prompts

One Markdown file per prompt key. The YAML front matter describes the prompt and the body is the template. The prompt registry (P2.4) loads these files, and Phase 6 moves them into the database. Prompt text never lives in code (CLAUDE.md hard rules).

```markdown
---
key: suggest              # unique; the pipeline asks the registry for this key
version: 1                # bump on every change; the registry keeps old versions for rollback
scope: platform           # platform | company | team | campaign (most specific wins)
stage: suggest            # model-router stage that runs it (seed/models/default.yaml)
description: One line on what the prompt is for.
variables:                # every {{name}} used in the body, and nothing else
  - transcript.last_60s
---
Template body with {{transcript.last_60s}} ...
```

`apps/agent-worker/tests/test_seed.py` checks every file: the front matter is complete, the stage exists, and the body uses exactly the declared variables.

## Cacheable prefix

A live prompt may contain one line `---turn---`. Everything before it must use only per-company variables (it is sent as the cacheable system prefix, ARCHITECTURE §4). Everything after it is the per-turn user message.
