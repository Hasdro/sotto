# Phase 2 — Suggestion engine, model router, replay and the 1.5 s proof

```
/spec then /plan then /build for the suggestion engine in apps/agent-worker.
No live calls yet. Tests first for trigger rules, router selection and fallback.

1. Model router: per-stage config (stt, turn, trigger, suggest, suggest_backup,
   summary, embed, judge) → provider adapter. Adapters: anthropic, openai,
   openai_compatible (base_url + key; covers Ollama, vLLM, LM Studio, Groq,
   OpenRouter). Config comes from a file now, DB in Phase 6.
2. Prompt registry: prompts loaded by key + version from prompts-seed/*.md with
   {{variables}}; no prompt text in code.
3. `pnpm replay <file|--all>` streams each test-calls recording in real time with
   customer and agent as separate tracks through the real STT vendor.
4. Only customer turns trigger. End-of-turn model, not fixed silence.
5. Trigger → playbook lookup → if no confident match, the suggest stage model with
   the last 60 s + playbook (prompt-cached). Stream the card.
6. R2 chain: backup model if no first token in 700 ms or error; backup STT; holding
   line + escalation record if no safe answer.
7. Log per card: each stage ms, total, model used, source (playbook/AI/backup/holding).
8. Quality: LLM judge (judge stage, rubric in prompts-seed) vs test-calls moments.

Print a table: p50/p95/max per stage and total, quality per call. Fail if p95 > 1500 ms.
Then run the replay once with a local Ollama model on the suggest stage and report
whether it meets R1 on this machine. Show both tables as evidence.
```

**Done when:** p95 ≤ 1500 ms on the golden set, fallback tests pass, Ollama path works.
