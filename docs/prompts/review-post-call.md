# Child: review-post-call (wave 2, T-076) — branch `phase9/review-post-call`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section, proposed D-041/D-044/D-045/D-047), `docs/reviews/ux-critique-2026-11.md` and `docs/reviews/integrations-playbook-2026-11.md` (the items below), `docs/DESIGN.md` §1 and §5, REQUIREMENTS R2, R11, R12, D-031, D-032, D-033. Read the wave-1 session-log entries (2026-11-13 (c)) in `docs/TRACKER.md`.

**Goal:** after the call the agent sees one short review, one checklist of suggested Zoho updates (nothing pre-ticked, one save), one follow-up card, and a clear done state; cards and transcript live in History. Model: main (Opus). Two other children run in parallel (`review-live-call`, `review-home-shell`); stay inside your files.

**Build on wave 1:** `EndedView.tsx` already holds the after-call composition; `packages/ui` has `ChecklistRow`, `Disclosure`, `Toast` with an action slot (Undo, 5 s), `LtrRun`, `StatTile`; `features/rating/RatingControls` is the thumbs control; the server has the `call_log` Zoho action (INT-01s; client helper already in `lib/cloud.ts`). Strings go in feature-local `strings.ts` files (`features/actions/strings.ts`, `features/review/strings.ts`, en + ar), not in `i18n.ts`.

## Scope (item ids from the backlog)
1. **UX-04** After-call order: one-line review → "Suggested updates (n)" checklist (`ChecklistRow`; nothing pre-ticked; Edit disclosure per row; one "Save n to Zoho" that sends only ticked rows, each its own approval, idempotent write and audit row, D-044) → follow-up → done state "Saved to Zoho ✓ · Open in Zoho". Cards and transcript move to History detail.
2. **UX-05** One "Follow up with <name>" card: the `followup` draft is the email body; WhatsApp is the second tab; one send path per channel (D-045).
3. **UX-22** Email preview as a mail client (From/To/Subject rows); warn when the body says "attached" and there is no attachment.
4. **UX-23** "Skip" on a checklist row or the follow-up with a 5 s Undo toast; skipped items are saved with the call and listed in History detail.
5. **UX-24** "Start another call" stays secondary until every follow-up item is saved or skipped.
6. **UX-27** Review leads with the coach's tip + mascot mood (80/65/50/30/none, R8); dimensions under a "Details" disclosure, including the full talk-ratio bar (`TalkMeter` `full` variant, read-only import from `features/call`); chance to close as Likely / Unclear / Unlikely.
7. **UX-41** Deal note heading "Note on <deal>" with the name in `LtrRun`; no repeated "Deal:".
8. **INT-01c** "Call log" row in the checklist: summary, objections, commitments, next step, chance band, plus the agent's "Note for after the call" (read via `lib/callNotes.ts`, owned by `review-live-call`); preview before save; uses `call_log` (Deal → Contact → Lead, D-047; no transcript text).
9. **INT-02m** Next-step Meeting row prefilled from the review's agreed date; the agent must confirm date, time and timezone before it can be ticked.
10. **INT-07** Deal-risk signals in the review (reason + short quote, labelled "AI-estimated"), offered as part of the call-log Note. Note text only: no custom Deal fields (that is INT-06, wave 4, Q11).
11. **INT-14a** Good default email formats per action (`cloud/email/defaults.json`); customers edit only the static blocks; links (proposal, booking) as static blocks that appear verbatim (R12).
12. **W2-REPLAY** After changing `seed/prompts/{review,followup,summary}.md` run `pnpm gen` and the replay; report p50/p95.
13. **UX-02h** (wave-1 handover) Rating in History: every AI advice card in History detail gets `RatingControls` (thumbs, reasons after thumbs-down); playbook and holding cards never (R11). Ratings feed the existing learning path unchanged.

## Blocked on owner — do not build
- Nothing in this stream depends on an open owner answer. Do not add custom Deal field writes (Q11, wave 4) or any automatic send (R12, Q12).

## Owned files
`apps/app/features/call/components/EndedView.tsx`; `apps/app/features/{actions,email,whatsapp,review,rating,history}/**` except `features/email/SmtpSettings.tsx` and `features/whatsapp/GallaboxSettings.tsx`; `apps/app/app/history/**`; `apps/app/lib/{cloud,deviceHistory}.ts` (hub this wave: new client calls go here); `packages/engine/src/{review,types}.ts` and `packages/engine/src/__tests__/bundle.json` (regenerated); `seed/prompts/{review,followup,summary}.md`; `apps/agent-worker/sotto_worker/cloud/email/defaults.json`; hubs `apps/agent-worker/sotto_worker/cloud/{app,store,bundle}.py` this wave; tests `apps/app/__tests__/{zoho-actions,messaging,history-server}.test.tsx`, `apps/app/features/rating/*.test.tsx`, `packages/engine/src/review.test.ts`, new tests under `apps/agent-worker/tests/cloud/` for anything you add server-side.

## Out of bounds (ask the master in your report)
`apps/app/lib/i18n.ts` (owned by `review-home-shell` this wave), `apps/app/app/call.tsx` and the rest of `apps/app/features/call/**` (`review-live-call`), `apps/app/features/crm/**` (use `lib/cloud.ts` for `call_log`; ask if `crm/api.ts` `ActionKind` must change), `apps/app/lib/{format,callNotes,desktop}.ts` (read-only), `apps/app/components/**`, `packages/ui/**` (read-only this wave), `apps/desktop/**`, `cloud/features.json`, `cloud/zoho/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Jest: after `ended` the order is review line → checklist → follow-up → done; no row is ticked initially; "Save 2 to Zoho" sends exactly the 2 ticked rows, each once with its own idempotency key; a retry creates no duplicate.
- Follow-up: one card, email tab body = `followup` draft, WhatsApp second tab; preview shows From/To/Subject; "attached" without attachment warns; static blocks verbatim.
- Skip → Undo within 5 s restores the row; after 5 s it is listed in History detail.
- "Start another call" is secondary while an item is open, primary after all are saved/skipped.
- Review: tip + mascot mood for scores 80/65/50/30/none; dimensions inside Details; chance band text; risk signals labelled "AI-estimated".
- Deal note heading uses `LtrRun` (RTL test).
- Meeting row cannot be ticked until date/time/timezone are confirmed.
- History detail: AI cards rateable, playbook/holding cards not (R11).
- Server (if touched): pytest for any new route incl. a company A/B isolation test.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `pnpm --filter @sotto/engine test`; `cd apps/agent-worker && uv run pytest`; `pnpm a11y` 0 serious.
- **Replay** (W2-REPLAY): `pnpm replay --all`, report p50/p95; p95 > 1500 ms is a failure.
- Screenshots in `docs/evidence/phase9/review-post-call/`: after-call checklist, follow-up card (both tabs), done state, review, History detail with rating — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(post-call): …`, `feat(review): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-post-call` about every 45 minutes.
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-076 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-post-call`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95, screenshot folder) · files outside your list you need touched (exact lines) · open questions · branch tip SHA.
