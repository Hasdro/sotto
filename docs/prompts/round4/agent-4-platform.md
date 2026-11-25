# Round 4 — Agent 4: Platform safety net, logging, local models, setup guide

You are one of **four agents working at the same time** on separate offline copies of this repo. The others build: Agent 1 live cards (prompt, tone, call state), Agent 2 the post-call wizard and style memory, Agent 3 the voice coach and prep coach. Your shared building blocks (`SafeBoundary`, `obs`, `outbox`, timeouts) are what the others use, so **do task 1 first** and keep its interfaces exactly as in master §3. Your branch merges first.

**Read first:** `docs/prompts/round4/00-master.md`, then `CLAUDE.md`, `docs/REQUIREMENTS.md` (R1, R3, R5a, R6, R7), `CONSTRAINTS.md`, `apps/desktop/` README if any.
Branch: `round4/platform`. Decision numbers: D-130 – D-139. Feature IDs: `call_logs_github`, `local_models_text`, `local_models_voice` (**off**), `setup_guide` (on).

## What exists today (checked 25 Nov)
- **No** React error boundaries anywhere in `apps/app` (the live call screen `apps/app/app/call.tsx` has none).
- `apps/app/lib/cloud.ts` `request()` (~316-345): fetch with **no timeout**, no backoff; network errors map to `CloudError "offline"`; offline start keeps the profile (~490-501); GET cache 30 s (~271-291). `apps/app/lib/server.ts` `api()` has no timeout.
- `apps/desktop/main.cjs`: **no** `uncaughtException`, `unhandledRejection`, `render-process-gone`, `did-fail-load` handlers; **no** disk log. CI (`.github/workflows/ci.yml`) has no desktop job; 0.6.0 crashed at launch.
- `CONSTRAINTS.md`: web bundle ≤ 450 KB gz (`scripts/check_bundle_size.py`), replay p95; no startup/memory/CPU budgets.
- Features: `cloud/features.json`, `cloud/features.py`, tables in `cloud/store.py`; admin `apps/app/app/admin/features.tsx`; owner `cloud/owner/`. GitHub issues: `cloud/github.py`, `cloud/bugreports.py`. Router: `cloud/routing/`, `seed/models/*.yaml`. Home checklist: `apps/app/features/home/setup.ts`, `SetupChecklist.tsx`; tours `components/Tutorial.tsx`, `AdminTour.tsx`.

## Your tasks (in order, tests first)
1. **Safety net (S2, S4) — first.**
   - `apps/app/components/SafeBoundary.tsx` ("This part didn't load – Retry"); wrap the app root (`apps/app/app/_layout.tsx`) and every existing screen you can without editing other agents' files (they wrap their own).
   - `apps/app/lib/obs.ts` `logEvent()` and server `cloud/obs/log.py` `log_event()` (master §3.4), metadata only, with a redaction test.
   - `cloud.ts` and `server.ts`: timeout on every call, ≤ 2 retries with growing waits (idempotent requests only), plain messages; offline banner; `apps/app/lib/outbox.ts` `enqueue(kind, payload)` that survives restarts and sends when online.
   - Electron: crash handlers, renderer auto-reload with state restore, disk log; worker/audio pipeline restart resuming the same call within 3 s with "Reconnecting…" (coordinate through events, not by editing `pipeline/` — if you must touch `pipeline/`, keep it to a restart hook and list it in the handoff).
2. **Speed budgets (S1).** Add to `CONSTRAINTS.md`: cold start ≤ 3 s, screen switch ≤ 300 ms, card render ≤ 100 ms after first token, call memory ≤ 500 MB, call CPU avg ≤ 25 %. A script (`scripts/perf/`) that measures them on the packaged Apple chip app; report baseline numbers.
3. **Launch test (S3) + CI.** A test that launches the packaged app, reaches sign-in, quits; publishing (`deploy/publish-apps.sh`) refuses if it fails. Add a desktop job to CI. Build targets: Apple chip Mac + Windows; remove Intel Mac (x64) from the desktop build config and the downloads manifest (D-097). Do not delete files on any server.
4. **Local safety copy (L5).** Critical errors only, redacted, ≤ 5 MB / 7 days, in the app's data folder; queue for upload; "Copy diagnostics" in Help.
5. **Call logs to GitHub (L3, L4).** One issue per call, no approval, to the logs repo set in the owner console (`cloud/owner/logs.*`); reuse `cloud/github.py`. Contents and exclusions exactly as master L3; `healthy` closed at once vs `needs-attention` open; background-failure issues deduplicated by fingerprint; body ≤ 60 000 chars + ≤ 5 comments, oldest cut first and marked. Owner-only switch per company and per user (user inherits unless overridden), default off, audit-logged. Build the per-user owner override (D-095) in `features.py` for these three IDs only. Test with a fake GitHub client.
6. **Local / offline models (L6).** Router support for local endpoints: OpenAI-compatible text, local speech-to-text, local text-to-speech; per company and per user, text and voice separately, default off, owner-enabled (`cloud/owner/local-models.*`). User settings: URL field, **Test** (reachability + short benchmark), status "connected ✓ / unreachable". Meets R1 → may drive live cards; else used for slow jobs only, unless the user opts in "use it for live cards anyway" after a warning with the measured delay (D-096: holding line at 1.5 s, local card replaces it, "local model – slower" badge, excluded from the p95 alarm but measured). Mid-call failure → cloud backup if the company's "Allow cloud backup" (owner-set, default on) is on, else holding line. Log every fallback. Run the replay with a local stub endpoint.
7. **Setup guide (L2).** `apps/app/app/admin/setup.tsx` (+ agent view) and owner `cloud/owner/setup.*`: steps per role in plain words, **Test it** buttons, live status, "Fix it" links; every setting gets a one-line "what this does" + recommended default (you may add these lines to existing admin screens you do not otherwise change; list them). The home checklist grows into it; tours stay.

## Owned files
`apps/app/components/SafeBoundary.tsx`, `apps/app/lib/obs.ts`, `lib/outbox.ts`, `lib/cloud.ts`, `lib/server.ts`, `apps/app/app/_layout.tsx`, `apps/desktop/`, `.github/workflows/`, `scripts/perf/`, `deploy/publish-apps.sh`, `cloud/obs/` (new), `cloud/github.py`, `cloud/features.py`, `cloud/routing/`, `seed/models/providers.yaml`, `cloud/owner/logs.*`, `local-models.*`, `setup.*`, `apps/app/app/admin/setup.tsx`, `features/home/setup.ts`, `SetupChecklist.tsx`, the budget lines in `CONSTRAINTS.md`, your block in `features.json`.

**Do not touch:** `pipeline/` (except a restart hook), `suggest.md`, `CardStack.tsx` (1), `features/postcall/`, `features/review/`, `cloud/memory/`, `cloud/learning/` (2), `CrmRail.tsx`, `cloud/coach/` (3).

## Acceptance (evidence in your handoff)
- A thrown error in any wrapped screen shows Retry, not a blank app; the live card area survives a failing side panel (test).
- Timeouts + retries tested with a fake server; offline queue survives restart and sends once online with no duplicates.
- Electron crash → reload with state; pipeline drop → same call resumes ≤ 3 s (test or scripted demo).
- Perf script numbers vs budgets; launch test passes on the packaged Apple chip build; Windows launch test written (run by merger if no Windows here).
- Logs: redaction test (no transcript, names, phones, emails, keys); healthy vs needs-attention labels; dedupe; size split; switch off → nothing sent; per-user override; audit entries.
- Local models: Test + benchmark; fast → live allowed; slow → slow jobs only unless opted in; opt-in shows holding line then local card with badge; failure → cloud backup / holding line per setting. Replay p95 with the cloud path unchanged.
- Isolation tests for every new table. Screenshots of setup guide, owner log/local-model screens, error and offline states: light/dark, 390/1280, LTR/RTL; axe 0 serious.
- Owner to-dos: create the private logs repo and token; Windows test machine.
