# Child: review-live-call (wave 2, T-075) — branch `phase9/review-live-call`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section, proposed D-041/D-042/D-043/D-054), `docs/reviews/ux-critique-2026-11.md` and `docs/reviews/zero-config-2026-11.md` (the items below), `docs/DESIGN.md` §1 and §5, REQUIREMENTS R1, R4, R10, R12, D-024, D-031. Read the wave-1 session-log entries (2026-11-13 (c)) in `docs/TRACKER.md`.

**Goal:** before the call the agent sees one start button and a brief they can edit; during the call the rail is a quiet read-only brief plus the transcript, with no CRM forms; audio sets itself up and the customer is always its own track. Model: main (Opus). Two other children run in parallel (`review-post-call`, `review-home-shell`); stay inside your files.

**Build on wave 1:** reuse `packages/ui` `Sheet` (bottom sheet < 768 px), `Disclosure`, `IconButton`, `LtrRun`; strings go in `features/call/strings.ts` (en + ar). The desktop already has `apps/desktop/deep-link.cjs` (scheme `agn-sales-shield://`, `onDeepLink`, `openPrivacySettings(mic|system-audio)`) and the server sends the detected Zoho DC (ZC-02).

## Scope (item ids from the backlog)
1. **UX-01** Rail: before the call, the full brief editor (TLDR, objective, attendees, pains, competitors, next step). Live: a 4-line read-only brief + "Edit" link, then the transcript; CRM details behind a `Disclosure` "More from Zoho". At 390 px the rail is a `Sheet` over the card. The saved brief is still injected into the live prompt (R10).
2. **UX-03r** The candidate picker shows only when the call started unlinked, as one line "Not linked to Zoho · Link".
3. **UX-16** Linked state reads "Linked to this call."; the timing note moves to the brief-editor help text.
4. **UX-17** Every Zoho value in the rail goes through `lib/format.ts` (currency, digit grouping, dates; Arabic locale). Add the helpers there; others import them read-only.
5. **UX-18** Talk-ratio bar on the live screen only while "You're talking a lot"; `TalkMeter` keeps a `full` variant that `review-post-call` mounts in the review.
6. **UX-19** (+INT-11) No CRM forms in the live rail. One "Note for after the call" field (`CallNotes`, stored through `lib/callNotes.ts`; `review-post-call` reads it in the checklist). Unknown caller: before the call starts, a dedupe search (name/email/phone) and a prefilled Lead offer (written only on the agent's approval, existing `lead` action, R12).
7. **UX-20** One start screen: detected call app → primary "Start listening"; secondary "Use microphone"; one verb across all buttons. Tertiary practice: see Blocked below.
8. **UX-21** Desktop permission copy + a button that calls `openPrivacySettings("mic" | "system-audio")` for the exact OS pane (Mac screen/system audio and mic; Windows mic).
9. **ZC-08** Audio auto-setup: OS default devices; call-app detection → system audio = customer, mic = agent; 5 s level check on both tracks with a plain-language fix; result remembered per device; auto-pickup default on (`features/call/autoPickup.tsx`). Never a mixed track (R4). `/call?check=audio` opens the level check directly (`review-home-shell` links its "Test audio" first-run step there).
10. **W1-L1** (wave-1 handover) `apps/app/lib/desktop.ts`: add `openPrivacySettings?` and `onDeepLink?` to the `Desktop` type. Wire `features/crm/useZoho.ts` to re-read the Zoho status on `agn-sales-shield://zoho/connected` (keep the focus/poll fallback). Home and the post-call panel use `useZoho` unchanged.

**Contract for `review-home-shell` (UX-03h):** Home calls the existing `bindCall` for a meeting, then `router.push("/call?prepare=1")`; `/call` with `prepare=1` opens the rail on the brief editor before the call. Implement and test that param; Home only links to it.

## Blocked on owner Q15 — do not build
- **UX-20 tertiary "Practice" on the start screen for real accounts** (conflicts with D-024, T-038). Keep today's practice availability exactly as it is (no new entry point in real accounts); leave a code comment pointing at Q15.

## Owned files
`apps/app/app/call.tsx`; `apps/app/features/call/**` except `components/EndedView.tsx`; `apps/app/features/crm/{api,useZoho,attached,mock,ZohoConnect}.ts*`; `apps/app/lib/{format,desktop,callNotes}.ts`; `apps/app/components/CallPeek.tsx`; `apps/desktop/**` (hub this wave); tests `apps/app/__tests__/{crm-rail,call,call-peek,call-survives-navigation,card-stack}.test.tsx`, `apps/app/features/call/*.test.ts*`, `apps/desktop/test/**`.

## Out of bounds (ask the master in your report)
`apps/app/lib/i18n.ts` (owned by `review-home-shell` this wave), `apps/app/features/call/components/EndedView.tsx`, `apps/app/features/{actions,email,whatsapp,review,rating,history}/**`, `apps/app/app/history/**`, `apps/app/features/crm/{HomeMeetings,UpcomingMeetings}.tsx`, `apps/app/components/**` except `CallPeek.tsx`, `apps/app/app/{settings,home,_layout}.tsx`, `packages/ui/**` and `packages/engine/**` (read-only this wave; ask for changes), `apps/agent-worker/**`, `seed/**`, `scripts/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Rail jest: before start the brief fields are editable; once live only 4 brief lines + Edit + transcript render; "More from Zoho" collapsed by default; at 390 px the rail renders inside `Sheet`.
- Linked call: no candidate picker; unlinked: exactly one "Not linked to Zoho · Link" line.
- No form inputs other than the note field in the live rail (test queries for text inputs); unknown caller: dedupe search + prefilled Lead offer before start, nothing written without approval.
- `format.ts` unit tests: currency, grouping and dates in en and ar.
- TalkMeter: hidden at a balanced ratio, shown at the "talking a lot" threshold.
- Start screen: call app detected → one primary "Start listening"; none → microphone primary; one verb.
- Desktop: `openPrivacySettings` called with the right pane per OS (desktop test + app test with a fake bridge); deep link `zoho/connected` triggers a status re-read.
- ZC-08: device choice, level check result and remembered setting per device tested; **R4 test: no code path sends a mixed track** (customer track only triggers cards).
- `prepare=1` opens the brief editor (test).

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `(cd apps/desktop && npm test)`; `pnpm a11y` 0 serious.
- **Replay** (rail, brief injection and audio are on the live path): `pnpm replay --all`, report p50/p95 and R4 count; p95 > 1500 ms is a failure.
- Screenshots in `docs/evidence/phase9/review-live-call/`: start screen, rail before and during the call, sheet at 390 px, permission state — light, dark, Arabic RTL, 390 px and 1280 px (dev web build; Electron with `--user-data-dir=<scratchpad>/electron-profile`).

## Rules
- Tests first; small conventional commits (`feat(call): …`, `feat(desktop): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-live-call` about every 45 minutes.
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-075 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-live-call`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95 + R4, screenshot folder) · files outside your list you need touched (exact lines) · open questions · branch tip SHA.
