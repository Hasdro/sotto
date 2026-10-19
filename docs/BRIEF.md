# Brief (filled in during Phase 0)

Claude interviews you in Phase 0 (`docs/phases/phase-0-brief.md`, task P0.1) and writes the answers here.

> **Status (2026-10-18): working assumptions, not yet confirmed by the owner.**
> The owner deferred the interview and asked the build to proceed on Claude's recommendations (D-009).
> Every line marked `ASSUMED:` is a default the code may rely on. Every line marked `OPEN:` must not be
> hard-wired; it stays a setting or waits for the owner. When the owner answers, replace the marker with
> the answer and note any change that breaks an assumption in `docs/DECISIONS.md`.

## The calls
- Will agents call through the app instead of their phone's dialer?
  - ASSUMED: yes, as D-002 requires. The dialer cannot be recorded (R4).
- SIP trunk: existing Yeastar, or a new carrier?
  - ASSUMED: the code stays carrier-agnostic through LiveKit SIP, and development uses a generic SIP trunk.
  - OPEN: whether Yeastar can trunk to LiveKit. Owner, before P4.1.
- Languages and dialects; Arabic and English mixed in one sentence?
  - ASSUMED: English plus Gulf Arabic, often mixed within one sentence. STT must handle code-switching, and P2.3 benchmarks vendors for it.
- Agents, calls per day, typical call length?
  - ASSUMED: see **Numbers**.

## The selling
- Products, prices, deal stages.
  - OPEN: owner. It feeds `playbook/products.md` (P0.3).
- Goal of a call: visit, proposal, close?
  - ASSUMED: book the next concrete step (meeting, visit or proposal). The suggestion prompt reads it from `{{company.call_goal}}`, so it is a per-company setting, not code.

## The suggestions
- Types: answer, next question, objection, warning.
  - ASSUMED: all four, plus `holding` (R2). This matches the card protocol in ENGINEERING §4.
- Should the AI hear the agent as context only?
  - ASSUMED: yes, as context only. It is on by default and a company setting can switch it off. The agent track never triggers a card (R4).
- When the playbook has no answer, may the AI answer from general knowledge?
  - ASSUMED: yes, with the label "Not in playbook — check before promising" (the R2 default). A company setting can turn it off.
- Card language: same as call, or always English?
  - ASSUMED: the same language as the customer's last sentence. A company setting can force one language.

## Models and prompts
- Default providers per stage; which companies need local / open-source models?
  - OWNER (2026-10-19): no Claude/Anthropic models; start on free providers and keep the vendor open (D-016). Default: Groq (open models) is the primary for suggestions and Google Gemini the backup (R2). STT uses two vendors chosen by the P2.3 benchmark. Exact model IDs live only in `seed/models/default.yaml`.
  - ASSUMED: none of the first companies needs a local model. The OpenAI-compatible adapter is still built (R6).
- Who may edit prompts: platform owner only, or company admins too?
  - ASSUMED: both, per R3. The platform owner edits platform-level prompts; company admins edit their company, team and campaign levels.

## The business
- First 3 companies, sizes.
  - OPEN: owner. ASSUMED for sizing: 3 companies of 5–20 agents each.
- Trial length, plans, seat and minute limits.
  - ASSUMED: a 14-day trial with 3 seats and 300 call minutes (R3 default). Paid plans are OPEN (owner, before P5.5).
- May call text go to a backup provider (e.g. OpenAI)?
  - ASSUMED: yes by default. A company admin can disable it (R2).
- Transcript retention, who can read transcripts.
  - ASSUMED: transcripts are kept 90 days and audio is not stored by default. Each company sets its own retention.
  - ASSUMED: readers per R3. An agent reads their own calls, a manager reads their team's, an admin reads the whole company.
  - OPEN: data residency (UAE / GCC). Owner, before the production Supabase project is created (P8.4). Development uses a non-GCC region with no real customer data.
  - OPEN: the consent wording and recording laws per country. Owner plus legal advice, before the pilot (P8.7).
- How success is measured.
  - ASSUMED:
    - R1 p95 at or under 1500 ms;
    - agent adoption (share of calls made through Sotto);
    - card usefulness (agent thumbs up/down);
    - escalations answered within 24 h.
  - OPEN: the conversion metric (needs CRM data, Phase 7).

## Numbers (ASSUMED; used for the cost and load targets)

| Item | First company | Year-1 platform target |
|---|---|---|
| Agents | 10 | 50 |
| Calls per agent per day | 30 | 30 |
| Average call length | 5 min | 5 min |
| Call minutes per day | 1,500 | 7,500 |
| Peak concurrent calls | 10 | 50 |
| Language split | 60% Arabic or mixed, 40% English | same |
