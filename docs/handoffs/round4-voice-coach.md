# Round 4 — Agent 3 Handoff: Prep Coach, Voice Coach, Review Queue, Morning Brief

- **Branch:** `round4/voice-coach` (based on snapshot `7baf81e` / `main` `9b5071b`)
- **Decision range:** `D-120` – `D-129`
- **Feature IDs added:** `prep_coach` (default on), `morning_brief` (default on), `voice_coach` (**default off**, owner-configured)
- **Bundle:** `round4-voice-coach.bundle` (`main..round4/voice-coach`)

---

## 1. What is done, per acceptance test

### Offline verification run
- **Architecture boundary checks (`python3 scripts/check_boundaries.py .`):** `check-boundaries: ok` (0 violations: no model names in code, no prompt text in code, no provider SDKs outside `adapters/`, no raw colors in `apps/app`, no suppressions).
- **Backend unit & multi-tenant isolation tests (`PYTHONPATH=apps/agent-worker python3 -m unittest apps/agent-worker/tests/test_coach_adapters.py apps/agent-worker/tests/test_coach_store.py -v`):** **10/10 passed in 0.084 s**:
  - `test_deepgram_tts_streams_audio_and_sends_auth_header` — ok
  - `test_deepgram_tts_interruptible_iteration` — ok
  - `test_deepgram_tts_redacts_api_key_on_error` — ok
  - `test_fake_tts_and_stt_adapters` — ok
  - `test_prep_chat_and_game_plan_without_zoho_and_contract` — ok
  - `test_voice_cap_lifecycle_80_100_and_month_reset` — ok
  - `test_review_queue_states_snooze_reminder_expiry_and_short_call` — ok
  - `test_voice_review_feeds_memory_and_enforces_transcript_visibility` — ok
  - `test_morning_brief_with_and_without_zoho_and_off_switch` — ok
  - `test_multi_tenant_isolation_all_tables` — ok

### Acceptance criteria mapping
1. **Prep every time + Prep coach & Game Plan (B1, B2):**
   - `apps/app/features/call/components/CrmRail.tsx` mounts `<PrepCoachPanel />` in `stage="prepare"` with an immediate **Start listening** action (never forces chat) and mounts Agent 1's `<CallStatePanel />` (stub) + read-only `<GamePlanCard />` in `stage="live"`.
   - `apps/agent-worker/sotto_worker/cloud/coach/engine.py` (`PrepCoachEngine`) uses `seed/prompts/coach_prep.md` and `seed/prompts/game_plan.md`, works cleanly with or without a Zoho brief, and saves structured game plans (3 goals, objections + answers, questions, what not to say).
   - `apps/agent-worker/sotto_worker/cloud/coach/api.py` exports `get_game_plan(company_id, call_id) -> str | None` (strictly ≤ 150 words, pre-rendered at prep time so it adds zero live-path latency).
2. **Voice coach adapters & stages (V1, V2):**
   - `seed/models/default.yaml` adds `coach_stt`, `coach_llm`, `coach_tts`; `seed/models/prices.yaml` adds vendor price rows.
   - `apps/agent-worker/sotto_worker/adapters/coach/` provides `TTSAdapter` / `CoachSTTAdapter` protocols (`base.py`), `DeepgramTTSAdapter` (`deepgram_tts.py`, built against Deepgram `/v1/speak` docs, interruptible async chunk streaming, API key redaction on errors), and deterministic fakes (`fake.py`).
3. **Monthly USD usage cap (V2):**
   - `CoachStore.cap_status()` & `check_voice_cap()` enforce: stages configured + company enabled + positive monthly USD cap required (no cap → feature hidden/blocked); minutes estimate shown alongside USD cap; ≥ 80 % emails company admin(s) + platform owner once per month; ≥ 100 % blocks until the 1st of next month UTC unless the owner raises the cap.
   - Owner console endpoints & UI in `apps/agent-worker/sotto_worker/cloud/owner/coach.{py,html,js}`; company admin status & transcript-visibility screen in `apps/app/app/admin/coach.tsx` (1-line nav link added in `apps/app/app/admin/_layout.tsx`).
4. **Post-call voice review (V4):**
   - `VoiceReviewEngine` (`cloud/coach/engine.py`) enforces ≤ 180 s (3 min), interruptible TTS, uses `seed/prompts/coach_review.md`, and calls `add_feedback(source="coach_review")` (Agent 2 stub) with the agent's answer to *"Anything I should remember for next time?"*.
   - `apps/app/features/coach/VoiceReviewModal.tsx` exports `startReview(callId)` for Agent 2's post-call wizard, with in-app voice controls and text fallback in the same screen.
   - Transcript access enforced in `CoachStore.get_review_transcript()`: agent sees own; company admin sees only when `allow_admin_transcript` is enabled; cross-company blocked.
5. **Review queue (V3):**
   - `CoachStore` implements `pending → done / snoozed / dismissed / cancelled / expired`; calls `< 30 s` create no review; snooze presets `1h`, `tomorrow_morning` (08:00 local), `custom`; single 24 h reminder (`due_reminders` + `mark_reminded`); 7-day auto-expiry.
   - `apps/app/features/coach/ReviewQueueCard.tsx` mounted via `apps/app/app/home.tsx` with count badge, snooze controls, and dismiss (no reason needed).
6. **Morning brief (V5):**
   - `apps/agent-worker/sotto_worker/cloud/coach/morning_brief.py` runs at ≥ 08:00 local time per user, delivers once per local day, respects the per-user off switch, switches to `voice` only when `voice_coach` is active and under cap, includes today's Zoho meetings when available, and is never empty without Zoho.
7. **Multi-tenant isolation:**
   - All 7 new tables (`coach_game_plans`, `coach_prep_messages`, `coach_caps`, `coach_usage`, `coach_cap_alerts`, `coach_reviews`, `coach_morning_brief_prefs`, `coach_morning_briefs`) carry `company_id` and pass `test_multi_tenant_isolation_all_tables`.

---

## 2. Vendor comparison for Voice Coach (V2 — no accounts created, no keys added)

| Option | STT vendor & rate | TTS vendor & rate | Blended est. / min (incl. Groq `coach_llm`) | Notes |
|---|---|---|---|---|
| **Option A (Recommended seed default): Deepgram Nova-3 + Deepgram Aura-2** | Deepgram Nova-3 streaming: ~$0.0043/min ($0.258/hr) | Deepgram Aura-2: $0.030 / 1k chars (~900 spoken chars/min ≈ $0.027/min) | **~$0.035 – $0.04/min** ($10/mo ≈ 250 min) | Single vendor key (`DEEPGRAM_API_KEY`), sub-250 ms TTS TTFB, lowest cost per minute, adapter implemented in `adapters/coach/deepgram_tts.py`. |
| **Option B: ElevenLabs Scribe + ElevenLabs Flash v2.5** | ElevenLabs Scribe: ~$0.0067/min ($0.40/hr) | ElevenLabs Flash v2.5: ~$0.060 / 1k chars (~$0.054/min) | **~$0.065 – $0.07/min** ($10/mo ≈ 140 min) | Higher voice naturalness and strong Arabic voice catalog; ~1.7× higher cost per minute; requires commercial tier (`ELEVENLABS_API_KEY`). |

---

## 3. What is NOT done or NOT verified in this offline sandbox, and why

1. **JS/TS install, lint, typecheck, Jest/Vitest, Expo web build & Playwright screenshots:** This sandbox has no outbound internet (`pnpm install` and `uv sync` could not run, so `node_modules` and `.venv` are not installed). Consequently:
   - `pnpm lint` (Biome + ruff), `pnpm typecheck` (tsc + mypy), `pnpm test` (vitest + jest-expo + pytest), `pnpm replay --all`, and `pnpm a11y` were **not** executed here and must be run by the merger.
   - Light/dark, 390 px / 1280 px, LTR / Arabic RTL screenshots and axe-core checks must be captured by the merger after `pnpm install`.
2. **Shared hub wiring left cleanly for merger (file ownership):**
   - `apps/agent-worker/sotto_worker/cloud/app.py` was **not** modified to avoid 4-way merge conflicts. The merger wires `coach_routes.make_routes(...)`, `make_owner_coach_routes(...)`, `register_coach_store(coach)`, and `scheduler.register("coach_morning_brief", HOUR_MS, ...)` + `coach.due_reminders()`.
   - `apps/agent-worker/sotto_worker/contracts.py` (`STAGES` tuple) is owned by Agent 4; once Agent 4 adds `coach_stt`, `coach_llm`, `coach_tts` to `STAGES`, `RoutingConfig.load("seed/models/default.yaml")` will validate them directly.
   - `apps/app/app/call.tsx` was not modified; if the merger wants `/call` (without `?prepare=1`) to default `railOpen` to `true` on idle calls (B1), change `useState(prepare)` → `useState(true)` in `CallView` and pass `callId={state.callId}` to `<CrmRail />`.

---

## 4. Every `ASSUMPTION:` and `STUB(...)`

### Assumptions
- `apps/agent-worker/sotto_worker/cloud/coach/store.py:25` — `ASSUMPTION:` `DEFAULT_COST_PER_MIN_USD = 0.04` (blended Deepgram Nova-3 + Aura-2 + Groq LLM estimate; owner can override per company in `configure_company_coach`).

### Stubs to replace at merge
- `apps/agent-worker/sotto_worker/cloud/coach/stubs.py`:
  - `// STUB(agent-2): replaced at merge` → `add_feedback(...)` — replace import in `cloud/coach/engine.py` with `from sotto_worker.cloud.memory.api import add_feedback`.
  - `// STUB(agent-4): replaced at merge` → `log_event(...)` — replace imports in `cloud/coach/{store,engine,morning_brief}.py` with `from sotto_worker.cloud.obs.log import log_event`.
- `apps/app/features/coach/stubs.tsx`:
  - `// STUB(agent-1): replaced at merge` → `CallStatePanel` — replace with Agent 1's real `CallStatePanel`.
  - `// STUB(agent-4): replaced at merge` → `SafeBoundary`, `logEvent`, `enqueue` — replace with Agent 4's `components/SafeBoundary.tsx`, `lib/obs.ts`, `lib/outbox.ts`.

### Shared file minimal touches (explicitly allowed by 00-master.md)
- `apps/app/app/home.tsx`: mounts `<ReviewQueueCard />` below `<HomeScreen />` (leaves `HomeScreen.tsx` untouched).
- `apps/app/app/admin/_layout.tsx`: 1-line nav link `{ href: "/admin/coach", label: { en: "Coach", ar: "المدرب" }, icon: "spark" }` in the `ai` group (§3.7).

---

## 5. Proposed decisions (`D-120` – `D-129`) and tracker lines

### Decisions
- **D-120 Voice coach router stages (`coach_stt`, `coach_llm`, `coach_tts`).** Seed defaults use Deepgram Nova-3 + Groq + Deepgram Aura-2; feature stays `default: "off"` and hidden until owner configures stages, enables the company, and sets a positive monthly USD cap.
- **D-121 Voice coach vendor pricing & TTS adapter.** Implemented `DeepgramTTSAdapter` (`/v1/speak`, streaming, interruptible) behind `TTSAdapter` protocol; `DEFAULT_COST_PER_MIN_USD = 0.04` used to display estimated minutes beside the monthly USD cap.
- **D-122 Game plan ≤ 150-word pre-rendered contract.** `get_game_plan(company_id, call_id)` returns pre-rendered text saved at prep time so injecting `{{call.game_plan}}` into live cards adds zero latency to the 1.5 s R1 budget.
- **D-123 Review queue lifecycle & transcript privacy.** Calls < 30 s create no review; snooze supports 1 h / tomorrow 08:00 local / custom; 1 reminder after 24 h; 7-day expiry; review transcripts are private to the agent unless the company admin enables `allow_admin_transcript`.

### Proposed tracker lines
- `T-R4-A3-01` [done] Prep coach chat + editable game plan (`CrmRail.tsx`, `PrepCoachPanel.tsx`, `GamePlanCard.tsx`, `cloud/coach/api.py::get_game_plan`).
- `T-R4-A3-02` [done] Voice coach adapters (`adapters/coach/`), monthly USD cap with 80%/100% alerts, owner console (`cloud/owner/coach.*`), admin screen (`admin/coach.tsx`).
- `T-R4-A3-03` [done] Post-call voice review (`VoiceReviewModal.tsx::startReview`, `VoiceReviewEngine` → `add_feedback`), review queue (`ReviewQueueCard.tsx`), and 08:00 morning brief job (`morning_brief.py`).

---

## 6. Exact commands for the merger

```bash
# 1. Fetch and merge after Agents 4, 2, and 1
git fetch /path/to/round4-voice-coach.bundle round4/voice-coach:round4/voice-coach
git merge round4/voice-coach

# 2. Replace stubs (see §4) and wire cloud/app.py + contracts.py STAGES + call.tsx default railOpen

# 3. Full quality gate
pnpm install && (cd apps/agent-worker && uv sync)
pnpm lint && pnpm typecheck && pnpm test
pnpm replay --all   # verify p95 <= 1500 ms (game plan adds 0 ms live-path overhead)
pnpm a11y           # verify 0 serious/critical across light/dark, 390/1280, LTR/RTL

# 4. Live tests (only after owner adds keys & sets a test cap)
# - Test DeepgramTTSAdapter against live DEEPGRAM_API_KEY
# - Test end-to-end voice review + 80%/100% cap alert emails via configured SMTP
```

---

## 7. Owner to-dos (decisions, accounts, keys, caps)
1. **Pick voice coach vendor:** Option A (Deepgram Nova-3 + Aura-2, ~$0.04/min) or Option B (ElevenLabs Scribe + Flash v2.5, ~$0.07/min).
2. **Add API key** in Owner Console → Keys & providers (`DEEPGRAM_API_KEY` for Option A or `ELEVENLABS_API_KEY` for Option B; no keys were added in this branch).
3. **Configure stages & set monthly USD caps** per company in Owner Console → Voice Coach (`/owner/coach.html`) before enabling `voice_coach` for any company.
