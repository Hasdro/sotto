# Environment variables

Put these in `.env` at the repo root. `.env` is git-ignored; never commit it. Every variable is optional for the local demo.

Platform keys for OpenAI-compatible providers are bound to their provider's host in `apps/agent-worker/sotto_worker/adapters/factory.py` (`COMPATIBLE_KEY_HOSTS`), so a company-configured endpoint can never receive one (D-016). The old `OPENAI_COMPATIBLE_API_KEY` is no longer read: an endpoint with no key name gets no secret.

> `.env.example` should hold this list (CLAUDE.md), but Claude's permission settings deny every `.env.*` path, including `.env.example`. Until the owner narrows that rule (tracker → *Waiting on owner*), this file is the list.

| Variable | Used by | What happens without it |
|---|---|---|
| `GROQ_API_KEY` | worker: live suggestions, trigger and summary (`seed/models/default.yaml`); sent only to `api.groq.com` | `pnpm demo` runs on fake models |
| `GEMINI_API_KEY` | worker: backup model (R2) and judge; sent only to `generativelanguage.googleapis.com` | the backup is switched off for that run |
| `OPENROUTER_API_KEY` | worker: optional, for routes that point at OpenRouter; sent only to `openrouter.ai` | routes that name it are not built |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | worker: only if a route uses the `openai` or `anthropic` provider (none does by default, D-016) | not needed |
| `DEEPGRAM_API_KEY`, `SPEECHMATICS_API_KEY`, `ASSEMBLYAI_API_KEY` | worker: speech-to-text vendor comparison (P2.3), then the chosen primary and backup (Phase 4) | not used by the demo, which is typed or scripted |
| `RESEND_API_KEY` | worker outbox: escalation emails (Phase 7) | emails stay in the outbox (fake sender) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | live calls (Phase 4) | not used yet |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | app + worker (Phase 5) | not used yet |
| `EXPO_PUBLIC_DEMO_BRIDGE_URL` | app: demo bridge address | `ws://127.0.0.1:8787` |
| `EXPO_PUBLIC_SOTTO_DEMO` | app build: `1` enables the demo bridge in a production web build (set by `pnpm demo`) | production builds never connect to the bridge |
| `SOTTO_RECORDINGS_DIR` | replay: golden-call audio outside git | the replay uses synthetic text calls only |
