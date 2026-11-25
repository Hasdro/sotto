# Round 4 Handoff — Agent 2: Post-Call Wizard + Style Memory

- **Branch:** `round4/wizard-memory` (from snapshot `7baf81e` of `main` `9b5071b`)
- **Feature IDs added:** `postcall_wizard` (default on), `style_memory` (default on)
- **Model-router stage added:** `memory_merge` (`seed/models/default.yaml`)
- **Prompt added:** `seed/prompts/memory_merge.md`
- **Decision range:** `D-110` – `D-119`

---

## 1. What Is Done (Per Acceptance Criterion)

### Backend — Style Memory, Feedback, Wizard State & Owner Console
- **`sotto_worker/cloud/memory/api.py`**: Exposes the exact master §3.4 contract:
  - `add_feedback(company_id, user_id, call_id, source, rating, reasons, note, card_id=None) -> str`
  - `get_style_memory(company_id, user_id) -> list[str]` (≤ 12 enabled rules, **company rules first**, then agent rules, deduplicated).
- **`sotto_worker/cloud/memory/redact.py`**: Strips emails, phone numbers, URLs, currency/price figures (`$5,000`, `AED 12,500`, etc.), honorific names (`Mr. John Smith`), labeled names (`customer Sara`), and explicit known names before saving feedback or sending to the merge model.
- **`sotto_worker/cloud/memory/store.py`**:
  - 5 SQLite tables (`memory_feedback`, `memory_versions`, `memory_state`, `memory_settings`, `postcall_wizard_state`), every table scoped by `company_id` with cascade delete.
  - Automatic one-time migration (`migrate_from_learning`) of existing R11 `cloud/learning/` instructions into company-wide style memory rules.
  - Legacy reason compatibility: `not_our_style` maps cleanly to `too_formal`; `cloud/learning/store.py` also accepts `too_formal` and `not_relevant` so R11 endpoints stay backward-compatible.
  - Versioning (`KEPT_VERSIONS = 50`), admin edit, disable, revert (creates a new version so revert is undoable), approve/reject when `review_before_apply` is on, and `promote_rule()` to promote an agent's rule to company-wide.
  - Every admin mutation writes an audit-log entry (`memory.edited`, `memory.reverted`, `memory.approved`, `memory.rejected`, `memory.promoted`, `memory.review_switch`).
  - Scheduled retention jobs: `purge_expired_feedback(now)` deletes raw feedback older than 90 days; `expire_wizard_states(now)` deletes unsent wizard drafts after 24 h while keeping Step 5 (feedback) in the queue for 7 days, then expires after 7 days.
- **`sotto_worker/cloud/memory/merge.py`**: Background merge runner (`run_memory_merge`) using `seed/prompts/memory_merge.md` and router stage `memory_merge` (no model names or provider SDKs in code). Builds a PII-stripped feedback packet with **no full transcript**, enforces ≤ 12 rules of ≤ 25 words, retries 3× on error/unparseable output, and preserves raw feedback unmerged on failure.
- **`sotto_worker/cloud/memory/routes.py`**: Full HTTP API under `/api/v1/memory/*` and `/api/v1/postcall/wizard*`.
- **`sotto_worker/cloud/owner/memory.py`, `memory.html`, `memory.js`**: Read-only Owner Console view across all companies (`GET /api/owner/memory`, `GET /owner/memory`, `GET /owner/memory.js`); writes rejected with 405.

### Frontend — Post-Call Wizard, Feedback Step & Style Memory Views
- **`apps/app/features/postcall/steps.ts`**: Pure wizard state machine enforcing:
  - Calls `< 30 s` suppress the wizard and review (`shouldOpenWizard`).
  - Steps 2–4 (WhatsApp, Email, Zoho) hidden when their feature is off or nothing is suggested.
  - `Back` / `Skip` / `Next` transitions never trigger sends or CRM writes (`sentCount === 0`).
  - 24 h draft expiry and 7-day feedback queue helpers.
- **`apps/app/features/postcall/PostCallWizard.tsx`**: 5-step popup shell with progress dots, `<SafeBoundary name="wizard.stepN">` wrapping every step, existing `CallReviewPanel` / `WhatsAppAction` / `EmailAction` / `AfterCallChecklist` embedded with their own explicit Send/Approve buttons (R12), **Talk it through** button on Step 1 when `voice_coach` is available (calling Agent 3's `startReview(callId)` stub), and **Finish later** persistence via `wizardApi.save`.
- **`apps/app/features/postcall/FeedbackStep.tsx`**: Step 5 showing rateable AI cards only (R11), thumbs up/down, Round 4 reason chips (**Too long**, **Too formal**, **Wrong**, **Not relevant**), optional per-card note, prominent whole-call feedback box ("What should the AI do differently?"), offline queuing via Agent 4's `enqueue` stub, merge trigger, and `"Learned N new things – view"` toast.
- **`apps/app/features/postcall/strings.ts`**: Full English + Arabic (RTL-ready) strings; zero user-facing "Sotto".
- **`apps/app/features/rating/ratings.ts`**: Updated with Round 4 canonical reasons, `not_our_style -> too_formal` migration, and optional per-card `note`, preserving R11 `isRateable()`.
- **`apps/app/app/admin/memory.tsx`**: Hosts both the Agent view (own rules + company rules + effective combined list ≤ 12) and the Admin view (company roll-up, every agent's rules, edit, disable, revert, approve/reject pending, promote to company-wide, `review_before_apply` switch). Uses `@sotto/ui` tokens only.
- **`apps/app/app/admin/_layout.tsx`**: Added 1-line Style Memory nav link under the AI group (per master §3.7).
- **`apps/app/features/flags/catalog.ts` & `strings.ts`**: Registered `postcall_wizard` and `style_memory` (en + ar) so the client catalog stays in sync with `features.json`.

### Executed Verification & Test Output
- **Backend tests (`apps/agent-worker/tests/cloud/test_memory.py`)** — executed directly on Python 3.11 + SQLite + Starlette `TestClient`: **10/10 PASSED**:
  - `test_pii_stripping_removes_names_emails_phones_prices_and_urls` — PASS
  - `test_contract_api_and_company_priority_over_agent_rules` — PASS
  - `test_merge_caps_no_transcript_and_retry_keeps_raw_on_failure` — PASS
  - `test_parse_merged_rules_handles_none_and_empty` — PASS
  - `test_ninety_day_feedback_deletion` — PASS
  - `test_review_before_apply_revert_promote_and_audit_log` — PASS
  - `test_migration_from_legacy_learning_store` — PASS
  - `test_wizard_finish_later_resumes_24h_and_expires_drafts_keeping_feedback_7d` — PASS
  - `test_multi_tenant_isolation_across_every_table_and_route` — PASS
  - `test_seed_catalog_and_model_stage_configured` — PASS
- **Architecture & boundary checks (`python3 scripts/check_boundaries.py`)**: **`check-boundaries: ok`** (0 violations: no raw colors, no model names/prompts in code, no provider SDKs outside `adapters/`, no suppressions).
- **Brand check**: 0 user-facing "Sotto" strings in all new UI files.

---

## 2. What Is Not Done / Not Verified (and Why)

This sandbox has **no outbound internet access**, no `pnpm`/`node_modules`, no `uv`/pytest/mypy/pydantic v2, and no headless browser:
1. **`pnpm install && pnpm lint && pnpm typecheck && pnpm test`** could not run offline (including Vitest execution of `apps/app/features/postcall/steps.test.ts` and existing R11 UI tests).
2. **`cd apps/agent-worker && uv sync && uv run pytest`** could not run full worker suite because system Python has `pydantic 1.10.4` (needed v2 for `sotto_worker/protocol`). All `cloud/memory/` and `cloud/owner/memory.py` tests ran directly against real SQLite + Starlette `TestClient`.
3. **Screenshots & axe-core checks** (all 5 wizard steps + Style Memory views in light/dark, 390 px / 1280 px, LTR / Arabic RTL; axe 0 serious) could not be captured without a browser or web build.
4. **`EndedView.tsx` mount**: `apps/app/features/call/components/EndedView.tsx` was not modified because it is outside Agent 2's owned files; the merger should mount `<PostCallWizard />` in `EndedView.tsx` when `postcall_wizard` is available and `durationS >= 30`.
5. **`cloud/app.py` mount**: `apps/agent-worker/sotto_worker/cloud/app.py` was not modified because it is a shared file; exact wiring lines are in Section 5 below.

---

## 3. Assumptions and Stubs

### `ASSUMPTION:` entries
- `apps/app/features/postcall/PostCallWizard.tsx`: `voice_coach` feature ID is added by Agent 3 in `features.json`; temporarily cast with `useFeature("voice_coach" as never)` until the merger joins all `features.json` / `catalog.ts` blocks.
- `apps/agent-worker/sotto_worker/cloud/memory/store.py`: When `expire_wizard_states` clears unsent drafts after 24 h, `current_step` advances to `5` (`feedback`) so resuming opens directly at the Card Feedback step for the remaining 6 days of the 7-day window.

### `STUB(...)` entries (replace at merge)
| File | Symbol | Stub target | Replacement at merge |
|---|---|---|---|
| `apps/agent-worker/sotto_worker/cloud/memory/obs_stub.py` | `log_event` | `STUB(agent-4)` | `from sotto_worker.cloud.obs.log import log_event` |
| `apps/app/features/postcall/stubs.tsx` | `startReview` | `STUB(agent-3)` | Agent 3's `startReview(callId)` client function |
| `apps/app/features/postcall/stubs.tsx` | `logEvent` | `STUB(agent-4)` | `import { logEvent } from "../../lib/obs"` |
| `apps/app/features/postcall/stubs.tsx` | `enqueue` | `STUB(agent-4)` | `import { enqueue } from "../../lib/outbox"` |
| `apps/app/features/postcall/stubs.tsx` | `SafeBoundary` | `STUB(agent-4)` | `import { SafeBoundary } from "../../components/SafeBoundary"` |

---

## 4. Proposed Decisions & Tracker Lines

### Proposed Decisions (`D-110` – `D-113`)
- **D-110 (25 Nov 2026) — Style memory extends `cloud/learning/` with per-agent + company scopes.** Existing company `learned_versions` migrate once into company-wide `memory_versions`; `get_style_memory()` returns ≤ 12 enabled rules with company rules prioritized ahead of per-agent rules.
- **D-111 (25 Nov 2026) — Canonical Round 4 feedback reasons with backward-compatible mapping.** Feedback chips use `too_long`, `too_formal`, `wrong`, `not_relevant` (+ `good_phrasing` for thumbs-up); legacy `not_our_style` maps to `too_formal` on both client and server.
- **D-112 (25 Nov 2026) — Server-side post-call wizard persistence (`postcall_wizard_state`).** "Finish later" persists the active step and unsent drafts for 24 h; after 24 h drafts are cleared and Step 5 (Card feedback) stays in the review queue for 7 days.
- **D-113 (25 Nov 2026) — Feature-local bilingual strings for Post-Call Wizard & Style Memory.** Keeps `apps/app/features/postcall/strings.ts` self-contained (English + Arabic) to avoid `lib/i18n.ts` conflicts across parallel Round 4 agents (following D-058).

### Proposed Tracker Lines (`docs/TRACKER.md`)
- `R4-A1`: Post-call 5-step wizard shell, `< 30 s` suppression, Finish later (24 h drafts / 7 d feedback), SafeBoundary wrapping — **Ready for merge** (`round4/wizard-memory`)
- `R4-A2`: Card feedback step (Round 4 reason chips, per-card note, whole-call note, offline outbox, learned toast) — **Ready for merge** (`round4/wizard-memory`)
- `R4-A3`: Per-agent style memory store, PII redactor, background merge job (≤ 12 rules / ≤ 25 words, 3× retry, 90-day purge, review-before-apply) — **Ready for merge** (`round4/wizard-memory`)
- `R4-A4`: Agent/Admin Style Memory screen (`app/admin/memory.tsx`) + Owner Console read-only view (`cloud/owner/memory.*`) + audit logs — **Ready for merge** (`round4/wizard-memory`)

---

## 5. Exact Merger Wiring & Commands

### A. Wire routes & scheduled jobs in `apps/agent-worker/sotto_worker/cloud/app.py`
```python
from sotto_worker.cloud.memory import api as memory_api
from sotto_worker.cloud.memory import routes as memory_routes
from sotto_worker.cloud.memory.store import MemoryStore
from sotto_worker.cloud.owner import memory as owner_memory

# Inside create_cloud_app(...):
memory = MemoryStore(store)
memory_api.configure(memory)
scheduler.register("memory_feedback_purge", DAY_MS, lambda now: _async_noop(memory.purge_expired_feedback(now)))
scheduler.register("postcall_wizard_expiry", HOUR_MS, lambda now: _async_noop(memory.expire_wizard_states(now)))

# Append to Starlette routes:
*memory_routes.make_routes(memory=memory, app_route=app_route, body=body, ip_of=ip_of, merge_runner=..., clock=config.clock),
*owner_memory.make_routes(memory=memory, owner_route=owner_route),
```
Also link `/owner/memory` from `apps/agent-worker/sotto_worker/cloud/owner/index.html` and mount `<PostCallWizard />` in `apps/app/features/call/components/EndedView.tsx` (removing the temporary `as never` cast on `voice_coach` once Agent 3's feature IDs are merged).

### B. Verification commands for the merger
```bash
# 1. Replace stubs (see Section 3), then run full lint, typecheck, and unit tests:
pnpm install && (cd apps/agent-worker && uv sync)
pnpm lint && pnpm typecheck && pnpm test
cd apps/agent-worker && uv run pytest tests/cloud/test_memory.py tests/cloud/test_learning.py tests/cloud/test_isolation.py

# 2. Replay latency & quality gate (must remain p95 <= 1500 ms):
pnpm replay --all

# 3. Accessibility & visual checks (light/dark, 390px/1280px, LTR/Arabic RTL; axe 0 serious):
pnpm a11y
node scripts/panels-shots.mjs
```

---

## 6. Owner To-Dos
- **None** (no new paid accounts, API keys, or external services required for Agent 2; `memory_merge` reuses the existing `GROQ_API_KEY` configured for `summary`).
