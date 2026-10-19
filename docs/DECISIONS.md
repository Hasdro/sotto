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
