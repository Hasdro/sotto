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
