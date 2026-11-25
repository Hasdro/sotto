# Round 4 — master brief (shared by all four agents)

Owner: Hasan. Written 25 Nov 2026 from an owner interview. Every decision below is the owner's and is final for this round.
Read this file fully, then your own agent file (`agent-N-*.md`), then `CLAUDE.md`, `docs/REQUIREMENTS.md`, `CONSTRAINTS.md`, `docs/ENGINEERING.md`.

## 0. How this round runs (read first)

- **Four agents work at the same time, offline, on separate copies of the repo.** Each copy is a zip of `main` at `9b5071b` with a single snapshot commit (no history, no `.env`, no GitHub access, no server, no live keys). Screenshots (`docs/design/screens`), `docs/evidence` and the native folders `apps/app/android` and `apps/app/ios` were left out of the zip.
- The other three agents are building the other parts **right now**. You cannot see their work. Do only your own share, keep inside your owned files (your agent file lists them), and build against the **contracts** in section 3. Where you need another agent's function, write against a stub with the exact signature in section 3 and mark it `// STUB(agent-N): replaced at merge`.
- A desktop session (the "merger") will collect all four results, merge them into `main` in the order **4 → 2 → 1 → 3**, resolve conflicts, run the full gate and push.
- **Never wait for the owner.** If something is unclear, pick the safest option that keeps every rule in this brief, write `ASSUMPTION:` in a code comment and in your handoff note, and keep going. Anything that needs money, an account, production or a live key goes into your handoff note as a to-do for the owner. Never fake a live test.
- Assume you have internet for `pnpm install` and `cd apps/agent-worker && uv sync`. If not, say so in the handoff and run what you can.

### Files nobody edits
- `docs/TRACKER.md` and `docs/DECISIONS.md`: put your proposed tracker lines and decisions in your handoff note. The merger copies them in.
- `docs/REQUIREMENTS.md`: the requirement changes this round needs are written in section 5. The merger applies them.

### Decision numbers (pre-assigned, no clashes)
| Who | Range |
|---|---|
| This master brief | D-094 – D-099 (section 5) |
| Agent 1 Live cards | D-100 – D-109 |
| Agent 2 Wizard + memory | D-110 – D-119 |
| Agent 3 Voice coach | D-120 – D-129 |
| Agent 4 Platform + admin | D-130 – D-139 |

### What you hand back
1. Work on branch `round4/<name>` (`live-cards`, `wizard-memory`, `voice-coach`, `platform`) from the snapshot commit. Small conventional commits, one verifiable slice each, tests first.
2. When done: `git bundle create round4-<name>.bundle main..round4/<name>` at the repo root.
3. A handoff note `docs/handoffs/round4-<name>.md` (committed on your branch) with:
   - what is done, per acceptance test, with test output / numbers / screenshot paths;
   - what is not done or not verified, and why;
   - every `ASSUMPTION:` and every `STUB(...)`;
   - proposed tracker lines and decisions (in your number range);
   - the exact commands the merger must run, including live tests you could not run;
   - owner to-dos (accounts, keys, money).
4. Return the bundle file and the repo zip of your copy (excluding `node_modules`, `.venv`, build output).

### Merger checklist (for the desktop session, not for you)
1. Start from `main` (`9b5071b`), first merge `chore/ci-green` (CI fix `cf84104` + tracker `6560e69`), push.
2. Fetch each bundle; merge `round4/platform`, then `wizard-memory`, then `live-cards`, then `voice-coach`. After each: replace stubs, `pnpm lint && pnpm typecheck && pnpm test`, `pnpm replay --all` (report p50/p95; p95 > 1500 ms fails).
3. Copy decisions, tracker lines and section 5 requirement changes in. Bump to **0.7.0**.

## 1. Product goals of this round
1. Cards that read like a sharp colleague: short, casual, never "I hear you", with a grain of sales insight, and coherent with the whole conversation.
2. A prep step before every call and a calm, step-by-step post-call flow.
3. The app learns per agent from feedback, as a compact summary, visible to admin and owner.
4. An optional voice coach before and after calls.
5. Clear setup for admins; a switch for every new feature.
6. Smooth and crash-proof: nothing slow, nothing blank, failures caught and logged.
7. Optional local/offline models.

## 2. All decisions (owner-approved)

### Cards
- **C1 Shape.** Model answers `SAY: <line>` or `TIP: <line>` (≤ 18 words), plus optional `WHY: <insight>` (≤ 12 words, a grain of sales wisdom). `WHY` is collapsed by default, tap to open. No filler openers.
- **C2 Hard check in code.** Over 18 words → cut at the last full sentence within 18 words (else at word 18); never re-ask the model. A banned opener is stripped. Every cut/strip is logged and counted by the quality judge.
- **C3 Tone.** Presets Casual / Direct / Warm / Formal + free text "how we talk" (≤ 200 chars). Platform owner sets the platform banned-phrase list; company admin sets the default tone (default **Casual**) and adds banned phrases; each agent picks their own tone from the presets the admin allows. Most specific wins. Banned phrases are per language (English and Arabic); starter list: "I hear you", "I understand your concern", "Great question", "That's a great question", "I completely understand".
- **C4 Context.** Only the customer track triggers a card (R4, unchanged). The prompt gets: last 60 s of both speakers labelled `Agent:` / `Customer:`, the **call state**, the **game plan**, the agent's **style memory**, the company rules, the playbook match.
- **C5 Call state.** A short running summary (≤ 120 words): customer goal, objections raised, promises the agent made, questions answered, call stage. Rewritten after every customer turn by a cheap model, **never on the 1.5 s path** (the card uses the latest finished state). Shown to the agent read-only in a collapsed rail item "What I know so far". The live screen still shows only the card, call status and one rail toggle (R8).
- **C6 Priority on conflict.** Playbook answer > company rules > agent's style memory.
- **C7 Quality check.** Besides speed, the replay scores cards with a judge model: no banned phrase, ≤ 18 words, not formal, refers correctly to earlier parts of the call. Thresholds go in `CONSTRAINTS.md`: ≥ 95 % of cards pass length + banned-phrase, coherence ≥ 4/5. Below fails the build.
- **C8 Talk-time meter.** Small bar showing the agent's share of talk time. Shown only when the two sides are separate tracks; hidden in "approximate" voice-sample mode.
- Also: verify that learned instructions (R11 / D-034) actually reach the live prompt at runtime; it was not confirmed.

### Before the call
- **B1 Prep screen every time.** "Start" opens the prep screen first, every time, but **Start listening** is active immediately; talking to the coach is never forced.
- **B2 Prep coach.** One coach engine (text always, voice when the voice coach is enabled) to brainstorm the call. It also uses the Zoho brief (R10). On Start it produces a **game plan**: 3 goals, likely objections with answers, questions to ask, what not to say. Editable before start; visible in the rail during the call; injected into the live prompt.

### After the call
- **A1 Wizard.** When a call ends (calls < 30 s: no wizard, no review) a step-by-step popup opens, each step with **Back**, **Skip**, **Next**:
  1. Call review (written review, score + mascot as today, plus **Talk it through** when the voice coach is on).
  2. WhatsApp follow-up (template picker).
  3. Email follow-up.
  4. Zoho actions (meeting, lead, contact update, deal note).
  5. Card feedback.
  Steps 2–4 are hidden when their feature is off or nothing is suggested. Next/Skip never send; sending or writing is a separate explicit **Send** / **Approve** button in that step (R12 unchanged). **Finish later** saves the place for 24 h; after 24 h unsent drafts are deleted, the feedback step stays in the review queue for 7 days.
- **A2 Feedback step.** The call's cards again, each with thumbs up/down, reason chips (too long, too formal, wrong, not relevant) and an optional note; plus a prominent whole-call feedback box ("what should the AI do differently?"), voice input allowed. All of it feeds the memory.
- **A3 Style memory.** Per agent, ≤ 12 rules of ≤ 25 words. After every call with any feedback, a cheap model merges the new feedback (notes, ratings, coach-review answers) into the existing rules: add, reword, strengthen or drop. Only the summary enters the live prompt. Raw feedback deleted after 90 days. Personal data (names, numbers, prices tied to a customer) is stripped before saving; no full transcript goes to the merge (R11). Merge runs in the background after the call; fails → retry 3×, raw feedback kept. Toast "Learned 2 new things – view". Default auto-apply; admin can switch a company to "review before apply".
- **A4 Who sees it.** Agent sees own rules. Company admin sees each agent's rules + a company roll-up, can edit, disable, revert (version history) and promote a rule to company-wide. App owner sees all, read-only.

### Voice coach (default OFF)
- **V1** In-app voice conversation (no phone call). Text fallback in the same screen.
- **V2** Models (coach speech-to-text, coach brain, coach text-to-speech) are configured only by the owner in the owner console; companies do not see the feature until the owner enables it. Each company has a monthly USD cap (minutes shown beside it), checked before every review; 80 % → email admin and owner; 100 % → coach stops until the 1st of next month unless the owner raises it. Vendors: the build proposes two options with cost per minute; nothing paid is switched on.
- **V3 Review queue.** States pending → done / snoozed / dismissed / cancelled. Queue on Home with a count badge, pick any in any order. Snooze: in 1 hour, tomorrow morning, pick a time. One reminder after 24 h; expires after 7 days; no reason needed to dismiss.
- **V4 Review content.** ≤ 3 min, interruptible: what went well, what to improve, one better phrasing for the key moment (quoted from the call), one sales tip; ends with "Anything I should remember for next time?" → memory. The transcript is shown only to the agent (and admin if the company allows).
- **V5 Morning brief.** Text at 08:00 local; voice only when the coach is on; user can turn it off. With Zoho: today's meetings + one tip + pending reviews; without Zoho: tip + pending reviews, never empty.

### Platform, admin, logging
- **L1 Switches.** Every new feature has a switch in `features.json` (R7 states). **New features start ON**, except anything that costs money, sends data out, or needs owner setup: voice coach, GitHub call logs, local models start **OFF**.
- **L2 Setup guide.** A "Setup" screen per role; each step in plain words with **Test it** and a live status ("Zoho: connected ✓", "WhatsApp: not set up → Fix it"). Every setting gets a one-line "what this does" and a recommended default. The home checklist grows into this; take-a-tour stays.
- **L3 Call logs to GitHub.** After each call the app posts one issue automatically, no approval, to a separate private repo set in the owner console (owner creates it, e.g. `Hasdro/sales-shield-logs`). Content: company, user id, platform + OS, app version, device; call id; per-stage timings; connection status (STT, models, Zoho, Gallabox, email); automations and scheduled jobs; errors with stacks; model requests/replies as **structure and sizes only** (no text). Never: transcripts, customer names, phones, emails, keys. Healthy call → label `healthy`, closed at once; errors or p95 > 1500 ms → open, `needs-attention`. Background failures (schedules, syncs, webhooks) get their own issues, deduplicated by error fingerprint. Body ≤ 60 000 chars: summary in the body, details in up to 5 comments, oldest cut first and marked.
- **L4 Log switch.** Owner-only, per company and per user (user inherits company unless overridden), default OFF, audit-logged.
- **L5 Local safety copy.** Always on: critical errors only, redacted, ≤ 5 MB / 7 days, in the app's data folder; queues uploads when sending is on and the network is down. "Copy diagnostics" in Help.
- **L6 Local / offline models.** Owner enables per company and per user, text and voice separately, default OFF. The user enters a URL (localhost or company network; OpenAI-compatible for text, e.g. Ollama / LM Studio; local Whisper-type server for speech-to-text; local TTS server for voice) and presses **Test**, which runs a short benchmark. If it meets R1 it may drive live cards; if not, it is used for post-call drafts, memory merge, coach and summaries, **unless the user opts in to "use it for live cards anyway"** after a warning showing the measured delay (D-096). Status shows "Local model: connected ✓ / unreachable". On failure mid-call: cloud backup if the owner-set company setting "Allow cloud backup" is on (default on); otherwise the holding line. Every fallback logged (metadata only).

### Speed and stability
- **S1 Budgets** (packaged app, Apple chip Mac; in `CONSTRAINTS.md`, measured by a script each release): cold start to home ≤ 3 s; screen/tab switch ≤ 300 ms; card on screen ≤ 100 ms after the model's first token; memory during a call ≤ 500 MB; average CPU during a call ≤ 25 %.
- **S2 Failures stay small.** Every screen and panel sits inside a shared error wrapper ("This part didn't load – Retry"), never a blank app. The live card area is isolated. If the audio or AI pipeline drops, it restarts itself and resumes the same call within 3 s ("Reconnecting…"). Today there are **no** error boundaries, **no** fetch timeouts, **no** Electron crash handlers and **no** disk log.
- **S3 Launch test.** Every installer (Apple chip Mac, Windows) is launched before publishing: opens, reaches sign-in, closes. Failure blocks publishing. Intel Mac builds stop (D-097).
- **S4 Network.** Every server/model call has a timeout, ≤ 2 retries with growing waits, and a plain message on failure. Offline: banner; follow-ups and feedback queue and send later; nothing lost.

## 3. Contracts (everyone builds against these)

### 3.1 Feature IDs (add your own block to `apps/agent-worker/sotto_worker/cloud/features.json`; the merger joins the blocks)
| ID | Owner agent | Default |
|---|---|---|
| `card_style_v2` (C1–C3) | 1 | on |
| `call_state` (C5) | 1 | on |
| `talk_meter` (C8) | 1 | on |
| `postcall_wizard` (A1) | 2 | on |
| `style_memory` (A3–A4) | 2 | on |
| `prep_coach` (B1–B2, text) | 3 | on |
| `voice_coach` (V1–V4) | 3 | **off**, owner-configured |
| `morning_brief` (V5) | 3 | on |
| `call_logs_github` (L3–L4) | 4 | **off** |
| `local_models_text`, `local_models_voice` (L6) | 4 | **off** |
| `setup_guide` (L2) | 4 | on |

Per-user owner overrides exist only for `call_logs_github`, `local_models_text`, `local_models_voice` (D-095). Agent 4 builds the per-user override mechanism; others don't need it.

### 3.2 Model-router stages (seed data only; no model names in code)
`call_state` (1), `quality_judge` (1, reuse the existing judge stage if present), `memory_merge` (2), `coach_stt`, `coach_llm`, `coach_tts` (3). Agent 4 owns router code and the local-endpoint support; other agents add their stage seed entries in their own block and call the router through its existing interface.

### 3.3 Prompt variables (prompt registry; text in `seed/prompts/`)
| Variable | Written by | Read by |
|---|---|---|
| `{{agent.style_memory}}` | 2 (`get_style_memory`) | 1 (`suggest`) |
| `{{call.game_plan}}` | 3 (saved with the call's brief) | 1 (`suggest`) |
| `{{call.state}}` | 1 | 1 |
| `{{company.tone}}`, `{{agent.tone}}`, `{{tone.banned}}` | 1 | 1 |

New prompt files per agent: 1 `call_state.md`, `quality_judge.md` (if new) and edits to `suggest.md`; 2 `memory_merge.md`; 3 `coach_prep.md`, `coach_review.md`, `game_plan.md`, `morning_brief.md`.

### 3.4 Server functions (Python, `sotto_worker/cloud/…`)
```python
# Agent 2 — sotto_worker/cloud/memory/api.py
def add_feedback(company_id: str, user_id: str, call_id: str | None,
                 source: Literal["card", "call_note", "coach_review"],
                 rating: Literal["up", "down"] | None, reasons: list[str],
                 note: str | None, card_id: str | None = None) -> str: ...
def get_style_memory(company_id: str, user_id: str) -> list[str]:  # ≤ 12 rules, company rules first
    ...

# Agent 3 — sotto_worker/cloud/coach/api.py
def get_game_plan(company_id: str, call_id: str) -> str | None: ...  # rendered text ≤ 150 words

# Agent 4 — sotto_worker/cloud/obs/log.py  (and apps/app/lib/obs.ts with the same shape)
def log_event(stage: str, event: str, *, call_id: str | None = None,
              level: Literal["info", "warn", "error"] = "info",
              duration_ms: int | None = None, **meta: str | int | bool) -> None: ...
# meta is metadata only: never transcript text, names, phones, emails, keys.
```

### 3.5 Client building blocks (Agent 4 provides, everyone uses)
- `apps/app/components/SafeBoundary.tsx`: `<SafeBoundary name="wizard.step2">…</SafeBoundary>`, retry button, reports through `obs.ts`.
- `apps/app/lib/obs.ts`: `logEvent(stage, event, meta)`.
- `apps/app/lib/cloud.ts` `request()` gets the timeout/retry; other agents add their API calls in their own `apps/app/lib/<area>.ts` files that call the exported `request`, never editing `cloud.ts`.
- Offline queue: `apps/app/lib/outbox.ts` `enqueue(kind, payload)` for follow-ups and feedback.

### 3.6 Database
New tables go in new modules (`cloud/memory/store.py`, `cloud/coach/store.py`, `cloud/obs/store.py`, `cloud/cards/store.py`), each with `company_id`, access checks and an isolation test (company A cannot read, insert, update or delete company B rows). Do not restructure `cloud/store.py`; if you must touch it, add only a registration line and say so in the handoff.

### 3.7 Owner console and admin screens
New files per agent: owner console `cloud/owner/memory.*` (2), `cloud/owner/coach.*` (3), `cloud/owner/logs.*`, `cloud/owner/local-models.*`, `cloud/owner/setup.*` (4). Admin screens: new files under `apps/app/app/admin/` named for the feature (`tone.tsx` 1, `memory.tsx` 2, `coach.tsx` 3, `setup.tsx` 4). Adding a menu link to a shared nav file is allowed: one line, noted in the handoff.

## 4. Rules that still apply (from CLAUDE.md, unchanged)
- Only the customer track triggers a card. Agent track is context only.
- After any change to worker pipeline, STT, LLM adapters, prompts or model config: `pnpm replay --all`, report p50/p95; p95 > 1500 ms is a failure.
- No model names and no prompt text in application code; provider SDKs only in `adapters/`.
- No secrets in code or git; new env vars in `.env.example` without a value.
- UI uses `packages/ui` tokens/components; check light + dark, 390 px + 1280 px, LTR + Arabic RTL; axe 0 serious.
- Never lower a quality bar (`CONSTRAINTS.md`): no skipped/deleted tests, no `@ts-ignore` without a note, no loosened thresholds.
- No user-facing "Sotto" (brand is AGN Sales Shield).

## 5. Decisions and requirement changes this round (merger applies)
- **D-094 Card style v2.** C1–C3 and C6. Supersedes the 25-word limit in `seed/prompts/suggest.md` v4.
- **D-095 Per-user owner overrides.** R7 says "no per-user toggle". Exception: the owner (only) may override `call_logs_github`, `local_models_text`, `local_models_voice` per user. Add to R7.
- **D-096 Slow local model for live cards (R1 exception).** Per-user opt-in after a warning. The holding line still appears at 1.5 s; the local card replaces it when ready, with a "local model – slower" badge. That user's calls are measured but excluded from the p95 alarm. Add to R1.
- **D-097 Desktop releases: Apple chip Mac + Windows.** Intel Mac builds stop from 0.7.0. Supersedes the "arm64 + x64" line in R5a.
- **D-098 Automatic call-log issues.** L3–L5; issues go to a separate private repo without approval; redaction rules as in L3. The existing client bug-report → review queue → GitHub flow stays for user-written reports.
- **D-099 Round 4 working rules.** L1 default-on rule (with the three default-off exceptions); four offline agents; owned files; decision ranges; merge order 4 → 2 → 1 → 3; version 0.7.0.
