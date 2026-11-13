# Child: review-ui-core (wave 1, T-072) — branch `phase9/review-ui-core`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section, proposed D-041/D-042), `docs/reviews/ux-critique-2026-11.md` (the items below), `docs/DESIGN.md` §1 and §5, REQUIREMENTS R1, R2, R8, R11, D-026.

**Goal:** the live call shows one loud thing — the card — and `packages/ui` gains the primitives waves 2–3 build on. Model: main (Opus). Two other children run in parallel (`review-copy-brand`, `review-server-core`); stay inside your files.

## Scope (item ids from the backlog)
1. **UX-02** No `RatingControls` under the live hero card. Thumbs = two 44 px icon buttons with accessible names ("Helpful", "Not helpful"), no visible question; shown on collapsed earlier cards on hover/focus only, on every AI card after the call and in History. Reason chips open only after a thumbs-down, outside the live hero.
2. **UX-11** The hero card no longer renders "On screen x s after…". Per-card timing is still recorded (R1); History detail may show it.
3. **UX-12** Card header = voice-bar colour + icon only (no "Answer" + "AI answer" pair). Source and the R2 notice become one short line **under** the sentence ("Not in playbook — check first"); the notice must still show for every AI-sourced card (R2 test).
4. **UX-13** At most 2 earlier cards by default + "Show earlier (n)"; compact cards use the background tone, not white, in light mode.
5. **UX-14** A compact holding card keeps its dashed edge; once a real card exists for the same turn, the holding card is dropped from the earlier list.
6. **UX-15** The rail toggle has a visible label "Context" and sits on the start side of the header; End call is alone on the end side (its confirm stays).
7. **UX-06a** Header: no "Fake AI"/mode label; show "Practice" only on practice calls; model/mode in the live-dot tooltip; mock badge rendered only when `devGate` says dev.
8. **UX-07** Escalation toast: top-end on wide, above the composer on narrow, never over interactive rows; text "Sent to your manager" (the question stays in the transcript line).
9. **UX-40** Dark-mode `Toast` = raised dark surface + border, not inverted.
10. **UX-43a** Live call: small live dot instead of the mascot beside "Listening to the customer".
11. **UX-44a** Every icon-only button in `packages/ui` has a visible focus ring and a 44 px target; `Button` accepts optional helper text explaining a disabled state.
12. **W1-UI** New primitives in `packages/ui` with gallery entries and tests: `Disclosure` (accessible expand/collapse), `Sheet` (bottom sheet below 768 px, focus trap, Escape closes), `ChecklistRow` (checkbox + one-line summary + Edit disclosure slot), `Toast` action slot (for "Undo", 5 s), neutral `StatTile`, `LtrRun` (bidi-isolated inline run for Latin names in RTL). Tokens only; light/dark; RTL mirrored.
13. **W1-SPLIT** Move the ended/after-call composition out of `app/call.tsx` into `features/call/components/EndedView.tsx` (props in, same render, same testIDs). No behaviour change; existing tests pass unchanged.

## Owned files
`packages/ui/src/**` except `packages/ui/src/brand/**`; `apps/app/app/gallery.tsx`; `apps/app/app/call.tsx`; `apps/app/features/call/components/{CardStack,CallHeader,ListenBar}.tsx`; new `apps/app/features/call/components/EndedView.tsx`; new `apps/app/features/call/strings.ts` (en + ar, pattern of `features/email/strings.ts`); `apps/app/features/rating/**`; tests `apps/app/__tests__/{card-stack,call,call-peek,call-survives-navigation}.test.tsx` and `packages/ui` tests.

## Out of bounds (ask the master in your report)
`apps/app/lib/i18n.ts` (owned by `review-copy-brand` this wave: do not edit; put new keys in `features/call/strings.ts`; stop *using* `card.shownAfter` instead of deleting it), `packages/ui/src/brand/**`, `apps/app/features/call/components/{CrmRail,ListenStart,ScenarioPicker,Composer,TranscriptPane,TalkMeter}.tsx` (wave 2), `apps/app/features/{actions,email,whatsapp,review}/**`, everything under `apps/agent-worker/**`, `apps/desktop/**`, `apps/landing/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Jest: hero card during a live call has no rating control; a collapsed AI card exposes two 44 px buttons with names; after `ended` every AI card is rateable; playbook/holding cards never are (R11).
- `SuggestionCard` tests: no timing text; R2 notice present under the sentence for AI source, absent for playbook; type label not rendered as text twice.
- CardStack: 3+ earlier cards → 2 shown + "Show earlier (1)"; holding card dropped once a real card for that turn arrives.
- CallHeader: practice → "Practice"; real → no mode label; mock badge absent when `devGate` is off.
- Toast: placement style differs wide vs narrow; dark-theme snapshot uses the raised surface token.
- Each new primitive: render test, keyboard test (Enter/Space/Escape where relevant), RTL test; listed in `/gallery`.
- W1-SPLIT: the full existing call test suite passes with no assertion changed.

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; `pnpm --filter @sotto/ui test`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (parallel sessions overload the machine; never run jest without `--maxWorkers=2`); `pnpm a11y` 0 serious.
- **Replay** (card rendering is on the live path): `pnpm replay --all`, report p50/p95; p95 > 1500 ms is a failure.
- Screenshots in `docs/evidence/phase9/review-ui-core/`: live call and gallery primitives in light, dark, Arabic RTL, at 390 px and 1280 px (`node scripts/screenshots.mjs` or the dev web build).

## Rules
- Tests first; small conventional commits (`feat(ui): …`, `refactor(call): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-ui-core` about every 45 minutes.
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-072 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-ui-core`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, replay p50/p95, screenshot folder) · files outside your list you need touched (exact lines) · open questions · branch tip SHA.
