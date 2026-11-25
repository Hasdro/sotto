# Round 4 — Agent 3: Prep coach, voice coach, review queue, morning brief

You are one of **four agents working at the same time** on separate offline copies of this repo. The others build: Agent 1 live cards (prompt, tone, call state), Agent 2 the post-call wizard and style memory, Agent 4 the platform safety net, logging, local models and setup guide. Do only your share, stay inside your owned files, and build against the contracts.

**Read first:** `docs/prompts/round4/00-master.md`, then `CLAUDE.md`, `docs/REQUIREMENTS.md` (R1, R6, R7, R10, R11), `CONSTRAINTS.md`.
Branch: `round4/voice-coach`. Decision numbers: D-120 – D-129. Feature IDs: `prep_coach` (on), `morning_brief` (on), `voice_coach` (**off**, owner-configured).

## Goal
Before a call the agent can brainstorm with a coach (type or talk) and get a game plan that feeds the live cards. After a call the agent can talk the call through with the coach and learn how to sell better; what they say feeds the memory.

## What exists today (checked 25 Nov)
- Pre-call: `apps/app/features/call/components/CrmRail.tsx`, stage "prepare" (`PrepPanel` ~line 506): Zoho candidate pick, brief editor (TLDR, objective, attendees, pains, competitors, next step), works without Zoho. Start button "Start listening" (`features/call/strings.ts:50`); routes `/call?prepare=1`, `/call?check=audio`. **No prep chat exists.**
- Text-to-speech is stored as a setting only, not built (D-081). Router: `cloud/routing/`, seed `seed/models/default.yaml`, prices `seed/models/prices.yaml`. Metering: `cloud/metering/`. Scheduler: `cloud/scheduler/`. Mail: `cloud/mail.py`.

## Your tasks (tests first)
1. **Prep every time (B1).** "Start" always opens the prep stage first; **Start listening** is active immediately; never force a chat. Mount Agent 1's `CallStatePanel` (stub component) in the live stage of the rail — you own `CrmRail.tsx`.
2. **Prep coach, text (B2).** Chat in the prep stage. Uses the Zoho brief when present. On Start, produce the **game plan** (3 goals, likely objections with answers, questions to ask, what not to say), prompt `seed/prompts/game_plan.md`; editable before start; saved with the call; visible read-only in the rail during the call. Expose `get_game_plan()` in `cloud/coach/api.py` (master §3.4) for Agent 1's prompt. Prompt `seed/prompts/coach_prep.md`; stage `coach_llm`.
3. **Voice coach (V1, V2).** In-app voice conversation (no phone call), text fallback in the same screen. Router stages `coach_stt`, `coach_llm`, `coach_tts` (seed blocks only; no model names in code; providers only in `adapters/`). Feature hidden unless the owner configured the stages and enabled the company. **Vendors:** write a short comparison of two text-to-speech + speech-to-text options with cost per minute in your handoff; do not sign up or add keys. Build the adapter interface + one adapter against the docs, tested with fakes.
4. **Usage cap (V2).** Monthly USD cap per company (minutes shown), set in owner console `cloud/owner/coach.*`. Check before every review and every prep voice session; 80 % → email admin + owner (once per month); 100 % → coach stops until the 1st unless raised. Feature off for companies with no cap.
5. **Post-call voice review (V4).** ≤ 3 min, interruptible: went well, improve, one better phrasing quoted from the call, one tip; ends with "Anything I should remember for next time?" → Agent 2's `add_feedback(source="coach_review")` (stub). Prompt `seed/prompts/coach_review.md`. Client entry `startReview(callId)` exported from `apps/app/features/coach/` for Agent 2's wizard. Transcript visible to the agent only (admin if the company allows).
6. **Review queue (V3).** States pending → done / snoozed / dismissed / cancelled; Home card with count badge; pick any; snooze 1 h / tomorrow morning / pick a time; one reminder after 24 h; expire after 7 days. Calls < 30 s create no review. You may add one line to `apps/app/app/home.tsx` to mount the queue card.
7. **Morning brief (V5).** Scheduled 08:00 local; text, voice only when the coach is on; user can turn it off; with Zoho: today's meetings + one tip + pending reviews; without Zoho: tip + pending reviews, never empty. Prompt `seed/prompts/morning_brief.md`.

## Owned files
`apps/app/features/call/components/CrmRail.tsx` (incl. `PrepPanel`), `features/call/strings.ts` (prep lines only), `apps/app/features/coach/` (new), `apps/app/app/admin/coach.tsx` (new), `apps/agent-worker/sotto_worker/cloud/coach/` (new), coach adapters under `adapters/`, `cloud/owner/coach.*` (new), the morning-brief job, `seed/prompts/coach_prep.md`, `coach_review.md`, `game_plan.md`, `morning_brief.md`, your blocks in `features.json`, `seed/models/default.yaml`, `seed/models/prices.yaml`.

**Do not touch:** `pipeline/`, `suggest.md`, `CardStack.tsx` (1), `features/postcall/`, `cloud/memory/` (2), `lib/cloud.ts`, `apps/desktop/`, router code (4).

## Stubs you write against
`add_feedback()` (Agent 2), `CallStatePanel` (Agent 1), `logEvent()`, `<SafeBoundary>`, `enqueue()` (Agent 4).

## Acceptance (evidence in your handoff)
- Prep: Start opens prep every time; Start listening works with no chat; game plan saved and returned by `get_game_plan()`; without Zoho it still works.
- Cap tests: under cap runs; 80 % sends one email; 100 % blocks until the 1st; no cap → feature hidden.
- Queue tests: every state change, snooze times, 24 h reminder once, 7-day expiry, < 30 s → none.
- Review feeds `add_feedback(source="coach_review")`.
- Morning brief with and without Zoho, never empty; off switch works.
- Isolation tests for every new table. Replay p95 unchanged (≤ 1500 ms): the game plan adds no live-path delay.
- Screenshots: prep chat, game plan, rail during call, voice review, queue: light/dark, 390/1280, LTR/RTL; axe 0 serious.
- Owner to-dos: vendor choice, keys, cap values.
