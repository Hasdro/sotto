# Phase 0 — Interview me and write the brief

No code. Paste into a fresh Claude Code session in the repo root.

```
Read docs/REQUIREMENTS.md (R1–R6) and docs/BRIEF.md. Use the agent-skills
interview-me skill and the AskUserQuestion tool to interview me in detail.

Cover: how and where our agents take calls today, languages and dialects, call volume,
the sales process and stages, products and prices, top customer questions and
objections, things an agent must never promise, the first customer companies, roles
and permissions, trial rules, which models/providers each company may use (cloud,
open-source, local), who may edit prompts, privacy and recording consent, and how we
measure success.

Don't ask obvious questions. Dig into the hard parts I may not have considered,
especially mobile calling, latency, local-model speed and multi-tenant isolation.

When done, fill docs/BRIEF.md, and draft playbook/faq.md, playbook/objections.md,
playbook/products.md and playbook/never-promise.md in the format from playbook/README.md,
marking anything I still need to fill in with TODO.
```

**Done when:** BRIEF.md filled, playbook has real answers, 10 recorded calls labelled in test-calls/.
