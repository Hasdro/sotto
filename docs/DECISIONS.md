# Decisions

One entry per decision. Never edit an old entry; supersede it with a new one.

Format: `D-NNN — Title` · date · status · decision · why · rejected options.

---

## D-001 — Product name: Sotto
2026-10-13 · accepted
- **Decision:** The product is called Sotto (from *sotto voce*, "in a low voice").
- **Why:** Short, works in English and Arabic markets, describes the product (a private
  whisper to the agent), no conflicting sales product found in a first search.
- **Open:** Trademark and domain check before public launch.

## D-002 — The app is the phone
2026-10-13 · accepted
- **Decision:** Calls go through the app (WebRTC media server + SIP trunk), not the phone's own dialer.
- **Why:** iOS and Android do not let apps read normal call audio. Running the call
  through our media server gives a separate customer track on every platform (R4, R5).
- **Rejected:** Recording the phone's dialer calls (blocked), single-mic diarization only (unreliable).

## D-003 — Prompts and models are data, not code
2026-10-13 · accepted
- **Decision:** All prompts come from a versioned prompt registry; all model calls go
  through a model router with provider adapters, including OpenAI-compatible endpoints
  (Ollama, vLLM, LM Studio, Groq, OpenRouter).
- **Why:** R6 — per-company customization, open-source and local models, safe rollback.

## D-004 — Engineering workflow: addyosmani/agent-skills
2026-10-13 · accepted
- **Decision:** Use the agent-skills plugin (spec → plan → build → test → review → ship)
  as the single workflow framework, plus Anthropic's frontend-design plugin for visual design.
- **Why:** Covers spec, TDD, ADRs, security, observability and shipping with verification
  gates; MIT; widely used. One framework only, to keep context small and behaviour consistent.
- **Rejected:** Stacking Superpowers / Spec Kit / BMAD on top (overlapping instructions).

## D-005 — Client framework (OPEN → resolved by D-010)
- **Options:** Expo (React Native, TypeScript; recommended) vs Flutter (Dart).
- **Decide in:** Phase 1, before any app code.

## D-006 — Skills are vendored into the repo, not installed as plugins
2026-10-13 · accepted · refines D-004
- **Decision:** These are copied into the repo:
  - agent-skills v0.6.12 (`1be8e34`): skills, references, agents and commands;
  - the official `frontend-design` skill.

  They live under `.claude/`. Two commands are renamed to avoid clashing with built-ins: `/plan` → `/breakdown`, `/review` → `/quality-review`.

  Plugins stay enabled only for:
  - tools that are not instructions: `context7`, `playwright`, `typescript-lsp`, `pyright-lsp`;
  - `security-guidance`, which is a hook.
- **Why:**
  - The same skills load in cloud sessions (claude.ai/code) and locally, with no install step.
  - The version is pinned and reviewable in git.
- **Rejected:** Installing the agent-skills plugin from its marketplace. Cloud availability is uncertain, the version can drift, and having both plugin and vendored copies would load every skill twice.
- **Update procedure:** `.claude/skills/README.md`.

## D-007 — The tracker is the project's memory
2026-10-13 · accepted
- **Decision:**
  - `docs/TRACKER.md` is the single status file: Now, phase board, task board with IDs from `docs/phases/`, waiting on owner, and an append-only session log.
  - Every session starts with `/next-task` and ends with `/handoff`.
  - A SessionStart hook prints the tracker's Now section.
- **Why:** Work moves between cloud sessions and the local Mac. Conversation memory does not carry over; the repo does.
- **Rejected:**
  - Status only in PR descriptions, which are not visible offline or to a fresh agent.
  - `tasks/todo.md` as the master list. It is per-task and is overwritten by `/breakdown`.

## D-008 — Branch per phase; the owner merges
2026-10-13 · accepted
- **Decision:**
  - Each phase gets its own branch, `phase-N-<slug>`. A cloud-generated `claude/…` branch is acceptable if it is recorded in the tracker.
  - A draft PR is opened early. The owner merges to `main`.
  - A new session continues an unmerged phase branch instead of starting a second one.
- **Why:** Cloud and local sessions alternate. One branch per phase avoids diverging trackers. It also gives the owner one review point per phase.

## D-009 — Build on working assumptions while the Phase 0 interview is deferred
2026-10-18 · accepted (owner instruction: "skip the questions for now … go ahead with your own recommendation")
- **Decision:**
  - P0.1 (interview) and P0.3 (real playbook content) wait for the owner. `docs/BRIEF.md` holds working assumptions marked `ASSUMED:`; the items that must not be hard-wired are marked `OPEN:`.
  - The Phase 0 exit gate is waived for starting Phase 1. Phase 1 needs only the BRIEF numbers, used for the cost estimate.
  - Where a task needs an owner choice, Claude takes its own recommendation, records it as a decision, and lists it under *Waiting on owner* for confirmation.
  - This session's cloud branch, `claude/friendly-gates-fbhqdv`, carries both the Phase 0 drafts and Phase 1 (refines D-008). The owner reviews them as one PR.
- **Why:** The owner wants progress without blocking on the interview. Phase 1 (skeleton, CI, boundaries) does not depend on business facts. Every assumption sits behind a setting, the model router or the prompt registry (D-003), so the answers can change it later without a rewrite.
- **Risk:** If a wrong assumption reaches code, rework follows. To limit that, assumptions only reach `seed/` data and settings, never logic.
- **Rejected:** Waiting for the interview, which stalls all work. Inventing playbook content, which would tune the engine on guesses (see the phase-0 pitfalls).

## D-010 — Client framework: Expo (resolves D-005)
2026-10-18 · accepted under D-009 (Claude's recommendation; the owner may override before Phase 3)
- **Decision:** `apps/app` is an Expo app (React Native + TypeScript, expo-router) for iOS, Android and web. Desktop starts as the installable web build, with Tauri later.
- **Comparison for this project:**

| Criterion | Expo (React Native + TS) | Flutter (Dart) |
|---|---|---|
| LiveKit SDK | `@livekit/react-native` with the official Expo config plugin (`@livekit/react-native-expo-plugin`). Needs a dev build, not Expo Go. Web uses `livekit-client` directly. | `livekit_client` covers Android, iOS, web, macOS, Windows and Linux in one package. |
| CallKit / ConnectionService | `react-native-callkeep` (community library) plus the LiveKit audio session APIs | Community packages (`flutter_callkit_incoming`); no official LiveKit guidance |
| Web and desktop | react-native-web gives a real DOM, a PWA and a Tauri shell later. It shares the TS card protocol and Supabase client with the web admin. | Web renders to canvas, which is weaker for admin tables, text selection and accessibility. Desktop builds are native. |
| Claude's strength | TypeScript and React are the strongest. Design tools (frontend-design, Playwright screenshots) target the DOM. | Good, but less training data and no DOM screenshots for the design loop |
| Hiring | The React/TS pool is the largest. | Smaller |
| RTL | `I18nManager` on native and `dir` on web. Both are mature, with a reload needed when switching direction. | Built-in `Directionality`, excellent |
| Shared code with the worker | The card protocol is one zod schema, with JSON Schema generated for Python. | It would need a separate Dart codegen. |

- **Why:** Expo wins on web/admin quality, shared TypeScript types, Claude's productivity and hiring. Flutter's advantage, native desktop, is not needed before Phase 8.
- **Sources (checked 2026-10-18):**
  - npm: `expo@58.0.14`, `@livekit/react-native@3.1.0`, `@livekit/react-native-expo-plugin@1.1.0`;
  - https://github.com/livekit/client-sdk-react-native-expo-plugin (install steps, iOS and Android options);
  - https://github.com/livekit/client-sdk-flutter (platforms).
- **Rejected:** Flutter, for the reasons above.

## D-011 — TypeScript lint and format: Biome
2026-10-18 · accepted under D-009 (settles the open choice in ENGINEERING §2)
- **Decision:** Biome (`@biomejs/biome`) is the single TypeScript linter and formatter, configured in the root `biome.json`. The worker uses ruff.
- **Why:**
  - One fast tool keeps the PostToolUse format hook and the Stop hook under the 20 s budget (P1.4).
  - It needs one config instead of the ESLint + Prettier plugin stack.
- **Trade-off:** Biome does not run every ESLint plugin, so Expo's own ESLint config is not used. Biome's React hooks rules are on.
- **Rejected:** ESLint + Prettier, which is slower and needs two configs.

## D-012 — The worker uses a per-call JWT, not the service role
2026-10-18 · accepted under D-009 · supersedes the "service role … in worker" clause of ENGINEERING §10
- **Decision:**
  - The `livekit-token` edge function mints a per-call worker JWT: role `worker`, claims `company_id` and `call_id`, TTL = maximum call length. It passes the token in the dispatch.
  - The worker uses only this token for Supabase, so RLS policies apply to every worker query.
  - The pgTAP isolation matrix includes the `worker` role (P5.2).
- **Why:** With the service role, the worker bypasses RLS. Then a missing `company_id` filter (for example in a playbook lookup) would leak another company's data, and the isolation tests would never catch it (R3). The architecture review found this, ARCHITECTURE §2–§3.
- **Rejected:**
  - Service role plus careful filters, which is untestable by RLS tests.
  - `SECURITY DEFINER` functions for every worker read, which means more surface to test and keep in sync.

## D-013 — Autonomous overnight run; a local demo before live calls
2026-10-18 · accepted (owner: "keep running without waiting for my response to approve the phases … when you need my decision go ahead with your recommendation")
- **Decision:**
  - Phase gates that need owner approval are passed provisionally. The owner reviews everything together on return.
  - All work stays on the cloud branch `claude/friendly-gates-fbhqdv` (PR #1), because this session may push only there.
  - The first testable deliverable is a **local demo** that runs on the Mac with `pnpm demo`:
    - the real worker pipeline (Phase 2) serves a dev-only WebSocket bridge on localhost;
    - the Expo web app (Phase 3 in-call screen) connects to it;
    - the customer side is typed or scripted, which stands in for STT and telephony.
  - With `ANTHROPIC_API_KEY` set in `.env`, suggestions come from the real model; without it, from fakes.
  - Live phone calls (Phase 4) wait for accounts: LiveKit Cloud, a SIP trunk, Apple and Google developer accounts. The rule "ask before creating accounts or spending money" still holds.
- **Why:** The owner wants something to try on the Mac after a few hours. Real calls need accounts that only the owner can create. The demo exercises everything except telephony, with the same card protocol and pipeline.
- **Guard rails:**
  - The bridge binds to 127.0.0.1 only. It is dev-only and never part of a production build.
  - Its message schema lives in `packages/shared` like the card protocol.
  - Demo company content is fictional and lives in `seed/demo/`, never in `playbook/` (no invented content for the owner's real playbook).

## D-014 — Visual direction "Prompter's box" (P3.1)
2026-10-18 · accepted under D-013 (Claude's choice; the owner reviews the screenshots in `docs/evidence/p3/` and `docs/evidence/demo/`)
- **Decision:**
  - Quiet, cool surfaces with an ink-teal brand colour. The suggestion card is loud: one hue per card type, plus an 8 px voice bar on the side where reading starts.
  - No shadows or gradients, and nothing moves on the read path.
  - Typeface: Readex Pro (Latin + Arabic, 3 weights). Hero sentence 28 px on phones, 36 px from 900 px wide.
  - One breakpoint at 900 px: bottom tabs and a thumb-reach composer below it; sidebar and transcript pane above it.
  - Arabic uses Western digits.
  - Details and the rejected second direction are in `docs/DESIGN.md`.
- **Why:** The card must be readable in one glance mid-conversation (ENGINEERING §11, RESEARCH §6). A calm shell keeps attention on the card.
- **New dependencies:** `@expo-google-fonts/readex-pro`, `expo-font` (DESIGN.md explains why).

## D-015 — Edge-function logic is pure and unit-tested (P4.2)
2026-10-18 · accepted under D-013
- **Decision:**
  - `supabase/functions` is a pnpm workspace package (`@sotto/functions`). Each function's decisions live in a pure module (for example `livekit-token/policy.ts`) with vitest tests.
  - The Deno entry point only loads rows (caller JWT, so RLS applies), calls the policy, and talks to providers through `_shared/adapters/`.
- **Why:** Cloud sessions have no Deno or Supabase runtime. Pure policies keep the security decisions tested in CI: membership, plan or trial, device revocation, destination allowlist, rate limit and least-privilege grants.

## D-016 — No Claude models; free OpenAI-compatible providers by default, keys bound to their host
2026-10-19 · accepted (owner: "I won't use Claude model so keep the llm vendor open … I'll start using free AI providers")
- **Decision:**
  - `seed/models/default.yaml` routes every LLM stage to free OpenAI-compatible providers. Groq (open gpt-oss models) is the primary for `trigger`, `suggest` and `summary`; Google Gemini, through its OpenAI endpoint, is the R2 backup and the judge. Nothing needs an Anthropic key. The Anthropic and OpenAI adapters stay, so any company can still choose them (R6).
  - A route names its platform key with `api_key_env`. `adapters/factory.py` sends each platform key only to its provider's host over https (`COMPATIBLE_KEY_HOSTS`). Rows from the database can't set `api_key_env`, and a route without one gets no secret.
  - This closes older gaps found in a security review. `OPENAI_COMPATIBLE_API_KEY` used to go to any `openai_compatible` base URL, including one a company admin chose; it is no longer read. A company row with provider `openai` and its own base URL used to receive `OPENAI_API_KEY`.
  - The `openai` and `anthropic` adapters now refuse any base URL other than their official host. Company rows (`model_routes`) may not use them until per-company secrets exist (Phase 6), because those adapters run on the platform's key.
  - The router caches adapters and circuits per key name too, so a keyless company copy of a platform route can never share its adapter.
- **Why:**
  - The owner doesn't use Claude and wants to start free.
  - Groq has the fastest free first token, which matters most for R1. Gemini is a different company, so one outage can't take out both (R2).
- **Risks:**
  - Free tiers have rate limits (about 30 requests a minute on Groq) and may train on inputs (the Gemini free tier). They are for development and test calls only. Before real customer calls, switch to paid no-training tiers; that is a settings change.
  - Model IDs change. P2.3 checks them on the golden set, and a renamed model shows up as holding lines, never as a crash.
- **Rejected:**
  - OpenRouter free models as the primary: a 50-requests-a-day cap.
  - Cerebras: its permanent free tier ended in mid-2026.
  - A local model as the primary: laptop latency misses R1 (P2.9 measures it).


## D-017 — Owner approves the decisions made on his behalf
2026-10-19 · accepted (owner, on the decisions page: https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6, db `answers/owner` v23; copied in `docs/OWNER-ANSWERS.md`)
- **Decision:**
  - D-009, D-010, D-011, D-012, D-013, D-014 and D-015 are **owner-approved**. They were accepted provisionally under D-009 or D-013; they are now final.
  - `docs/ARCHITECTURE.md` is **owner-approved** as the Phase 1 architecture (closes P1.2).
  - D-016 is confirmed as the owner's own choice: Groq is the primary LLM and Google Gemini Flash is the backup (R2). Both are free tiers.
- **Applies with these owner answers** (details in `docs/BRIEF.md`):
  - Keys are handed over in `.env` on the Mac only, never as cloud-environment secrets. Live-provider tests (P2.3 and later) therefore run in local sessions; cloud sessions stay on fake models.
  - The budget while building is $0: free tiers only. The test phone line still needs an explicit ask.
- **Why:** The owner submitted the page on 2026-10-19 with every recommendation kept on these items.
- **Old entries are not edited** (the rule above). Read this entry with D-009 to D-016.

## D-018 — English only for calls and cards; the UI keeps Arabic RTL
2026-10-19 · accepted (owner: languages "Mostly English", note *"Consider it only English"*; card language "Always English")
- **Decision:**
  - Customer speech is **English**. STT is chosen and benchmarked for English only. There is no Gulf Arabic or mid-sentence code-switching requirement.
  - Cards are **always English**. The platform default for `card_language` becomes `en` (it was `auto`, which meant "the customer's language"). The setting stays per company, so a company can still choose otherwise later without a code change.
  - The holding line and the "not in playbook" label keep their Arabic text in seed data, but they are not used while cards are English.
  - **The UI keeps Arabic RTL.** R5 requires right-to-left support. The owner's answer is about call and card language, not the interface, and changing a requirement needs the owner. R5 stays as written until the owner explicitly changes it.
  - The demo company (`seed/demo/`, fictional) keeps its Arabic scenario as an RTL showcase; it is not product data.
- **Effects:**
  - BRIEF: languages, card language and the numbers table (language split) are updated.
  - P2.3: the STT pick-list targets English real-time streaming.
  - The playbook lookup's Arabic normalisation stays; it costs nothing and supports a future Arabic company.
- **Rejected:**
  - Removing Arabic from the UI now: that is an R5 change the owner did not ask for.
  - Removing the `auto` option: it is a per-company setting (R6), so it costs nothing to keep.

## D-019 — The owner chooses vendors; keys come from the owner; an in-app keys panel
2026-10-20 · accepted (owner: "regarding the model vendors, keep it option where I can select, you just take keys from me … in the final result I want an admin panel to be able to add these keys with help me link to them")
- **Decision:**
  - Vendor choice is the owner's (or a company admin's) for every stage, including speech-to-text. Claude recommends but never locks one in. Every vendor in `docs/PROVIDER-KEYS.md` sits behind the same adapter interface, so choosing one is a setting.
  - **STT:** P2.3 builds real-time adapters for all four listed vendors (Deepgram, AssemblyAI, Speechmatics, ElevenLabs), not just two. The owner picks the primary and backup by setting, then adds the keys.
  - Keys come only from the owner:
    - today, as `.env` on the Mac (D-017);
    - in the final product, through the **Keys & providers** admin panel (P6.7, added to R6). The panel has a "Get a key" link and how-to for every vendor, a connection test, and write-only encrypted storage.
- **Why:** The owner wants to stay free to switch vendors and to manage keys himself without editing files.
- **Effects:**
  - R6 gains the panel requirement and an acceptance test.
  - Phase 6 gains P6.7.
  - `docs/PROVIDER-KEYS.md` is the source for the panel's provider catalogue.
  - D-016's host binding moves from code into that catalogue in P6.7.
- **Later:** placement moved by D-038, then to the owner console by D-059.

## D-020 — A hosted Sotto server for the demo, with the keys panel and a spoken customer track
2026-10-20 (night) · accepted by Claude under the owner's standing instruction for this run ("even if you need my decision and it is something reversible go ahead with your recommendation"); owner reviews in the morning
- **Context:** The owner wants a demo that works and a backend hosted on his own server (`us3`), plus the Keys & providers panel (D-019). The D-013 bridge was localhost-only by design and used a WebSocket-only server that cannot take request bodies.
- **Decision:**
  - The demo bridge becomes **the Sotto server** (`apps/agent-worker/sotto_worker/server/`), on **Starlette + uvicorn**. It serves the web app, runs calls over `/ws` (typed, scripted, or **spoken** customer audio from the browser microphone → real-time STT → the real pipeline), and the admin API for the keys panel and call history.
  - **Two modes.** Local (`pnpm demo`): localhost only, no access code, data in `.sotto-data/` (git-ignored). Hosted (`deploy/`): refuses to start without `SOTTO_ACCESS_CODE`, `SOTTO_SECRET_KEY` and `SOTTO_PUBLIC_ORIGIN`. Behind Caddy (automatic HTTPS), with a signed HttpOnly, Secure, SameSite=Strict session cookie, an origin check on sockets and state changes, and login rate limiting.
  - **Keys:** write-only. Each key is encrypted with AES-256-GCM, with the key name as associated data. The master secret is `SOTTO_SECRET_KEY`, kept in the server's env file and never in the DB or git. Storage is SQLite (`SOTTO_DATA_DIR`). Keys are never returned by any API. Each key is only sent to its own vendor host (D-016). Panel keys take precedence over env keys. This **extends D-017**: keys may now also live encrypted on the owner's server, entered by the owner in the panel.
  - **Vendor per stage:** the panel picks a vendor and a model per stage from `seed/models/providers.yaml`. The stage's deadlines and limits stay from the seed. The next call uses the change (R6), with no deploy.
  - **End of turn on a spoken track is ours (T-007):** an energy VAD ends the turn after 300 ms of quiet, `finalize()` forces the vendor's final, and t0 (R1) is the end of speech. The primary STT falls back to the backup on error (R2).
  - **Sample data only.** The hosted demo uses the fictional demo company and its sample playbook. No real customer calls go through it until the owner answers the free-tier data question (BRIEF OPEN).
- **Supersedes:** D-013's "never deploy the bridge", but only for this hardened server. The rest of D-013 stands.
- **Not decided here:** production auth stays Supabase (Phase 5), and live telephony stays LiveKit (Phase 4). The SQLite store is replaced by Supabase tables in Phases 5–6; the API shapes are meant to survive.
- **Rejected:**
  - Keeping the websockets-only server: it cannot take request bodies for the admin API.
  - A Node backend: the pipeline is Python.
  - Copying the Mac `.env` to the server: that breaks D-017's spirit; the owner enters keys in the panel instead.
- **Reversible:** delete `deploy/` and run local only. The server code is also the local demo.

## D-021 — Default speech-to-text: AssemblyAI main, Speechmatics backup (was Deepgram + AssemblyAI)
2026-10-20 · accepted by Claude under the owner's overnight instruction (reversible in Admin → Keys & providers; the owner reviews)
- **Evidence:** `pnpm spoken:live` on the full spoken path (browser-style 20 ms PCM → VAD 300 ms → forced final → pipeline), live keys, same five sentences:

  | Vendor | Transcript after end of speech | Whole sentences |
  |---|---|---|
  | AssemblyAI | ~500–535 ms | 5/5 |
  | Speechmatics | ~520–555 ms | 5/5 |
  | Deepgram | ~715–970 ms | 4/5 (answers Finalize with the sentence split in two; the tail can arrive after the turn) |

- **Decision:** the seed default becomes AssemblyAI (main) and Speechmatics (backup). They are different companies (R2), the fastest two measured, and AssemblyAI has the cheapest paid rate ($0.15/h). Deepgram stays fully supported and selectable.
- **Caveats:**
  - Speechmatics' free plan allows 2 concurrent sessions, which is fine as a backup for a demo.
  - The audio is synthetic, so P2.8 golden calls must confirm these results on real voices before the pilot.
- **Supersedes:** the STT-OPTIONS recommendation of Deepgram as primary (2026-10-20).

## D-022 — Client apps run the call; the us3 server only manages accounts and subscriptions
2026-10-20 · owner direction (chat, 2026-10-20 10:00). Sub-choices were made by Claude as recommendations, and the owner reviews them in the Project Hub's Decisions tab.

**Owner direction:**
- All API calls and network-heavy work (speech-to-text streams, model calls) run **on the client**: the phone, desktop, web or Chrome extension app.
- The server on us3 does as little as possible and holds as little data as possible. It handles:
  - sign up and log in;
  - companies, plans, trials, seats and devices;
  - company configuration;
  - the usage numbers that clients report;
  - an owner-only admin dashboard with client stats and management tools.
- Log in and sign up happen inside the apps.

**Design (Claude, reversible):**
- **Engine:** `packages/engine` (TypeScript) is a port of the worker's call pipeline. It covers the playbook lookup, the prompt registry render, the model router with the 0.7 s backup race and the holding line, the OpenAI-compatible, Anthropic and Gemini streaming adapters, and the AssemblyAI and Speechmatics streaming STT. The engine runs in every client and speaks the same demo protocol as `/ws`, so the call screen does not change.
- **Python worker:** stays. It remains the reference implementation for replays, benchmarks and the local demo, and Phase 4 LiveKit telephony may still need it.
- **Management server:** `sotto_worker.cloud` (Starlette + SQLite), run by systemd behind Caddy on us3. There is no Docker: 1 vCPU and 1 GB RAM are too small for it.
  - **Data:** one SQLite file, backed up nightly. Every company-scoped table has `company_id`. Isolation is enforced in the single data-access module and covered by API-level isolation tests: company A cannot read or change company B rows through any route. This replaces RLS for this server; the Supabase/RLS migrations stay in the repo, unused, until a decision supersedes them.
  - **Auth:**
    - Passwords are hashed with scrypt.
    - Opaque bearer tokens: 32 random bytes, stored as SHA-256, one per device, revocable.
    - Login and signup are rate-limited per client and globally.
    - Apps send `Authorization: Bearer`, with no cookies, so cross-origin clients (desktop, extension, mobile) need no CSRF handling.
    - The owner dashboard uses a separate SameSite=Strict cookie and is served from the same origin only.
  - **Provider keys:**
    - Recommendation: the company admin enters them once in the app.
    - The server stores them AES-GCM encrypted (as in D-020).
    - The server hands them only to signed-in users of that company, and only while the plan allows calls.
    - This supersedes the "no secrets in client apps" reading for runtime-delivered, per-company keys. No key is ever bundled into a build.
    - Vendor short-lived tokens (AssemblyAI) replace raw keys where available.
  - **Plans:**
    - A trial lasts 14 days with 3 seats and 300 minutes, per the owner's earlier answers.
    - States: trial, active, suspended, expired. When expired or suspended, sign-in still works and calls are blocked.
    - Billing is manual for now: the owner marks a company paid in the dashboard.
- **Desktop:** Electron wraps the web build (Windows, Mac and Linux from one Mac). The Chrome extension is an MV3 side panel that wraps the same web build.
- **Supersedes:**
  - D-020's hosted call path for production use. Server-side `/ws` calls remain for `pnpm demo` only.
  - The Supabase plan in Phase 5, for auth and tenancy on this server.
- **Amendment (2026-10-20, security review T-017):**
  - Devices receive only the model keys that the company's current routes use. They never receive speech keys; those go out as short-lived tokens only. Each delivery is written to the audit log, and key tests run on the server.
  - The owner console moved to its own origin, `https://owner.<domain>` (`SOTTO_OWNER_ORIGIN`). Its pages and the app never share an origin.
  - Usage minutes are capped by the server's own record of when each call started (`/api/v1/calls/start`).
- **Later:** provider keys amended by D-061 (shared platform keys; per-company keys are the D-059 BYO case).

## D-023 — Phones open navigation from the left: a menu button and a drawer (was bottom tabs)
2026-10-20 · owner feedback after installing the Android APK ("the dashboard (navigation menu) must be on the left"). Supersedes the narrow-screen part of DESIGN.md §6 (bottom tabs).

**Decision:**
- **Below the wide breakpoint (900 px):** a top bar with a menu button (start side) and the wordmark. The button opens a drawer from the start edge with the same contents as the desktop sidebar: Call, History, Playbook, Inbox (open-question count), Admin, Account (when signed in to a server), the demo role switch, and the user and company footer. The bottom tab bar is removed.
- **At or above the breakpoint:** the 248 px sidebar is unchanged.
- **Right-to-left:** the drawer opens from the right in Arabic, and the menu button sits on the right.
- **Behaviour:** the drawer closes on an item tap, a scrim tap, the close button, Escape (web) and Android back. On web, focus stays inside the open drawer. Open count also shows as a dot on the menu button, so an open question is visible without opening the menu.
- **Motion:** the drawer slides in over `motion.base` (200 ms) because it answers a tap (DESIGN.md §7); with "reduce motion" on, it appears without sliding.
- **No new dependency:** built with React Native `Modal` + `Animated` and `packages/ui` tokens. A scrim colour token (`scrim`) is added to `packages/ui`.

**Why:** the owner asked for it; it also frees the bottom edge on phones, removes the role-switch bar from the top of every page, and gives phone and desktop the same navigation model.

**Trade-off:** one extra tap to change area on a phone. The call screen, where speed matters, needs no navigation during a call.

## D-024 — Real calls on the desktop: hear the computer's sound; real accounts carry no demo data
2026-10-20 · owner: "keep the focus on the Mac version … ready for real world with Zoom, Google Meet and Yeastar calls; remove the fake customer data call, we are over the demo phase".

**Decision:**
- **Customer audio on the desktop = the computer's sound output** (R4 "desktop with another softphone", exact). The Electron app answers `getDisplayMedia` with `audio: "loopback"` (Apple's Core Audio tap on macOS 14.2+, `NSAudioCaptureUsageDescription` in Info.plist) and its own window as the required picture, so no screen-recording permission is needed; the page drops the video track at once. Covers Zoom, Google Meet, Teams and the Yeastar Linkus / 3CX desktop softphones with no change to the phone system.
- **The microphone stays as the second source** for in-person and speakerphone calls, with the R4 "Approximate" badge (no voice-sample matching yet).
- **Real accounts see a "Start listening" panel**, choose the source, and get a listening bar (pause/resume, words heard so far). No scenario picker, no typed lines. The `?mock=1` stream only exists in development builds.
- **The cloud bundle carries no demo data:** no sample playbook, no scripted scenarios, and neutral company defaults (`seed/company/default.yaml`) instead of the Palm Grove realty tone and goal. Only the engine test fixture asks for samples (`build_bundle(samples=True)`).

**Why:** the owner's real calls run in Zoom, Meet and Yeastar on the Mac; the speakers carry only the other side, so capture is exact without telephony integration (Phase 4 stays the path for a dial pad and real numbers inside the app).

**Trade-offs:** macOS asks once for "system audio recording" (must be allowed by the user; launched from a terminal, macOS checks the terminal instead). All system sound is heard, including notifications, during a call. The agent's own track is not captured on the desktop yet.
- **Later:** amended by D-073 (practice calls in real accounts, one neutral script).

## D-025 — The main AI gets 1150 ms before the backup is raced (owner, 21 Oct 2026)

**Context.** R2 says "no first token within 700 ms → backup". The seed's `first_token_ms` is measured from the end of the customer's speech (t0), but the request only leaves ~0.6 s after t0 (STT final + turn decision). So the main model had ~0.1 s of its own, and the live replay started the backup on 2–3 of 11 turns without it ever winning — wasted requests on free quotas (review brief B1.2, T-029).

**Decision.** The owner chose "raise" on the hub: `suggest.first_token_ms` = 1150 ms from t0 (≈ 550 ms of the model's own time). R2's "700 ms" is read as the model's own time. The holding line at t0 + 1400 ms and R1's 1500 ms p95 are unchanged.

**Consequences.** Fewer duplicate requests; a slow main model shows the holding line rather than a backup card slightly more often. Replay must stay ≤ 1500 ms p95.

## D-026 — Product name: AGN Sales Shield (supersedes D-001)
2026-11-12 · owner (phase 9 brief)
- **Decision:** The user-facing product is **AGN Sales Shield**, short form **Sales Shield**. No tagline until the owner approves one. The logo is a standalone symbol (no letters), chosen by the owner from three vector directions (T-048).
- **Technical identifiers stay:** `com.sotto.app`, `app.sotto.desktop`, repo Hasdro/sotto, the `app://sotto` origin and its localStorage keys, the `sotto-desktop` user-data folder, package names `@sotto/*`, the `sotto_worker` module, env vars `SOTTO_*`.
- **Why:** the owner's brand; renaming identifiers would break installs, sessions and stored data.
- **Supersedes:** D-001 (name Sotto).

## D-027 — Desktop-only for now (R5 superseded)
2026-11-12 · owner (phase 9 brief)
- **Decision:** Releases are macOS and Windows desktop only. iPhone, Android, the Chrome extension and Linux are on hold: their code stays in the repo and keeps passing its tests, but gets no release work. R5 is superseded by R5a (see REQUIREMENTS).
- **Why:** focus; the owner's real calls are on desktops.
- **Consequence:** UI checks still cover 390 px (small windows, the mini window) and 1280 px.

## D-028 — Feature flags: one catalog, five states, three layers
2026-11-12 · owner (phase 9 brief), design by Claude
- **Decision:** A central catalog (one module shared by server and app) lists every capability with its role audience, dependencies and the connection it needs. The server computes each user's effective state: `available`, `off_by_platform`, `off_by_org`, `needs_connection`, `no_permission`, evaluated in that order. Layers: platform entitlement + global kill switch (owner console), org toggle (Admin → Features, default on), role. No per-user toggle.
- **UI:** unavailable workflow features are greyed with a one-line reason and an action; role-irrelevant features are hidden. Admins see the whole catalog.
- **Enforcement:** see D-036.
- **Rejected:** per-user toggles (clutter, support load); hiding instead of greying (agents can't tell why a feature is missing).

## D-029 — Persistent login: 90-day sliding refresh, OS secure storage
2026-11-12 · owner (phase 9 brief), design by Claude
- **Decision:** Agent-app sessions become an access token (short-lived) plus a rotating refresh token with a 90-day sliding inactivity window. Refresh-token reuse revokes the whole device session (theft signal). Tokens live in OS secure storage through Electron `safeStorage` (Keychain / Credential Manager); web builds keep `localStorage` as a fallback. The client never signs out on network errors or 5xx; it signs out only on logout, password change, admin revoke, device removal, or 90 days unused. The existing 30-day token is exchanged once for the new pair on first start of 0.3.0 (no forced re-login). The owner console keeps its own shorter cookie session.
- **Supersedes:** the auth token lifetime and "any 401 deletes the token" behaviour under D-022.
- **Rejected:** long-lived single tokens (no rotation, no theft signal).
- **Amendment (2026-11-12, flags-auth fixes):** (1) A lost refresh answer is not theft: the refresh token the current pair replaced may renew again for as long as that pair has never been used (no request with its access token, no refresh with its refresh token); only after the successor is used does the old token count as reuse and revoke the device session. No time window. The same holds for `/auth/migrate`: the 0.2.0 token gets a fresh pair until the first pair is used. (2) Local data on sign-out: this device's call history and recordings (kept per account) are deleted only on a manual sign-out or when the server answers `device_removed` (the person or an admin removed the device). A revoke, a reused token, a password change elsewhere or 90 days unused end the session but keep that data for the next sign-in of the same account. (3) A desktop that cannot encrypt (no safeStorage) never migrates a 0.2.0 token; it keeps using it until it ends, because a pair it cannot save would be lost at quit.

## D-030 — Version ladder and release channels
2026-11-12 · owner (phase 9 brief)
- **Decision:** 0.3.0 Foundation → 0.4.0 Pre-call → 0.5.0 Learning loop → 0.6.0 Post-call actions → 0.7.0 WhatsApp → 0.8.0 Release. Each version is tagged `vX.Y.0` on GitHub Releases (private archive) with the macOS DMGs and the Windows installer; the public landing page at `salesshield.agncompu.com` (us3, Caddy) hosts the downloads. Unsigned builds, no auto-update, no paid signing this round. Desktop and web share one version number (`apps/desktop/package.json` = `APP_VERSION`).
- **Rejected:** a public repo for downloads; auto-update before signing exists.

## D-031 — Zoho: per-user OAuth through the server; Meetings module; v1 permission matrix
2026-11-12 · owner (phase 9 brief), design by Claude
- **Decision:** Each agent connects their own Zoho account (server-based OAuth; the client secret and each user's refresh token stay on the server, AES-GCM encrypted like provider keys). All Zoho reads and writes go through the management server, which checks the flag state, the org permission matrix and the approval, writes the audit row, and makes writes idempotent. Data centre chosen at connect, remembered per org (US, EU, IN, AU, JP, CA, CN). v1 matrix: read Leads, Contacts, Accounts, Deals, Meetings, Notes; write Leads, Contacts, Meetings, and Notes on Deals. No Deal stage/amount or Account writes. The meeting record is the CRM Meetings module; its API name is verified against the owner's org with `GET /crm/v8/settings/modules` before coding, mapped if it differs; never silently create an Event.
- **Why server-side:** the OAuth client secret cannot ship in a client (D-022 "no key in a build"); approval, audit and idempotency must not depend on the client.
- **Amends D-022:** the server now proxies CRM calls. It still never carries call audio or live suggestions.
- **Later:** data centre detection D-046; the "no Deal writes" line is amended by D-069 for allow-listed AGN fields (Stage/Amount still blocked).

## D-032 — Email: org-approved senders, formats with static blocks
2026-11-12 · owner (phase 9 brief)
- **Decision:** Senders are approved per org (Hostinger SMTP now; Resend optional; Gmail/Microsoft OAuth later); the agent picks a sender per email. Admin → Email holds formats (name, action type, example body, tone, length, static blocks with placeholders); defaults: follow-up and meeting confirmation. The model writes only the variable body; static blocks (name, title, company, signature) are merged verbatim afterwards; optional per-user signature override. Sending goes through the server after explicit confirmation, with an audit row.
- **Builds on:** the existing `mail.py` SMTP adapter (manager escalation email).

## D-033 — WhatsApp through Gallabox: template-first
2026-11-12 · owner (phase 9 brief)
- **Decision:** v1 sends approved templates only, from an org allow-list, after agent approval, through the server. The adapter exposes `window_status() -> open|closed|unknown`; free-form stays disabled until a reliable window signal is documented and verified on the owner's account; anything but an authoritative `open`, re-checked right before send, falls back to a template. The last 100 messages are read as transient call context and not stored; only the sent message, template and approval are logged. No bulk sends.
- **Why:** a ban on the owner's WhatsApp number would be far worse than a less flexible message.

## D-034 — Learned instructions: per org, minimised packet, playbook wins
2026-11-12 · owner (phase 9 brief)
- **Decision:** Only AI advice cards are rateable. After a call with ≥ 3 ratings, a minimised packet (summary, prep brief, rated cards with the customer turn before and after, rating and reason; never the full transcript) goes to the learning prompt (prompt registry, model router). At most 8 instructions of ≤ 25 words, stored per org as a prompt-registry variable, versioned and revertible; auto-apply by default with a per-org "review before apply" switch. They never override the playbook or hard rules and never edit the playbook. New instructions apply from the next call. Replay after the prompt change.

## D-035 — Session orchestration: a cheap master and delegated workstreams
2026-11-12 · owner (phase 9 brief)
- **Decision:** The master session plans, decomposes, reviews, merges and keeps the tracker true; it does not run long builds, full suites or large refactors. Subagents do research, focused implementation, test runs and reviews; child sessions (each with its own branch and worktree, at most 3 in parallel) do independent workstreams from prompts in `docs/prompts/`. No two sessions touch the same files; the master owns the merge order. Rules in CLAUDE.md § Session orchestration.

## D-036 — How flags are enforced when the client runs the call (D-022)
2026-11-12 · Claude (technical)
- **Context:** D-028 requires the server to reject every non-available action, but under D-022 live suggestions and call review run in the client.
- **Decision:** The server is the only place that computes flag state. (1) Every server route that serves a capability checks it and answers `403 {"error":"feature_unavailable","state":…,"feature":…}`: key and token delivery, recording upload, review sync, reports, settings writes, Zoho, email and Gallabox. (2) The session config the client fetches carries the effective feature map; the app greys from it and refreshes it on sign-in, on focus and every 10 minutes. (3) A client-only capability is effectively stopped because the server withholds what it needs (the model keys for its route, the upload, the integration call).
- **Accepted limit:** a modified client using its own keys can run client-only logic; it can never reach company data, integrations or the server's keys.

## D-037 — Zoho brief goes in through its own prompt; connect link is browser-bound
2026-11-13 · Claude (technical, zoho-slice)
- **Decision:** (1) The attached Zoho brief reaches the live model through a separate `crm_brief` prompt in the registry (`seed/prompts/crm_brief.md`), not a new variable in `suggest`, because 0.3.0 clients break when `suggest` gets an unknown variable. (2) The `/auth/zoho/start` link only completes in the browser that opened it (state bound to that browser), so a forwarded link cannot attach someone else's Zoho account.
- **Consequence:** older clients keep working without the brief; a user who starts the connect on one device must finish it there.

## D-038 — Model and prompt configuration lives in the web admin panel only
2026-11-13 · owner
- **Decision:** models, providers, keys, router and prompt studio are configured in the web admin panel (company admin) and owner console (platform). The desktop client hides those screens and only fetches the effective config. Supersedes the in-app placement of D-019's panel; its write-only key rules stay.
- **Later:** superseded by D-059 (owner console; company BYO only when AGN enables it).

## D-039 — SMTP and Gallabox credentials per org in Admin → Integrations
2026-11-13 · owner
- **Decision:** SMTP (host, port, user, password, from) and Gallabox (API key, secret, channel, template allow-list) are entered per org in Admin → Integrations, write-only and encrypted, with a platform fallback in the owner console (org wins), the same pattern as the Zoho client (D-037). Credentials are never collected in chat or stored in git.
- **Later:** the Zoho-client part is amended by D-064 (owner-console override).

## D-040 — Learned instructions go in the cacheable system part through their own prompt
2026-11-13 · Claude (technical, learning-admin)
- **Decision:** approved learned instructions reach the live model through a separate `learned_instructions` prompt appended to the cacheable system part (same pattern as D-037), from the next call only; the playbook wins on conflict. Older bundles skip the block, so 0.3.x clients keep working. Extraction uses `learned_extract` on a minimised packet (summary, brief, rated cards with the customer turn before and after), never the full transcript.

## D-041 — Muse-ai design system replaces the current visual style (owner, 14 Nov 2026)
2026-11-14 · owner (style choice) + Claude (adaptation, design-system session)
- **Context:** the owner wants every Sales Shield app and online panel to follow the reference style in `docs/design/reference/muse-ai/` ("Quiet Paper Glass").
- **Decision:** `docs/design/DESIGN-SYSTEM.md` replaces DESIGN.md's "Prompter's box" visuals (D-014, T-050 evolution). Near-white canvas, the reference gray ramp, one blue accent (`#005bbf`), pill controls, 22/6 bubbles, glass + float shadow on floating chrome only, 100–300 ms standard-ease motion; dark derived from the ramp. Fonts: Inter + IBM Plex Sans Arabic (replaces Readex Pro). The live hero card is an accent-filled bubble (warning red, holding neutral); compact cards and badges are neutral with the type hue only in small marks. `packages/ui/tokens.ts` stays the single source; `tokens.css` is generated from it for HTML pages.
- **Departures from the reference (requirements win):** 44 pt targets, outlined inputs (WCAG 1.4.11), focus rings, a red warning card, a dark theme, slightly taller line heights for Arabic (DESIGN-SYSTEM §10). Muse's mascot, fonts and copy are not reused.
- **Consequence:** the app and admin/HTML redesigns build on branch `phase9/design-system`; tests keep every contrast pair at AA.


---

Review backlog, November 2026 (`docs/reviews/backlog-2026-11.md`). D-042…D-058 are the master's technical decisions drafted there on 13 Nov and already cited in code as "draft D-0NN (backlog)"; they keep their numbers and are accepted as written. D-059…D-073 record the owner's answers to the 15 questions in that file's § Needs the owner ("all recommended", 14 Nov 2026), one entry per question (Q1 → D-059 … Q15 → D-073).

## D-042 — The live call carries no rating question, no timing line and no CRM form
2026-11-13 · Claude (technical, review backlog; UX-02, UX-11, UX-19) · accepted 2026-11-14
- **Decision:** the live hero card has no rating controls and no "On screen x s after…" line; the live rail has no CRM form. Ratings sit on collapsed cards, after the call and in History.
- **Unchanged:** R11 (only AI advice cards are rateable); R1 timing is still logged per card and shown in History detail and Reports.

## D-043 — No during-call side panel for Lead/Contact
2026-11-13 · Claude (technical, review backlog; UX-19, INT-11) · accepted 2026-11-14
- **Decision:** unknown callers get a dedupe search and a prefilled Lead before the call starts and in the after-call checklist. During the call there is one "Note for after the call" field.
- **Supersedes:** the phase 9 brief line "During the call, a side panel limited to lead creation and contact updates" (`docs/phases/phase-9-product-round.md`).

## D-044 — After-call checklist approval
2026-11-13 · Claude (technical, review backlog; UX-04) · accepted 2026-11-14
- **Decision:** nothing is pre-ticked. Each ticked item is its own approval, its own idempotent write and its own audit row; "Save n to Zoho" submits only the ticked items. R12 holds.

## D-045 — One follow-up card
2026-11-13 · Claude (technical, review backlog; UX-05) · accepted 2026-11-14
- **Decision:** the `followup` draft becomes the email body; WhatsApp is the second tab; there is one send path per channel.

## D-046 — Zoho data centre detected from the OAuth callback
2026-11-13 · Claude (technical, review backlog; ZC-02) · accepted 2026-11-14
- **Decision:** the server reads `location` / `accounts-server` from the OAuth callback and stores the data centre per user. A "Change" link keeps R10's "chosen data centre". Refines D-031's "chosen at connect".

## D-047 — Call-log Note
2026-11-13 · Claude (technical, review backlog; INT-01) · accepted 2026-11-14
- **Decision:** one structured Note per call; parent order Deal → Contact → Lead; no transcript text, only the review's structured summary; idempotency key per call and kind; audited.

## D-048 — Stage and source guidance is seed data in `crm_brief`
2026-11-13 · Claude (technical, review backlog; INT-03, INT-16) · accepted 2026-11-14
- **Decision:** stage guidance, `Lead_Source` and campaign name reach the brief through `seed/prompts/crm_brief.md`, at most 150 tokens, labelled "as of prep". Replay p95 ≤ 1500 ms is the gate.

## D-049 — Recording is an org policy
2026-11-13 · Claude (technical, review backlog; ZC A4) · accepted 2026-11-14
- **Decision:** the admin sets `record_calls` once for the company; the per-agent toggle becomes a read-only line.

## D-050 — Agents never see model names, admin stats, the Inbox or the playbook editor
2026-11-13 · Claude (technical, review backlog; UX-25, ZC app map) · accepted 2026-11-14
- **Decision:** in line with the R3 role table. A page outside the role's areas says why, whatever the URL.

## D-051 — Desktop admin in four groups; Keys & providers leaves the desktop
2026-11-13 · Claude (technical, review backlog; UX-29) · accepted 2026-11-14
- **Decision:** the admin area has four groups: People, Connections, AI, Company. Keys & providers is not on the desktop app (applies D-038; D-059 then moves it to the owner console).

## D-052 — SMTP presets from the admin's domain
2026-11-13 · Claude (technical, review backlog; ZC-03) · accepted 2026-11-14
- **Decision:** presets (Google, Microsoft 365, Hostinger, Zoho Mail, Other) are picked from a known-domain map plus an MX lookup with `dnspython` (small, pure-Python, judged not major). If it cannot be added, the static map plus "Other" ships alone.
- **Related:** D-065 (customer SMTP is the default sender).

## D-053 — Password reset by email
2026-11-13 · Claude (technical, review backlog; UX-39) · accepted 2026-11-14
- **Decision:** emailed single-use token, 30 minutes, rate-limited per address and per client, audited, no account enumeration; using it revokes the user's other refresh tokens (D-029).

## D-054 — Desktop deep link scheme `agn-sales-shield://`
2026-11-13 · Claude (technical, review backlog; UX-35) · accepted 2026-11-14
- **Decision:** used only for "return to the app" (for example after the Zoho connect); it never carries a token.

## D-055 — Follow-up steps re-ask the agent
2026-11-13 · Claude (technical, review backlog; INT-08) · accepted 2026-11-14
- **Decision:** an in-process scheduler on the management server (no new dependency) creates a desktop notification per step; nothing is sent without the agent's tap (R12, D-033).

## D-056 — Blueprint is read-only
2026-11-13 · Claude (technical, review backlog; INT-04) · accepted 2026-11-14
- **Decision:** the rail shows a Blueprint checklist ("to move to X you still need …") and may suggest a Note; transitions are never executed (D-031, R12).

## D-057 — Config health is computed by the server
2026-11-13 · Claude (technical, review backlog; ZC-14) · accepted 2026-11-14
- **Decision:** one status per org (`ok` / `needs_attention` + reason) shipped in the session config with the feature map (D-036); the apps only render it with a fix link.

## D-058 — Review-backlog file ownership
2026-11-13 · Claude (technical, review backlog) · accepted 2026-11-14
- **Decision:** within a wave, each hub file has one owner: `apps/app/lib/i18n.ts`, `cloud/app.py`, `cloud/store.py`, `cloud/features.json`, `cloud/bundle.py`, `apps/app/components/AppShell.tsx`, `apps/app/app/admin/_layout.tsx`, `apps/desktop/**`. New strings go in feature-local `strings.ts` files (pattern of `features/email/strings.ts`). Any other stream that needs a line in a hub writes the exact line in its report; the master adds it at merge. Builds on D-035 (no two sessions touch the same files).

## D-059 — Providers, keys, model routing and the prompt studio move to the owner console (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q1 → 1a)
- **Decision:** the Keys & providers panel, the model router settings and the prompt studio are run by AGN in the owner console (DD-1, DD-2). A company admin sees and edits them only when AGN enables "bring your own" (BYO) for that company (platform entitlement, default off). Company overrides of prompts are owner-only.
- **Amends:** R6 "Keys & providers panel" and "Prompt studio" audience (REQUIREMENTS). **Supersedes:** D-038 (web admin as the place for model and prompt configuration); D-019's write-only key rules stay.
- **Rejected:** keys and models only (1b); today's split (1c).

## D-060 — AGN pays vendor usage, bundled in the plan minutes (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q2 → 2a)
- **Decision:** AI and speech-to-text usage on AGN's platform keys is paid by AGN and included in the plan minutes (DD-3). Before pricing is set, AGN gets a cost-per-minute estimate from the live replay.
- **Open (owner):** running `pnpm replay:live` with real keys spends money; the owner starts it. Until then the estimate tool reports from the synthetic replay and the seed price table, marked "estimate".
- **Rejected:** metered overage (2b); customers bring their own keys as the default (2c; still possible per D-059 BYO).

## D-061 — Shared platform keys with per-tenant sub-keys, spend caps and alerts (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q3 → 3a)
- **Decision:** one set of AGN platform keys serves every company (ZC-12, B2). Where a vendor offers per-tenant sub-keys or short-lived tokens, the server hands out those instead of the raw key; keys rotate without a release; usage is metered per company with a spend cap and an 80 % alert.
- **Cap values come from the owner.** The setting ships with no default spend: an unset cap means metering and the 80 % alert are off for that company and the owner console marks it "Cap not set".
- **Amends:** D-022 "Provider keys" (per-company keys entered by the admin are now the BYO case of D-059).
- **Rejected:** one vendor account per company (3b); an AGN relay for all model traffic (3c, adds a hop against R1).

## D-062 — The agent track as context is a platform default, not a company setting (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q4 → 4a)
- **Decision:** the admin toggle "transcribe the agent track as context" is removed (DD-5). AGN sets it platform-wide; today's behaviour is unchanged. The agent track still never triggers a card (R4).
- **Amends:** R4 "(setting)" → "(platform default)".

## D-063 — AI-vendor consent step with placeholder legal text (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q5 → 5a)
- **Decision:** onboarding gets a "Who processes your calls" step (DD-4): sub-processor list, the admin's choice and timestamp audited, a "primary vendors only" switch. The text ships as "DRAFT — not legal text".
- **Open (owner):** the sub-processor list and the legal wording come from the owner or counsel before the release that shows the step to customers.

## D-064 — Zoho multi-DC on the existing client; per-org client becomes an owner override (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q6 → 6a)
- **Decision:** the owner enables multi-DC on the existing Zoho API client (Zoho API console). The server picks the client by the detected data centre (D-046). The per-org Zoho client form leaves Admin › Integrations and becomes an override in the owner console (ZC-01, DD-6).
- **Amends:** D-039's Zoho-client placement (the SMTP and Gallabox parts of D-039 stay in Admin › Integrations).
- **Open (owner):** the multi-DC switch in the Zoho API console is the owner's step.

## D-065 — Customer SMTP with presets is the default sender; AGN's Hostinger SMTP is the fallback (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q7 → 7a)
- **Decision:** companies send from their own SMTP, set up through presets (D-052); AGN's Hostinger SMTP stays the platform fallback (D-039). No paid transactional vendor is added.
- **Consistent with:** D-032 (Resend stays optional, not the default).

## D-066 — Playbook bootstrap from CRM, website and documents, after consent (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q8 → 8a)
- **Decision:** the playbook can be bootstrapped from Zoho, the company website and a pasted document (ZC-04), only after the consent step (D-063). Every generated entry lands as "needs review" and never answers on a call until a manager approves it. Prompts and models go through the registry and router.

## D-067 — Automatic model routing, weekly, under an owner-set monthly cap (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q9 → 9a)
- **Decision:** a benchmark-based routing job (ZC-05) runs weekly on the golden calls, stages a candidate, canaries it on AGN's demo org and rolls back on failure; R6's "only a model whose last benchmark meets R1" holds.
- **Cap value comes from the owner.** The monthly spend cap setting ships with no default: while it is unset the job does not run.
- **Depends on:** golden calls (P0.5). Until they exist the job is built and tested on the synthetic set and stays off.

## D-068 — Self-signup creates a trial company (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q10 → 10a)
- **Decision:** the Zoho Forms sign-up on the landing page creates a trial company and the first admin invite (ZC-10), rate-limited, and lists it in an owner sign-up queue where AGN can suspend or delete it.
- **Amends:** R3 ("Create companies" is no longer platform-owner-only).

## D-069 — One Zoho scope bundle; allow-listed AGN fields on Deals (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q11 → 11a)
- **Decision:** Tasks (INT-02), Blueprint definitions (INT-04, read-only per D-056), custom Deal fields (INT-06), Campaigns (INT-16) and the Notifications scope T-081 needs (INT-13) ship in one release with one reconnect per agent. INT-06 creates AGN-owned custom fields in the customer's Zoho org (score, chance band, top objection, last call date) and may write only those fields on Deals, each write approved (R12).
- **Amends:** D-031's v1 matrix "no Deal writes" for that allow-list only. Stage and Amount stay blocked by test (R12 unchanged).

## D-070 — WhatsApp meeting reminders need one tap each (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q12 → 12a)
- **Decision:** meeting reminders (INT-09, UTILITY template, org flag default off) are sent only after the agent taps once per reminder. No standing approval. R12 and D-033 unchanged.

## D-071 — Gallabox delivery/read status, status only (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q13 → 13a)
- **Decision:** an HMAC-verified Gallabox status webhook (INT-10) records sent/delivered/read/failed per sent message; no message text is stored (D-033).
- **Open (owner):** it works only if AGN's Gallabox plan includes webhooks (Essential/Advanced); the feature stays off until the owner confirms.

## D-072 — Zoho Analytics through a weekly CSV export only (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q14 → 14a)
- **Decision:** a weekly CSV export (scores, counts, categories, Zoho ids; no transcript) for Zoho Analytics (INT-12). No live push and no new vendor integration.

## D-073 — Practice calls in real accounts (owner, 14 Nov 2026)
2026-11-14 · owner (backlog Q15 → 15a; tracker T-038)
- **Decision:** real accounts may run a practice call, labelled "Practice", never saved to History, Reports, ratings or learning, and never uploaded. The first-run checklist gets its "Try a practice call" step.
- **Amends:** D-024 "real accounts carry no demo data", for one neutral practice script only.

## D-074 — R12 rests on code for Deals (engineering, 15 Nov 2026)
2026-11-15 · engineering (T-082 draft, recorded in wave-4 hardening)
- **Context:** D-069 grants `ZohoCRM.modules.deals.UPDATE`, so the OAuth scope no longer stops a Deal write; only our code does.
- **Decision:** the adapter's `update_deal_fields` allow-list (the 4 AGN api names) is the only Deal write. A test (`test_only_three_callers_reach_the_raw_write`) pins that `_request` has exactly two callers, `_send` (module allow-list) and `update_deal_fields`. Stage and Amount stay blocked by test. Blueprint is read per record with `deals.READ`; no Blueprint or layout settings scope is requested.
- **Also:** a Task or AGN-field write names a `call_id` the caller started or reported in their own company; any other id is 404 (wave-4 hardening).
- **Open (owner):** the AGN Deal PUT sends no `trigger`, so Zoho runs its default workflow/Blueprint rules on the field change. Closed by D-075.

## D-075 — AGN Deal field writes never fire the customer's Zoho automation (owner, 15 Nov 2026)
2026-11-15 · owner (closes D-074's open point)
- **Decision:** `update_deal_fields` (the AGN-field PUT on Deals, D-069) sends `"trigger": []`. Zoho CRM v8 runs the record's workflow, approval and blueprint automation when `trigger` is omitted; `[]` runs none (insert/update records docs). A test pins the body.
- **Scope:** only the Deal AGN-field write. The Contact update (an agent-approved edit of the customer's own data, the same edit a person makes in Zoho) and the creates (Events, Leads, Tasks, Notes) keep Zoho's default, so the customer's rules run as for a manual entry.

## D-076 — Playbook bootstrap is a feature flag, off by default (owner, 15 Nov 2026)
2026-11-15 · owner (T-083 hub line 7)
- **Decision:** `playbook_bootstrap` joins the catalog (roles admin and manager, `default: off`). Every `/api/v1/playbook/bootstrap` route checks it after the role check and returns `feature_unavailable` (`off_by_org`) until a company admin turns it on in Admin › Features. The Playbook page's panel shows the reason (and the Features link for admins) while it is off and calls no route. Consent (D-063) is still required on top.

## D-078 — Vendor-only configuration (owner, 18 Nov 2026)
2026-11-18 · owner (M-002, T-097)
- **Decision:** Zoho AGN fields, SMTP, Gallabox + delivery webhook, and model configuration are configured only in the owner console, per organisation, by the vendor/owner. The client app no longer carries any of that configuration UI and no longer exposes client write endpoints for it.
- **What stays in the client:** the Zoho connection itself (the user's own Zoho login); Gallabox status only ("Gallabox Connected" / "Gallabox not connected" + channel label); email formats (now rich text, D-080).
- **Why:** a user — even an admin — must not be able to change what the vendor sells or what the organisation is charged for; the vendor sets it once and it applies to every user in the organisation.

## D-079 — Model visibility boundary (owner, 18 Nov 2026)
2026-11-18 · owner (M-002, T-100)
- **Decision:** the client shows no model UI anywhere and the bundle no longer carries `providers[].models`, `overrides`, or `key_source`. Model configuration is per organisation in the owner console.
- **Boundary (stated plainly):** the effective provider+model per stage still reaches the device, because calls go direct to vendors (D-038 architecture). Full invisibility would need server-side proxying, which is NOT in this round.

## D-080 — Email formats are rich text (owner, 18 Nov 2026)
2026-11-18 · owner (M-002, T-098)
- **Decision:** email formats store Markdown. The editor has a bold/italic/list/link toolbar. The server renders `multipart/alternative` (plain-text part = markers stripped; HTML part = a sanitised Markdown subset) only when the filled text contains Markdown — plain formats send exactly as before (single text part). Subject stays plain text.
