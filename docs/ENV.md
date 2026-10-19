# Environment variables

Put these in `.env` at the repo root. Where to get each key: `docs/PROVIDER-KEYS.md`. `.env` is git-ignored; never commit it. Every variable is optional for the local demo.

**Since D-020, provider keys can also be added in the app**, under Admin → Keys & providers. There they are encrypted and stored by the Sotto server. A key saved in the panel wins over the same name in `.env`. On the hosted server the panel is the only place for keys; `.env` is never copied there.

Platform keys for OpenAI-compatible providers are bound to their provider's host in `apps/agent-worker/sotto_worker/adapters/factory.py` (`COMPATIBLE_KEY_HOSTS`), so a company-configured endpoint can never receive one (D-016). The old `OPENAI_COMPATIBLE_API_KEY` is no longer read: an endpoint with no key name gets no secret.

`.env.example` at the repo root holds the same names with no values (owner-approved 2026-10-19). Keep the two in sync: a new variable goes in both, with no value.

| Variable | Used by | What happens without it |
|---|---|---|
| `GROQ_API_KEY` | worker: live suggestions, trigger and summary (`seed/models/default.yaml`); sent only to `api.groq.com` | `pnpm demo` runs on fake models |
| `GEMINI_API_KEY` | worker: backup model (R2) and judge; sent only to `generativelanguage.googleapis.com` | the backup is switched off for that run |
| `OPENROUTER_API_KEY` | worker: optional, for routes that point at OpenRouter; sent only to `openrouter.ai` | routes that name it are not built |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | worker: only if a route uses the `openai` or `anthropic` provider (none does by default, D-016) | not needed |
| `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `SPEECHMATICS_API_KEY`, `ELEVENLABS_API_KEY` | worker: real-time speech-to-text for the spoken customer track (default AssemblyAI main + Speechmatics backup, D-021); `pnpm stt:live` | "Speak as the customer" is hidden; typed and scripted calls still work |
| `RESEND_API_KEY` | worker outbox: escalation emails (Phase 7) | emails stay in the outbox (fake sender) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | live calls (Phase 4) | not used yet |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | app + worker (Phase 5) | not used yet |
| `EXPO_PUBLIC_DEMO_BRIDGE_URL` | app: server socket address | the page's own server (`wss://<host>/ws`), or `ws://127.0.0.1:8787/ws` under the Expo dev server |
| `EXPO_PUBLIC_SOTTO_DEMO` | app build: `1` enables the demo bridge in a production web build (set by `pnpm demo`) | production builds never connect to the bridge |
| `SOTTO_RECORDINGS_DIR` | replay: golden-call audio outside git | the replay uses synthetic text calls only |

## Sotto server (D-020)

| Variable | Used by | What happens without it |
|---|---|---|
| `SOTTO_ACCESS_CODE` | hosted server: the access code for the sign-in page (8+ characters) | hosted mode refuses to start; local mode has no sign-in |
| `SOTTO_SECRET_KEY` | server: master secret that encrypts panel keys (32+ characters) | hosted mode refuses to start; local mode creates `.sotto-data/secret.key` once |
| `SOTTO_PUBLIC_ORIGIN` | hosted server: the only origin allowed to open call sockets or change settings, e.g. `https://104-168-48-116.sslip.io` | hosted mode refuses to start |
| `SOTTO_DATA_DIR` | server: SQLite file with panel keys, stage choices, call history and audit log | `<repo>/.sotto-data/` (git-ignored) |
| `SOTTO_TRUSTED_PROXY` | server: which proxy IPs may set `X-Forwarded-For` (Caddy in Docker) | `127.0.0.1` |
| `SOTTO_DOMAIN` | deploy: the HTTPS hostname Caddy serves | `<ip-with-dashes>.sslip.io` |

On the hosted server these live in `/etc/sotto/sotto.env` (mode 600), created by `deploy/install.sh`; see `deploy/README.md`.

