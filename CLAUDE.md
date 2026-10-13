# Sotto
Real-time sales call assistant: listens to the customer's audio track and shows the
agent one suggestion card in ≤ 1.5 s. Multi-tenant. iOS, Android, desktop.
Prompts and models are configurable per company (no hard-coding).

Read before feature work: @docs/REQUIREMENTS.md
Also read: docs/ARCHITECTURE.md (system), docs/DESIGN.md (UI work), docs/ROADMAP.md (current phase).
Every decision: append to docs/DECISIONS.md.

## Status
Phase 0 (brief + playbook). No app code yet. Phase prompts live in prompts/.

## Commands
Not set up yet. Phase 1 adds them here: dev, test, typecheck, lint, replay, db tests.

## Hard rules
- IMPORTANT: after any change to the agent worker, STT, LLM, prompts or model config, run the replay and report p95.
- Only the customer track may trigger a suggestion.
- Every table has tenant_id + RLS policy + an isolation test.
- No model names or prompt text in code: use the model router and prompt registry (R6).
- Provider SDKs are imported only inside adapters/.
- No API keys in client apps. Never read or commit .env files.
- UI uses packages/ui tokens and components only. Check light + dark, phone + desktop.
- Real customer recordings never go into git (see test-calls/README.md).

## Workflow
- Use the agent-skills plugin flow: /spec → /plan → /build → /test → /review → /ship.
- Start each phase in plan mode. Finish with evidence: test output, replay numbers, screenshots.
- Small commits on a branch per task.
