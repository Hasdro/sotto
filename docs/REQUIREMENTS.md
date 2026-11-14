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
- Primary model fails or has no first token within 700 ms of its own time → backup model (e.g. OpenAI). D-025 (owner, 21 Oct 2026): configured as 1150 ms from the end of speech, since the request leaves ~0.6 s after it.
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

Self-signup (D-068): the Zoho Forms sign-up on the landing page also creates a **trial** company and its first admin invite, rate-limited and listed in the owner's sign-up queue; every other company is created by the platform owner.
Prompts and models (D-059): the company admin's "yes" applies only when AGN enables "bring your own" for that company; otherwise AGN sets them in the owner console.

Plan states: **trial** (default 14 days, seat + minute limits, banner with days left),
**active**, **expired/suspended** (sign-in works, calls blocked, data kept 30 days).

**Acceptance tests**
- Database-level isolation (RLS): for every table, a user of company A cannot select,
  insert, update or delete rows of company B. Runs in CI.
- Same profile and history on phone and laptop; per-device sign-out; admin can revoke a device.
- Trial blocks calling the day after expiry; reminder email 3 days before.
- A self-signup creates exactly one trial company and one admin invite, is rate-limited, and shows in the owner sign-up queue (D-068).
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

The agent track may be transcribed as context only (platform default, D-062); it never triggers a card.

**Acceptance tests**
- Replay: nothing the agent says ever triggers a card.
- Live test call through the app: customer transcript contains no agent sentences.
- Voice-sample mode shows a visible "approximate" badge.

## R5 — One app on iPhone, Android, Windows, Mac and Linux

> **Superseded 2026-11-12 by R5a (D-027).** Kept for history; mobile, extension and Linux are on hold.

One codebase. Modern, consistent design, light and dark, Arabic right-to-left support.

**Acceptance tests**
- Release builds: iOS (TestFlight), Android (internal testing), desktop (installable web app, later Tauri installers).
- In-call screen passes a visual check on small phone, large phone and laptop, light and dark.
- A full test call works on at least one device per platform before any release.

## R6 — Modular and configurable: prompts, models, modules

Nothing about prompts or models is hard-coded. Companies (and the platform owner) can
change them without a code release.

**Prompt studio**
- Run by AGN in the owner console; a company admin edits company-level prompts only when AGN enables "bring your own" for that company (D-059).
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

**Keys & providers panel** (owner request, 2026-10-20, D-019; moved to the owner console by D-059)
- The panel and the model router settings live in the owner console and use AGN's shared platform keys (D-061). A company admin sees them only when AGN enables "bring your own" (BYO) for that company; "company admins" below means that BYO case.
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

## R5a — Desktop first: macOS and Windows (supersedes R5, D-027)

One codebase; releases are the macOS and Windows desktop apps. Light and dark, Arabic RTL. Mobile, extension and Linux code stay and keep passing tests, with no release work.

**Acceptance tests**
- Each version ships a macOS DMG (arm64 + x64) and a Windows installer with the same version number.
- A full test call works on a Mac and on a Windows PC before a release is published.

---

The requirements below come from the phase 9 brief (`docs/phases/phase-9-product-round.md`), which holds the full detail.

## R7 — Feature flags (D-028, D-036)

Every capability has one state: available, off_by_platform, off_by_org, needs_connection, no_permission. Platform entitlement and a global kill switch (owner), an org toggle (admin, default on), role rules. No per-user toggle.

**Acceptance tests**
- For each non-available state, the server rejects the action with `feature_unavailable` and the state; a test covers every state.
- Unavailable workflow features are greyed with a one-line reason and an action; role-irrelevant ones are hidden.
- The global kill switch turns a feature off for every org within 10 minutes without a deploy.
- Every existing capability (call review, follow-up, recordings, reports, AI knowledge, integrations) is in the catalog.

## R8 — AGN Sales Shield brand and density (D-026)

**Acceptance tests**
- No user-facing "Sotto" remains (grep check on strings, installers, tray, About, favicon).
- The live call shows only the suggestion card, the call status and one collapsed context-rail toggle; one card expanded at a time.
- The mascot shows the right mood for review scores 80, 65, 50, 30 and no review.
- Light, dark, RTL, 390 px and 1280 px screenshots; axe 0 serious; replay p95 ≤ 1500 ms.

## R9 — Stay signed in (D-029)

**Acceptance tests**
- Sign-in survives an app restart, an update, an offline start and a server 5xx.
- A token unused for 90 days no longer works; an active user is never asked to sign in again.
- A reused refresh token revokes the device session.
- Tokens are in OS secure storage on desktop, not in localStorage.
- A 0.2.0 sign-in carries over to 0.3.0 without a new login.

## R10 — Pre-call context from Zoho (D-031)

**Acceptance tests**
- Each agent connects their own Zoho account in a chosen data centre and can disconnect it; tokens are encrypted and never returned by the API.
- For a booked call, up to three meeting/contact candidates with evidence appear; nothing attaches without the agent's confirmation; "Skip" and manual search work.
- The structured brief (TLDR, objective, attendees, pains, competitors, next step) is saved with the call and injected into the live prompt; replay p95 ≤ 1500 ms.
- Without Zoho, a manual brief works and Zoho features show "needs connection".
- Company A's Zoho tokens and briefs are never visible to company B (isolation test).

## R11 — Learn from card ratings (D-034)

**Acceptance tests**
- Only AI advice cards show rating controls.
- After a call with ≥ 3 ratings, at most 8 instructions of ≤ 25 words are produced; the packet contains no full transcript (test).
- Instructions can be edited, reordered, disabled, deleted and reverted; "review before apply" holds them until approved.
- A test call shows the instructions applied on the next call only; the playbook answer wins on conflict.

## R12 — Post-call actions: Zoho, email, WhatsApp (D-031, D-032, D-033)

**Acceptance tests**
- Each suggested action (Meeting, Lead, Contact update, Deal note, email, WhatsApp) waits for its own approval; nothing is written or sent before.
- A retried write never creates a duplicate; every write and send is in the audit log.
- No Deal stage or amount write is possible through the API.
- Email static blocks appear verbatim; the agent sees a preview and confirms before send.
- WhatsApp: only allow-listed templates are sent unless the window is verifiably open, re-checked right before sending; message history is not stored.
