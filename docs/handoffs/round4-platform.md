# Round 4 Handoff — Agent 4: Platform safety net, logging, local models, setup guide

- **Branch:** `round4/platform` (from snapshot commit `7baf81e` of `main` `9b5071b`)
- **Merge order:** First (`4 → 2 → 1 → 3`)
- **Decision numbers used:** `D-130` – `D-136`
- **Feature IDs added:** `call_logs_github` (off), `local_models_text` (off), `local_models_voice` (off), `setup_guide` (on)

---

## 1. What is done (per acceptance test, with verified output)

### Task 1 — Safety net (S2, S4)
- **`apps/app/components/SafeBoundary.tsx`**: Shared React error boundary (`<SafeBoundary name="…">`) rendering `"This part didn't load"` + **Retry** button and logging error metadata via `obs.ts`.
  - Wrapped app root & screens in `apps/app/app/_layout.tsx` (`app.root`, `screen`).
  - Isolated live cards (`call.cards`) and side panel (`call.rail`) in `apps/app/app/call.tsx` so a failing side panel does not take down the live card area.
- **`apps/app/lib/obs.ts`** & **`apps/agent-worker/sotto_worker/cloud/obs/log.py`**: Exact §3.4/§3.5 `logEvent()` / `log_event()` contracts, metadata-only with strict key and regex redaction (strips transcripts, customer names, phones, emails, API keys/tokens while keeping numeric counts such as `tokens_in`/`tokens_out`).
- **`apps/app/lib/cloud.ts`** (exported `request`) & **`apps/app/lib/server.ts`**: Timeout (`AbortController`, default 15 s) on every request, ≤ 2 retries with growing waits (`300 ms`, `900 ms`) for idempotent requests only (`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`, or explicit `idempotent: true`; never retries `POST` by default), plain user-facing error messages, offline state tracking (`isOffline`, `subscribeOffline`), and automatic outbox flush on reconnect.
- **`apps/app/components/OfflineBanner.tsx`**: Offline banner wired into `ShellBanner` (`apps/app/components/AppShell.tsx`).
- **`apps/app/lib/outbox.ts`**: Persistent offline queue `enqueue(kind, payload)` with `dedupeKey`, single-flight `flushOutbox()` (no duplicate sends), survives restarts, auto-flushes on `online`.
- **`apps/app/lib/pipelineSupervisor.ts`**: Event-driven mid-call pipeline drop supervisor — emits `"Reconnecting…"` and resumes the same `callId` within ≤ 3 s (`[200, 500, 1000] ms` backoff). No edits to `pipeline/`.
- **`apps/desktop/crash-safety.cjs`** (wired into `main.cjs`, `preload.cjs`, `desktop.ts`, and `package.json` `build.files`):
  - `uncaughtException` & `unhandledRejection` handlers.
  - `render-process-gone` & `did-fail-load` auto-reload with saved route/call recovery state and reload-loop guard.
  - Redacted critical-error disk log (`<userData>/logs/safety.log`, ≤ 5 MB / 7 days, L5).

**Verification:**
- `apps/app/__tests__/safe-boundary.test.tsx`: **2/2 passed** (error fallback + Retry recovery, live-card isolation from failing side panel).
- `apps/app/__tests__/network-safety.test.ts`: **6/6 passed** (obs redaction, idempotent retry vs non-idempotent POST, timeout abort + plain message, persistent outbox dedupe + single-flight flush, `PipelineSupervisor` ≤ 3 s reconnect).
- `apps/agent-worker/tests/cloud/test_obs_log.py`: **4/4 passed** (`log_event` contract + redaction).
- `apps/desktop/test/crash-safety.test.cjs` (+ full desktop suite): **34/34 passed** (including `packaged-files.test.cjs`).

### Task 2 — Speed budgets (S1)
- Added all 5 S1 budgets to `CONSTRAINTS.md`: cold start ≤ 3 s, screen/tab switch ≤ 300 ms, card render after first token ≤ 100 ms, call memory ≤ 500 MB, call CPU avg ≤ 25 %.
- Created `scripts/perf/measure-desktop.mjs` and `scripts/perf/measure-desktop.test.mjs` (**3/3 passed**).

### Task 3 — Launch test (S3) + CI + Intel Mac removal (D-097)
- Created `apps/desktop/test/launch.mac.mjs` (Apple chip macOS `.app`) and `apps/desktop/test/launch.win.mjs` (Windows `.exe`).
- Gated `deploy/publish-apps.sh` on `launch.mac.mjs` so publishing refuses if the launch test fails.
- Added `desktop` job to `.github/workflows/ci.yml` running `apps/desktop` unit + `packaged-files` tests, `downloads-manifest.test.mjs`, and `measure-desktop.test.mjs`.
- Removed Intel Mac (`x64`) from `apps/desktop/package.json` (`build.mac.target[0].arch = ["arm64"]`, `watcher` builds `arm64` only, `dist` targets `--mac --win`) and `scripts/downloads-manifest.mjs` + `scripts/downloads-manifest.test.mjs` (**2/2 passed**). No server files deleted.

### Task 4 — Local safety copy (L5)
- Always-on redacted critical-error log (≤ 5 MB / 7 days) in `<userData>/logs/safety.log` (desktop) and `localStorage` fallback (web), plus `"Copy diagnostics"` button in `apps/app/features/support/BugReport.tsx`.

### Task 5 — Call logs to GitHub (L3, L4, D-095, D-098)
- Added Agent 4 feature IDs to `apps/agent-worker/sotto_worker/cloud/features.json`, `apps/app/features/flags/catalog.ts`, and `apps/app/features/flags/strings.ts`.
- Built D-095 per-user owner override in `apps/agent-worker/sotto_worker/cloud/features.py` restricted strictly to `PER_USER_OVERRIDE_IDS = {"call_logs_github", "local_models_text", "local_models_voice"}`.
- Created tenant-isolated `apps/agent-worker/sotto_worker/cloud/obs/store.py`, `apps/agent-worker/sotto_worker/cloud/obs/call_logs.py`, extended `apps/agent-worker/sotto_worker/cloud/github.py` (`create_log_issue`, `comment_on_log_issue`), and added owner console `apps/agent-worker/sotto_worker/cloud/owner/logs.{py,html,js}`.
- Verified with fake GitHub client (`tests/cloud/test_call_logs_github.py` + `test_features.py`): **27/27 passed** across obs, call logs, local models, and features (redaction, `healthy` closed vs `needs-attention` open, fingerprint dedupe, 60k body + ≤ 5 comments oldest-cut split, switch off → nothing sent, per-user override, audit entries, tenant isolation).

### Task 6 — Local / offline models (L6, D-096)
- Added `local_openai`, `local_stt`, `local_tts` templates under top-level `local_providers:` in `seed/models/providers.yaml` (preserving `Catalog.load`'s `https://` check on cloud `providers:`).
- Created tenant-isolated `apps/agent-worker/sotto_worker/cloud/routing/local_models.py`, owner console `cloud/owner/local_models.py` + `local-models.{html,js}`, and user settings UI `apps/app/features/settings/LocalModelsSettings.tsx`.
- Verified (`tests/cloud/test_local_models.py` + `setup-guide.test.tsx`): Test + benchmark (fast vs slow vs unreachable), fast → live allowed, slow → slow jobs only unless opted in, opt-in → 1.5 s holding line + `"local model – slower"` badge + excluded from p95 alarm, mid-call failure → cloud backup vs holding line per company setting (default on) + metadata-only `obs` logging, tenant isolation.
- Replay check (`pnpm replay --all`): **p50 576 ms, p95 978 ms ≤ 1500 ms (PASS)**, R4 agent-triggered cards: 0 (PASS), R2 drill p95 1270 ms (PASS).

### Task 7 — Setup guide (L2)
- Created `apps/app/app/admin/setup.tsx` (role-aware `SetupGuideView`, wrapped in `<SafeBoundary name="admin.setup">`) with plain-language `"what this does"`, recommended default, live status, **Test it** buttons, and **Fix it** links.
- Extended `apps/app/features/home/setup.ts` and `apps/app/features/home/SetupChecklist.tsx` (links into `/admin/setup`; existing tours `Tutorial.tsx` and `AdminTour.tsx` untouched).
- Added 1-line `"Setup guide"` menu link to `apps/app/app/admin/_layout.tsx` (per master §3.7).
- Created owner setup guide `apps/agent-worker/sotto_worker/cloud/owner/setup.{py,html,js}`.
- Verified (`apps/app/__tests__/setup-guide.test.tsx` + `home-first-run.test.tsx` + `admin-desktop-tabs.test.tsx`): **26/26 passed**.

### Full Gate Summary
- `pnpm typecheck` (all 5 TS packages + `mypy --strict` across 239 Python files): **PASS (0 errors)**
- `ruff check` on all touched/new Python files: **PASS (0 errors)**
- `@sotto/app` Jest tests (7 suites, 74 tests): **74/74 PASS**
- `apps/agent-worker` pytest (obs + call logs + local models + features): **27/27 PASS**
- `apps/desktop` Node tests: **34/34 PASS**
- `scripts/downloads-manifest.test.mjs` + `scripts/perf/measure-desktop.test.mjs`: **5/5 PASS**
- `pnpm replay --all`: **p50 576 ms / p95 978 ms (PASS)**

---

## 2. What is not done / not verified here (and why)

1. **Packaged Apple-chip macOS build, baseline perf numbers, & macOS launch test**: This offline agent ran on Linux x86_64 without macOS/Xcode/Electron binary packaging. `scripts/perf/measure-desktop.mjs` and `apps/desktop/test/launch.mac.mjs` are written and unit-tested (`measure-desktop.test.mjs`), ready for the Mac merger to run against the packaged Apple-chip `.app`.
2. **Windows launch test execution**: `apps/desktop/test/launch.win.mjs` is written; requires a Windows machine/runner.
3. **Screenshots (light/dark, 390/1280, LTR/RTL) & `pnpm a11y` (Playwright/Chromium)**: Playwright browser binaries were not downloaded in this offline VM; all new UI uses `@sotto/ui` tokens/components with semantic roles and RTL-safe styles. Run `pnpm --filter @sotto/app export:web && pnpm a11y` on the merger machine.
4. **Live GitHub API call & live Ollama/Whisper/TTS server**: Tested with deterministic `httpx.MockTransport` fakes per master §0 ("Never fake a live test").

---

## 3. Assumptions, Stubs, and Minimal Shared-File Touches

- **No `STUB(agent-N)` markers needed**: Agent 4 provides the shared building blocks (`SafeBoundary`, `obs`, `outbox`, `request`) that Agents 1–3 consume.
- **`ASSUMPTION:` (D-130 / `seed/models/providers.yaml`)**: Placed local endpoint templates (`local_openai`, `local_stt`, `local_tts`) under a top-level `local_providers:` key rather than cloud `providers:` so `Catalog.load`'s `https://` URL validation on cloud providers remains strictly enforced.
- **`ASSUMPTION:` (D-131 / `apps/agent-worker/sotto_worker/cloud/owner/local_models.py`)**: Python module filename uses underscore (`local_models.py`) alongside `local-models.html` / `local-models.js` so Python imports work cleanly.
- **Minimal shared-file touches (outside new files)**:
  - `apps/app/app/call.tsx`: Wrapped `<CardStack />` in `<SafeBoundary name="call.cards">` and `<CrmRail />` in `<SafeBoundary name="call.rail">` (did not edit `CardStack.tsx` or `CrmRail.tsx`).
  - `apps/app/components/AppShell.tsx`: Added 2 lines in `ShellBanner` to display `useOfflineBanner()`.
  - `apps/app/app/admin/_layout.tsx`: Added 1 menu link line for `/admin/setup` (permitted by master §3.7).
  - `apps/app/features/flags/catalog.ts` & `strings.ts`: Added Agent 4's 4 feature IDs so `test_the_app_reads_the_same_catalog_file` and strict TS `Record<FeatureId, string>` stay green.
  - `apps/app/features/support/BugReport.tsx`: Added `"Copy diagnostics"` button (L5).
  - `apps/agent-worker/tests/cloud/test_features.py`: Added Agent 4's 4 feature IDs to the catalog/default-off assertions and explicit kwargs in `layers()` for `mypy --strict`.

---

## 4. Proposed Decisions (`D-130` – `D-136`) & Tracker Lines

### Proposed Decisions
- **D-130 (Local provider seed section):** Store self-hosted HTTP/LAN provider templates (`local_openai`, `local_stt`, `local_tts`) under top-level `local_providers:` in `seed/models/providers.yaml` so cloud `providers:` keeps strict `https://` validation.
- **D-131 (Obs redaction allowlist):** Allow numeric token-size counters (`tokens_in`, `tokens_out`, `request_bytes`, `response_bytes`) in `obs` logs while stripping auth tokens (`access_token`, `refresh_token`, `auth_token`, `auth_header`, `token`) and PII/transcript keys.
- **D-132 (Idempotent-only network retries):** `cloud.ts` `request()` and `server.ts` `api()` apply a 15 s `AbortController` timeout and ≤ 2 retries (`300 ms`, `900 ms`) only for idempotent HTTP methods (`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`) or explicit `idempotent: true`; `POST` is never retried automatically.
- **D-133 (Single-flight persistent outbox):** `apps/app/lib/outbox.ts` persists queued items with optional `dedupeKey` and serializes `flushOutbox()` through a single-flight promise so reconnects never send duplicate follow-ups or feedback.
- **D-134 (Desktop crash reload loop guard):** `apps/desktop/crash-safety.cjs` caps automatic renderer reloads at 5 per minute to prevent infinite crash loops while preserving active route/call recovery state on transient crashes.
- **D-135 (Event-driven pipeline recovery):** Mid-call pipeline drops are coordinated through `PipelineSupervisor` (`apps/app/lib/pipelineSupervisor.ts`) with `[200, 500, 1000] ms` backoff (≤ 3 s total), leaving `pipeline/` untouched.
- **D-136 (D-095 per-user override enforcement):** `cloud/features.py` restricts `Layers.user_overrides` strictly to `PER_USER_OVERRIDE_IDS = {"call_logs_github", "local_models_text", "local_models_voice"}` and `cloud/obs/store.py` rejects any other feature ID with `CloudError("invalid")`.

### Proposed Tracker Lines
- `R4-P1` Platform safety net (`SafeBoundary`, `obs`, `outbox`, timeouts/retries, offline banner, Electron crash recovery, pipeline supervisor) — **Done** (verified on `round4/platform`).
- `R4-P2` S1 desktop speed budgets in `CONSTRAINTS.md` + `scripts/perf/measure-desktop.mjs` — **Done** (baseline measurement pending Mac arm64 build).
- `R4-P3` S3 launch smoke tests (`launch.mac.mjs`, `launch.win.mjs`), `publish-apps.sh` gate, CI `desktop` job, Intel Mac `x64` removal (D-097) — **Done** (live launch pending Mac/Windows build).
- `R4-P4` L5 local redacted safety copy (≤ 5 MB / 7 days) + Help `"Copy diagnostics"` — **Done**.
- `R4-P5` L3/L4 automatic GitHub call logs + D-095 per-user overrides + owner console `logs.*` — **Done** (live repo pending owner to-do).
- `R4-P6` L6/D-096 local/offline models (text/STT/TTS, benchmark, slow opt-in, cloud backup fallback, owner console `local-models.*`) — **Done**.
- `R4-P7` L2 role-aware Setup Guide (`admin/setup.tsx`, `cloud/owner/setup.*`, `features/home/setup.ts`, `SetupChecklist.tsx`) — **Done**.

---

## 5. Exact Commands for the Merger

```bash
# 1. Fetch and merge round4/platform first (before Agents 2, 1, 3)
git fetch ./round4-platform.bundle round4/platform:round4/platform
git merge round4/platform

# 2. Full typecheck, lint, tests, and replay
pnpm typecheck
pnpm lint
pnpm test
pnpm replay --all

# 3. Desktop tests, manifest, and perf budget tests
(cd apps/desktop && npm test)
node --test scripts/downloads-manifest.test.mjs scripts/perf/measure-desktop.test.mjs

# 4. Web export + bundle size + a11y + screenshots (light/dark, 390/1280, LTR/RTL)
CI=1 EXPO_OFFLINE=1 pnpm --filter @sotto/app export:web
python3 scripts/check_bundle_size.py apps/app/dist
pnpm a11y

# 5. On Apple-chip Mac: package, launch test, and record S1 perf baseline
(cd apps/desktop && npm ci && npm run web && npm run dist:mac)
node apps/desktop/test/launch.mac.mjs
node scripts/perf/measure-desktop.mjs --json

# 6. On Windows test machine: package & run Windows launch test
# (cd apps/desktop && npm ci && npm run web && npm run dist:win)
# node apps/desktop/test/launch.win.mjs
```

---

## 6. Owner To-Dos (Hasan)

1. **Create private GitHub logs repo & fine-grained PAT** (e.g. `Hasdro/sales-shield-logs` with `Issues: Read & Write` scope) and enter it in Owner Console → Call Logs (`/owner/logs.html`).
2. **Windows test machine / runner**: Run `apps/desktop/test/launch.win.mjs` against the 0.7.0 Windows installer before publishing.
3. **Apple-chip Mac baseline**: Record the first packaged S1 perf baseline (`node scripts/perf/measure-desktop.mjs --json`) during the 0.7.0 merge.
