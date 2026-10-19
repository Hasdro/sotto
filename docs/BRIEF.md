# Brief (filled in during Phase 0)

Claude interviews you in Phase 0 (`docs/phases/phase-0-brief.md`, task P0.1) and writes the answers here.

> **Status (2026-10-19): owner answers applied.** The owner answered the decisions page
> (https://claude.ai/artifact/7KfhEygJMdxMi5gPRdmWV6; verbatim copy in `docs/OWNER-ANSWERS.md`).
> Markers:
> - `OWNER:` the owner's answer.
> - `ASSUMED:` a default still not confirmed, which the code may rely on.
> - `OPEN:` waits for the owner and must not be hard-wired.
> Changes that break an earlier assumption are recorded in `docs/DECISIONS.md` (D-017, D-018).

## The calls
- Will agents call through the app instead of their phone's dialer?
  - OWNER: yes, calls go through the app (D-002). The dialer cannot be recorded (R4).
- SIP trunk: existing Yeastar, or a new carrier?
  - OWNER: use the existing Yeastar system. The code stays carrier-agnostic through LiveKit SIP.
  - OPEN: the Yeastar admin details, and whether this Yeastar model can send a SIP trunk to LiveKit. Ask the owner when P4.1 starts.
- Languages and dialects; Arabic and English mixed in one sentence?
  - OWNER: English only (D-018). STT is chosen and benchmarked for English real-time streaming; there is no code-switching requirement.
- Agents, calls per day, typical call length?
  - ASSUMED: see **Numbers**.

## The selling
- Products, prices, deal stages.
  - OPEN: owner. It feeds `playbook/products.md` (P0.3).
- Goal of a call: visit, proposal, close?
  - OWNER: close the sale on the call. The suggestion prompt reads it from `{{company.call_goal}}`, so it stays a per-company setting, not code.

## The suggestions
- Types: answer, next question, objection, warning.
  - OWNER: all four (answer, next question, objection, warning), plus `holding` (R2). This matches the card protocol in ENGINEERING §4.
- Should the AI hear the agent as context only?
  - OWNER: yes, as context only. It is on by default and a company setting can switch it off. The agent track never triggers a card (R4).
- When the playbook has no answer, may the AI answer from general knowledge?
  - OWNER: yes, with the label "Not in playbook — check before promising" (the R2 default). A company setting can turn it off.
- Card language: same as call, or always English?
  - OWNER: always English (D-018). The platform default is `card_language: en`; it stays a per-company setting.

## Models and prompts
- Default providers per stage; which companies need local / open-source models?
  - OWNER (2026-10-19): no Claude/Anthropic models; start on free providers and keep the vendor open (D-016). Default: Groq (open models) is the primary for suggestions and Google Gemini the backup (R2). STT uses two vendors chosen by the P2.3 benchmark. Exact model IDs live only in `seed/models/default.yaml`.
  - OWNER: no local models for the first companies. The OpenAI-compatible adapter is still built (R6).
- Who may edit prompts: platform owner only, or company admins too?
  - OWNER: the platform owner plus each company's admins (R3). The owner edits platform-level prompts; company admins edit their company, team and campaign levels. Every change is versioned with one-click rollback.

## The business
- First 3 companies, sizes.
  - OPEN: owner (left blank on the decisions page). ASSUMED for sizing: 3 companies of 5–20 agents each.
- Trial length, plans, seat and minute limits.
  - OWNER: a 14-day trial with 3 seats and 300 call minutes. Paid plans are OPEN (owner, before P5.5).
- May call text go to a backup provider?
  - ASSUMED: yes by default. A company admin can disable it (R2). The backup is Gemini (D-016, D-017).
- May free AI tiers (which may keep or train on inputs) see real customer calls?
  - OPEN: the owner is unsure. Free tiers are fine for development and colleague test calls. **Before the first real customer call**, explain the trade-off again (for example, the Gemini free tier may train on inputs) and get an explicit choice.
- Transcript retention, who can read transcripts.
  - OWNER: keep audio as well as transcripts.
  - OPEN: how long to keep audio (no duration given). Audio storage also needs a per-company consent note and free-tier storage. **Until the owner answers, the code keeps the default of no audio storage.**
  - ASSUMED: transcripts are kept 90 days. Each company sets its own retention.
  - ASSUMED: readers per R3. An agent reads their own calls, a manager reads their team's, an admin reads the whole company.
  - OWNER: no data-residency requirement.
  - OPEN: the consent wording and recording laws per country. Owner plus legal advice, before the pilot (P8.7).
- How success is measured.
  - OWNER:
    - R1 p95 at or under 1500 ms;
    - agent adoption (share of calls made through Sotto);
    - card usefulness (agent thumbs up/down);
    - escalations answered within 24 h.
  - Not chosen: the conversion metric (needs CRM data, Phase 7).

## Building and testing
- Budget while building: OWNER: $0, free tiers only. Ask before the test phone line or anything else that costs money.
- Accounts the owner can open this week: OWNER: Groq, Google AI Studio, Supabase, LiveKit Cloud, Deepgram.
- Keys: OWNER: only in `.env` on the Mac, no cloud-environment secrets. Live-provider tests run in local sessions (D-017).
- Playbook: OWNER: the owner sends documents (price list, brochure, FAQ, scripts); Claude drafts `playbook/`, the owner corrects. Nothing is invented.
- Golden calls: OWNER: later. Keep using the synthetic replay until then; its speed numbers are estimates.

## Numbers (ASSUMED; used for the cost and load targets)

| Item | First company | Year-1 platform target |
|---|---|---|
| Agents | 10 | 50 |
| Calls per agent per day | 30 | 30 |
| Average call length | 5 min | 5 min |
| Call minutes per day | 1,500 | 7,500 |
| Peak concurrent calls | 10 | 50 |
| Language | English (D-018) | English |
