# Phase 0 — Brief, playbook and golden calls

**No application code in this phase.**

## Goal

Turn the owner's knowledge into three things every later phase depends on:
1. `docs/BRIEF.md` — business facts and choices;
2. `playbook/` — what the AI answers from;
3. `test-calls/` labels — the golden set that proves R1, R4 and quality.

## Why it matters

- Without real questions and objections, the suggestion engine is tuned on guesses.
- Without labelled recordings, the 1.5 s requirement cannot be measured.

## Entry criteria

None. This is the first phase.

## Read first

- `docs/REQUIREMENTS.md` (R1–R6)
- `docs/BRIEF.md` (the question list)
- `playbook/README.md` (entry format)
- `test-calls/README.md` (label format)
- `docs/DECISIONS.md`

## Skills and subagents

- `interview-me`: one question at a time, until you are about 95% confident.
- `idea-refine`: stress-test the answers.
- `documentation-and-adrs`: record decisions that come out of the interview.

Use the AskUserQuestion tool for multiple-choice questions where it helps.

## Environment

Cloud or local. Interactive with the owner.

## Tasks

### P0.1 — Interview the owner

Cover every heading in `docs/BRIEF.md`, plus:
- **Calls today:** how agents call (mobile dialer, Yeastar softphone, desk phone); whether they will accept calling through the Sotto app (D-002).
- **Carrier:** the SIP trunk options, and whether the Yeastar can trunk to LiveKit.
- **Language:** languages and dialects; whether Arabic and English mix in one sentence (this drives the STT choice).
- **Volume:** call volume, call length, and peak concurrent calls.
- **Sales process:** stages and the goal of a call.
- **Content:**
  - the top 20 questions and top 10 objections;
  - the products, packages and prices;
  - what an agent must never promise.
- **Suggestions:**
  - the card types wanted;
  - whether the AI may answer outside the playbook;
  - the card language.
- **Tenants:** the first 3 companies, the roles they need, trial length, and plan limits.
- **Models:** default providers per stage, which companies need local or open-source models, and who may edit prompts.
- **Privacy:**
  - recording consent;
  - retention;
  - whether call text may go to a backup provider;
  - data residency (UAE / GCC?).
- **Success metrics:** for example conversion, time to answer, agent adoption, escalations answered.

Dig into the hard parts the owner may not have considered:
- calling from mobile;
- whether local models can be fast enough;
- the cost per call minute;
- consent laws.

**Acceptance:** every BRIEF.md question is answered, or marked `OPEN:` with who decides and by when.

### P0.2 — Write `docs/BRIEF.md`

Replace each question with the answer. Keep the headings. Add a "Numbers" section with these estimates:
- agents, calls per day, average minutes;
- peak concurrent calls;
- languages split.

These feed the cost and load targets.

**Acceptance:** the owner reads it and says "correct".

### P0.3 — Draft the playbook

Create `playbook/faq.md`, `objections.md`, `products.md` and `never-promise.md` in the README format.
- Short answers must be 25 words or fewer and sayable out loud.
- Mark gaps `TODO(owner)`.

**Acceptance:**
- at least 20 FAQ entries and 10 objections with real content;
- the TODOs are listed in the tracker under *Waiting on owner*.

### P0.4 — Golden-call plan

Write `test-calls/PLAN.md`:
- **What to record:** 10 real or role-played calls, 5–10 minutes each, covering the top objections, both languages, one noisy call, and one where the agent talks over the customer.
- **How to get separate tracks:**
  - Yeastar call recording with split channels, if it supports that;
  - otherwise two phones and two recorders;
  - otherwise role-play over LiveKit later.
- **Consent wording.**
- **Where audio is stored:** outside git.
- **How to label it.**

**Acceptance:** the owner agrees to the plan, with a date.

### P0.5 — Label the calls

Do this when the recordings arrive. It can finish later; see the rules in `README.md`.

For each call, write `test-calls/<id>.json` with at least 5 moments, each with a `good_suggestion` and a `playbook_ref`.

**Acceptance:** 10 labelled calls, and the audio paths resolve on the owner's machine.

### P0.6 — Decisions from the interview

Add `D-NNN` entries for anything decided, for example:
- the STT vendor shortlist (driven by language);
- whether the AI may answer outside the playbook;
- the backup provider policy;
- data residency.

**Acceptance:** DECISIONS.md is updated, and REQUIREMENTS.md is changed only with the owner's explicit OK.

## Exit gate

- [ ] BRIEF.md is confirmed by the owner.
- [ ] The playbook has real answers (TODOs only where the owner must supply facts).
- [ ] The golden-call plan is agreed. 10 labelled calls are present, or the owner has waived the gate until P2.8.
- [ ] The tracker shows Phase 0 done, and the Phase 1 tasks are ready.

## Out of scope

Choosing frameworks, writing code, designing screens.

## Pitfalls

- **Generic answers** ("we offer great service") are useless. Ask for the exact words their best agent uses.
- **Over-long playbook answers.** The card must be readable in one second.
- **Assuming the dialer can be recorded.** It cannot (D-002). Make sure the owner understands the "call through the app" consequence.

## Owner actions

- Answer the interview.
- Supply prices and facts.
- Record or arrange the 10 calls with consent.
- Confirm BRIEF.md.
