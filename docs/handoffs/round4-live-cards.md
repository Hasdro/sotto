# Round 4 Handoff — Agent 1: Live Cards (`round4/live-cards`)

**Branch:** `round4/live-cards` (off `main` snapshot `7baf81e`)
**Bundle:** `round4-live-cards.bundle` (`main..round4/live-cards`)
**Decision range:** D-100 – D-109
**Feature IDs added (`features.json`):** `card_style_v2`, `call_state`, `talk_meter` (all default on)

---

## 1. What is done (by acceptance criterion)

| Acceptance item | Status | Implementation & Evidence |
|---|---|---|
| **C1 / C2 Card format, parser, hard 18-word cut, EN + AR banned-opener strip** | Done & tested | `apps/agent-worker/sotto_worker/pipeline/verdict.py` (`SAY:` / `TIP:` / `ANSWER:` + optional `WHY:` + `NO_SAFE_ANSWER`; `strip_banned_opener` EN + AR; `enforce_word_limit` sentence-boundary cut <= 18 words, `WHY:` <= 12 words; streaming capitalization after stripped opener; `cuts`/`strips` counters + `log_event`). Verified via 5 Python tests in `tests/pipeline/test_live_cards_v2.py` (all PASS). |
| **C1 Card UI (`WHY:` collapsed by default, tap to open)** | Done (test written, needs Jest on Mac) | `apps/app/features/call/components/CardStack.tsx` (`splitCardWhy`, collapsible `WhyInsight` under hero card, EN + AR, `@sotto/ui` tokens only). Tests in `apps/app/features/call/components/live-cards-v2.test.tsx`. |
| **C3 Tone presets + EN/AR banned phrases + precedence + isolation** | Done & tested | `seed/cards/tone_defaults.yaml`, `apps/agent-worker/sotto_worker/cloud/cards/store.py` (`CardToneStore`: `platform < company < agent` precedence, `how_we_talk <= 200`, `company_id` isolation), `routes.py` (Starlette endpoints), `apps/app/lib/cards.ts`, `apps/app/app/admin/tone.tsx` (+ 1-line link in `admin/_layout.tsx`), `apps/app/features/call/components/AgentTonePicker.tsx` (+ 1-line mount in `settings.tsx`). Verified via 3 Python tests in `tests/cloud/test_cards.py` (all PASS). |
| **C4 / C6 Prompt rewrite (`suggest.md` v5) + R11 style memory** | Done & tested | `seed/prompts/suggest.md` v5 (spoken, casual, <= 18 words, `SAY:`/`TIP:`/`WHY:`, priority Playbook > Company rules > Agent style memory). **R11 finding:** `learned_instructions` reached `packages/engine/src/call.ts` on the client, but **never reached `sotto_worker/pipeline/session.py`**. Fixed in `session.py` `_request()` via `{{agent.style_memory}}` calling `get_style_memory(company_id, user_id)`. Verified in `test_suggest_v5_prompt_includes_style_memory_game_plan_and_state`. |
| **C5 Async call state (0 ms on card path) + "What I know so far" panel** | Done & tested | `seed/prompts/call_state.md`, `seed/models/default.yaml` (`call_state` stage), `apps/agent-worker/sotto_worker/pipeline/call_state.py` (`CallStateUpdater`, coalescing fire-and-forget task, <= 120 words), wired in `session.py` without awaiting on the card path. UI: `apps/app/features/call/components/CallStatePanel.tsx` (collapsed read-only `Disclosure`, EN + AR; exported for Agent 3 / merger to mount in `CrmRail.tsx`). Verified non-blocking in `test_call_state_background_update_does_not_block` (PASS). |
| **C7 Quality judge in replay + `CONSTRAINTS.md`** | Done & tested | `seed/prompts/quality_judge.md`, `seed/models/default.yaml` (`quality_judge` stage), `apps/agent-worker/replay/quality.py` (`judge_card_stub`, `QUALITY_PASS_RATE_MIN = 0.95`, `QUALITY_COHERENCE_MIN = 4.0`), wired into `replay/synthetic.py` (`ReplayReport.passed` + `format_report`) and `CONSTRAINTS.md`. Verified via `test_quality_judge_thresholds` (PASS). |
| **C8 Talk-time meter + `<SafeBoundary>`** | Done (test written, needs Jest on Mac) | `apps/app/features/call/components/TalkMeter.tsx` (compact R8-safe bar, hidden when `approximate === true`), mounted in `apps/app/app/call.tsx` alongside `<SafeBoundary name="call.cards">` wrapping the live card area. Tests in `live-cards-v2.test.tsx`. |

### Sandbox verification results
- **Python unit tests run directly (`python3`):** `11 passed, 0 failed` (`tests/pipeline/test_live_cards_v2.py` 8/8, `tests/cloud/test_cards.py` 3/3).
- **Architecture boundaries (`python3 scripts/check_boundaries.py`):** `ok`.
- **Syntax & imports:** all modified/new `.py` files pass `py_compile`; `apps/app` has `0` broken relative imports.

---

## 2. Not verified in sandbox (for the merger / desktop agent)

The sandbox has no `pnpm`, `uv`, `pytest`, pydantic v2, `node_modules`, or Chromium/Playwright. The following were **not run here** and must be run at merge:
- `pnpm lint` (Biome + ruff + boundaries)
- `pnpm typecheck` (TS + mypy `--strict`)
- `pnpm test` (app jest incl. `live-cards-v2.test.tsx`, `@sotto/ui`, engine vitest, worker pytest + 90% coverage floor)
- `pnpm replay --all` (synthetic replay p50/p95 + R4 + C7 stub judge pass)
- `pnpm replay:live` (live model + live `quality_judge` pass — needs owner API keys)
- `pnpm a11y` + Chrome screenshots of WHY closed/open, `CallStatePanel`, `TalkMeter`, and `/admin/tone` (light/dark, 390/1280, EN/AR).

---

## 3. Assumptions & Stubs (for the merger)

### Assumptions
- **ASSUMPTION (D-100):** `CardMessage` is generated in `packages/shared` (outside Agent 1's owned files). To stay 100% backwards-compatible with all other agents and existing tests, optional `WHY:` insight is appended by `VerdictParser.finish()` as `\nWHY: <insight>` and split/collapsed in `CardStack.tsx` via `splitCardWhy()`.
- **ASSUMPTION (C8):** In `apps/app/app/call.tsx`, `TalkMeter` currently derives `agentMs` / `customerMs` from transcript turns and sets `approximate={session.source === "mic"}`. When raw per-track VAD millisecond counters are exposed on `CallSession`, pass those directly to `<TalkMeter>`.

### Stubs to replace at merge
| Stub file | Symbol | Replace with |
|---|---|---|
| `apps/agent-worker/sotto_worker/pipeline/stubs.py` | `get_style_memory(company_id, user_id)` (`# STUB(agent-2)`) | `sotto_worker.cloud.memory.api.get_style_memory` |
| `apps/agent-worker/sotto_worker/pipeline/stubs.py` | `get_game_plan(company_id, call_id)` (`# STUB(agent-3)`) | `sotto_worker.cloud.coach.api.get_game_plan` |
| `apps/agent-worker/sotto_worker/pipeline/stubs.py` | `log_event(...)` (`# STUB(agent-4)`) | `sotto_worker.cloud.obs.log.log_event` |
| `apps/app/lib/obs.ts` | `logEvent(stage, event, meta)` (`// STUB(agent-4)`) | Agent 4's real `apps/app/lib/obs.ts` |
| `apps/app/components/SafeBoundary.tsx` | `SafeBoundary` (`// STUB(agent-4)`) | Agent 4's real `apps/app/components/SafeBoundary.tsx` |

### Wiring lines for the merger (kept out of shared files to prevent conflicts)
1. **`apps/agent-worker/sotto_worker/cloud/app.py`:** instantiate `tone_store = CardToneStore(store._db, store._lock)` and extend `routes` with `card_tone_routes(tone_store, require_user, owner_route)`.
2. **`apps/app/features/call/components/CrmRail.tsx` (Agent 3's file):** mount `<CallStatePanel state={callState} />` inside the live rail.

---

## 4. Proposed decisions (D-100 – D-102) & tracker lines (for the merger)

### Proposed `docs/DECISIONS.md` entries
- **D-100 — `WHY:` insight transport without breaking `CardMessage` schema.** `VerdictParser.finish()` appends optional `WHY:` insight (<= 12 words) as `\nWHY: <insight>` to card text; `CardStack.tsx` splits it via `splitCardWhy()` and renders it collapsed by default. Keeps `@sotto/shared` protocol backwards-compatible across all 4 parallel Round 4 branches.
- **D-101 — `CallStateUpdater` coalescing async queue.** Background call-state updates coalesce pending transcripts to the latest turn if a previous `call_state` LLM call is still in flight, capping output at 120 words and adding 0 ms to the live card path.
- **D-102 — `CardToneStore` precedence & tenant isolation.** Tone resolution strictly follows `agent > company > platform` with company `allowed_presets` gating agent choices and `company_id` scoping every company/agent row.

### Proposed `docs/TRACKER.md` lines
- `[x] R4-A1-1 Card format SAY/TIP/WHY + 18-word sentence cut + EN/AR banned-opener strip (C1, C2, D-094, D-100)` — `verdict.py`, `CardStack.tsx`, `test_live_cards_v2.py`
- `[x] R4-A1-2 Tone presets + EN/AR banned phrases + precedence + isolation (C3, D-102)` — `cloud/cards/`, `seed/cards/tone_defaults.yaml`, `admin/tone.tsx`, `AgentTonePicker.tsx`, `test_cards.py`
- `[x] R4-A1-3 Prompt rewrite suggest.md v5 + R11 style_memory wiring (C4, C6)` — `seed/prompts/suggest.md`, `pipeline/session.py`
- `[x] R4-A1-4 Async call state + CallStatePanel + TalkMeter + C7 quality judge (C5, C7, C8, D-101)` — `pipeline/call_state.py`, `CallStatePanel.tsx`, `TalkMeter.tsx`, `replay/quality.py`, `CONSTRAINTS.md`

---

## 5. Exact commands for the merger

```bash
# After merging round4/platform (4) -> round4/wizard-memory (2) -> round4/live-cards (1) -> round4/voice-coach (3)
# and replacing the 5 stubs + wiring the 2 lines above:
pnpm install && (cd apps/agent-worker && uv sync)
pnpm lint
pnpm typecheck
pnpm test
pnpm replay --all
pnpm --filter @sotto/app export:web && pnpm a11y
# With owner keys in .env (costs money; owner go required):
pnpm replay:live
```

## 6. Owner to-dos
- Approve running `pnpm replay:live` on the Mac with real Groq + Gemini keys so the live `quality_judge` stage grades real model cards against the C7 thresholds (≥ 95% length+banned, coherence ≥ 4.0/5.0).
