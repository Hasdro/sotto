# Try Sotto on your Mac (local demo)

This runs the real suggestion engine on your laptop with the web app (D-013). The "customer" is typed by you or played from a script, because real phone calls need LiveKit and a phone-line account (Phase 4).

## 1. One-time setup (about 5 minutes)

You need Node 22+, pnpm and uv. If they are missing, install them in Terminal:

```bash
brew install node pnpm uv
```

Then get the code on the build branch:

```bash
cd ~/Documents/GitHub/sotto        # or wherever you cloned it
git fetch origin
git checkout claude/friendly-gates-fbhqdv
git pull
pnpm install
(cd apps/agent-worker && uv sync)
```

## 2. Run the demo

```bash
pnpm demo
```

Wait for `Open http://127.0.0.1:8787`, then open that address in Chrome or Safari. Stop the demo with `Ctrl+C`.

- **Pick a scenario** (for example "Investor call: payment plan and price objection") and press Start. Watch the transcript and the suggestion cards appear.
- **Or type** what the customer says, for example "Another company quoted us 20% less", "What's the payment plan?" or "Do you allow pets?". Customer lines trigger cards; agent lines never do (R4).
- **Card colours:**
  - **Playbook** cards are instant answers from the demo company's playbook.
  - **"Not in playbook — check before promising"** cards come from the AI.
  - **Holding line** cards ("Good question. Let me confirm…") appear when there is no safe answer, and the question goes to the manager's inbox.

The demo company, **Palm Grove Realty (demo)**, is fictional (`seed/demo/`). Your own products and answers go into `playbook/` once you send them.

## 3. Real AI suggestions (optional)

Without a key, the demo uses fake models. For real ones, create a file named `.env` in the repo folder with:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...        # optional: backup model (R2)
```

Run `pnpm demo` again. The terminal says `live models`. Never commit `.env`; git ignores it already. The full list of variables is in `docs/ENV.md`.

## 4. Checks you can run

| Command | What it proves |
|---|---|
| `pnpm test` | All unit tests (app, UI, shared protocol, worker, scripts) |
| `pnpm replay --all` | Latency p50/p95 and "agent never triggers a card" on the scripted calls (synthetic until real recordings exist) |
| `pnpm test:db` | Database isolation between companies (needs Docker Desktop + `brew install supabase/tap/supabase`, or a local PostgreSQL with pgTAP) |
| `pnpm typecheck`, `pnpm lint` | Types, style and architecture rules |

## What is not in the demo yet

- Real phone calls and speech-to-text. These need accounts: LiveKit Cloud, a SIP trunk, and a speech-to-text vendor.
- Sign-in, multiple companies and roles. The database and its security rules exist and are tested; the app screens use sample data.
- iPhone and Android builds. They need Xcode, Android Studio and the store accounts.
