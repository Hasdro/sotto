# Research behind the plan

This is the research the plan was built on (planning sessions, 13–19 Oct 2026). It explains *why* the requirements, architecture and decisions look the way they do.

It is background, not a rule book:
- `REQUIREMENTS.md` and `DECISIONS.md` win over anything here.
- Prices, latencies and star counts come from third-party sources unless marked otherwise. Measure our own numbers before relying on them (`source-driven-development`).

---

## 1. The product in one paragraph

Sotto listens to the **customer** on a sales call. Within **1.5 s** of the customer finishing a sentence, it shows the agent one short card: the answer, the next question, or how to handle the objection. Example:

> Customer: "Another company quoted us 20% less."
>
> Card (*Objection · price*, 0.9 s): "Ask what their quote includes: is furniture and the 12-month warranty in it? Offer to compare both quotes line by line." (from playbook: *Price objection, competitor quote*)

## 2. Existing products (build vs buy)

| Product | Type | Live suggestions | Public price | Fits a small team? |
|---|---|---|---|---|
| Cresta | Contact-center AI | Yes, core | ~$150k/yr | No, enterprise |
| Balto | Contact-center agent assist | Yes, core | Quote | Mid to large |
| Observe.AI, Cogito, Dialpad Ai | Contact-center / phone platform | Yes | Quote / bundled | Dialpad, but only if you switch phone system |
| Clari Copilot | Sales call intelligence | Yes, battle cards | Quote | Yes |
| Gong, Chorus, Salesken | Revenue intelligence | Partly; mostly after the call | Quote | Medium |
| Amotions | Live guide for Zoom | Yes, plus emotion cues | n/a | Zoom only |
| Convo | Real-time sales coaching | Yes | from ~$22/mo | Yes |
| Cluely | General meeting copilot | Yes, overlay | $20–200/mo (third-party figure) | Not sales-specific |
| SalesCopilot (Salesforce AI Research) | Open-source demo | Yes | Free code | Useful to learn from |

**Why build anyway:** none of them covers all of these together:
- Arabic and English mixed in one call;
- calling from a mobile app;
- many companies served from one system, each with its own prompts and models (R6);
- a Zoho CRM link.

## 3. Why "the app is the phone" (D-002, R4)

| Situation | How the customer's voice is isolated | Reliability |
|---|---|---|
| Call made through the app (phone, tablet, computer) | The app is the phone. The customer is a separate audio track on the media server, and still receives a normal call from the company number. | Exact |
| Desktop with another softphone | System call audio is the customer; the mic is the agent. Needs audio-capture code per OS. | Exact |
| Normal mobile call from the phone's own dialer | **Not possible.** iOS gives apps no call audio. Android has blocked call audio for regular apps since Android 10. | Blocked |
| Speakerphone or in-person meeting | One mic hears both. The agent records a 30 s voice sample once, and speech that matches it is dropped. | Approximate; must show an "approximate" badge |

**Flow:**
1. Customer PSTN → SIP trunk (Yeastar PBX, or Twilio/Telnyx) → LiveKit room.
2. The agent app joins the same room.
3. The AI worker subscribes to the customer track only, and sends cards over the data channel.

## 4. Stack research (recommended vs alternative)

| Part | Recommended | Why | Alternative |
|---|---|---|---|
| Agent app | Expo (React Native + TS): iOS, Android, web | Claude is strongest in TS/React. There is an official LiveKit Expo SDK. Design tooling targets React. | Flutter (Dart, all 6 platforms) |
| Desktop | Installable web app; Tauri shell later | Small installers, only when needed | Electron |
| Calls | LiveKit + SIP trunk | Separate tracks, built-in telephony, end-of-turn model, agent framework | Twilio Voice SDK + Media Streams |
| AI worker | LiveKit Agents (Python) | Most mature; STT/LLM plugins | LiveKit Agents (Node) |
| STT | Speechmatics or Soniox for mixed Arabic + English; Deepgram for English | Test on our own recordings first | AssemblyAI |
| Model router | Own module: per-stage provider/model, read from the DB per call | R6: change models without a release | LiteLLM proxy |
| Default models | Fast Claude model for live cards, a larger one for summaries, OpenAI as backup | Speed under 1.5 s | Ollama/vLLM open models via the OpenAI-compatible adapter |
| Tenants / data | Supabase: auth, Postgres + RLS, storage | Isolation enforced in the database | Clerk orgs + Neon |
| Email | Resend or Postmark | Escalations, trial reminders | Zoho ZeptoMail |
| Errors / metrics | Sentry + per-card latency table | R1/R2 need proof in production | PostHog |
| Billing (later) | Stripe | Trials, seats, usage | Paddle |

Model names above are examples. In code, models are chosen only through the router and seed data (D-003).

## 5. How to fit 1.5 s (R1)

The illustrative budget is in `ARCHITECTURE.md` (~1010 ms). Techniques that make the most difference:

1. **Smart end-of-turn model:** detects that the customer has finished without waiting for a long silence. This is the biggest single saving.
2. **Prompt caching + warm connections:** the playbook prefix is cached and connections are kept open, so the first token comes sooner.
3. **Draft while the customer speaks:** start on the partial transcript, then finalize at end of turn.
4. **Instant answers for top FAQs:** a playbook index hit skips the model.
5. **Stream the card:** the first word counts as "shown".
6. **Backup timer:** if the primary has not started answering within ~700 ms, the backup races it (R2).

Local models are usually too slow for live cards. They fit the after-call summary and the judge. The settings screen must block assigning a model that breaks R1 to a live stage.

## 6. Making it beautiful (Phase 3)

- **Show, don't describe.** 5–10 reference screenshots go in `docs/design/refs/`, each with one line on what is liked. "Modern" in words gives generic results.
- **Design system before screens.** Tokens and components first; screens are built only from them.
- **Mock data first.** Screens are built and approved before live calls are wired in.
- **The agent must see its own work.** Use a screenshot loop (Playwright / Claude in Chrome for web, simulator screenshots for mobile) and compare against the refs.
- **Design for one glance.** The agent is mid-conversation, so the card has:
  - large text, 25 words at most;
  - one colour per card type;
  - nothing moving except the new card.
- **Test with a real agent:** ten minutes of a mock call.

## 7. Making it reliable

| Practice | Catches | From phase |
|---|---|---|
| Golden recorded calls + replay | Slow cards, bad suggestions, agent speech triggering | 2 |
| Tests before code (triggers, fallback, permissions) | Regressions | 1 |
| Stop hook: typecheck + tests before a turn ends | "Done" while broken | 1 |
| Tenant isolation tests in CI | Cross-company data leaks | 5 |
| Fresh-context review subagents | Blind spots of the writing session | every |
| Failure drills | Fallbacks that only work on paper | 8 |
| Production metrics + alerts | Hearing about outages from customers | 8 |
| Staging, beta builds, pilot | Real-world issues | 8 |

## 8. Often missed (outside the code)

- **Consent and law.** Customers must know the call is transcribed. Check UAE data-protection rules and each customer company's country, and add an announcement or a script line.
- **Data residency.** Choose regions for the database, the media server and the AI vendors.
- **App store review.** Apple scrutinises calling and microphone apps. Write clear permission strings and expect one rejection round.
- **Cost per minute.** Phone minutes + media + STT + model. Track it per company from day one.
- **Phone numbers.** Which number the customer sees, and whether the SIP provider can issue numbers in each target country.
- **Support.** Alerts must reach a person.

## 9. Questions for the Phase 0 interview

- **Calls:**
  - Will agents accept calling through the app?
  - Which SIP trunk?
  - Which languages and dialects? Code-switching mid-sentence?
  - Number of agents, calls per day, call length.
- **Selling:**
  - Products, prices, deal stages.
  - Top 20 questions with answers.
  - Top 10 objections, and how the best agent handles them.
  - What an agent must never promise.
  - The goal of a call.
- **Suggestions:**
  - Card types.
  - Should the agent track be context only?
  - May the AI answer from general knowledge?
  - Card language.
- **Business:**
  - The first 3 companies and their sizes.
  - Trial length, plans and limits.
  - May call text go to OpenAI as a backup?
  - Retention period and who can read transcripts.
  - How success is measured.

## 10. Why agent-skills (D-004, D-006)

- addyosmani/agent-skills is MIT-licensed: ~25 skills, commands and reviewer personas.
- It turns ad-hoc coding into a loop with gates: spec → plan → build → test → review → ship.
- It is vendored at v0.6.12 and paired with `frontend-design`, because agent-skills does not cover visual design.
- Do **not** stack Superpowers, Spec Kit or BMAD on top. They overlap and give competing instructions.

## Sources (as researched, Oct 2026)

- **Claude Code:** official best-practices docs; official plugins overview; frontend-design skill; Playwright MCP design loop.
- **Workflow:** github.com/addyosmani/agent-skills; comparisons of OpenSpec, Spec Kit and Superpowers.
- **Calling:**
  - LiveKit Expo SDK; LiveKit SIP telephony docs;
  - BCR project notes on Android call-audio limits;
  - TargetVoice and REAL-TSE 2026 (speaker extraction).
- **Latency:** 2026 LLM API latency benchmarks; prompt-cache pre-warming.
- **STT:** Speechmatics Arabic–English, Soniox Arabic, Deepgram code-switching, AssemblyAI pricing.
- **Market:** SalesCopilot (arXiv), Cresta pricing, Balto vs Cresta, Cluely pricing, Convo.

Current official links per topic are in `docs/REFERENCES.md`.
