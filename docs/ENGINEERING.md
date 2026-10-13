# Engineering standards

These rules keep the code coherent across sessions and agents. If a rule blocks you,
propose a change as a decision; do not quietly break it.

---

## 1. Repository layout (target; Phase 1 creates it)

```
sotto/
├─ apps/
│  ├─ app/                      Expo (React Native + TS): iOS, Android, web. Agent + admin UI.  (D-005)
│  │  ├─ app/                   expo-router screens: (auth)/, (agent)/, (admin)/
│  │  ├─ features/              call/, cards/, history/, playbook/, prompts/, models/, team/, billing/
│  │  └─ lib/                   supabase client, livekit client, i18n, telemetry
│  └─ agent-worker/             Python 3.12, LiveKit Agents worker + replay harness
│     ├─ sotto_worker/
│     │  ├─ pipeline/           turn.py, trigger.py, playbook.py, suggest.py, fallback.py, card.py
│     │  ├─ router/             stage → adapter resolution, timeouts, fallback policy
│     │  ├─ prompts/            registry: load by (key, scope) → render with variables
│     │  ├─ adapters/           ONLY place provider SDKs are imported
│     │  │  ├─ llm/             anthropic.py, openai.py, openai_compatible.py, fake.py
│     │  │  ├─ stt/             <vendor>.py, fake.py
│     │  │  ├─ email/  crm/     resend.py / zoho.py, fake.py
│     │  ├─ telemetry/          card timing events, structured logs
│     │  └─ config/             typed settings (pydantic), no secrets in code
│     ├─ replay/                golden-set replay + judge
│     └─ tests/
├─ packages/
│  ├─ ui/                       design tokens + components (only UI source for apps)
│  └─ shared/                   TS types, zod schemas, generated DB types, card protocol
├─ supabase/
│  ├─ migrations/               SQL, forward-only
│  ├─ tests/                    pgTAP: RLS isolation per table
│  ├─ functions/                edge functions: livekit-token, escalation-email, admin actions
│  └─ seed.sql                  dev-only fake companies/users
├─ seed/
│  ├─ prompts/                  default prompts: one .md per key, YAML front matter
│  └─ models/                   default stage → provider/model routing (YAML)
├─ playbook/  test-calls/       business content + golden-set labels (no audio)
├─ spec/  tasks/                agent-skills specs and current plan
├─ scripts/                     doctor.sh, check-boundaries.sh, dev helpers
└─ docs/
```

If D-005 picks Flutter, `apps/app` becomes a Flutter app and `packages/ui` becomes a Dart
package. Everything else stays the same.

## 2. Languages and versions

| Area | Choice |
|---|---|
| Package manager | pnpm workspaces (Node 22 LTS or newer) |
| App | TypeScript `strict`, Expo SDK (current stable at Phase 1), expo-router |
| Worker | Python 3.12, `uv`, `ruff` (lint + format), `mypy --strict` on `sotto_worker/`, `pytest` |
| DB | Postgres via Supabase, SQL migrations, pgTAP tests |
| Lint/format TS | ESLint + Prettier (or Biome; decide once in Phase 1) |

Pin exact versions in lockfiles. Upgrade on purpose, never as a side effect.

## 3. Boundaries (checked in CI by `scripts/check-boundaries.sh`)

- Provider SDK imports (`anthropic`, `openai`, STT vendors, `resend`, Zoho client, Stripe) only under `adapters/`.
- No model-name strings (`claude-`, `gpt-`, `llama`, `whisper`…) outside `seed/models/`, tests and adapters' capability tables.
- No prompt text in code. Prompts are rendered by the registry from `seed/prompts/` (DB from Phase 6).
- `apps/app` never imports from `apps/agent-worker` and never holds a provider key.
- UI code imports colors, spacing and type only from `packages/ui`.

## 4. Core interfaces (keep stable; change only with a decision)

```python
# router: one call per pipeline stage
class LLMAdapter(Protocol):
    async def stream(self, req: LLMRequest) -> AsyncIterator[LLMChunk]: ...   # first chunk ASAP
    capabilities: ModelCapabilities                                            # context, caching, json

class STTAdapter(Protocol):
    async def transcribe(self, audio: AsyncIterator[AudioFrame], opts: STTOptions) -> AsyncIterator[TranscriptEvent]: ...

Stage = Literal["stt", "turn", "trigger", "suggest", "suggest_backup", "summary", "embed", "judge"]
```

**Card protocol** (worker → app over the LiveKit data channel; schema in `packages/shared`):

```json
{ "v": 1, "card_id": "uuid", "call_id": "uuid", "seq": 3,
  "type": "answer|question|objection|warning|holding",
  "source": "playbook|ai|backup|holding", "label": "Not in playbook — check before promising",
  "delta": "next words…", "done": false,
  "timing": { "turn_end_ms": 0, "stt_final_ms": 0, "lookup_ms": 0, "first_token_ms": 0 } }
```

Cards stream as deltas. The app renders the first delta immediately; `done: true` closes the card.

## 5. Configuration and secrets

- Typed settings objects; read env once at startup; fail fast with a clear message on missing config.
- Secrets live in `.env` (local), cloud environment secrets (Claude Code on the web), Supabase
  secrets / Vault (server), EAS secrets (builds). Company-supplied provider keys are stored
  encrypted server-side and never sent to the app.
- `.env.example` lists every variable with a comment and no value.

## 6. Errors, timeouts, fallbacks

- Every network call has a timeout. Defaults: LLM first token 700 ms → backup (R2); STT
  reconnect 2 s → backup vendor; DB 2 s; email/CRM async with retry + dead letter.
- No silent catches. Either handle (with a fallback that R2 describes) or raise with context.
- The live path never blocks on email, CRM, analytics or summary work. Those are async jobs.

## 7. Observability

- Structured JSON logs with `company_id`, `call_id`, `card_id`, `stage`, `ms` (no transcript text in logs).
- One `card_timings` row per card: each stage ms, total, model, provider, source, fallback reason.
- Sentry in app and worker (Phase 8 wires alerts). PII scrubbing on.

## 8. Testing strategy

| Layer | Tool | What it proves |
|---|---|---|
| Unit | pytest / vitest (jest-expo for RN) | logic: trigger rules, router selection, fallback timing (fake clock), prompt rendering |
| Contract | pytest with fake adapters | every adapter obeys the Protocol; fake adapters are used everywhere else |
| DB | pgTAP (`supabase test db`) | RLS isolation for every table × role × operation |
| Replay | `pnpm replay` | R1 latency p50/p95, R4 (agent never triggers), suggestion quality via judge |
| UI | Playwright on web build + screenshots; Maestro or Detox on devices (Phase 4) | screens match DESIGN.md; flows work |
| Load / drills | Phase 8 scripts | concurrency, failure modes |

Rules: tests first for logic; one behaviour per test; no network in unit tests (fakes);
flaky test = bug, fix or quarantine with a tracker entry, never ignore.

## 9. Performance budget (R1)

| Stage | Budget |
|---|---|
| Audio + network | 100 ms |
| End of turn | 250 ms |
| Final transcript | 100 ms |
| Playbook lookup | 50 ms |
| Model first token | 450 ms |
| Render | 60 ms |
| **Total** | **~1010 ms, hard limit 1500 ms p95** |

Techniques: end-of-turn model, warm connections, prompt caching (stable system prefix:
company profile + playbook digest), drafting on partial transcript, playbook fast path
for top FAQs, streaming. Measure before optimising; record every change's replay result.

## 10. Security and privacy baseline

- Supabase Auth; RLS on every table; service role only in edge functions/worker, never in the app.
- LiveKit tokens minted server-side per call with least privilege (agent can publish mic,
  subscribe; worker subscribes customer).
- Recording consent per company setting; retention per company; deletion jobs.
- Audit log for every admin action. OWASP ASVS L2 for the API, MASVS for mobile as the checklist.
- Dependencies: audit in CI; new dependency = one line in the PR explaining why.

## 11. UI, i18n, accessibility

- Tokens only; light and dark; `I18nManager`/`dir` RTL for Arabic; no hard-coded strings (i18n keys).
- WCAG 2.2 AA contrast; touch targets ≥ 44 pt; the suggestion card readable at arm's length
  in one second (large type, one main sentence).

## 12. Database rules

- Every table: `id uuid`, `company_id uuid not null` (except global tables listed in ARCHITECTURE), `created_at`, RLS enabled, policies per role, pgTAP isolation test in the same PR.
- Forward-only migrations; expand/contract for renames; never edit an applied migration.
- Generated types committed to `packages/shared`.

## 13. Definition of done (every task)

- Acceptance criteria of the task met with evidence (output, numbers, screenshots).
- Tests added/updated and green; typecheck and lint clean; boundaries check clean.
- Replay run if the live path was touched; p95 ≤ 1500 ms.
- Reviewed by the right subagent(s); real findings fixed.
- Docs touched where behaviour changed (ARCHITECTURE, DESIGN, DECISIONS, `.env.example`, CLAUDE.md commands).
- Tracker updated; committed; pushed.
