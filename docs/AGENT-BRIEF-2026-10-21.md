# Remediation brief — for the implementing agent

**Written:** 21 October 2026 · **Source:** the three-lens review at `~/Documents/GitHub/sotto-review/REVIEW-2026-10-21.md` (read it once; this file is the executable subset).
**Branch:** `claude/friendly-gates-fbhqdv` · **PR:** #1.
**Status:** items marked **[OWNER]** must not start until the owner says yes. Everything else is approved to build.

You are the implementing agent. Work through the batches in order. Each item is a small, testable change with a stated proof. Do not batch several items into one commit, and do not skip ahead because an item looks easy — Batch 0 exists because those are the defects a customer can see today.

---

## 1. What the product is

Sotto is a live sales-call copilot. It listens to **the customer's audio only** and shows the agent **one suggestion card within 1.5 s (p95)** of the customer finishing a sentence. The answer comes from the company playbook, or from an AI answer labelled "not in playbook", or from a holding line plus a question for the manager. It is multi-tenant SaaS (companies, roles, trials, plans) running on iPhone, Android, web, desktop and a Chrome extension.

Since **D-022** the client apps run the call themselves — speech-to-text and the LLM run on the device — and a small Python/Starlette + SQLite server on a 1-vCPU VPS handles only accounts, plans, devices, usage, keys and the owner console. **`packages/engine` is the live pipeline.** The Python worker in `apps/agent-worker` is the reference implementation for replay and benchmarks.

## 2. Rules you may not break

These come from `CLAUDE.md` and `CONSTRAINTS.md`. Breaking one is a failed task, not a trade-off.

1. **Only the customer's track may trigger a card.** Agent speech is context at most. (`packages/engine/src/turns.ts:23-29`.)
2. **No model names and no prompt text in application code.** Model ids live in `seed/models/`, prompt text in `seed/prompts/`.
3. **Provider SDKs only inside an `adapters/` directory.**
4. **Every table has `company_id`, and tenant isolation is tested.** A query that can cross companies is a bug, not a shortcut.
5. **After any change to the pipeline, STT, LLM adapters, prompts or model config, run `pnpm replay --all` and report p50/p95.** p95 above 1500 ms is a failure.
6. **Never weaken a check to get green** — no deleted or skipped tests, no `@ts-ignore`, no lowered thresholds, no narrowed boundary scan.
7. **Never read, print or commit `.env*`, and never put a secret in a client build.**
8. **Do not touch the production server** (`104.168.48.116`, `*.sslip.io`) or create accounts.

## 3. Working agreement

- Read `CLAUDE.md`, `docs/REQUIREMENTS.md`, `docs/TRACKER.md` and `CONSTRAINTS.md` before the first commit. `REQUIREMENTS.md` wins every conflict.
- **One item = one task = one commit** (conventional commits: `fix(app): …`, `feat(engine): …`, `test(cloud): …`).
- **TDD.** Write the failing test first, watch it fail for the right reason, then make it pass. A test you never saw fail proves nothing.
- Update `docs/TRACKER.md` when an item changes state. Give each item a `T-0NN` id and reference it in the commit body.
- If a fix would **change a requirement or contradict a decision**, stop and ask. Propose a new `D-0NN` entry instead of silently reinterpreting one.
- If a fix needs money, a new account, production access or a new major dependency, stop and ask.
- Evidence or it did not happen: every item's proof command and its output go in your handoff.

**Before you start, confirm the baseline** (it was green on 21 Oct 2026):

```bash
pnpm install && (cd apps/agent-worker && uv sync)
pnpm typecheck && pnpm lint && pnpm test
pnpm replay --all          # expect p50 567 / p95 1148, holding 45%, 0 agent cards
python3 scripts/check_bundle_size.py apps/app/dist   # expect 430 KB of 450
```

If the baseline is not green, stop and report — do not build on a broken tree.

---

## 4. Batch 0 — truth and privacy (do this first, all small)

### B0.1 · Customer transcripts must not survive sign-out · S
**Why:** the last 30 calls (transcripts included) sit in `localStorage` under one fixed key `sotto.calls` (`apps/app/lib/deviceHistory.ts:25-26`). Sign-out clears the token only (`apps/app/lib/cloud.ts:199-203`). On a shared laptop, the next user from another company reads the previous agent's customer conversations. This is the worst finding in the review.
**Touch:** `apps/app/lib/deviceHistory.ts`, `apps/app/lib/cloud.ts`.
**Do:** namespace the storage key by company and user (`sotto.calls.<companyId>.<userId>`); export `clearDeviceCalls()`; call it from `signedOut()` and when a different account loads. Set the current owner from `loadSession()`/`signOut()`. Discard any data under the old key rather than migrating it. Do not change what a call stores.
**Prove:** a jest test — save a call as user A, sign out, sign in as user B, assert B's history is empty; plus `pnpm test`.
**Gate:** none.

### B0.2 · The admin must not be able to pick a speech vendor the app cannot run · S
**Why:** the panel offers Deepgram, AssemblyAI, Speechmatics and ElevenLabs (`seed/models/providers.yaml:69-106`), but the client engine implements only AssemblyAI and Speechmatics (`packages/engine/src/adapters/stt.ts:54-56`, `cloud/app.py:167`). Choosing Deepgram passes the key test and then leaves the call with **no speech-to-text at all**.
**Touch:** `seed/models/providers.yaml`, `apps/agent-worker/sotto_worker/cloud/bundle.py`, `apps/app/app/admin/keys.tsx` (and `lib/cloudCompat.ts` if the bundle grows a field).
**Do:** mark the two unsupported vendors in the catalogue as not client-capable, pass that flag through the bundle, and disable them in the stage picker with one line of explanation ("not available in the app yet"). Keep the Python adapters — the worker still supports all four. Add a server-side guard so a route cannot be set to a client-incapable vendor for `stt`/`stt_backup`.
**Prove:** a vitest/jest test that the picker refuses the vendor, a pytest that the API rejects the route, and `pnpm test`.
**Gate:** none.

### B0.3 · No sample data in a real account's History or Playbook · S
**Why:** History hard-codes `outcome: "practice"` for every server call and labels the customer as `Call <date>` (`features/history/server.ts:42-50`, `features/call/local.ts:88`), then always appends the fictional sample calls from `features/history/mock.ts` (`app/history/index.tsx:14-31`). The Playbook renders `server.entries ?? samples` (`app/playbook.tsx:44`), so a loading or failed fetch shows another company's answers and hides the edit button.
**Touch:** `apps/app/app/history/index.tsx`, `apps/app/features/history/server.ts`, `apps/app/app/playbook.tsx`.
**Do:** when signed in to a server, never fall back to sample rows — show an empty state ("No calls yet" / "Add your first answer"). Show the samples only in the demo build (`demoEnabled()`). Derive the outcome from the call's own data instead of the constant.
**Prove:** jest tests rendering History and Playbook signed-in with no data — assert "Palm Grove" appears nowhere and the empty state does; and that the demo build still shows samples.
**Gate:** none.

### B0.4 · Navigating away must not end a live call, and End must ask · S
**Why:** the call lives in the screen's effect, so unmounting closes it (`features/call/useCallSession.ts:84-88` → `call.ts:203-206`). Opening History mid-call or a back gesture kills the session. The End button ends on one tap with no confirmation (`features/call/components/CallHeader.tsx:56-58`).
**Touch:** `apps/app/app/_layout.tsx`, `apps/app/features/call/useCallSession.ts`, `CallHeader.tsx`, `app/call.tsx`.
**Do:** hold the call session above the navigator (a provider mounted where `AccountGate` lives) so route changes keep it alive; end it only on an explicit action, on sign-out, or when the app closes. Add a confirmation before ending — a small dialog is better than a double-tap pattern; reuse the RN `Modal` approach the drawer already uses rather than adding a dependency. Keep the "usage is posted exactly once" guarantee.
**Prove:** jest test — start a call, navigate, call still live; press End, confirm, call ends and usage posts once.
**Gate:** none.

### B0.5 · Tell the agent when the plan blocks calls · S
**Why:** the banner is hidden on the call screen and for agents (`components/PlanBanner.tsx:36`), which are the two places a block actually bites. The agent learns by failing.
**Touch:** `apps/app/components/PlanBanner.tsx`, `app/call.tsx`.
**Do:** when the plan blocks calls, show a compact, non-dismissable line on the call screen and to agents: "Calls paused — <reason>. Ask your admin." Keep the existing banner elsewhere.
**Prove:** jest test for the blocked state on the call screen and for the agent role.
**Gate:** none.

### B0.6 · No environment-variable names in user-facing copy · S
**Why:** the call notice says "sample answers: add GROQ_API_KEY in Keys & providers for real AI" (`packages/engine/src/call.ts:67`; already noted at `docs/TRACKER.md:270`).
**Touch:** `packages/engine/src/call.ts` and its test.
**Do:** say "Real AI answers are off — ask your admin to connect a model." Name the provider on the Keys screen instead, where the admin is already looking.
**Prove:** the existing engine test updated, plus a check that no user-facing string contains `_API_KEY`.
**Gate:** none.

---

## 5. Batch 1 — latency correctness

Any item in this batch requires `pnpm replay --all` in the commit body, with before/after p50, p95 and holding rate.

### B1.1 · Remove the 150 ms settle before a sentence-ending final · S
**Why:** `SETTLE_MS = 150` (`packages/engine/src/spoken.ts:17`) waits after a final that already ends with punctuation, although the turn only ends after 300 ms of silence. It costs ~150 ms on every card.
**Touch:** `packages/engine/src/spoken.ts`, `engine.test.ts`.
**Do:** flush immediately when the pending final ends with `.`/`?`/`!`, keep the 400 ms tail wait for a final without punctuation, and keep the `midThought` hold. Add a test that a sentence-ending final is released without the extra wait.
**Prove:** engine tests and `pnpm replay --all` — expect p50 to drop and the card count *not* to rise (a split turn would add a card).
**Gate:** none.

### B1.2 · Give the primary model a real first-token budget · S
**Why:** `first_token_ms: 700` is an absolute deadline from the end of speech (`router.ts:231-234`), but the request only starts ~600 ms later, so the model gets ~100 ms before the backup fires. That is the 18% race rate in T-006.
**Touch:** `seed/models/default.yaml` (`suggest` only), then `pnpm gen` for the engine fixture.
**Do:** raise the `suggest` deadline to **1150 ms** and leave the holding line at 1400 ms. This is a value change, not a semantics change — do **not** redefine what `first_token_ms` means without a new decision entry (ARCHITECTURE §4 defines it; propose `D-025` if you want the better design).
**Prove:** `pnpm replay --all` with p50/p95 before and after; report the holding rate — if it rises, revert and report instead of forcing it.
**Gate:** none.

### B1.3 · Stop the keep-warm loop from eating the rate limit · S
**Why:** every call pings the vendor's `/models` every 25 s on the same key and the same quota (`call.ts:32,251`, `adapters/llm.ts:158-163`). Ten agents = ~24 warm requests/min against Groq's ~30/min free tier.
**Touch:** `packages/engine/src/call.ts`.
**Do:** warm once at call start, then every 120 s (the HTTP keep-alive is already 120 s). Keep the call-start warm.
**Prove:** unit test on the interval constant (assert it is ≥ the keep-alive), and a note in the commit that this is a quota fix.
**Gate:** none.

### B1.4 · Stop the replay from implying a measured R1 · S
**Why:** `pnpm replay --all` prints "R1 p95 ≤ 1500 ms: PASS" from a simulation with typed-in constants (`replay/synthetic.py:37-44`). The real end-to-end evidence is 4 cards (`docs/TRACKER.md:262`).
**Touch:** `apps/agent-worker/replay/__main__.py`, `replay/synthetic.py`.
**Do:** print `PASS (synthetic — not the R1 gate)` and one line saying real calls are required for the gate. Also report the number of turns where the backup was started and where it won. Keep exit code 0; do not weaken anything.
**Prove:** run it and paste the new output.
**Gate:** none.

---

## 6. Batch 2 — make the playbook answer the question

### B2.1 · Feed the top three entries to the model · M
**Why:** the matcher is lexical and misses most short questions: 8/17 realistic phrasings matched, and "How do I pay for it?" scores **0.000** against the payment entry (`packages/engine/src/playbook.ts:53-81`, `CONFIDENT = 0.42`). 45% of replay cards are holding lines as a result.
**Touch:** `packages/engine/src/session.ts` (`request()` and `runTurn()`), `packages/engine/src/playbook.ts`, `engine.test.ts`.
**Do:** when the direct lookup misses, put the **three nearest** entries into the existing `playbook.match` variable (question + short answer + details each, capped at ~600 characters total). Do **not** add a new prompt variable and do not rewrite the prompt; the model already knows how to use that slot. Keep the playbook card path unchanged — a card is still shown directly only at ≥ 0.42. Remove the duplicate lookup while you are there: `session.ts:233` and `session.ts:357` each run the full scan (already debt at `docs/TRACKER.md:231`) — compute once and pass it through.
**Prove:** an engine test where the question is below threshold but entry 2 contains the answer, asserting the prompt carries all three; plus `pnpm replay --all` with the holding rate before and after.
**Gate:** none.

### B2.2 · Report whether matching is getting better · S
**Why:** there is no quality metric, only latency. Without one, B2.1 cannot be evaluated and the next change is a guess.
**Touch:** `apps/agent-worker/replay/synthetic.py`, `replay/__main__.py`, `packages/engine/src/telemetry` (if needed).
**Do:** add to the replay summary: playbook-card share, holding share, mean top-1 score, and the share of customer turns whose top-1 score is below 0.42. No new dependency.
**Prove:** run it; paste the numbers with the R1 output.
**Gate:** none.

### B2.3 · Do not jump to embeddings yet
Embeddings are the right second step (`seed/models/default.yaml:69` is still `fake`), but measure B2.1 first. If the holding rate is still above ~20% after B2.1, propose an embedding provider as a normal change; do not add one speculatively.

---

## 7. Batch 3 — the manager promise

### B3.1 · An escalation must carry enough to answer it · S
**Why:** the client posts only the question (`features/call/local.ts:104`); the server stores company, user, question (`cloud/store.py:835-852`). R2 requires customer, question, transcript excerpt, CRM link and agent.
**Touch:** `features/call/local.ts`, `cloud/app.py`, `cloud/store.py`, `apps/app/app/inbox.tsx`.
**Do:** send `transcript_excerpt` (the session already builds one at `session.ts:340-346`), the agent id and the call id; store them; show the excerpt in the inbox under the question. Cap the excerpt (the 2000-char line cap already exists).
**Prove:** pytest that the row stores and returns the excerpt; jest that the inbox renders it; `pnpm test`.
**Gate:** none.

### B3.2 · Email the sales manager within a minute · M **[OWNER]**
**Why:** R2 step 4 requires it; on the live path **nothing sends email**. The Resend adapter and outbox exist and are tested, but only the retired Supabase path used them (`sotto_worker/outbox/`, `adapters/email/resend.py`).
**Ask the owner first:** a Resend account, the from-address, and which address receives escalations (manager per company, or a company alias).
**Touch:** `cloud/app.py` (escalation route), `sotto_worker/outbox/`, `sotto_worker/adapters/email/resend.py`, `cloud/store.py` (manager email + settings).
**Do:** on escalation, enqueue exactly one email per escalation (idempotency key = escalation id) with the question, excerpt, agent and a link to the inbox; retry with the existing backoff; log a failure and never block the call. No email when the company has no manager address — log it instead. Add the address to Admin → Settings.
**Prove:** pytest with the fake email adapter asserting exactly one message per escalation and the retry path; a manual send is **not** required.
**Gate:** **[OWNER]** — account, sender, recipient.

---

## 8. Batch 4 — first value

### B4.1 · Tell a phone user the truth · S
**Why:** native capture does not exist yet (`mic.ts` needs `navigator.mediaDevices`), but the phone shows "Start listening" and fails (`app/call.tsx:139-141`).
**Touch:** `apps/app/app/call.tsx`, `ListenStart.tsx`, i18n strings.
**Do:** on iOS/Android, replace the start panel with: "Live calls in the phone app arrive with phone calling (Phase 4). Use the Mac or Windows app today." plus a link to the downloads page. Keep the panel on web and desktop.
**Prove:** jest test on the native branch (mock `Platform.OS`).
**Gate:** none.

### B4.2 · Guided key setup · S
**Why:** a new company must create a Groq account and an AssemblyAI account and paste two keys before any call works; no screen guides them (`P7` in the review, 15–30 minutes).
**Touch:** `apps/app/app/admin/keys.tsx`, `lib/i18n.ts`.
**Do:** on first run (no keys), show a short three-step checklist at the top of Admin → Keys & providers: 1) connect a suggestion model, 2) connect speech-to-text, 3) add one playbook answer — each with the existing "Get a key" link and a green tick when done. Reuse the catalogue copy; do not invent new instructions.
**Prove:** jest test that the checklist appears with no keys and disappears when both are set.
**Gate:** none.

### B4.3 · A 60-second demo call · M **[OWNER]**
**Why:** the fastest "aha" is a card appearing with no setup. It currently cannot exist because a real account has no sample content (D-024).
**Ask first:** is a clearly-labelled practice call acceptable inside a real account, or should it stay on the sign-in screen only? D-024 deliberately removed demo data from real accounts, so this is a decision, not a detail.
**Do (only after a yes):** a recorded/scripted customer with three questions, labelled "Practice — sample customer", available before any key is added. Keep it out of History and out of the usage numbers.

---

## 9. Batch 5 — the admin screens must stop lying

### B5.1 · Wire Admin → Team to the real API · S
**Why:** it renders fictional staff (`palmgrove.example`) and its Invite button has no handler (`app/admin/index.tsx:4,24`), while `GET/POST /api/v1/team` already exists (`cloud/app.py:735-737`) and the Account page already uses it (`app/account.tsx:178`).
**Touch:** `apps/app/app/admin/index.tsx`.
**Do:** load `GET /api/v1/team`, wire Invite to the same `POST /api/v1/team` the Account page calls, and keep the Account page working. Remove the mock import.
**Prove:** jest with a fake API — the list renders server data and Invite posts; and the mock data is no longer imported by any screen.
**Gate:** none.

### B5.2 · Do not show a prompt screen that discards edits · S (or M to persist)
**Why:** the prompt studio is an in-memory store (`features/prompts/store.tsx:1`); edits vanish and never reach a call. The cloud store has no prompt table.
**Touch:** `apps/app/app/admin/_layout.tsx`, `app/admin/prompts/*`.
**Do (smallest):** hide the Prompts and Models tabs behind a "Coming in a later phase" note, or remove them from the tab list, and add a tracker entry. **Do not** leave a screen that accepts edits and silently drops them.
**Better, only if you have the time and a server migration:** persist `prompt_versions` and have `build_bundle` ship the published body. That is a real feature; scope it as its own task.
**Prove:** a test asserting the removed/hidden tab, or (for persistence) a round-trip test publish → bundle → next call.
**Gate:** none.

### B5.3 · Models screen: wire it or hide it
Same rule as B5.2. The real per-stage benchmark lives in Admin → Keys & providers ("Measure speed"); a second mock table of stage p95s (`app/admin/models.tsx:1-4`) is a duplicate that lies. Hide it unless you wire it to the measured data.

---

## 10. Batch 6 — engineering hygiene

### B6.1 · Give the shipped engine a coverage floor · S
**Why:** the 90% floor covers the Python worker; the live engine has no coverage tool at all (`CONSTRAINTS.md:35`). It is 2,815 lines with 23 tests.
**Touch:** `packages/engine/package.json`, `vitest.config`, `CONSTRAINTS.md`, `docs/TRACKER.md`.
**Do:** add `@vitest/coverage-v8`, a `test:coverage` script and a **80%** statements/branches floor (90% at Phase 8), and wire it into `pnpm test`. Record the new bar in `CONSTRAINTS.md` with a tracker entry. This raises the bar, never lowers one.
**Prove:** `pnpm test` shows the floor passing, and a deliberately uncovered branch fails locally (revert that probe).
**Gate:** none.

### B6.2 · Make the engine tests deterministic · S
**Why:** `engine.test.ts` sleeps on the real clock (2200 ms twice, plus 250/700 ms waits), 6.5 s per run, and the tracker already records one unexplained flake.
**Touch:** `packages/engine/src/engine.test.ts`.
**Do:** inject the existing `Clock` fake (`types.ts`) instead of `realClock.sleep`; keep one small integration test that exercises real timers end to end. Target: the suite under 2 s.
**Prove:** three consecutive runs, same count, and the timing.
**Gate:** none.

### B6.3 · The web bundle is at 430/450 KB · **[OWNER]**
Do not silently raise the budget. Present the owner with the choice: raise it (a decision entry), cut zod from the client bundle, or lazy-load the call screen. Phase 4 needs room for LiveKit and there are 20 KB left.

---

## 11. Batch 7 — do not start without an explicit yes

| Item | Why it is gated | What the owner must decide |
|---|---|---|
| **Sign + notarise the desktop app, add auto-update** | Money (Apple Developer, Windows certificate) and a release-process change | Budget and who holds the certificates |
| **Replace device keys with a server-side LLM proxy** | Changes D-022's "calls run on the device" for the LLM step; affects cost and privacy | Whether model calls may pass through Sotto's server |
| **Off-box database backup + restore drill** | Needs a second location and possibly money | Where the copy lives |
| **Sotto-funded trial keys (~$1 per trial)** | Spends money on the owner's provider accounts | Budget and cap |
| **Team analytics / coaching** | Conflicts with D-022 (calls never reach the server) | Whether calls may be uploaded, and with what consent |
| **Multi-language cards** | Conflicts with D-018 (cards are English) | Whether to supersede D-018 |
| **Pricing and trial changes** | Business decision | Price, trial limits, what a plan includes |

---

## 12. Do not build (and why)

- **Emotion or sentiment scoring of the buyer.** Workplace emotion recognition is prohibited under the EU AI Act. "Objection topics over time" is fine; "how happy was the buyer" is not.
- **Naive drafting on partial transcripts.** It was tried and correctly rejected on data: at the 300 ms cut the partial is missing the last 1–3 words on every vendor (`docs/TRACKER.md:241`). A tail-checked version is a later, separate proposal.
- **Embeddings before B2.1 is measured.** Measure first.
- **A model call in the `trigger` stage** to "use" the configured stage. It would add latency to every turn; the regex rules are instant. If you change this, it is a latency experiment with a replay number attached, not a cleanup.
- **Anything that changes the 1.5 s target, the replay gate, or a coverage/contrast/bundle threshold.**
- **New provider SDK imports outside `adapters/`, or model names in app code.**
- **Deleting the Supabase migrations or the Python worker.** They are not dead: the worker is the reference implementation and Phase 4 may need it.

---

## 13. Report format (per batch)

```
Batch N — <name>
Items: B<N>.<x>, B<N>.<y>          (tracker T-0NN, T-0NN)
Commits: <sha>..<sha>
Tests:   pnpm test -> <counts>; typecheck; lint
Replay:  p50 <x> / p95 <y> ms, holding <z>%   (only if the pipeline changed)
Screens: <paths> (only if UI changed)
Left open: <anything you chose not to do, and why>
```

**Definition of done for the whole brief:** every Batch 0–2 item merged with its test; Batch 3 and 5 complete or explicitly parked by the owner; the replay still under 1500 ms p95 with a lower holding rate than 21 Oct; `pnpm typecheck && pnpm lint && pnpm test` green; `docs/TRACKER.md` updated with one `T-0NN` line per item.

## 14. If you only have one or two days

**One day:** B0.1, B0.2, B1.1, B1.2 — in that order. That removes the worst privacy defect, the most confusing admin failure, and two real latency costs; each has a test and a number attached.

**Two days:** add B2.1, the biggest quality weakness. Do not start B2.1 without a replay baseline, because its whole value is the before/after holding rate.
