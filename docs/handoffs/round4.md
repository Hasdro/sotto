# Round 4 Merge Handoff (`0.7.0`)

- **Date:** 2026-11-26
- **Branch:** `main` (merged in order `4 → 2 → 1 → 3`: `round4/platform` → `round4/wizard-memory` → `round4/live-cards` → `round4/voice-coach`)
- **Version:** `0.7.0` (`apps/desktop/package.json`, `apps/app/lib/cloud.ts`)
- **Decisions recorded:** `D-094`–`D-099` (Master), `D-100`–`D-102` (Agent 1), `D-110`–`D-113` (Agent 2), `D-120`–`D-123` (Agent 3), `D-130`–`D-136` (Agent 4).
- **Requirements updated (`docs/REQUIREMENTS.md`):** R1 (`D-096` slow local model opt-in), R5a (`D-097` Apple-chip Mac + Windows only from `0.7.0`), R7 (`D-095` owner-only per-user overrides for `call_logs_github`, `local_models_text`, `local_models_voice`).

## 1. Workstreams Merged

1. **Agent 4 (`round4/platform`) — Platform Safety Net, Setup, Call Logs & Local Models (`P1`–`P4`, `S1`–`S4`, `L1`–`L6`)**
   - `SafeBoundary`, `obs.ts` / `cloud/obs/log.py` redacted metadata logger, persistent single-flight `outbox.ts`, 15 s idempotent-only retry `request()` / `api()`, `ownerFetch` 15 s timeout, offline banner, `crash-safety.cjs` reload guard, `PipelineSupervisor`.
   - `CONSTRAINTS.md` S1 desktop budgets (`3000 ms` cold start, `300 ms` screen switch, `100 ms` card render, `500 MB` call RAM, `25%` call CPU) + `scripts/perf/measure-desktop.mjs`.
   - S3 launch smoke tests (`launch.mac.mjs`, `launch.win.mjs`), Intel `x64` Mac removal (`D-097`), `publish-apps.sh` launch gate, CI `desktop` job.
   - L2–L6: Role-aware Setup Guide (`/admin/setup`, `/setup`, `/owner/setup.html`), local safety logs (≤ 5 MB / 7 days) + `"Copy diagnostics"`, automatic redacted GitHub call-log issues (`/owner/logs.html`), `D-095` per-user owner overrides, local/offline models (`/owner/local-models.html`, `/admin/setup`, benchmark + slow opt-in + cloud backup).
2. **Agent 2 (`round4/wizard-memory`) — Post-Call Wizard & Style Memory (`A1`–`A4`)**
   - 5-step post-call wizard (`PostCallWizard.tsx`), `< 30 s` suppression, `"Finish later"` (`24 h` drafts / `7 d` feedback), canonical feedback chips (`too_long`, `too_formal`, `wrong`, `not_relevant`, `good_phrasing`, legacy `not_our_style` mapped to `too_formal`).
   - Per-agent + company style memory (`cloud/learning/`), PII redactor, `memory_merge` background job, `/admin/memory`, `/memory`, and owner read-only view (`/owner/memory`).
3. **Agent 1 (`round4/live-cards`) — Live Cards v2 (`C1`–`C8`)**
   - `SAY:` / `TIP:` / `WHY:` card format (`VerdictParser`, `splitCardWhy()`), 18-word sentence cap, EN/AR banned-opener strip.
   - Company/agent tone presets (`direct`, `warm`, `consultative`, `brief`), `CardToneStore` precedence (`agent > company > platform`), `admin/tone.tsx`, `AgentTonePicker.tsx`.
   - Async coalescing `CallStateUpdater`, `CallStatePanel`, `TalkMeter`, C7 `replay/quality.py` judge, `suggest.md` v5.
4. **Agent 3 (`round4/voice-coach`) — Prep Coach, Game Plan & Voice Review (`B1`–`B7`)**
   - Home `Start` opens `/call?prepare=1`; `PrepCoachPanel.tsx` + editable `<= 150`-word `GamePlanCard.tsx` (`CrmRail.tsx` rail open by default in prep).
   - `DeepgramTTSAdapter`, `coach_stt`/`coach_llm`/`coach_tts` router stages, monthly USD cap (`DEFAULT_COST_PER_MIN_USD = 0.04`) with 80%/100% alerts, `/owner/coach.html`, `/admin/coach`.
   - `VoiceReviewModal.tsx` (`startReview`), `VoiceReviewEngine` → `add_feedback`, `ReviewQueueCard.tsx` on `/home` (`1 h` / tomorrow `08:00` / custom snooze, 7-day expiry), and 08:00 morning brief job (`morning_brief.py`).

## 2. Master §3 Cross-Agent Contracts Verified

- `get_style_memory()` and `get_game_plan()` reach `suggest` prompt rendering across both Python `pipeline/session.py` and TS `packages/engine/src/{call,session}.ts`.
- Post-call wizard Step 1 calls Agent 3's real `startReview(callId)`.
- Coach voice review (`cloud/coach/engine.py`) calls Agent 2's real `add_feedback(..., source="coach_review")`.
- All screens are wrapped at the root layout (`apps/app/app/_layout.tsx`) and at call/wizard/coach panels with Agent 4's `SafeBoundary`.
- All Round 4 client API helpers use Agent 4's `request` (`apps/app/lib/cloud.ts`) with 15 s timeout & idempotent-only retries; `ownerFetch` also enforces a 15 s `AbortController` timeout.
- Zero `STUB(` markers remain anywhere in `apps/`, `packages/`, or `seed/`.

## 3. Assumptions & Known Items Carried Forward

- **`D-100` (`CardMessage` WHY transport):** Optional `WHY:` line appends as `\nWHY: <insight>` in `VerdictParser.finish()` and is parsed by `CardStack.tsx` to preserve `@sotto/shared` compatibility.
- **`C8` (`TalkMeter`):** Uses transcript-turn speaking durations with `approximate={session.source === "mic"}` until raw per-track VAD millisecond counters are exposed on `CallSession`.
- **`D-130` (`seed/models/providers.yaml`):** Self-hosted templates live under top-level `local_providers:` so cloud `providers:` preserves strict `https://` validation.
- **`DEFAULT_COST_PER_MIN_USD = 0.04`:** Blended Deepgram Nova-3 + Aura-2 + Groq estimate in `cloud/coach/store.py` (owner-overridable per company).
- **Pre-existing Web Bundle Size Blocker (`CONSTRAINTS.md` / `scripts/check_bundle_size.py`):** Web JS bundle gz total is ~610 KB against the 450 KB budget (already 574 KB in `0.6.1` before Round 4). Retained the 450 KB threshold per instructions and escalated to the owner.

## 4. Visual Evidence

- Captured 72 Round 4 screenshots (`docs/evidence/round4/shots-390/`, `docs/evidence/round4/shots-1280/`) covering light/dark, 390/1280 px, and EN LTR / AR RTL across `/home`, `/call?mock=1`, `/setup`, `/memory`, `/admin/setup`, `/admin/tone`, `/admin/memory`, `/admin/coach`, and `/settings`.

## 5. Consolidated Owner To-Dos (Before Publishing / Live Cutover)

1. **Private Call-Log Repo + PAT (L3):** Create a private repository (e.g. `Hasdro/sales-shield-logs`) and save a fine-grained PAT (`Issues: Read & Write`) in Owner Console (`/owner/logs.html`).
2. **Voice Coach Vendor, Key & Caps (B2–B4):** Choose Option A (`Deepgram Nova-3 + Aura-2`, ~$0.04/min) or Option B (`ElevenLabs Scribe + Flash v2.5`, ~$0.07/min), add the API key in Owner Console → Keys & providers, and configure company stages + positive monthly USD caps in `/owner/coach.html`.
3. **Web Bundle Budget Decision (`check_bundle_size.py`):** Decide whether to raise the 450 KB limit (already exceeded at 574 KB in `0.6.1`) or schedule web bundle trimming so CI passes once the repository becomes public.
4. **Windows Test Machine (`D-097`, S3):** Run `launch.win.mjs` against the packaged `0.7.0` Windows installer before publishing.
5. **Live Cost Replay (optional):** Approve running `pnpm replay:live` on the Mac with real vendor keys to benchmark C7 live model quality.
