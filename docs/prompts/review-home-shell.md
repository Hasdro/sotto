# Child: review-home-shell (wave 2, T-077) — branch `phase9/review-home-shell`

Follow `docs/prompts/common.md`. Read `docs/reviews/backlog-2026-11.md` (your section, proposed D-041/D-050/D-051/D-053/D-057), `docs/reviews/ux-critique-2026-11.md` and `docs/reviews/zero-config-2026-11.md` (the items below, incl. the app map), `docs/DESIGN.md` §1 and §5, REQUIREMENTS R3, R7, R8, R9, D-024, D-036, D-038. Read the wave-1 session-log entries (2026-11-13 (c)) in `docs/TRACKER.md`.

**Goal:** the first minute is guided, Home answers "what is next for me", agents see only what they use, the desktop admin is four clear groups, and signing in is simple and recoverable. Model: main (Opus). Two other children run in parallel (`review-live-call`, `review-post-call`); stay inside your files.

**Build on wave 1:** `packages/ui` `StatTile` (neutral), `ChecklistRow`, `Disclosure`, `IconButton`; the server sends `health` (`ok` / `needs_attention` + reasons) with the feature map (helper in `lib/cloud.ts`), has `POST /api/v1/auth/reset/request|confirm` (helpers in `lib/cloud.ts`) and `GET/PUT /api/v1/company/defaults`. You own `apps/app/lib/i18n.ts` this wave: other streams put strings in feature-local `strings.ts`; add hub lines they request only at the master's word.

## Scope (item ids from the backlog)
1. **UX-10** (+ZC-09, DD-8) Role-based first-run checklist on Home (`ChecklistRow`), hidden when every step is done. Agent: Connect Zoho (re-checks via `useZoho`), Test audio (links to `/call?check=audio`, built by `review-live-call`). Admin/manager: playbook (link to the editor; no auto-bootstrap, Q8), invite people, connect email/WhatsApp (link to Admin › Integrations). Practice step: see Blocked.
2. **UX-03h** Home "Next meetings": "Prepare" = existing `bindCall` + `router.push("/call?prepare=1")` (rail opens on the brief editor, built by `review-live-call`); "Start call with this meeting" = `bindCall` + `/call`.
3. **UX-25** (+ZC A14) Agent Home: next meetings, last call's tip, own open questions. Company block for admin/manager only; no model names for agents; trial/seats as one status line.
4. **UX-26** Stat tiles use the neutral `StatTile`; card colours only on cards.
5. **UX-43b** Replace the greeting with "Next: <meeting> at <time>" (`lib/format.ts`, read-only); mascot only for review moods.
6. **UX-29** (+ZC B16, D-038) Desktop admin grouped as People, Connections, AI, Company; Keys & providers removed from the desktop nav (D-038; the web admin keeps it); Recordings, Devices and Activity in one Company page. Also fix the copy-brand leftover: `app/admin/keys.tsx` still passes `code="pnpm demo"` (that prop only).
7. **UX-39** Sign in and "Create a company" are separate screens (the existing sign-up keeps exactly today's rules; no new self-signup path, that is ZC-10/Q10 in wave 3); "Forgot password"; "You'll stay signed in on this computer."
8. **UX-39r** (wave-1 handover) `/reset-password` web page `apps/app/app/reset-password.tsx`: reads `#token`, immediately `history.replaceState` to drop it, `<meta name="referrer" content="no-referrer">`, new password + confirm, calls the confirm helper; product-voice errors (expired, used). The server email already links to `/reset-password#token=…`; Caddy's `Referrer-Policy` for that path is the master's (put the exact line in your report).
9. **ZC-14c** One health banner from the server status with a fix link (Zoho reconnect, Integrations, plan), in `AppShell`; never more than one banner.
10. **ZC-map-agent** (+ZC A1, A3, A5) Agents do not see Inbox or the playbook editor (D-050, R3 table). Settings = language/theme, Audio (link to `/call?check=audio`; `review-live-call` owns the audio component, the master mounts it at merge if ready), Advanced (mini window, sounds, auto-pickup), About. Remove "Soon" placeholders (`ComingLater`). UI language from the OS on the first start. Delete the unused `card.shownAfter` key (en + ar).
11. **W2-A11Y** `scripts/a11y.mjs` routes updated for the new Home, Settings, admin groups and `/reset-password`; 0 serious.

## Blocked on owner Q15 — do not build
- **UX-10 "Practice call" first-run step** (practice in real accounts conflicts with D-024; T-038). Leave the step out; keep the checklist data-driven so the master can add it with one entry after the answer.

## Owned files
`apps/app/lib/i18n.ts` (hub this wave); `apps/app/lib/{locale,role,prefs}.ts*`; `apps/app/features/home/**`; `apps/app/features/crm/{HomeMeetings,UpcomingMeetings}.tsx`; `apps/app/app/{home,index,account,settings,_layout}.tsx`; new `apps/app/app/reset-password.tsx`; `apps/app/components/**` except `CallPeek.tsx` (incl. `AppShell.tsx`, `PlanBanner.tsx`, `ComingLater.tsx`); `apps/app/app/admin/{_layout,index,recordings,devices,activity}.tsx` and new admin group pages; the `code=` prop line in `apps/app/app/admin/keys.tsx`; `apps/app/features/{account,settings}/**`; `scripts/{a11y,screenshots}.mjs`; tests `apps/app/__tests__/{home-meetings,admin-desktop-tabs,admin-tools,admin-team,tutorial,screens,plan-paused,persistent-login,i18n,settings-server,settings-web-admin,app-link,feature-gate}.test.*` and new tests you add.

## Out of bounds (ask the master in your report)
`apps/app/app/call.tsx` and `apps/app/features/call/**`, `apps/app/features/crm/{api,useZoho,attached,mock,ZohoConnect}.ts*` (`review-live-call`; import read-only), `apps/app/lib/{cloud,deviceHistory,format,desktop,callNotes}.ts` (read-only), `apps/app/features/{actions,email,whatsapp,review,rating,history}/**`, `apps/app/app/history/**`, the rest of `apps/app/app/admin/keys.tsx` and `admin/{integrations,models,prompts,settings,instructions,features}.tsx` (wave 3), `packages/ui/**` (read-only this wave), `apps/desktop/**`, `apps/agent-worker/**`, `deploy/**`, `docs/DECISIONS.md`.

## Acceptance (each item has a test or a screenshot)
- Home jest: agent sees Connect Zoho + Test audio (no practice step); admin sees playbook, invite, email/WhatsApp; a done step disappears; all done → checklist hidden.
- Next meetings: Prepare calls `bindCall` and pushes `/call?prepare=1`; Start pushes `/call`.
- Agent Home has no company block and no model name (test greps rendered text); admin/manager see the company block; trial/seats one line.
- Greeting replaced by "Next: … at …" with formatted time (en + ar).
- Admin desktop: four groups; no Keys & providers entry on desktop; Recordings/Devices/Activity reachable from one Company page.
- Sign-in and Create a company are separate; Forgot password → request helper called; reset page drops the token from the URL before any network call (test), shows expired/used errors.
- Health: `needs_attention` → exactly one banner with the fix link; `ok` → none.
- Agent role: no Inbox and no playbook editor in nav or by URL (redirect/RoleGate test); no "Soon" text; first start picks Arabic when the OS locale is Arabic.
- `i18n.test.ts` passes (en/ar in step, `card.shownAfter` gone).

## Evidence
- `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`; app jest with **`cd apps/app && npx jest --maxWorkers=2`** (never without `--maxWorkers=2`); `pnpm a11y` 0 serious.
- No replay needed unless you touch the live path (you should not); say so in the report.
- Screenshots in `docs/evidence/phase9/review-home-shell/`: Home (agent, admin, first run, done), admin groups, Settings, sign-in, create company, reset page, health banner — light, dark, Arabic RTL, 390 px and 1280 px.

## Rules
- Tests first; small conventional commits (`feat(home): …`, `feat(shell): …`, `feat(account): …`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push WIP to `phase9/review-home-shell` about every 45 minutes.
- **Do not deploy, do not touch us3, do not build or install the Mac app** — the master does that after merging.
- Tracker: change only the T-077 line (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/review-home-shell`. Do not edit Now.
- Record nothing in `docs/DECISIONS.md`; if you make a notable choice, put the draft text in your report.

## Final report (max 5 bullets)
What changed (item ids) · evidence (tests, a11y, screenshot folder) · files outside your list you need touched (exact lines, incl. the Caddy header line) · open questions · branch tip SHA.
