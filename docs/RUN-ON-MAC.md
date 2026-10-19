# Try Sotto on your Mac (local demo)

This runs the real suggestion engine on your laptop with the web app (D-013, D-020). The "customer" is played by a script, typed by you, or **spoken into your microphone**. Real phone calls need LiveKit and a phone-line account (Phase 4). To put the same demo on your server, see `deploy/README.md`.

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
- **Or speak:** press **Speak as the customer** and talk; you play the customer. Sotto transcribes you in real time (AssemblyAI by default), decides when you have finished a sentence, and shows the card. The button appears when a speech-to-text key is set.
- **Or type** what the customer says, for example "Another company quoted us 20% less", "What's the payment plan?" or "Do you allow pets?". Customer lines trigger cards; agent lines never do (R4).
- **Card colours:**
  - **Playbook** cards are instant answers from the demo company's playbook.
  - **"Not in playbook — check before promising"** cards come from the AI.
  - **Holding line** cards ("Good question. Let me confirm…") appear when there is no safe answer, and the question goes to the manager's inbox.

The demo company, **Palm Grove Realty (demo)**, is fictional (`seed/demo/`). Your own products and answers go into `playbook/` once you send them.

## 3. Real AI suggestions (optional)

Easiest: open **Admin → Keys & providers** in the demo, follow "Get a key" for Groq (free) and AssemblyAI ($50 free credit), paste the keys, and press **Test**. The next call uses them.

Or, with a file: without a key, the demo uses fake models. Real ones are free (D-016):

1. Create a Groq key at console.groq.com (free, no card). Optional: a Google AI Studio key at aistudio.google.com for the backup model.
2. Create a file named `.env` in the repo folder (`touch .env && open -e .env`) with:

```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...           # optional: backup model (R2)
```

Run `pnpm demo` again. The terminal says `live models`. If a provider renames a model, cards fall back to the holding line; tell Claude and it updates `seed/models/default.yaml`. Never commit `.env`; git ignores it already. The full list of variables is in `docs/ENV.md`.

## 4. Checks you can run

| Command | What it proves |
|---|---|
| `pnpm test` | All unit tests (app, UI, shared protocol, worker, scripts) |
| `pnpm replay --all` | Latency p50/p95 and "agent never triggers a card" on the scripted calls (synthetic until real recordings exist) |
| `pnpm replay:live` | The same with your real AI keys |
| `pnpm stt:live` | Each speech-to-text vendor with a key: time to the final transcript, word errors |
| `pnpm spoken:live` | The whole spoken path against a running server (`pnpm demo`, or `--url https://… --code …` for the hosted one): time from end of speech to the card |
| `pnpm test:db` | Database isolation between companies (needs Docker Desktop + `brew install supabase/tap/supabase`, or a local PostgreSQL with pgTAP) |
| `pnpm typecheck`, `pnpm lint` | Types, style and architecture rules |

## What is not in the demo yet

- Real phone calls. These need LiveKit Cloud and a SIP trunk (Phase 4); the microphone stands in for the customer.
- Real sign-in, multiple companies and roles. The database and its security rules exist and are tested; the app screens use sample data, and the hosted server uses one access code (D-020).
- iPhone and Android builds. They need Xcode, Android Studio and the store accounts.
