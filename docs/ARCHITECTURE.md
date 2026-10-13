# Architecture (DRAFT — finalized in Phase 1)

## Overview

```
Customer phone ──SIP trunk──▶ Media server (LiveKit) ◀── Agent app (iOS/Android/web/desktop)
                                   │  customer track (only this triggers)
                                   ▼
                              AI worker
          STT ▶ end-of-turn ▶ playbook lookup ▶ model router ▶ card ──data channel──▶ Agent app
                                   │                 │
                     prompt registry          adapters: Anthropic · OpenAI · OpenAI-compatible
                                   │                 (Ollama, vLLM, LM Studio, Groq, OpenRouter)
                                   ▼
                     Database (tenants, RLS) · CRM adapter (Zoho) · Email adapter
```

## Components (proposed)

| Component | Proposed tech | Notes |
|---|---|---|
| Agent app | Expo (React Native + TS) for iOS, Android, web | D-005 open; LiveKit Expo SDK needs dev builds |
| Desktop | Installable web app; Tauri shell later | |
| Calls | LiveKit + SIP trunk (Yeastar or Twilio/Telnyx) | Separate track per participant |
| AI worker | LiveKit Agents (Python) | Reads company config per call |
| Model router | Own module over provider adapters | Per-stage provider/model/settings from DB |
| Prompt registry | DB table, versioned, scoped platform → company → team → campaign | Seeded from `seed/prompts/` files |
| Data | Supabase (Postgres + RLS, auth, storage) | Separate dev and prod projects |
| Email | Resend / Postmark / ZeptoMail via adapter | Escalations, trial reminders |
| Observability | Sentry + card latency table | Feeds R1 dashboard |

## Latency budget (target, per R1)

| Stage | Budget |
|---|---|
| Audio + network | 100 ms |
| End of turn | 250 ms |
| Final transcript | 100 ms |
| Playbook lookup | 50 ms |
| Model first token | 450 ms |
| Render | 60 ms |
| **Total** | **~1010 ms (headroom to 1500)** |

## Failure modes (to complete in Phase 1)

Primary LLM down/slow · STT down · media server reconnect · DB unreachable · email provider
down · CRM rate-limited · local model too slow · agent offline mid-call.
