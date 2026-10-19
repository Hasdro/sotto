# Sotto — Requirements

Source of truth for every feature. Each requirement ends with acceptance tests.
A feature is not done until its acceptance tests pass and the evidence is shown.

---

## R1 — Suggestion in 1.5 seconds or less

Measured from the moment the customer stops speaking to the first word of the
suggestion on the agent's screen. 1500 ms is the **maximum (p95)**, not the average.

Techniques expected: end-of-turn model (not fixed silence), prompt caching and warm
connections, drafting while the customer is still speaking, instant answers for
top FAQs from the playbook index, streamed cards.

**Acceptance tests**
- Every card logs per-stage and total delay. Admin dashboard shows p50/p95 per day and per company.
- `pnpm replay --all` runs the golden recorded calls; p95 total > 1500 ms fails CI.
- Cards stream word by word; the first word counts as "shown".
- If no suggestion is ready by 1500 ms, the card shows the holding line (R2), never nothing.

## R2 — Never leave the agent empty-handed

**Answer chain, per customer question**
1. Playbook answer (high-confidence match).
2. General AI answer, labelled "Not in playbook — check before promising" (company setting can disable).
3. No safe answer → holding line ("Good question. Let me confirm that and send it to you today.").
4. Escalation email to the company's sales manager within 1 minute: customer, question,
   transcript excerpt, CRM link, agent.
5. Manager answers in the app; after approval the answer is added to the playbook.

**Provider fallback, per request**
- Primary model fails or has no first token within 700 ms → backup model (e.g. OpenAI).
- Speech-to-text has a backup vendor too.
- A company admin can disable any backup provider (data-sharing reasons).

**Acceptance tests**
- With the primary model blocked, cards still arrive within 1.5 s from the backup.
- No playbook match + "no AI guesses" on → holding line + exactly one manager email.
- "Unanswered questions" inbox lists every escalation: open / answered / added to playbook.

## R3 — Many companies, many users, many devices (multi-tenant)

| Can…                                       | Platform owner | Company admin | Sales manager | Agent |
|--------------------------------------------|----------------|---------------|---------------|-------|
| Create companies, set plans and trials     | yes            | no            | no            | no    |
| Invite users, set roles, billing           | yes            | yes           | no            | no    |
| Edit playbook, prompts, models; approve answers | support only | yes        | yes (playbook) | no   |
| See team calls, reports, escalations       | support only   | yes           | own team      | no    |
| Take calls, see suggestions, own history   | no             | yes           | yes           | yes   |

Plan states: **trial** (default 14 days, seat + minute limits, banner with days left),
**active**, **expired/suspended** (sign-in works, calls blocked, data kept 30 days).

**Acceptance tests**
- Database-level isolation (RLS): for every table, a user of company A cannot select,
  insert, update or delete rows of company B. Runs in CI.
- Same profile and history on phone and laptop; per-device sign-out; admin can revoke a device.
- Trial blocks calling the day after expiry; reminder email 3 days before.
- Every admin action (role, playbook, prompt, model, plan change) is in the audit log.

## R4 — Listen only to the customer

Suggestions are triggered only by the customer's voice. Each side of the call is a
separate audio track.

| Situation | How the customer is isolated | Reliability |
|---|---|---|
| Call made through the app (any device) | App is the phone; customer is a separate server-side track | Exact |
| Desktop with another softphone | System/call audio = customer, mic = agent (per-OS capture) | Exact |
| Normal call from the phone's own dialer | Not possible: iOS and Android block call audio for apps | Blocked |
| Speakerphone / in-person | Agent voice sample (30 s) + speaker matching drops agent speech | Approximate, badge shown |

The agent track may be transcribed as context only (setting); it never triggers a card.

**Acceptance tests**
- Replay: nothing the agent says ever triggers a card.
- Live test call through the app: customer transcript contains no agent sentences.
- Voice-sample mode shows a visible "approximate" badge.

## R5 — One app on iPhone, Android, Windows, Mac and Linux

One codebase. Modern, consistent design, light and dark, Arabic right-to-left support.

**Acceptance tests**
- Release builds: iOS (TestFlight), Android (internal testing), desktop (installable web app, later Tauri installers).
- In-call screen passes a visual check on small phone, large phone and laptop, light and dark.
- A full test call works on at least one device per platform before any release.

## R6 — Modular and configurable: prompts, models, modules

Nothing about prompts or models is hard-coded. Companies (and the platform owner) can
change them without a code release.

**Prompt studio**
- Every prompt (trigger classifier, suggestion, summary, escalation email, judge…) is a
  versioned record with variables, e.g. `{{playbook.match}}`, `{{transcript.last_60s}}`,
  `{{crm.deal.stage}}`, `{{company.tone}}`.
- Prompts can be defined at platform, company, team or campaign level; the most specific wins.
- Before publishing, a prompt version can be tested against recorded calls (quality score + latency).
- One-click rollback to any previous version.

**Model router**
- Each pipeline stage has its own provider + model + settings: speech-to-text, end-of-turn,
  trigger classifier, live suggestion, backup suggestion, after-call summary, embeddings, judge.
- Providers through adapters: Anthropic, OpenAI, Google, and **any OpenAI-compatible endpoint**
  (Ollama, vLLM, LM Studio, Groq, OpenRouter, Together…) so open-source and local models work.
- Self-hosted speech-to-text (e.g. Whisper-based servers) can be added the same way.
- A stage may only use a model whose last benchmark on the golden set meets R1 for that
  stage; the settings screen shows that benchmark next to each model.

**Keys & providers panel** (owner request, 2026-10-20, D-019)
- The platform owner and company admins add, test, replace and remove provider keys in the app. Each vendor has a "Get a key" link and short instructions.
- Each stage's vendor is chosen in the same panel. Keys are write-only, encrypted, never shown again after saving, and only sent to their own vendor.

**Modules**
- Telephony, CRM (Zoho first; HubSpot/Salesforce later), email, and storage sit behind
  interfaces so a new provider is a new adapter, not a rewrite.
- Features can be switched on/off per company (feature flags).

**Acceptance tests**
- Change the live-suggestion model of one company in the admin UI; the next call uses it; no deploy.
- Add a new OpenAI-compatible endpoint (e.g. local Ollama URL) in the UI and run the replay with it.
- Create prompt v2, test it on recordings, publish, then roll back to v1.
- Grep check in CI: no provider SDK is imported outside `adapters/`; no model name string outside config/seed data.
- Add a key in the Keys & providers panel, test it, select it for a stage; the next call uses it; the key never appears in any API response.
