# Environment variables

Put these in `.env` at the repo root. `.env` is git-ignored; never commit it. Every variable is optional for the local demo.

> `.env.example` should hold this list (CLAUDE.md), but Claude's permission settings deny every `.env.*` path, including `.env.example`. Until the owner narrows that rule (tracker → *Waiting on owner*), this file is the list.

| Variable | Used by | What happens without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | worker: live suggestions (`seed/models/default.yaml` → `suggest`) | `pnpm demo` runs on fake models |
| `OPENAI_API_KEY` | worker: backup model (R2) | the backup is switched off for that run |
| `OPENAI_COMPATIBLE_API_KEY` | worker: a company endpoint such as Groq or OpenRouter | sent as `unused` (fine for Ollama) |
| `STT_PRIMARY_API_KEY`, `STT_BACKUP_API_KEY` | worker: speech-to-text (P2.3, Phase 4) | not used by the demo, which is typed or scripted |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | live calls (Phase 4) | not used yet |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | app + worker (Phase 5) | not used yet |
| `EXPO_PUBLIC_DEMO_BRIDGE_URL` | app: demo bridge address | `ws://127.0.0.1:8787` |
| `SOTTO_RECORDINGS_DIR` | replay: golden-call audio outside git | the replay uses synthetic text calls only |
