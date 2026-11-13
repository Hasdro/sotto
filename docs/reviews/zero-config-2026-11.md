# Zero-config proposal: what AGN manages so the customer configures almost nothing

2026-11-13 · research and writing child of the phase 9 master · **no code changed** · status: proposal for the owner

**Goal.** A customer installs the app, signs in, and gets suggestions. Setup and tuning (vendors, keys, models, prompts, integrations, templates) happens in the background or is done by AGN. Nothing in R1–R12 is dropped; the *place* and the *owner of the setting* change.

**Sources read.** `docs/REQUIREMENTS.md`, `docs/DECISIONS.md` (D-019, D-022, D-028, D-036…D-040), `docs/ARCHITECTURE.md`, `docs/phases/phase-9-product-round.md`, the five session hand-overs, `apps/app/app/**`, `apps/agent-worker/sotto_worker/cloud/**` (routes, `features.json`, owner console), `seed/**`, `apps/app/features/call/mic.ts`, `apps/desktop/main.cjs`. Screen names come from the code at 0.4.0 (`claude/phase9-zero-config-b47e7a`, base 7f0b9ce). I did not run the app. Where I infer something I say so.

---

## 1. Inventory: every setting a customer touches today

Headache: **H** = needs knowledge the customer does not have or can fail silently; **M** = understandable but tedious; **L** = trivial. "Often" = how often the setting is expected to change after first setup.

### 1a. Desktop app (agent or admin signed in)

| # | Setting | Lives now | Set by | Often | Headache |
|---|---|---|---|---|---|
| A1 | Theme (system/light/dark), language (en/ar) | `settings.tsx` → Appearance | agent | once | L |
| A2 | Auto-pickup (start listening when a call app opens) | `settings.tsx` → Calls, `autoPickup.tsx` | agent | once | L |
| A3 | Mini window and its shortcut | `settings.tsx` → Calls | agent | once | L |
| A4 | Record calls on this device | `settings.tsx` → Calls | agent | once | M (consent/legal) |
| A5 | Sounds | `settings.tsx` → Calls | agent | once | L |
| A6 | Microphone choice | `settings.tsx` → Microphone | agent | once, again if the headset changes | M |
| A7 | Capture source: microphone vs computer (system/loopback) audio, plus the OS permission for system audio | call screen `session.source`, `features/call/mic.ts`, `main.cjs` loopback handler | agent | per setup | **H** (R4 hinges on it; wrong choice = no customer track) |
| A8 | Tutorial and playbook guide | `settings.tsx` → Help | agent | once | L |
| A9 | Personal Zoho connection (data centre, Connect/Disconnect, reconnect for write scopes) | call rail, Admin → Integrations, `/auth/zoho/start` | each agent | once, again when scopes change | **H** |
| A10 | Manual pre-call brief or booked-call candidate pick | call/prep | agent | per call | M |
| A11 | Rate AI cards; accept or reject learned instructions | `features/rating`, Admin → Instructions | agent / admin | per call | L / M |
| A12 | Post-call actions: approve Meeting/Lead/Contact/Deal note, email (choose sender, preview, confirm), WhatsApp (template, parameters) | `features/actions`, `email`, `whatsapp` | agent | per call | M (by design: approval is the safety, R12) |
| A13 | Playbook: add, edit, delete answers; answer escalations in the inbox | `playbook.tsx`, `inbox.tsx` | admin / manager | continuous | **H** (an empty playbook means a useless product on day one) |
| A14 | Account: devices list, sign out this device, seats, minutes, trial days | `account.tsx` | agent | rare | L |
| A15 | Onboarding: first sign-in, trial banner, tutorial | `index.tsx`, `account.tsx`, tutorial | agent | once | M |

### 1b. Web admin panel (company admin; `apps/app/app/admin/*`)

| # | Setting | Lives now | Set by | Often | Headache |
|---|---|---|---|---|---|
| B1 | Team: invite users, set roles (admin/manager/agent), deactivate | `admin/index.tsx` | admin | monthly | M |
| B2 | Provider keys: add, test, replace, remove per vendor; custom OpenAI-compatible endpoints (name, URL, key) | `admin/keys.tsx` (863 lines, web only since D-038) | admin | once, then on rotation | **H** |
| B3 | Per-stage vendor + model choice (stt, stt_backup, turn, trigger, suggest, backup, summary, embeddings, judge), speed test | `admin/keys.tsx` stages, `seed/models/default.yaml` | admin | once, then on outage | **H** |
| B4 | Disable backup providers (data sharing) | `admin/settings.tsx` → Backup; `backup_disabled` in `seed/company/default.yaml` | admin | once | M (a consent decision dressed as a toggle) |
| B5 | Prompt studio: version, test, publish, roll back (`suggest`, `summary`, `review`, `followup`, `crm_brief`, `learned_*`, `escalation_email`) | `admin/prompts/*` (route exists; tab not in the tab list) | admin | rare | **H** |
| B6 | Company profile: tone, call goal, card language, holding line | `admin/settings.tsx`, `seed/company/default.yaml` | admin | once | M |
| B7 | "AI answers allowed" (the "Not in playbook" tier of R2) | `admin/settings.tsx` | admin | once | M |
| B8 | Agent track as context only | `admin/settings.tsx` (`agent_context`) | admin | once | M (R4 wording is hard) |
| B9 | Manager email for escalations | `admin/settings.tsx` | admin | once | L |
| B10 | Learned instructions: view, edit, reorder, disable, revert; "review before apply" switch | `admin/instructions.tsx` (488 lines) | admin | per call batch | M |
| B11 | Feature toggles (org layer of D-028) | `admin/features.tsx` | admin | rare | M |
| B12 | Integrations: Zoho OAuth client per org (client ID, secret, DC) | `admin/integrations.tsx`, `/api/v1/company/zoho/client` | admin | once | **H** (needs the Zoho API console, redirect URI, DC) |
| B13 | Integrations: SMTP per org (host, port, user, password, from) + test | `admin/integrations.tsx`, `/api/v1/company/smtp` | admin | once | **H** |
| B14 | Integrations: Gallabox API key, secret, channel; load templates; choose allow-list and fill parameters | `admin/integrations.tsx`, `/api/v1/company/gallabox*` | admin | once, then per new template | **H** |
| B15 | Email formats: name, action type, example body, tone, length, static blocks | `/api/v1/company/email/formats` (D-032) | admin | rare | M |
| B16 | Recordings (storage, review), devices (revoke), activity (audit view) | `admin/recordings.tsx`, `devices.tsx`, `activity.tsx` | admin | rare | L |

### 1c. Owner console (AGN staff only; `cloud/owner/*`)

| # | Setting | Lives now | Set by | Often | Headache |
|---|---|---|---|---|---|
| C1 | Companies: create, plan (trial/starter/team/custom), seats, minutes, suspend | Companies view | AGN | per customer | M |
| C2 | Feature kill switch and per-company entitlements | Features view | AGN | rare | L |
| C3 | Platform Zoho OAuth client (default for orgs without their own) | Account → Zoho | AGN | once | M |
| C4 | Platform SMTP fallback | Account → Email | AGN | once | M |
| C5 | Audit, overview KPIs, device removal, user reset/deactivate, own password | Overview, Audit, Account | AGN | continuous | L |
| C6 | **Missing today:** platform provider keys and platform model routing (D-038 says "owner console (platform)", but the console has no such view; `default.yaml` is a repo file) | none | n/a | n/a | n/a |

**Reading the table.** Everything marked **H** is plumbing the customer does not care about (B2, B3, B5, B12–B14, A7, A9) or a content problem (A13). C6 is the gap that blocks the whole proposal: AGN has no place to run models and keys on behalf of customers.

---

## 2. Recommendation per setting

Categories: **VM** vendor-managed with sane defaults · **AUTO** auto-detected or derived · **KEEP** kept with the customer, simplified · **REMOVE** removed from the UI.

| # | Setting | Recommendation | Reasoning and implications |
|---|---|---|---|
| A1 | Theme, language | KEEP | Personal taste, one control. Default to system theme; derive language from the OS on first start (AUTO), keep the switch. |
| A2 | Auto-pickup | AUTO → default on, one row | Already detects call apps (`call-apps.cjs`). Default on; a toggle stays for people on shared machines. |
| A3 | Mini window and shortcut | KEEP, collapse into "Advanced" | Power-user feature. |
| A4 | Record on this device | KEEP, but the **default is an org policy** | Recording is a legal/consent choice that belongs to the org (one switch for the admin), not each agent. The agent sees a read-only line "your company records calls". |
| A5 | Sounds | KEEP, "Advanced" | |
| A6 | Microphone choice | AUTO | Follow the OS default device; re-pick silently when the device list changes; show a manual list only after a failed level check (ZC-08). |
| A7 | Capture source | AUTO | The app knows the call app (`call-apps.cjs`) and the platform. Rule: a detected softphone/meeting app → system audio = customer, mic = agent (R4 "exact"); otherwise ask once with a plain-language choice and a live level meter. A first-run check plays a tone / asks the user to say a word and confirms both tracks move (ZC-08). Never silently fall back to a mixed track: R4 says only the customer track may trigger. |
| A8 | Tutorial and guide | KEEP, shown once, then in Help | |
| A9 | Zoho connection | KEEP per user, **simplified** | Per-user OAuth stays (D-031: writes happen as the agent). What goes away: choosing a data centre, the OAuth client (see B12), and the "reconnect for write scopes" surprise. One button "Connect Zoho"; DC detected (ZC-01, ZC-02); scopes requested once, up front, at the full v1 matrix. |
| A10 | Pre-call brief | KEEP | Per-call, valuable, already auto-suggested from the CRM. |
| A11 | Ratings / learned instructions | KEEP; learning becomes default-apply | The rating buttons are the feedback loop. The review-before-apply queue moves out of the agent's world. See B10. |
| A12 | Post-call approvals | KEEP | These are the safety feature (R12). Reduce friction only by pre-filling (template, parameters, sender) from the brief and from org defaults. |
| A13 | Playbook | VM bootstrap + KEEP curation | The biggest "empty product" risk. AGN (or an automatic job) builds a first playbook from the customer's own material (see ZC-04). Admin curation stays, because the playbook is the answer source of truth (R2, "playbook wins"); the inbox of unanswered questions stays as the lightweight way to improve it. |
| A14 | Account | KEEP, small | Trial days, seats and minutes become one status line; devices move to "Devices" in the admin web panel plus sign-out here. |
| A15 | Onboarding | REPLACE with a 3-step guided first run | Sign in → "Connect Zoho (optional)" → audio check. Tutorial only on request. (ZC-09) |
| B1 | Team and roles | KEEP, simplified | Invites by email list; role defaults to agent; SSO later. Roles are a tenancy and R3 matter, so they stay with the customer. Add bulk invite and "first admin = the person who signed up" (no AGN ticket). |
| B2 | Provider keys | **VM** (the main recommendation) | AGN holds the platform keys and pays the vendors; the customer's price covers usage (owner decision: DD-3). "Bring your own key" stays as an enterprise option inside the owner console, per company, set by AGN on request. The customer sees no vendor, no key, no "Get a key" link. Implications: **R6**, "Keys & providers panel" moves from the company admin to the owner console; D-019's write-only, encrypted storage and the "key only sent to its own vendor" rule hold unchanged. **Security:** under D-022 keys reach the client for the duration of a call. One shared platform key across every tenant is a bigger blast radius than today's per-company key. Mitigation is a hard requirement of this proposal: per-tenant sub-keys or short-lived vendor tokens where a vendor offers them (STT streaming tokens), per-company spend caps and anomaly alerts, key rotation by AGN without a release (ZC-12). Routing all model calls through an AGN relay would remove the exposure but adds a network hop against the 1.5 s budget, so it is a fallback, not the default; the replay must prove it either way (CLAUDE.md hard rule). |
| B3 | Per-stage vendor and model | **VM** with automatic routing | AGN picks by benchmark on the golden set (R6 already forbids a stage using a model that misses R1) and rolls forward silently (ZC-05, ZC-06). Config stays *data* (`seed/models`, DB per company), so R6's acceptance tests (change a company's model with no deploy; add an OpenAI-compatible endpoint; replay with it) still pass, run by AGN in the owner console. Per-company override remains for BYO-key and local-model customers. |
| B4 | Disable backup providers | KEEP as a **consent** choice, relocated | Do not drop it: R2 gives admins this right for data-sharing reasons. But a toggle called "Backup" hides the real question. Replace it with one onboarding step, "Which AI vendors may process your calls?", showing the vendor list (STT, LLM, backup) and the region, default = all AGN-approved vendors allowed, with a single "primary vendors only (slower recovery if one is down)" switch. Record the choice and timestamp (audit). Needs a sub-processor list and a DPA text from the owner (DD-4). |
| B5 | Prompt studio | **VM** | Customers cannot judge prompts; a bad edit is a quality and latency regression with the customer as the author. Platform prompts are tested by AGN against recordings and rolled out per version (R6's "test before publish, rollback" is preserved, operated by AGN). Customer-facing prompt inputs shrink to the *company profile* (tone, call goal, language, product facts) which already feeds the prompts as variables. Per-company prompt override stays in the owner console for support cases. R6 is intact: prompts remain versioned data with company/team/campaign scope; only the editing audience narrows. |
| B6 | Company profile | KEEP, prefilled | Tone and call goal are the customer's voice, so keep them, but prefill from the website/CRM (ZC-04) and show a one-page form with good defaults (`default.yaml` already has them). Card language: default "same as the customer" (AUTO); hide the selector under "Advanced". |
| B7 | AI answers allowed | KEEP (one clear switch) | It is a business-risk choice (will the agent see an unverified answer?). Default on with the "check before promising" label; keep. |
| B8 | Agent track as context | **VM default, REMOVE the toggle** | The setting only changes quality, not a promise to the customer; R4 still holds because the agent track never triggers a card. Default per the benchmark winner. Keep the flag in config for AGN. Check with the owner (DD-5) if any customer needs "never transcribe my agents" for privacy; if so, that belongs under the consent step in B4 instead. |
| B9 | Manager email | AUTO + KEEP | Derive from the first admin and role "manager"; ask only if none exists. |
| B10 | Learned instructions | **VM default: auto-apply**, review queue becomes optional | D-034 already auto-applies by default. Remove the tab from the default admin navigation; show a small "AGN learned 3 things from your last 12 calls" card on the admin home with an edit/disable link. The privacy rule (minimised packet, no transcript) stays. |
| B11 | Org feature toggles | KEEP, one page, plain names | R7 requires an org toggle. Reduce to a list with 6–8 customer-meaningful features; hide the ones that are plumbing (`integrations`, `zoho`/`gallabox` as separate rows from `whatsapp`). Owner entitlements and kill switch unchanged. |
| B12 | Zoho OAuth client per org | **VM: one AGN client for all orgs** (T-070) | Zoho allows a server-based client to be authorised by users of any org; enable multi-DC in the API console and keep one client ID per DC family, secrets in the platform store. The per-org client becomes an optional override in the owner console (for a customer that insists on their own app). Security: unchanged (secret on the server, AES-GCM, per-user refresh tokens; company A never sees company B's tokens: isolation tests already exist). A Zoho Partner listing is a likely side benefit (see ZC-01). |
| B13 | SMTP per org | **AUTO + VM**: presets, then fallback sender | Detect provider from the admin's email domain and pre-fill host/port/TLS (ZC-03). Add an AGN-managed sending service as the default (the owner's Hostinger SMTP or a transactional vendor such as Resend, already named in D-032), sending as `agent@customer` via a verified domain (SPF/DKIM guide) or, until verified, "on behalf of" the AGN domain. Customer-owned SMTP remains the option for strict customers. Implication: deliverability and abuse become AGN's job; keep the send limit and audit row (R12). |
| B14 | Gallabox credentials and templates | KEEP the credential (it is the customer's WhatsApp number) **but auto-import** | A customer's own WhatsApp Business account cannot be AGN's; the key stays with them. Everything after the key is automatic: pull all templates, preselect the approved ones, read parameters, map parameters to CRM fields (ZC-07). The allow-list becomes "approved templates in use" without a manual dropdown. Safety rules of D-033 (template-first, window re-check, no bulk) are untouched. |
| B15 | Email formats | **VM defaults**, customer edits optional | Ship good defaults per action type; the customer edits only static blocks (name, title, signature), most of which come from the user profile. |
| B16 | Recordings, devices, activity | KEEP, merge into one "Company" page | Low headache; fewer tabs. |
| C1 | Companies and plans | KEEP, add self-signup (ZC-10) | Create-by-AGN stays for enterprise; the Zoho Forms sign-up (T-066) creates the trial org automatically. |
| C2 | Kill switch, entitlements | KEEP | |
| C3 | Platform Zoho client | KEEP, becomes **the** client | Gains multi-DC fields. |
| C4 | Platform SMTP | KEEP, becomes **the** default sender | |
| C6 | Platform keys and routing | **NEW owner-console views** | Keys & providers (moved from `admin/keys.tsx`), model routing per stage with benchmark column and one-click rollback, vendor health. This is where B2, B3, B5 land. |

### What this means for the four cross-cutting concerns

- **R6 (configurable prompts and models).** The requirement is about *no hard-coded prompts or models and no code release to change them*. It does not say the customer must be the one changing them. All R6 acceptance tests keep passing if run by AGN. Two sentences of R6 need amending (the "Keys & providers panel" owner, and "Companies (and the platform owner) can change them"): see DD-1 and DD-2.
- **Multi-tenancy (R3).** Config stays per company in the DB with `company_id`; the owner console writes the platform layer, companies override only where AGN enables it. Resolution order stays "most specific wins": company → platform default. Shared platform keys must not weaken isolation: usage is metered per `company_id` and a company can never read a key (already true: keys are write-only and never in an API response).
- **Security.** Moving keys to AGN concentrates risk (see B2). Required: encrypted storage as today, per-tenant sub-keys or short-lived tokens, spend caps, key rotation without a client release, and an alert on abnormal usage. A shared Zoho client means a compromised secret affects all orgs, so the secret stays server-side only, never in a client (D-031 already requires it).
- **Data-sharing consent.** Today the admin implicitly consents by choosing vendors. With AGN choosing them, AGN must say who sees call audio and transcripts: a sub-processor list, a one-time org consent (B4) recorded in the audit log, and a way to restrict vendors. Customers in regulated regions may need region-bound vendors; keep `backup_disabled` and a `vendor_allow_list` per company so that is a data change, not a rewrite. The owner has to provide the legal text (DD-4); I do not write it.

---

## 3. Background automation ideas

Effort: **S** ≤ 2 days, **M** ≈ 3–7 days, **L** > 1 week or needs outside work (vendor, legal, owner action).

| ID | Idea | What the customer stops doing | Effort | Notes |
|---|---|---|---|---|
| ZC-01 | **One AGN Zoho client for all orgs, multi-DC** (T-070) | Creating an OAuth client in the Zoho API console, copying ID/secret/redirect | **M** | Register the client in each needed DC (US, EU, IN, AU, JP, CA; CN separately), store ID/secret per DC in the owner console (extends C3). Server picks the client by DC. Verify on a second Zoho org before announcing. Zoho has no documented public API to *create* clients; T-070's research should confirm. |
| ZC-02 | **Auto-detect the Zoho data centre** | Choosing US/EU/IN/… | **S** | Start OAuth on the global accounts endpoint; Zoho returns `location` and `accounts-server` in the callback. Store it per org and per user. Fall back to a probe of each DC's `/oauth/v2/token/info` if absent. |
| ZC-03 | **SMTP presets by domain** | Finding host, port, TLS mode | **S** | Map the admin's mail domain via MX lookup to Google, Microsoft 365, Hostinger, Zoho Mail, etc.; pre-fill and show only the password field (app password with a "how to create one" link). "Send test email" runs automatically on save. |
| ZC-04 | **Default playbook from the CRM and website** | Writing the first 50 answers | **L** | Job reads products, FAQs and past won-deal notes from Zoho, plus the customer's public site and a pasted document, drafts Q&A pairs into a "needs review" state. Nothing goes live unreviewed (R2: playbook answers must be trustworthy). Requires a data-handling rule for CRM content (DD-4) and the playbook import path. Also prefills tone and call goal (B6). |
| ZC-05 | **Silent model routing by benchmark** | Choosing vendors/models | **L** | Nightly job runs the golden-set replay per candidate (R6 already requires the benchmark), picks the cheapest model meeting p95 ≤ 1500 ms and the quality bar per stage, stages the change, promotes after a canary on AGN's own demo org. Needs the golden calls (P2.8) and a safe rollback. **Hard rule from CLAUDE.md applies:** a route change counts as a pipeline change, so the replay report is the evidence. |
| ZC-06 | **Automatic failover and vendor health** | Switching vendor during an outage | **M** | Today's per-request backup race (R2, D-025) stays. Add platform-level circuit breaking: demote a failing primary for all tenants for N minutes and show AGN a health board. The company never sees it. |
| ZC-07 | **Auto-import Gallabox templates and map parameters** | Selecting templates and filling parameters one by one | **M** | On saving the key: pull all templates, keep `APPROVED`, guess parameter mappings from names (`customer_name`, `meeting_time` → CRM/brief fields), surface only unmapped ones. Allow-list defaults to the approved set; admin can untick. |
| ZC-08 | **Audio auto-setup and level check** | Picking mic vs computer audio; fixing "no customer voice" | **M** | On first run and when the device list changes: pick devices from the OS default; detect call app (existing `call-apps.cjs`); run a 5-second check on both tracks (energy per track; "say hello", then "play any sound"); on failure show one plain-language fix and a retry. Remember per device. Telemetry only counts the outcome, no audio. |
| ZC-09 | **Three-step guided first run** | Reading a tutorial; wondering what to do next | **S** | Sign in → optional Zoho → audio check → a 30-second practice call (the app already has a practice mode in `call.tsx`). |
| ZC-10 | **Self-signup creates the org and the first admin** | Waiting for AGN to create the company | **M** | Zoho Forms sign-up (T-066) posts to a server hook that creates a trial org (defaults from `seed/company`), emails an invite. Rate limit and abuse check; owner console shows the queue. |
| ZC-11 | **Org policy defaults pack** | Answering 8 questions about recording, AI answers, agent context, escalation | **S** | One "Company defaults" form with 4 questions (record calls? allow unverified AI answers? which vendors? who is the manager?), everything else from `default.yaml`. Consent step from B4 lives here. |
| ZC-12 | **Key and secret rotation without a release** | Nothing today, but avoids an AGN emergency | **M** | Owner console rotates platform keys; clients refetch within the 10-minute flag refresh cycle (D-036). Per-tenant sub-keys where a vendor supports them (see B2). Alerts at 80 % of a company's spend cap. |
| ZC-13 | **Auto-derived roles and team from Zoho** | Typing every colleague's email | **M** | Offer "Invite everyone with a Zoho CRM user in sales roles" to the admin; roles default to agent. |
| ZC-14 | **Config health and self-healing banner** | Diagnosing "why is it not suggesting?" | **S** | One server-computed status per org (`ok`, `needs_attention` with a reason: expired Zoho token, SMTP failing, quota near). Shown as one banner; extends the D-036 feature map with `needs_connection` reasons. |
| ZC-15 | **Per-org defaults from usage** | Tuning card language, holding line | **M** | Detect the customer language mix over the first calls and set card language; offer Arabic/English holding lines automatically. |

Suggested order (value ÷ effort): ZC-02, ZC-03, ZC-09, ZC-11, ZC-14 (all S) → ZC-01, ZC-08, ZC-07, ZC-10 (M) → keys/routing move (needs C6 views, DD-1/2/3) → ZC-04, ZC-05 (L).

---

## 4. Minimal app map

Before = today's screens (0.4.0). After = proposed. "→ Owner" = moves to the owner console; "✕" = disappears from the customer's UI (kept in config for AGN).

### Agent (desktop app)

| Before | After |
|---|---|
| Home | **Home**: start call, today's brief, trial/status line |
| Call (card, rail, context, mini) | **Call**: suggestion card, call status, one collapsed rail (D-026 unchanged) |
| Mini window | Mini window (kept) |
| History list and detail | **History** (list + detail with review and post-call actions) |
| Reports | **Reports** (kept; flag-gated) |
| Inbox (escalations) | **Inbox**: visible to managers/admins only; hidden for agents |
| Playbook | Hidden for agents; managers/admins keep it |
| Settings: Appearance, Calls (4 switches), Microphone, Help, Knowledge, Integrations (placeholder "soon"), Health, About | **Settings**: language and theme; "Audio" (auto status + re-run check); "Advanced" folds mini window, sounds, auto-pickup; About |
| Account (devices, seats, minutes, trial) | **Account**: who I am, this device, sign out, Zoho connect/disconnect, status line |
| Gallery (dev page) | Dev only, not shipped |
| Tutorial | First run only (ZC-09) |

### Admin (web admin panel; mostly one page of "company")

| Before (tabs) | After |
|---|---|
| Team | **Team**: invite, roles |
| Keys (vendors, keys, stages, speed test, custom endpoints) | → Owner (C6). The company sees none of it. |
| Settings (AI answers, backup providers, agent context, card language, app language, manager email) | **Company defaults** (ZC-11): tone, call goal, record calls, allow unverified AI answers, AI-vendor consent, manager. Agent-context ✕ (AGN default); card language under Advanced |
| Prompts (studio) | → Owner. Company sees only the profile fields that feed prompts |
| Instructions (learned) | Card on the admin home; full editor reachable from it |
| Features | **Features**: plain list, only customer-meaningful rows |
| Integrations (Zoho client, SMTP, Gallabox, templates) | **Integrations**: Zoho = "Connected as …" (no client ID/secret/DC); Email = domain-detected preset + password, or "use AGN email"; WhatsApp = key + secret + channel, then everything auto (ZC-07) |
| Recordings, Devices, Activity | One **Company activity** page with three sections |
| (no email format screen in the tabs) | Email formats: defaults, edit static blocks only |

Result: admin goes from **9 tabs to about 5** (Team, Company defaults, Integrations, Features, Activity) with the learned-instruction card on the home.

### Owner console (AGN)

| Before | After |
|---|---|
| Overview, Companies, Features (kill, entitlements), Audit, Account (password, Zoho client, SMTP) | Same, plus: **Providers and keys** (platform keys, per-company BYO override, spend caps), **Model routing** (per stage, benchmark column, canary, rollback, health), **Prompts** (studio, per-company override), **Integrations defaults** (Zoho multi-DC clients, SMTP/sending domain, Gallabox status) and a **Sign-up queue** (ZC-10) |

### What disappears for the customer

Vendor and key screens, per-stage model pickers, the speed test, custom OpenAI-compatible endpoint form, prompt studio, the Zoho OAuth client form and DC picker, SMTP host/port form (becomes preset), Gallabox template dropdown (becomes auto-import), agent-context switch, the "Soon" integration placeholders in Settings, per-agent record toggle (becomes org policy).

---

## 5. Draft decisions (accept or reject each; numbering continues after D-040)

Each is independent unless a "needs" line says otherwise. Nothing is in force until the owner accepts.

### DD-1 (proposed D-041): AGN manages providers, keys and model routing
- **Decision:** Platform-wide provider keys and the model router are managed by AGN in the owner console. Companies do not see vendors, keys or models. A company may, on AGN's enablement, bring its own key or a local endpoint (BYO), configured by AGN or by that company's admin in a clearly marked "advanced" owner-enabled screen.
- **Supersedes:** D-019 (owner/company admin chooses vendors and adds keys) and D-038 (config in the *company* admin web panel). D-019's write-only, encrypted, vendor-bound key rules, and D-038's "desktop only fetches effective config", stay.
- **Amends:** R6 "Keys & providers panel" (owner of the panel becomes the platform owner; company admin gets BYO only when enabled).
- **Needs:** DD-3 (who pays), the C6 owner-console views, per-tenant keys or tokens (see B2), replay evidence (hard rule).
- **Rejected alternative:** keep the company admin panel and just prefill it. It leaves the failure modes (wrong key, wrong model, forgotten rotation) with the customer.

### DD-2 (proposed D-042): Prompts are platform-managed; customers edit the company profile only
- **Decision:** Prompt studio, versions, tests and rollbacks are operated by AGN in the owner console. Customers edit tone, call goal, product facts and language, which feed prompts as variables. Company-level prompt override exists but only through the owner console.
- **Amends:** R6 "Prompt studio" audience. All R6 prompt acceptance tests remain, run in the owner console.
- **Rejected alternative:** read-only prompt view for customers (adds a screen nobody acts on).

### DD-3 (proposed D-043): Usage is bundled into the plan; AGN pays the vendors
- **Decision:** Plans (trial/starter/team/custom) include model and speech usage up to the minutes already in the plan presets; AGN meters per `company_id` and caps spend; overage and BYO follow the owner's commercial rules.
- **Needs:** **owner decision, spends money** (CLAUDE.md: ask before spending money). I did not model unit costs; the owner needs a cost-per-call-minute estimate from the latest replay or vendor price sheets before accepting.

### DD-4 (proposed D-044): AI-vendor consent is an organisation-level, recorded step
- **Decision:** At onboarding the first admin accepts a one-page "who processes your calls" text listing sub-processors and regions; the choice (all approved vendors, or primary only) is stored with a timestamp in the audit log. `backup_disabled` and a `vendor_allow_list` stay as per-company data. CRM content used to bootstrap the playbook (ZC-04) is covered by the same consent.
- **Supersedes:** the bare "disable backup providers" toggle in R2 (the right stays, the presentation changes). R2's acceptance wording is unchanged.
- **Needs:** owner or counsel to supply the sub-processor list and the legal text. I do not draft it.

### DD-5 (proposed D-045): Settings with no customer-visible effect are not exposed
- **Decision:** The following become AGN defaults with no customer UI: agent-track-as-context, card language "same as the customer", model/stage choice, email format defaults, learned-instruction review queue (still available behind the admin home card). Recording moves from a per-agent toggle to an org policy with a read-only line for agents.
- **Amends:** R4 text "may be transcribed as context only (setting)" becomes "(platform default, set by AGN)"; no behaviour change.
- **Open check:** if any customer must forbid transcribing the agent's own voice, that is a consent item (DD-4), not a toggle.

### DD-6 (proposed D-046): One AGN Zoho OAuth client for all organisations; per-org client is an override
- **Decision:** Per T-070's recommended path: one platform client per data-centre family, multi-DC enabled, data centre detected from the OAuth callback. Per-org clients are an owner-console override only. Per-user tokens, server-only secret, matrix and audit rules of D-031 are unchanged.
- **Amends:** D-037/the phase 9 "client enterable per organization in Admin → Integrations" requirement (the form leaves the company admin).
- **Needs:** owner to register the extra DC clients in the Zoho API console (owner action), and T-070's research result on any client-creation API.

### DD-7 (proposed D-047): Integrations auto-configure after the one credential that is the customer's own
- **Decision:** Email uses a domain preset or an AGN sending service; WhatsApp imports and maps templates automatically after the customer enters their own Gallabox key. D-032 (org-approved senders, static blocks, confirm before send) and D-033 (template-first, allow-list, no bulk) are unchanged, including the "agent approves each send" rule.
- **Supersedes:** the manual host/port form and the manual template dropdown parts of D-039 (credentials stay write-only and per-org; platform fallback pattern stays).

### DD-8 (proposed D-048): Guided first run replaces settings-first onboarding
- **Decision:** First start is a guided flow (sign in, optional Zoho, audio check, practice call). Audio source is chosen by detection (R4 stays: never a mixed track); manual selection appears only after a failed check.
- **Needs:** ZC-08. R4 acceptance tests (agent speech never triggers a card; customer transcript has no agent sentences) are re-run against the auto-selected source.

---

## Open questions for the owner (numbered, answer like "1a, 2b")

1. **Who pays vendor usage?** (a) AGN, bundled in the plan (DD-3, recommended for zero headache) · (b) customers pay through metered overage · (c) BYO key only, as today.
2. **Shared platform keys across tenants?** (a) Yes with per-tenant sub-keys/tokens and spend caps (recommended) · (b) one key per company, created by AGN · (c) route everything through an AGN relay (safest, risks R1).
3. **Playbook bootstrap from CRM and web (ZC-04):** (a) allowed, needs-review state, with the DD-4 consent (recommended) · (b) not now.
4. **Email default:** (a) AGN sending service until the customer verifies a domain · (b) customer SMTP only.
5. **Vendor consent text:** who supplies the sub-processor list and legal wording?

## Not done here, so you know

- No numbers on cost per minute or on vendor token support (some vendors may not offer short-lived or per-tenant keys; needs a check per vendor before DD-1 ships).
- I did not run the app or the server; screen contents are from source. The `admin/prompts` route exists but is not in the tab list, so I treated the prompt studio as web-reachable by URL.
- T-070's research (does Zoho have a client-creation API) is still open; ZC-01 assumes it does not.
