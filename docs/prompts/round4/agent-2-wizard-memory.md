# Round 4 — Agent 2: Post-call wizard + style memory

You are one of **four agents working at the same time** on separate offline copies of this repo. The others build: Agent 1 live cards (prompt, tone, call state), Agent 3 the voice coach and prep coach, Agent 4 the platform safety net, logging, local models and setup guide. Do only your share, stay inside your owned files, and build against the contracts.

**Read first:** `docs/prompts/round4/00-master.md`, then `CLAUDE.md`, `docs/REQUIREMENTS.md` (R7, R11, R12), `CONSTRAINTS.md`.
Branch: `round4/wizard-memory`. Decision numbers: D-110 – D-119. Feature IDs: `postcall_wizard`, `style_memory` (default on).

## Goal
After a call the agent must not face one screen with many decisions. Replace it with a calm step-by-step wizard, and turn all feedback into a compact per-agent memory the app uses on the next call, visible to admin and owner.

## What exists today (checked 25 Nov)
- Post-call: `apps/app/features/review/CallReviewPanel.tsx`, `features/review/FollowUp.tsx` (mounts `EmailAction` + `WhatsAppAction`), `features/followup/` (`DueSteps.tsx`, `PlanSetup.tsx`), `features/whatsapp/`, `features/email/`, `features/actions/` (Zoho actions).
- Ratings: `apps/app/features/rating/` (`RatingControls.tsx`, `ratings.ts`): up/down; reasons `wrong`, `too_long`, `not_our_style`, `good_phrasing`. Shown after the call, not under the live card.
- Learning (R11, D-034): server `apps/agent-worker/sotto_worker/cloud/learning/` (routes, store); client `apps/app/features/learning/` (packet, diff, learn); admin `apps/app/app/admin/instructions.tsx`.

## Your tasks (tests first)
1. **Wizard shell (A1).** New `apps/app/features/postcall/`: popup with steps 1 Review → 2 WhatsApp → 3 Email → 4 Zoho actions → 5 Card feedback; **Back / Skip / Next** on every step; progress dots; steps 2–4 hidden when their feature is off or nothing is suggested; calls < 30 s → no wizard. Reuse the existing review, WhatsApp, email and Zoho action components inside the steps; each keeps its own explicit **Send / Approve** button (R12; Next never sends). **Finish later** saves the step for 24 h (server-side, per user); after 24 h unsent drafts are deleted and the feedback step stays in the review queue 7 days. Step 1 shows a **Talk it through** button when `voice_coach` is available; it calls Agent 3's `startReview(callId)` (stub).
2. **Feedback step (A2).** The call's cards with thumbs, reason chips (**too long, too formal, wrong, not relevant**; map or migrate the old reasons), optional note per card, and a prominent whole-call feedback box (voice input via the OS/dictation is enough). Everything goes through `add_feedback()`; offline it goes to Agent 4's outbox (`enqueue`, stub).
3. **Style memory (A3).** `apps/agent-worker/sotto_worker/cloud/memory/` with `api.py` exposing exactly `add_feedback()` and `get_style_memory()` (master §3.4). Build on `cloud/learning/` rather than beside it; migrate existing instructions into the memory. Merge job after each call with any feedback: prompt `seed/prompts/memory_merge.md`, router stage `memory_merge` (seed block in `seed/models/default.yaml`); ≤ 12 rules of ≤ 25 words; add, reword, strengthen, drop; personal data stripped; no full transcript in the packet; retry 3×, raw feedback kept on failure; raw feedback deleted after 90 days (scheduled job). Default auto-apply; company setting "review before apply". Toast "Learned N new things – view". Priority for readers: company rules first, then the agent's rules.
4. **Views (A4).** Agent: own rules (`apps/app/app/admin/memory.tsx` can host both; or a settings section you own). Admin: every agent's rules + company roll-up; edit, disable, revert (version history), promote to company-wide. Owner console: `cloud/owner/memory.*`, all companies, read-only. Every admin change in the audit log (R3).

## Owned files
`apps/app/features/postcall/` (new), `features/review/`, `features/followup/`, `features/rating/`, `features/learning/`, `apps/app/app/admin/memory.tsx` (new), `apps/app/app/admin/instructions.tsx`, `apps/agent-worker/sotto_worker/cloud/memory/` (new), `cloud/learning/`, `cloud/owner/memory.*` (new), `seed/prompts/memory_merge.md`, your blocks in `features.json` and `seed/models/default.yaml`. You may make small changes inside `features/whatsapp/`, `features/email/`, `features/actions/` only to embed them in steps; list each in the handoff.

**Do not touch:** `pipeline/`, `suggest.md`, `CardStack.tsx` (1), `CrmRail.tsx`, `cloud/coach/` (3), `lib/cloud.ts`, `apps/desktop/`, router code (4).

## Stubs you write against
`startReview(callId)` (Agent 3, client), `enqueue()`, `logEvent()`, `<SafeBoundary>` (Agent 4). Wrap each wizard step in `<SafeBoundary name="wizard.stepN">`.

## Acceptance (evidence in your handoff)
- Wizard tests: Back/Skip/Next order; hidden steps; Next never sends; Finish later resumes within 24 h and expires after; < 30 s call → no wizard.
- Memory tests: merge keeps ≤ 12 rules ≤ 25 words; packet has no transcript and no personal data; retry and keep-raw on failure; 90-day deletion; review-before-apply holds changes; revert restores a version; promote to company works; company rule beats agent rule.
- Isolation tests for every new table (company A cannot read/insert/update/delete company B).
- Audit-log entries for admin edits.
- Screenshots of all 5 steps and the memory views: light/dark, 390/1280, LTR/RTL; axe 0 serious.
- R11 acceptance still passes (only AI cards rated; instructions applied on the next call only).
