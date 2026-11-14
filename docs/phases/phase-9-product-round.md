# Phase 9 — AGN Sales Shield product round (0.3.0 → 0.8.0)

Owner brief, 12 Nov 2026 (master prompt pasted into chat). This file is the source for the round; `docs/TRACKER.md` carries the task states, `docs/DECISIONS.md` D-026…D-036 the decisions, `docs/REQUIREMENTS.md` R7–R12 the acceptance tests.

## Goal
AGN Sales Shield (formerly Sotto) listens only to the customer's audio during a live sales call and shows one suggestion card within 1.5 s (p95) of the customer finishing a sentence. It is multi-tenant, **desktop-first (macOS + Windows)**, and configurable per organization. This round adds feature flags, persistent login, the rebrand and reskin, Zoho pre-call context, a card-feedback learning loop, post-call actions (Zoho writes, email), WhatsApp via Gallabox, and a public landing page.

## Entry state (12 Nov 2026)
- Desktop 0.2.0 (Electron), macOS + Windows installers on `https://104-168-48-116.sslip.io/downloads/`; private repo Hasdro/sotto; no GitHub Releases; unsigned; no auto-update.
- Auth: 30-day opaque bearer sessions, no refresh; any 401 deletes the token; token in `localStorage`.
- Per-company call settings exist; no platform entitlement or global kill switch.
- Call review exists (scores, success, sentiment, summary, tip); the mascot ignores it. No card ratings. No pre-call CRM, Zoho, Gallabox or per-user email senders.
- Mobile and extension code exist and are **on hold** (D-027).
- Owner has Zoho One (CRM + Meetings), Gallabox API with a WhatsApp number, Hostinger email.

Do not rebuild what exists. Extend it.

## Read first
- `CLAUDE.md` (incl. "Session orchestration"), `docs/WORKFLOW.md`, `docs/HANDOFF.md`, `docs/TRACKER.md`
- `docs/REQUIREMENTS.md` R1–R4, R6, R7–R12; `docs/DECISIONS.md` D-022, D-024, D-026…D-036
- `docs/DESIGN.md` (the "Prompter's box" language), `packages/ui`
- `docs/REFERENCES.md` § Zoho CRM, § Gallabox (research 12 Nov 2026)

## Version ladder
Ship in order. Each version is independently testable, behind flags, and gets a GitHub release tag (`vX.Y.0`) with the macOS and Windows installers attached.

| Version | Theme | Tasks |
|---|---|---|
| 0.3.0 | Foundation | T-045…T-052 |
| 0.4.0 | Pre-call | T-053…T-057 |
| 0.5.0 | Learning loop | T-058…T-060 |
| 0.6.0 | Post-call actions | T-061…T-063 |
| 0.7.0 | WhatsApp | T-064…T-065 |
| 0.8.0 | Release | T-066…T-069 |

No mobile, extension or Linux release work. No auto-update. No paid signing or notarization in this round.

## Cross-cutting requirements

### 1. Feature flags (R7, D-028)
Central catalog; every capability has exactly one state:
- `available`
- `off_by_platform` — not entitled by AGN, or the global kill switch is on
- `off_by_org` — entitled, but the organization admin turned it off
- `needs_connection` — on, but Zoho, Gallabox or email is not connected
- `no_permission` — the user's role cannot use it

Rules:
- Three layers: platform entitlement + global kill switch (owner console); organization toggle in Admin → Features (default on); no per-user toggle.
- Unavailable → greyed, one-line reason, an action where useful ("Ask your admin", "Connect Zoho"). Workflow-relevant features are never hidden; role-irrelevant ones stay hidden.
- The server rejects the action in every non-available state (D-036 says how this works with client-run calls).
- Admins see the full catalog with state and reason; agents see only their workflow's features.
- Retrofit every existing capability: call review, follow-up, recordings, reports, AI knowledge, integrations, and every new feature.
- Explicit dependencies: WhatsApp → post-call actions + Gallabox; Zoho writes → Zoho connection + write permission; email sending → an approved sender.
- Owner console: per-organization entitlement matrix + global kill switch. Org admins see only entitled features.

### 2. Brand and UI (R8, D-026)
- User-facing name **AGN Sales Shield**, short form **Sales Shield**. No tagline until the owner approves one.
- Keep technical identifiers: `com.sotto.app`, `app.sotto.desktop`, repo Hasdro/sotto, the `app://sotto` origin and localStorage keys, `~/Library/Application Support/sotto-desktop`. A technical rename breaks installs and sessions.
- Logo: three vector directions for owner approval — (a) a shield formed by a phone handset, (b) a handset with a subtle cape or check, (c) a shield + handset monogram. Standalone symbol, no letters. From the winner derive `.icns`, `.ico`, tray monochrome (template image on macOS), favicon, landing assets; update installers, tray, window, About.
- Reskin: evolve the "Prompter's box" language — quiet grey-blue surfaces, ink-teal brand, one warm signal accent, one loud suggestion card. All screens incl. admin; deepest on the live-call screen.
- Light and dark equal, Arabic RTL, WCAG AA, the one-glance card rule. No latency added; the 1.5 s budget is unchanged.
- Information density: the live call shows only the suggestion card, call status and one collapsed context-rail toggle; one card expanded at a time, older cards compact; prep, CRM and objective live in the rail or the Prep tab; everything else on dedicated screens with tabs or search.
- Mascot result moods from the review success score with sentiment nuance: excellent (≥ 75), good (60–74), mixed (40–59), needs work (< 40), no-result. Shown in the review result and History detail only. Keep the code-based SVG, existing activity states, accessible labels and reduced-motion support.

### 3. Persistent login (R9, D-029)
- Sliding 90-day inactivity session with rotating refresh tokens and silent renewal; active users stay signed in indefinitely.
- Tokens in macOS Keychain / Windows Credential Manager via Electron `safeStorage`, not `localStorage`.
- Never sign out on network errors or 5xx. Sign out only on manual logout, password change, admin revoke, device removal, or 90 days unused.
- Migrate the existing token without a forced re-login where possible. "Remember me" is the default. Multi-device sessions remain.
- The owner console keeps its shorter session policy.

### 4. Pre-call context, 0.4.0 (R10, D-031)
- Per-user Zoho OAuth (server-based Web Application flow; the client secret stays on the server). Each agent connects their own Zoho; records are created under their name. No shared org write account.
- Data-centre choice at connect time, remembered per organization: US, EU, IN, AU, JP, CA, CN.
- Org permission matrix: read Leads, Contacts, Accounts, Deals, Meetings, Notes; write Leads, Contacts, Meetings in v1. Deal/Account writes later, separate decision. Enforced server-side; UI greyed when denied. Connection layer module-generic; v1 ships only this matrix.
- Meetings: the CRM Meetings module is the primary meeting record. **Before coding, verify the API module name and fields against the owner's org via `GET /crm/v8/settings/modules`.** Map a different name if needed; the UI still says "Meeting"; never silently create an Event.
- The AI asks whether the call is booked in CRM, searches Meetings and Contacts by time window + attendee email/phone/name, presents up to three candidates with confidence and evidence; the agent confirms. Manual search and an explicit "Not in CRM / Skip". Never auto-attach.
- Pull: deal (name, stage, amount, close date, owner), contact (name, title, email, phone), account (name, industry), meeting (title, time, agenda, notes), and the last five notes/activities from the last 90 days. Cap to a token budget; summarise older items.
- Generate a TLDR and a call objective. Structured brief: TLDR, objective, attendees, pains, competitors, next step; editable by chat or fields. Inject the **brief**, not the raw chat, into the live prompt (via the prompt registry; replay after).
- Prep is optional: one-click "Skip prep"; auto-pickup may start without it; the rail stays available during the call and updates live context when confirmed.
- Brief + chat saved with the call (org-scoped), shown in History. Without Zoho, a manual brief works and Zoho shows `needs_connection`.
- Collapsed context rail during the call; it never pushes the card out of the one-glance zone.

### 5. Card feedback and learned instructions, 0.5.0 (R11, D-034)
- Rate AI advice cards only (AI answer, statement, objection, warning). Playbook, holding and system cards are not rateable.
- Thumbs up/down + optional reason chips: wrong, too long, not our style, good phrasing. Stored per user and per org; aggregates to admins.
- Instructions are per organization in v1.
- After a call with ≥ 3 ratings, send the learning AI a minimised packet: call summary, prep context, each rated card with the customer turn before and after, rating and reason. Never the whole transcript.
- At most 8 instructions, each ≤ 25 words. Auto-apply by default; per-org "review before apply" switch, default off. Editable, reorderable, disableable, deletable, versioned, revertible in Settings, with source call and date. "New instructions" badge.
- Learned instructions never override the playbook or hard rules; the playbook wins on conflict; never auto-edit a playbook entry.
- Stored in the prompt registry as a variable; no prompt text or model names in app code.
- Applied from the next call; never mutate an in-flight call.

### 6. Post-call actions, 0.6.0 (R12, D-031, D-032)
v1 actions, each approved, edited or rejected on its own card:
- create a Zoho CRM Meeting; create a Lead; update Contact fields (first name, last name, email, phone, description); add a Note to the related Deal; draft and send an email.
- No Deal stage/amount changes; no arbitrary module writes.
- The AI suggests actions with a short reason and confidence. Nothing is written or sent until the agent approves that card.
- In-app post-call panel (not a separate OS window). During the call, a side panel limited to lead creation and contact updates; never steal focus mid-call. *(Side panel superseded by D-043: one "Note for after the call" field; Lead/Contact before and after the call.)*
- Zoho writes use the connected user's OAuth and the user as Meeting owner, relate to the matched Contact, Deal, Account. The Meeting card has title, start/end, timezone, attendees, related records, owner; the agent confirms date/time. Every write audited and idempotent (retries never duplicate). Failure → plain reason + retry.
- Email senders: org-approved — Hostinger SMTP now, Resend optional, Gmail/Microsoft OAuth later. Sender chosen per email. To = primary contact on the deal/meeting; CC = other attendees/contacts; editable.
- Email formats (Admin → Email): name, optional action type (follow-up, meeting confirmation, general), example body, tone and length, static blocks (sender name, title, company, signature) with placeholders. Two defaults: follow-up, meeting confirmation. The AI picks the matching active format; the agent can override. The model generates only the variable body; static blocks are merged verbatim after. Optional per-user signature override. Preview and edit before send. The example is a style guide, never copied verbatim. No email without explicit confirmation.

### 7. WhatsApp via Gallabox, 0.7.0 (R12, D-033)
- Read the last 100 messages for the matched contact as transient call context. Log only the sent message, template and approval.
- Template-only in v1. The adapter exposes `window_status() -> open | closed | unknown`. Free-form stays disabled until Gallabox documents a reliable window signal and it is verified on the owner's account; only an authoritative `open` may allow a free-form draft, re-checked immediately before send. Closed, unknown or error → approved template. Never risk a ban.
- Admin → Integrations: allow-list of Gallabox templates the AI may choose; validate name and parameters; agent approves the final message.
- The post-call panel offers WhatsApp only when entitled, Gallabox connected, and a template or verified-open window exists.
- No WhatsApp history writes, no bulk sends, no sends without approval.

### 8. Release and landing page, 0.8.0 (D-030)
- Two channels: public landing page + private GitHub Releases archive. Repo stays private.
- Landing at `salesshield.agncompu.com` on us3 behind Caddy; public installers hosted there; GitHub Releases is the versioned archive.
- Owner adds DNS: A record `salesshield.agncompu.com → 104.168.48.116` (Cloudflare: DNS-only or a correct Caddy certificate setup). Remind; never assume it is done.
- Single page: hero, what it does, 3–4 feature sections, 0.3.0 screenshots, macOS + Windows download buttons (auto-detect macOS), system requirements, unsigned-install instructions, the owner's Zoho Forms embed (placeholder slot until provided — never invent a form), short privacy note by the form, Privacy and Terms pages, AGN IT Services footer. No pricing, no fake testimonials, no invented logos or metrics.
- Remove stale installers, the APK and the extension zip from `/downloads/`; replace the directory listing with the landing page; keep current desktop installers available.
- Tag v0.3.0…v0.8.0 with installers on GitHub Releases. Unsigned; clear first-open instructions; no auto-update.

### 9. Local Mac cleanup (end of round, local-only checklist)
- Quit the app. Remove `/Applications/Sotto.app`, `apps/desktop/release/mac/Sotto.app`, `apps/desktop/release/mac-arm64/Sotto.app`.
- Rebuild the latest version, install to `/Applications`, preserve `~/Library/Application Support/sotto-desktop` and the login (tests persistence).
- Optional clean-slate test that wipes app data only if the owner asks.

## Owner additions (13 Nov 2026)
- **Saturday demo (owner chose "2a"):** a Zoho demo slice is pulled forward from 0.4.0: connect Zoho, look up the caller's contact/deal/account and recent notes before or during the call, shown in the context rail. Tracked as T-053/T-055 (slice) + T-057 (rail).
- **Zoho OAuth client (owner created one):** Server-based Application; homepage `https://salesshield.agncompu.com/`; redirect `https://salesshield.agncompu.com/auth/zoho/callback/`; data centre `.com`. The client must also be enterable **per organization** in Admin → Integrations (write-only, encrypted like provider keys), with the platform client as the default; the desktop app uses the same admin screen.
- **Automate client creation (T-070, research first):** find whether Zoho offers any API to create OAuth clients; if not, the recommended path is one AGN platform client (any Zoho org's user can authorize it; enable multi-DC in the API console), with the per-org client as an optional override.
- **Gallabox (refines T-064):** Admin → Integrations has a place for the Gallabox API key, secret and channel. The template allow-list is a dropdown filled by pulling **all** templates from Gallabox; the admin selects templates and saves; the app then pulls each selected template's parameters so it knows what must be filled.
- **Zoho Forms embed (T-066):** `https://forms.zohopublic.com/agncomputerllc/form/SalesShieldSignup/formperma/95zC6xcBOHVHXpGkfczaurMCdOmUN1bSpPIhPdLDy-Q` (iframe, 500 px high, aria-label "Sales Shield Signup").
- **Hostinger SMTP:** owner sends it on 14 Nov.

## Definition of done per version

**0.3.0**
- Flag catalog with five states, owner entitlement matrix, global kill switch, org toggles default on, existing features retrofitted, server enforcement, consistent greyed UI.
- Login survives restart, update, offline and 5xx; 90-day sliding refresh; tokens in OS secure storage; migration test; no forced re-login.
- AGN Sales Shield visible everywhere; chosen logo in both installers, tray and favicon; D-001 superseded (D-026).
- Global reskin + live-call polish; light, dark, RTL; WCAG AA; one-glance card kept; density rule; five mascot moods.
- Replay p95 ≤ 1500 ms; tests, typecheck, lint, a11y and boundary checks green; screenshots.

**0.4.0**
- Per-user Zoho OAuth; DC choice; encrypted refresh tokens; disconnect and revoke; module permission matrix.
- Meeting/contact search with ≤ 3 confirmed candidates, manual search, skip.
- Context pull with the fields and caps above.
- Prep chat + editable brief; saved with the call; injected into the live prompt; works without Zoho.
- Live context rail; no latency regression (replay).

**0.5.0**
- Ratings only on AI cards; reason chips; stored per user and org.
- Instructions after ≥ 3 ratings; 8 × 25-word cap; editor; version and revert; review switch; playbook precedence; no playbook auto-edit.
- Evidence from a test call showing instructions applied on the next call.

**0.6.0**
- Zoho Meeting, Lead, Contact writes and Deal notes with approval, audit, idempotency; no Deal stage/amount writes.
- Email formats, static blocks, sender choice, To/CC, preview, send, audit.
- Post-call panel and during-call side panel; failure and retry paths.

**0.7.0**
- Gallabox template-only; window status; last 100 messages; approved sends; no free-form without a verified open; no ban-risk path.

**0.8.0**
- Landing live at the domain with the Zoho form and downloads; DNS verified; GitHub Releases tagged; stale/mobile/extension downloads removed; unsigned instructions; Privacy and Terms.
- Clean install preserving data; final QA; tracker and handoff complete.

## Non-goals
Mobile, extension or Linux releases · public repo · auto-update · signing/notarization · Deal stage/amount writes or arbitrary Zoho module writes · playbook auto-edit or instructions overriding the playbook · free-form WhatsApp before the window API is verified · per-agent instructions · pricing page, fake testimonials, invented logos or metrics · full-transcript upload to the learning AI · new paid accounts.

## Owner actions (batched; never block on them)
1. Approve one of the three logo directions.
2. DNS: `salesshield.agncompu.com` A → `104.168.48.116`, or name the DNS provider and Cloudflare setup.
3. Zoho OAuth Web Application client (api-console.zoho.com): client ID + secret, redirect URI, data centre, a test org. Secrets go into the app's key panel or the Mac `.env`, never chat.
4. Zoho Forms embed code.
5. Hostinger sender address + SMTP credentials; optional Resend key.
6. Gallabox API key, secret, channel; confirm the template list.
7. Review the Privacy and Terms draft before publish.
8. Test the Mac and Windows builds when asked.

## Orchestration for this round
See CLAUDE.md § Session orchestration. Workstreams for 0.3.0, each in its own branch + worktree, prompts in `docs/prompts/`:
- (a) **brand-ui** — T-048, T-049, T-050, T-051
- (b) **flags-auth** — T-045, T-046, T-047
- (c) **landing-infra** — T-066/T-067 plan + skeleton (starts once 0.3.0 assets exist)

Zoho and Gallabox research run as subagents; findings in `docs/REFERENCES.md`. The master reviews evidence, merges in dependency order (flags-auth → brand-ui → landing), runs the release gate T-052.
