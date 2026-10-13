# Phase 2 — Suggestion engine, model router, prompt registry, replay

## Goal

Build the brain of Sotto, without live calls:

    customer turn → trigger → playbook → model → streamed card

The pipeline uses the R2 fallbacks, configurable prompts and models (R6), and a replay harness that proves R1 and R4 on the golden set.

## Entry criteria

- The Phase 1 gate has been met.
- P2.1–P2.7 can run without recordings. P2.8 needs the golden calls from P0.5.

## Read first

- `docs/REQUIREMENTS.md` R1, R2, R4, R6
- `docs/ARCHITECTURE.md`: the pipeline, the fallback state machine, the latency budget
- `docs/ENGINEERING.md` §3–§9
- `playbook/`, `test-calls/README.md`
- `docs/REFERENCES.md`:
  - LiveKit Agents (turn detection)
  - Anthropic (streaming, prompt caching)
  - OpenAI-compatible endpoints
  - the STT vendors

## Skills and subagents

- Use `/spec` to write `spec/phase-2-engine.md`, then `/breakdown`, then `/build` with TDD.
- Use `source-driven-development` for every SDK.
- Use `performance-optimization` and `observability-and-instrumentation`.
- Run `latency-guardian` after each pipeline change and `code-reviewer` per PR.

## Environment

- **Cloud** works for P2.1–P2.7 with fake adapters, and for P2.8 if the network is enabled and the keys are set as environment secrets.
- **Local** is needed for P2.9 (Ollama).

## Tasks

### P2.1 — Contracts and fakes

Define the following in the worker:
- `LLMAdapter`, `STTAdapter` and `Stage` (see ENGINEERING §4);
- `TranscriptEvent` with speaker, partial/final and timestamps;
- the `Card` model, matching the `packages/shared` schema.

Then write fake adapters with scripted timing (first-token delay, errors, hangs) on an injectable clock.

**Acceptance:**
- Contract tests pass for the fakes.
- The rest of the worker depends only on the protocols.

### P2.2 — Model router

- Resolve each stage to an adapter instance from config.
- The config comes from `seed/models/*.yaml` now, and from the DB in Phase 6.
- It is resolved per company, with the platform default as the base.
- It sets the timeouts, the first-token deadline (default 700 ms) and the backup stage.

**Acceptance:** unit tests cover:
- choosing the right adapter per stage and per company;
- falling back on an error;
- falling back when the deadline passes without a first token, using the fake clock;
- not falling back when the backup is disabled for the company.

### P2.3 — Real adapters

Build these adapters, following the current official docs:
- `anthropic` (streaming, prompt caching on the stable prefix);
- `openai`;
- `openai_compatible` (base_url + key + model; covers Ollama, vLLM, LM Studio, Groq, OpenRouter);
- one primary STT vendor and one backup STT vendor, chosen from the D-NNN shortlist made in Phase 0.

**Acceptance:**
- Adapter contract tests pass, recorded with VCR/cassettes or skipped without keys, and clearly marked.
- No SDK is imported outside `adapters/`; the boundaries check is green.

### P2.4 — Prompt registry

- Load prompts by `key`, using front matter (key, stage, version, variables, scope) from `seed/prompts/`.
- Render with `{{variables}}`, and fail on an unknown or missing variable.
- Resolve the scope: campaign > team > company > platform.
- Seed these prompts: `trigger.classify`, `suggest.live`, `suggest.holding_line`, `summary.after_call`, `judge.card_quality`.

**Acceptance:** rendering and scope tests pass, and there is no prompt text in the Python code.

### P2.5 — Pipeline

1. Use the customer-track turn detection from an end-of-turn model, not a fixed silence; use the LiveKit turn detector or the vendor's endpointing.
2. The trigger classifier decides one of: question / objection / buying signal / none. Skip "none" cheaply.
3. Match against the playbook:
   - embeddings, or BM25 to start;
   - a fast path for the top FAQs;
   - a confidence threshold read from config.
4. Choose the suggestion source:
   - a confident playbook match → a playbook card (an optional LLM rephrase is allowed only if it fits the budget);
   - otherwise → the `suggest` stage, with the last 60 s of transcript, the playbook digest and the company profile, all prompt-cached.
5. Stream the card deltas.

Drafting on the partial transcript is allowed if it measurably reduces p95; keep it behind a flag.

**Acceptance:** unit tests prove:
- agent turns never trigger;
- "none" produces no card;
- a playbook match skips the LLM;
- the card streams.

### P2.6 — The R2 chain

Implement this chain:

    backup model → holding line at 1500 ms if no first token → escalation record (email stubbed until Phase 7)

The company settings `allow_ai_outside_playbook` and `allow_backup_provider` are respected.

**Acceptance:** tests cover each branch, and exactly one escalation is created per unanswered question.

### P2.7 — Telemetry

- Write a timing event per card with each stage's duration in ms, the total, the provider/model, the source and the fallback reason.
- For now, write events to a JSONL file in replay mode; Phase 5 writes them to `card_timings`.

**Acceptance:** the replay summary is computed from these events only.

### P2.8 — Replay harness and judge

- `pnpm replay <id|--all>` streams the customer and agent WAVs in **real time** as separate tracks through the real STT.
- It applies the pipeline and records the timings.
- The judge stage scores each card against the labelled `good_suggestion` (rubric in `seed/prompts/judge.card_quality.md`).

The run outputs:
- a table of p50 / p95 / max per stage and for the total;
- the quality per call;
- the agent-trigger count, which must be 0.

The run exits non-zero if p95 > 1500 ms or the agent-trigger count > 0. Add it to CI as a manual or nightly job, since it needs keys and audio.

**Acceptance:** the table is pasted into the session log, with p95 ≤ 1500 ms. If p95 is over the limit, optimise using the levers in ENGINEERING §9 and report each change's effect.

### P2.9 — Local model proof (local only)

1. Run the replay with `suggest` → Ollama (OpenAI-compatible) on the Mac.
2. Report whether it meets R1, and on what hardware.
3. Record the benchmark format that Phase 6 will display.

**Acceptance:** the table is in the log, and the D-NNN entry records which local models are allowed on the live stages.

## Exit gate

- [ ] Golden-set replay p95 ≤ 1500 ms, and the agent-trigger count is 0. The evidence table is in the tracker.
- [ ] All R2 branch tests pass, and the primary-blocked replay still meets 1500 ms with the backup.
- [ ] The R6 checks pass: no model names or prompt text in code; switching a stage's model in YAML changes the behaviour with no code change; the Ollama path runs.
- [ ] `latency-guardian` and `code-reviewer` findings are resolved.

## Out of scope

Live calls, UI, DB persistence (files are fine), email delivery.

## Pitfalls

- **Measuring the wrong thing.** The clock starts at the customer's end of speech in the audio, not when the transcript arrives.
- **Prompt caching silently missing.** Check the cache-hit fields in the responses.
- **Cassette tests hiding real latency.** Latency claims come only from real-time replay.
- **The LLM rephrasing a playbook card** can cost 400 ms. Measure it before keeping it.

## Owner actions

- Provide the API keys:
  - Anthropic and OpenAI;
  - the two STT vendors.

  Locally, these go in `.env`. In the cloud, set them as environment secrets.
- Provide the 10 recordings.
- Install Ollama on the Mac for P2.9 (`brew install ollama`).
