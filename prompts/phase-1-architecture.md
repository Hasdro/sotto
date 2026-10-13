# Phase 1 — Architecture, decisions, repo skeleton

Start in plan mode (Shift+Tab).

```
Read docs/BRIEF.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md (draft) and
docs/DECISIONS.md. Use source-driven-development: check current official docs for
Expo, LiveKit (Agents, SIP, Expo SDK), Supabase, and the OpenAI-compatible APIs of
Ollama and vLLM, and cite them.

1. Help me decide D-005 (Expo vs Flutter) with a short comparison for this project.
2. Finalize docs/ARCHITECTURE.md: components, data flow, the model router and adapter
   interfaces, prompt registry schema and scoping, latency budget per stage under
   1500 ms, the R2 fallback chain, and every failure mode with its handling.
3. Append decisions to docs/DECISIONS.md; update docs/ROADMAP.md "done when" lines
   from the acceptance tests.
4. Create the monorepo skeleton: apps/app, apps/agent-worker, packages/ui,
   packages/shared, supabase/, adapters live under apps/agent-worker/adapters/.
   Add dev/test/typecheck/lint/replay commands and list them in CLAUDE.md.
5. GitHub Actions: typecheck, tests, and the R6 grep check (no provider SDK imports
   outside adapters/). gitleaks pre-commit.

Show me the plan first. Finish with CI output as evidence.
```

**Done when:** docs approved, D-005 decided, CI green on the skeleton.
