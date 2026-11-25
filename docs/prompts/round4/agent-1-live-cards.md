# Round 4 — Agent 1: Live cards

You are one of **four agents working at the same time** on separate offline copies of this repo. The others build: Agent 2 the post-call wizard and style memory, Agent 3 the voice coach and prep coach, Agent 4 the platform safety net, logging, local models and setup guide. Do only your share, stay inside your owned files, and build against the contracts.

**Read first:** `docs/prompts/round4/00-master.md` (all decisions, contracts, hand-back rules), then `CLAUDE.md`, `docs/REQUIREMENTS.md` (R1, R2, R4, R6, R8, R11), `CONSTRAINTS.md`.
Branch: `round4/live-cards`. Decision numbers: D-100 – D-109. Feature IDs: `card_style_v2`, `call_state`, `talk_meter` (all default on).

## Goal
Cards that read like a sharp, casual colleague, short, with a grain of sales insight, and coherent with the whole conversation. Today's test cards said "I hear you" too much, were too formal and too long, and seemed to lose track of the call.

## What exists today (checked 25 Nov)
- Prompt: `seed/prompts/suggest.md` (key `suggest`, v4): "at most 25 words, one main sentence". Replies `ANSWER: <card>` / `NO_SAFE_ANSWER`, parsed in `apps/agent-worker/sotto_worker/pipeline/verdict.py`. Rendered in `pipeline/session.py` `_request` (~line 381); `max_tokens` 120 (~404). There is **no** length check in code.
- Context: last 60 s (`CONTEXT_WINDOW_MS`, `session.py:35`), both speakers labelled `Customer:` / `Agent:`. Agent events are context only (`session.py:215-222`); `classify()` runs on customer turns only.
- Variables today: `company.name/tone/call_goal/context`, `playbook.match`, `transcript.last_60s`, `turn.kind`, `turn.text`, `card.language`; `crm.brief` appended from `seed/prompts/crm_brief.md`.
- Learned instructions (R11 / D-034) reach the client bundle (`apps/app/lib/cloud.ts` ~517-532); **not confirmed** that they reach the live prompt.
- Card UI: `apps/app/features/call/components/CardStack.tsx` (one hero card, `EARLIER_LIMIT = 2`). Ratings: `apps/app/features/rating/` (Agent 2 owns rating changes).

## Your tasks (in this order, tests first)
1. **Card format + parser (C1, C2).** New reply format `SAY:` / `TIP:` (≤ 18 words) + optional `WHY:` (≤ 12 words); keep `NO_SAFE_ANSWER` and the R2 answer chain. Parser in `verdict.py`. Hard check: cut at the last full sentence ≤ 18 words (else word 18), strip banned openers, never re-ask; count each cut/strip. Card UI: `WHY` collapsed by default, tap to open. Streaming: first word still counts as "shown" (R1).
2. **Tone + banned phrases (C3).** Presets Casual/Direct/Warm/Formal + "how we talk" (≤ 200 chars); levels platform → company → agent, most specific wins; default Casual. Banned list per language (English + Arabic), starter list in the master. Storage in `cloud/cards/store.py` (new; `company_id`, isolation test). Admin screen `apps/app/app/admin/tone.tsx`; agent's own pick in their settings (a new component you own, mounted with one line). Defaults in `seed/`.
3. **Prompt rewrite (`suggest.md` v5).** Spoken, casual, no filler, one grain of insight. Variables: add `{{call.state}}`, `{{call.game_plan}}`, `{{agent.style_memory}}`, `{{agent.tone}}`, `{{tone.banned}}`. Priority on conflict: playbook > company rules > style memory (C6). Keep `seed/` as the only place for prompt text.
4. **Call state (C5).** New `pipeline/call_state.py` + `seed/prompts/call_state.md` + router stage `call_state` (cheap model; seed block in `seed/models/default.yaml`). Updated after each customer turn, asynchronously; the card uses the latest finished state; ≤ 120 words. It must add **0 ms** to the card path: prove it in the replay.
5. **"What I know so far" panel.** `apps/app/features/call/components/CallStatePanel.tsx`, read-only, collapsed by default. **Do not edit `CrmRail.tsx`** (Agent 3 owns it); export the component; Agent 3 mounts it in the live rail. Note it in the handoff.
6. **Learned rules reach the prompt.** Find out whether R11 instructions reach the live prompt at runtime; if not, fix through `{{agent.style_memory}}` (Agent 2's `get_style_memory`, stubbed for you). Add a test that fails if they are missing.
7. **Talk-time meter (C8).** Small bar on the live screen showing the agent's share of talk time from VAD (voice-activity detection) on the agent track. Hidden in approximate (voice-sample) mode. Must fit R8 density.
8. **Quality judge (C7).** Extend the replay (`pnpm replay --all`) with a judge pass: banned phrase, ≤ 18 words, formality, coherence (1–5) against earlier call parts. Prompt `seed/prompts/quality_judge.md`, stage `quality_judge`. Add thresholds to `CONSTRAINTS.md` (≥ 95 % pass length + banned; coherence ≥ 4/5); fail below. Offline: run with a stub judge and say the live judge run is for the merger.

## Owned files
`seed/prompts/suggest.md`, `seed/prompts/call_state.md`, `seed/prompts/quality_judge.md`, `apps/agent-worker/sotto_worker/pipeline/` (session.py, verdict.py, new call_state.py), `apps/agent-worker/sotto_worker/cloud/cards/` (new), replay scripts, `apps/app/features/call/components/CardStack.tsx`, `CallStatePanel.tsx` (new), talk-meter component (new), `apps/app/app/call.tsx` (only for the meter and for wrapping the card area in `<SafeBoundary>`), `apps/app/app/admin/tone.tsx` (new), your block in `features.json` and `seed/models/default.yaml`, the quality lines in `CONSTRAINTS.md`.

**Do not touch:** `CrmRail.tsx` (3), `features/review/`, `features/rating/`, `features/learning/`, `cloud/learning/` (2), `lib/cloud.ts`, `apps/desktop/`, `cloud/routing/` code (4).

## Stubs you write against
`get_style_memory()` (Agent 2), `get_game_plan()` (Agent 3), `log_event()` / `logEvent()` and `<SafeBoundary>` (Agent 4). Use the exact signatures in master §3.

## Acceptance (evidence in your handoff)
- Parser and cut tests: 19+ word card → cut to ≤ 18 at a sentence end; banned opener stripped; English + Arabic.
- Tone precedence test (platform < company < agent); isolation test for `cloud/cards` tables.
- Replay: p50/p95 before and after (p95 ≤ 1500 ms); call-state update adds 0 ms to the card path; R4 check: 0 cards from agent speech.
- Judge pass on the synthetic set with the thresholds (stub judge offline).
- Screenshots: card with WHY closed/open, "What I know so far", talk meter; light/dark, 390/1280, LTR/RTL; axe 0 serious.
- Test proving style memory reaches the rendered prompt.
