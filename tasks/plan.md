# Mac round 1 — owner's list of 21 Oct 2026

> For agentic workers: implement batch by batch, tests first, one slice per commit. After each batch: rebuild the Mac app (`cd apps/desktop && npm run web && npm run dist:mac`), replace /Applications/Sotto.app, ask the owner to test. Server changes: back up `/var/lib/sotto/cloud.db`, then `deploy/push.sh root@104.168.48.116`.

**Goal:** make the macOS app feel alive and complete: automatic call pick-up, a card for every customer message, a call review at the end, recordings, a busy home page, settings, reports, and the first integrations (Zoho CRM, Gallabox, Google sign-in, Resend).

**Architecture:** unchanged (D-022). Calls and AI run in the app; the us3 server keeps accounts, keys, playbook, recordings and integration tokens. Mac-only native work lives in `apps/desktop` (Electron main + a small Swift helper). Third-party APIs go through `adapters/` (server) or `packages/engine/src/adapters` (client).

**Owner decisions applied (hub, 21 Oct):** first-token budget raised (T-029); lazy-load the call screen (T-044); manager email through Resend (T-035); a practice tutorial popup inside the app with "Don't show this again" and a replay option (T-038, owner note); plan an off-server backup, usage analytics and pricing (Batch 7).

## Global constraints
- Mac first: only the Electron Mac app is built and tested this round; other platforms wait (owner rule, 21 Oct).
- R1 still holds: p95 ≤ 1500 ms on `pnpm replay --all` after any engine, prompt or model change.
- R4 still holds: only customer speech creates cards.
- No model names or prompt text in app code; new prompts go in `seed/prompts/`.
- UI uses `packages/ui` tokens; light, dark and Arabic.
- No owner secrets in chat or git. Keys go in through the app's Keys panel or a silent prompt on the server.

## Review focus
1. Auto pick-up starts on something that is not a call (a voice memo, a YouTube video) → only listed call apps start a call, and the agent can dismiss it.
2. A call app keeps the microphone after hanging up (Zoom keeps it in the waiting room) → end after 20 s of no customer audio as well as when the mic is released.
3. A card for every message floods the screen → short statements get a small "note" card; the card list keeps the last 3 expanded.
4. Recording upload on a slow line → upload only when idle, resumable, never during a call.
5. CRM contact not found or the token expired → the sidebar says so plainly and the call still works.

## Batches (in order)

### A — Fast, alive, clear (no outside accounts needed)
- A1 Instant tabs: cache every server read (stale-while-revalidate), prefetch after sign-in, load `/me` and `/bundle` in parallel. Test: second visit renders with zero requests.
- A2 First-token budget raised to the decided value + replay (T-029). Decision record.
- A3 Home page: remove the two mode cards; show user, company, plan, models in use, today's calls/minutes/cards, last call link, open questions, playbook size. Small "Start manually" link stays as a fallback while auto pick-up is off.
- A4 Look and feel: Claude-desktop-style right panel and cards; status colours on buttons and numbers; "listening" and "thinking" highlight effects; "Powered by AGN IT Services" footer; the Sotto mascot (animated SVG with states: idle, listening, thinking, suggesting, reviewing, offline).
- A5 Profile popup (from the avatar) and a Settings section: theme (system/light/dark), language, sounds, microphone choice, auto pick-up, recording, tutorial replay, About (version, server, licences), sign out of other devices.
- A6 Practice tutorial popup on first sign-in with "Don't show this again" and replay from Settings (T-038).
- A7 Playbook help popup (animated walkthrough) + 2 sample entries for every new company and for Zylker (server seed + one-off insert).
- A8 Keys & providers: collapsible vendor sections, search, "Add a provider" pick list instead of the full list.

### B — Call intelligence
- B1 A card for every customer message: new kinds `statement`, `buying_signal`, `small_talk` beside `question`/`objection`, each with its own colour. Prompt in seed. Replay must stay ≤ 1500 ms p95.
- B2 Call review after End: scores (opening, discovery, listening, objection handling, clarity, next step), talk ratio, sentiment line, success chance %, one coaching tip. Sliders/gauges, no emoji. Prompt in seed; runs once after the call.
- B3 Auto pick-up on Mac: Swift helper polls Core Audio process objects (macOS 14.2+) for call apps using the microphone (Zoom, Teams, Webex, Chrome/Safari/Edge for Meet, 3CX, Yeastar Linkus); start on, end on release or 20 s silence. `sotto://call?number=…` link for 3CX/Yeastar "open URL on call" to pass the caller's number.
- B4 Recording: both sides recorded to a local file during the call; playback in History; upload to the server when idle; 30-day retention on the server; space check.

### C — Integrations (need the owner's accounts; code first, switch on when the key is in)
- C1 Resend manager email (T-035): key entered on the server by the owner through a silent prompt; sender address; one email per question.
- C2 Google sign-in: server OAuth flow, app opens the browser and returns via `sotto://`. Needs a Google Cloud OAuth client from the owner.
- C3 Zoho CRM: company admin connects Zoho (OAuth, data centre picked); server keeps the refresh token encrypted; contact search by phone/name, account and deals; call sidebar with a contact pick list; contact details go into the AI context.
- C4 Gallabox: Settings → Integrations; API key, secret and channel; list templates, pick one, send to the current contact.
- C5 Local speech-to-text: OpenAI-compatible `/v1/audio/transcriptions` (whisper.cpp server, Speaches) with utterance chunking.

### D — Admin and reports
- D1 Reports section: calls per day, cards per call, answer speed p50/p95, holding-line rate, top questions, review scores over time, per agent.
- D2 More admin tools: company profile, call policy (AI guesses, recording on/off and retention, auto pick-up default), audit log, devices, usage limits, data export.
- D3 Owner Batch 7 picks: off-server backup plan (needs a storage account), usage analytics, pricing page plan.
