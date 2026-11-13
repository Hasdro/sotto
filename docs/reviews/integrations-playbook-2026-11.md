# Integrations playbook — getting the most out of Zoho, email and WhatsApp

2026-11-13 · research + proposal, no code changed · for the owner's Zoho Partner demo and the next two versions.
Sources in the repo: `docs/REQUIREMENTS.md` R10–R12, `docs/phases/phase-9-product-round.md`, D-031…D-040, `docs/REFERENCES.md`. Code read: `cloud/{zoho,email,gallabox,learning}`, `apps/app/features/**`. Web checks are marked **[web]**; anything I could not confirm is marked **[verify]**.

## 0. Summary

- Today the app covers **before the call** (Zoho brief), **during** (customer-only cards, learned instructions) and **after** (review, 4 approved Zoho writes, email, WhatsApp template). The missing piece is the **loop**: what happened on the call never reaches Zoho as structured data a manager can report on, and Zoho's own process (Blueprint, stage) never reaches the live card.
- The cheapest high-value wins reuse scopes and routes that already exist (a call-summary Note, a structured next-step Meeting, review-score fields). The expensive ones need new Zoho scopes (Blueprint, custom fields, Analytics) and every connected agent must **reconnect Zoho** again (as happened for 0.4.0).
- Hard limits that shape every idea: no Deal stage/amount write (D-031, Zoho refuses it because we never request the scope); every write/send needs the agent's approval (R12); WhatsApp is template-only and has no history endpoint (D-033); the server never carries call audio (D-022).

## 1. Workflows that work today (0.4.0)

| Role | Workflow | What it uses |
|---|---|---|
| **Agent** | Connect own Zoho once (Admin › Integrations / call rail) → app lists upcoming meetings, agent confirms which one this call is (never auto) → brief (TLDR, objective, attendees, pains, competitors, next step) built from Contact, Deal, Account and last notes → call starts; customer track only drives suggestion cards (playbook first, AI second, holding line third) → **rate AI cards** 👍/👎 → after call: review (chance to close, six skill scores) and follow-up | Zoho read, live engine, learning |
| **Agent** | Post-call panel: approve/edit/reject each suggested action: **Meeting**, **Lead**, **Contact update**, **Deal note**; **email** (org-approved sender, format with static blocks, preview, confirm); **WhatsApp template** (allow-listed, agent approves final text) | Zoho write (per-user OAuth, idempotent, audited), SMTP, Gallabox |
| **Manager** | Gets an escalation email within a minute when the AI has no safe answer; answers in the app; answer joins the playbook after approval; sees own team's history, reports, objection counts | escalation, reports, playbook |
| **Admin** | Pastes SMTP and Gallabox credentials, Zoho OAuth client (write-only, encrypted); edits email formats and the WhatsApp template allow-list; sees ratings aggregates, approves/edits/reverts **learned instructions** (web admin); sets models/prompts (web only, D-038); flags per org (R7) | Integrations, flags, learning |
| **Platform owner** | Zoho OAuth client and SMTP fallback in owner console; per-org feature kill switch; audit log | owner console |

Gaps visible in code today: the Zoho brief is saved with the call but **nothing from the call goes back as a call summary**; there is no Zoho webhook, so the app only knows CRM state at prep time; no Blueprint/stage-aware prompting (stage is read only as text in the brief); WhatsApp is send-only (no delivery status, no inbound); reports are app-internal and do not reach Zoho Analytics.

## 2. Ideas

Legend — **Feasibility:** *Today* = existing scopes/routes, mostly prompt + UI; *Small* = small code, same scopes; *Scopes* = needs new Zoho scope (agents reconnect) or new setup. **Effort:** S ≤ 2 days, M ≈ week, L > 2 weeks.

### INT-01 — One-tap call log to Zoho (summary + outcome + next step)
- **Value:** the agent's #1 chore (CRM hygiene) done in one approval. The review already has a summary and the brief has "next step"; today they stay in the app.
- **Uses:** Zoho Notes (existing `Deal note` write) + review.
- **Feasibility:** **Today / small.** Add a 5th suggested action "Call log" that renders a structured Note (summary, objections raised, commitments, next step, chance to close) through the existing `deal_note` path; fall back to Contact/Lead note only if a new `notes.CREATE` parent is allowed (current code writes Deal notes only → for Lead-only calls needs one small route change).
- **Effort:** S.
- **Risk:** the summary contains customer statements → org consent/recording policy, show a preview (already the pattern); Notes cost 1 API credit per write; keep idempotency key per call so a retry cannot duplicate.

### INT-02 — Next-step Meeting and Task from what the customer agreed
- **Value:** "send me the proposal Thursday" becomes a booked follow-up Meeting with the right Participants, so the pipeline does not rely on memory.
- **Uses:** Zoho `Events` (existing Meeting write); Tasks would be new.
- **Feasibility:** Meeting **today** (action exists, add date extraction from the call review and agent confirms date/time as R12 requires). Tasks module needs `ZohoCRM.modules.tasks.CREATE` → **new scope**.
- **Effort:** S (Meeting) / M (Tasks).
- **Risk:** wrong date extraction → mandatory date confirmation; timezone handling (Zoho needs offsets; verify on the owner's org **[verify]**).

### INT-03 — Stage-aware live suggestions (use Deal stage, amount, age as context)
- **Value:** cards sound different for a Qualification deal vs a Negotiation deal ("don't discount yet", "ask for the decision date"). Cheap way to make the brief matter live.
- **Uses:** Zoho read (Stage, Amount, Closing_Date already fetched by `lookup.py`).
- **Feasibility:** **Today.** Stage already reaches the brief; add a short stage→guidance block in the `crm_brief` prompt (data, per org, in the prompt registry — no prompt text in code). Replay p95 must stay ≤ 1500 ms (brief is per-turn text; keep it ≤ ~150 tokens).
- **Effort:** S.
- **Risk:** stale stage if the agent did not update CRM; label "stage as of prep".

### INT-04 — Blueprint-aware coaching ("what the Blueprint requires next")
- **Value:** Zoho Partners sell Blueprint; showing "to move to Proposal you still need: budget confirmed, decision maker named" **live** and ticking those items from what the customer says is a strong demo and real value.
- **Uses:** Zoho Blueprint API: per-record `GET /{module}/{id}/actions/blueprint` (module scopes, no settings scope) returns current state and next transitions with required fields **[web]**. Transition definitions: `GET /settings/blueprints/transitions` needs `ZohoCRM.settings.transitions.read` **[web]**; states `ZohoCRM.settings.blueprint.states.read` **[web]**.
- **Feasibility:** read-only record-level call is **small** (verify it works with Deals scope already granted **[verify]**). Definitions/fields = **new scopes**. We would **suggest** and prefill a Note, never execute the transition (stage writes are out, D-031; the PUT blueprint call would need the Deal write scope we deliberately do not hold).
- **Effort:** M.
- **Risk:** customers' Blueprints differ widely; transition "during" fields are free-form → map by label only, show as checklist, never auto-fill Zoho.

### INT-05 — Manager coaching from card ratings and review scores
- **Value:** managers see *which* AI suggestions agents reject, which objections repeat, which skill (of six) is weakest per agent/team, and the learned instructions that came from it. Turns ratings (R11) into coaching, not just model tuning.
- **Uses:** learning store, review scores, history (all in-app).
- **Feasibility:** **Small.** Data exists (ratings per user/org, review scores per call); a Team panel view + weekly summary email via existing SMTP (manager-only, Admin-opt-in).
- **Effort:** M.
- **Risk:** per-agent scoring is HR-sensitive → org setting, agents see their own data first, no ranking by default; minimised packets rule (D-034) still applies.

### INT-06 — Write call-quality fields back to the Deal/Contact (custom fields)
- **Value:** "Last call score", "Chance to close (AI)", "Top objection", "Last call date" visible in Zoho lists, views, Blueprints and workflows; managers filter pipeline by them without opening our app.
- **Uses:** Zoho field update.
- **Feasibility:** **Scopes.** Needs a Deal update scope (`ZohoCRM.modules.deals.UPDATE`) which D-031 deliberately avoids; options: (a) a supersede-decision allowing writes **only to a closed list of AGN custom fields** on Deals, enforced in `actions.py` (stage/amount stay blocked); (b) write to a custom module/Notes instead (no new scope, less useful). Partner must create the fields (`ZohoCRM.settings.fields.CREATE` or manual).
- **Effort:** M.
- **Risk:** decision D-031 must be superseded first; a bug that touches Stage/Amount is the worst case → allow-list by field API name + unit test; each write 1 credit.

### INT-07 — Deal-risk signals from the call
- **Value:** at the end of the call the app says "risk: competitor named, no next step, champion silent, budget doubts" and offers a Note (INT-01) or a Zoho tag/field (INT-06). Gives managers an early-warning list.
- **Uses:** review + brief (competitors, pains) + INT-06 for the write.
- **Feasibility:** signal extraction **today** (prompt on the review); writing it back = INT-01 (Note) **today** or INT-06 (field) **scopes**.
- **Effort:** M.
- **Risk:** false alarms erode trust → show reason + evidence quote, agent approves; keep an "AI-estimated" label.

### INT-08 — Follow-up sequence (email day 0 → WhatsApp template day 2 → reminder)
- **Value:** the agent approves **one plan** (3 steps, dates) after the call; the app prepares each step at the right time. Biggest time saver for follow-up, and consistent.
- **Uses:** email + Gallabox templates + Meeting/Task.
- **Feasibility:** needs a scheduler on the server and a "pending sequence" store → **small-to-medium code**, no new scopes. Day-0 email already exists.
- **Effort:** L.
- **Risk:** D-033 says no bulk, every send approved: implement as **"each step re-asks the agent, one tap"** (push/desktop notification), never auto-send. WhatsApp: only allow-listed templates, opt-in evidence required, stop on Meta error codes (131056, 131048, 131049, 132015/6 per REFERENCES) **[web, in REFERENCES]**; Gallabox rate limits unpublished.

### INT-09 — WhatsApp / email meeting reminders before booked meetings
- **Value:** fewer no-shows: a UTILITY template "Your meeting with {{agent}} is at {{time}}" 24 h/1 h before. Direct pipeline impact.
- **Uses:** Zoho Events (read, existing), Gallabox template, scheduler (INT-08's).
- **Feasibility:** **Small–M.** Needs scheduler + customer phone from the Contact + opt-in flag. Reminder is a *template* so it works outside the 24 h window.
- **Effort:** M.
- **Risk:** **highest WhatsApp-policy risk**: reminders are sent without a live call, so approval must be *standing per meeting* (agent ticks "remind this customer" when the meeting is created, with opt-in confirmed); template must be approved as UTILITY, not MARKETING; new number tier ≈ 250 unique users/24 h **[web, REFERENCES]**; a ban would hurt the owner's number → ship behind an org flag, default off.

### INT-10 — Delivery and reply status from Gallabox back to the agent and Zoho
- **Value:** "WhatsApp delivered/read", "customer replied" in the history and in a Note; the agent knows when to call again.
- **Uses:** Gallabox webhooks: `POST /devapi/webhooks`, events `Message.WA.Status.Received/Failed`, `Message.Received`, signature `x-gallabox-signature` (HMAC-SHA256) per REFERENCES; docs also list a template-status event **[web]**. Payload shape not confirmed **[verify]**.
- **Feasibility:** **Small–M**, new public webhook endpoint on the server; needs Essential/Advanced Gallabox plan **[REFERENCES]**. Same webhook is the only way to learn the 24 h window (D-033).
- **Effort:** M.
- **Risk:** storing inbound customer messages conflicts with D-033 "history not stored" → store **status only** (sent/delivered/read/failed, no text) unless the owner changes the decision.

### INT-11 — Pre-call "who is this" for unknown callers: create Lead from the first minute
- **Value:** if no Zoho match, the app offers a prefilled Lead (name/phone/company said on the call) at call start instead of the end.
- **Uses:** existing Lead create (D-031, plain create, not upsert).
- **Feasibility:** **Today** (side-panel allows lead creation during the call, R12). Add dedupe search first (existing search routes).
- **Effort:** S.
- **Risk:** duplicates → search by phone/email before offering; approval stays.

### INT-12 — Reporting to Zoho Analytics (win-rate by objection, skill score vs outcome)
- **Value:** the Partner can show the customer dashboards in the tool they already sell: calls by agent, avg review score, objection categories vs won/lost deals.
- **Uses:** Zoho Analytics (import API / CRM sync + our data as a CSV or API push) **[verify: I could not find Analytics API docs in the searches; scopes, limits and plan not confirmed]**.
- **Feasibility:** **Scopes / new integration.** Cheapest path without code in our app: a **weekly CSV export** (admin button) the Partner imports into Analytics; real push = new `analytics` adapter, new OAuth scope, new flag.
- **Effort:** S (CSV) / L (live push).
- **Risk:** call data leaves our server to a second vendor → org consent and a data-minimised schema (scores, counts, categories; no transcript). Join key = Zoho Deal/Contact ID, so INT-01/06 must store it per call (the brief already carries it).

### INT-13 — Zoho webhooks: refresh the brief when the CRM changes
- **Value:** "the deal moved to Negotiation 10 minutes ago", "meeting rescheduled" reflected without re-prep; also triggers INT-09 when a meeting is created by someone else.
- **Uses:** Zoho Notifications `POST /actions/watch`, events like `Deals.edit`, `Events.create` **[web]**; the callback URL must be publicly reachable; channels expire and need renewal **[web]**.
- **Feasibility:** **Scopes/new code**: server endpoint + subscription renewal job + per-user (per OAuth) watch.
- **Effort:** L.
- **Risk:** operations burden (expiry, replays); watch is per user token → many subscriptions; Zoho API credits for follow-up reads. Not needed if prep re-reads on call start (already true).

### INT-14 — Email follow-up with attachments and meeting link (proposal, brochure)
- **Value:** the follow-up email carries the right document for the stage.
- **Uses:** SMTP, email formats (static blocks).
- **Feasibility:** links in static blocks **today** (verbatim blocks exist); attachments need storage + UI → **small–M**.
- **Effort:** S (links) / M (files).
- **Risk:** attachments leaving the org → admin-curated list only; no arbitrary file upload by agents in v1.

### INT-15 — Playbook auto-suggestions from won Deals / rejected cards
- **Value:** repeated "wrong" ratings on one topic or a manager answer to an escalation propose a playbook entry (manager approves) — keeps the playbook alive, the base of R2 and the 1.5 s instant answers.
- **Uses:** learning store + escalation flow (exist).
- **Feasibility:** **Small**; playbook is never auto-edited (D-034) → always a manager approval card.
- **Effort:** M.
- **Risk:** none for integrations; keep approval.

### INT-16 — Lead-source / campaign attribution in the brief
- **Value:** the card knows which campaign brought the lead ("came from Dubai expo") for opening lines and objections.
- **Uses:** Zoho Leads/Contacts fields `Lead_Source`, campaign association (read).
- **Feasibility:** **Today** (extra fields in the lookup; Campaigns module read would be a **new scope**).
- **Effort:** S.
- **Risk:** minimal; field names vary per org.

## 3. Cross-cutting risks

| Area | Rule / risk | Action |
|---|---|---|
| **Consent & recording** | Summaries and notes carry customer speech into Zoho | Per-org consent setting, agent preview before any write, no transcript in Zoho |
| **WhatsApp policy** | Opt-in, template category, quality rating, number restrictions (REFERENCES) | Templates allow-listed, opt-in tick per customer, no bulk, org flag default off for reminders/sequences |
| **Zoho API credits** | Enterprise ≈ 50k + 1000/user/day, concurrency 20; search 1 credit, upsert 1/10 records **[REFERENCES, web]** | Cache brief, one search per call start, batch note+meeting where possible; show a credits usage line in Admin if INT-12/13 ship |
| **Scopes** | Each new scope forces every agent to reconnect (0.4.0 already did) | Bundle all new scopes into **one** release (see top 5 for 0.5/0.6), keep read-only additions separate from writes |
| **Stage/amount** | Never written (D-031) | INT-06 needs an explicit supersede decision with a field allow-list |
| **Learned instructions** | Apply from next call, playbook wins (D-034/40) | Stage guidance (INT-03) is a prompt block, same rule |
| **D-022** | Server never carries audio or live suggestions | All ideas run on text artefacts produced after the call |

## 4. Recommended top 5

### For the Zoho Partner demo (days; mostly already built, shows the loop)
1. **INT-01 Call log to Zoho** — S, no new scopes; the clearest "I saved my agents 10 minutes per call" moment.
2. **INT-03 Stage-aware suggestions** — S; the live card visibly changes with the Deal stage in the Partner's own sandbox.
3. **INT-02 Next-step Meeting** (date confirmed by the agent) — S; completes "call → CRM follow-up" with the existing Meeting write.
4. **INT-05 Manager coaching view** (ratings + six skill scores + learned instructions) — M but the data and web admin exist; a manager story for the Partner's customers.
5. **INT-04 Blueprint-aware checklist, read-only** — M; the differentiator for a Zoho Partner. If time is short show it as a **static mock** fed by a real `actions/blueprint` call on the owner's org, flagged "preview".

Demo order suggestion: connect Zoho → pick meeting → brief → live call showing stage-aware card → rate a card → post-call panel: Call log + Meeting + email → manager view. Do not demo WhatsApp reminders (policy risk, INT-09).

### For the next two versions
- **Next version (0.5.x): value without new risk**
  1. **INT-01 + INT-02** shipped properly (idempotency, Lead-only fallback, date confirmation).
  2. **INT-03 + INT-16** stage and source context (prompt + lookup fields, replay p95 check).
  3. **INT-05** manager coaching and weekly summary email.
- **Version after (0.6.x/0.7.x): new scopes in one reconnect, plus messaging automation**
  4. **INT-04 + INT-06 + INT-07** together: Blueprint read, allow-listed AGN custom fields on Deals, deal-risk signals. One decision superseding D-031 and **one** reconnect.
  5. **INT-08/09/10** follow-up sequence and meeting reminders with webhook status, per-step agent approval, flag default off; then **INT-12 CSV export → Zoho Analytics** as the bridge to the Partner's reporting offer.

Parked: INT-13 (Zoho webhooks, only if prep-time reads prove stale), INT-14 attachments, INT-15 playbook suggestions (small, do when learning matures).

## 5. Questions for the owner

1. Is writing **allow-listed custom fields on Deals** (INT-06) acceptable, superseding the "no Deal writes" line of D-031? Stage and Amount stay blocked.
2. May WhatsApp reminders (INT-09) go to customers **without a live approval each time** if the agent ticked "remind" and opt-in when booking? Or strictly one tap per message?
3. Is Zoho Analytics a customer deliverable (needs the real integration) or a Partner services upsell (CSV is enough)?
4. Should Gallabox **status** (not text) be stored to support INT-10, given D-033 stores nothing?

## 6. What I could not confirm

- Zoho Analytics API, scopes and plan requirements (no usable result).
- Gallabox webhook payload shape and whether a message-history endpoint exists (REFERENCES already flags both).
- That the Deals read scope alone is enough for the record-level Blueprint call (docs say module scopes **[web]**; test on the owner's org).
- Events search by `criteria` and timezone/owner fields (already in the "must verify" list in REFERENCES).

Sources: [Get Blueprint Transitions](https://www.zoho.com/crm/developer/docs/api/v8/blueprint-transitions.html) · [Blueprint APIs](https://www.zoho.com/crm/developer/docs/api/v8/blueprint-details.html) · [Get Blueprint States](https://www.zoho.com/crm/developer/docs/api/v8/blueprint-states.html) · [Enable Notifications](https://www.zoho.com/crm/developer/docs/api/v8/notifications/enable.html) · [Notification APIs](https://www.zoho.com/crm/developer/docs/api/v8/notifications/overview.html) · [Gallabox webhooks](https://docs.gallabox.com/developer-resources/webhook) · plus the links already in `docs/REFERENCES.md`.
