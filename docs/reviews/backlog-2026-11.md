# Review backlog — November 2026

2026-11-13 · master planning · sources: `docs/reviews/ux-critique-2026-11.md` (UX-xx), `docs/reviews/integrations-playbook-2026-11.md` (INT-xx), `docs/reviews/zero-config-2026-11.md` (ZC-xx, DD-x, inventory rows A1–C6).

The owner asked for **every** item. Each item below has one home stream. Overlaps are merged (the "Merged" column lists every source id folded into the row). Items that need the owner are built only after the answer; until then the stream builds the default marked *(rec)* in "Needs the owner" or skips the gated part and says so in its report.

Size: **S** ≤ 1–2 days · **M** ≈ 3–7 days · **L** > 1 week. Status: wave 1 (T-072…T-074) `done` 2026-11-13; the rest `todo`. Tracker ids: T-072…T-083 (one per stream).

---

## Waves and streams

At most 3 streams run in parallel (D-035). Streams in one wave own disjoint files. Hub files (`apps/app/lib/i18n.ts`, `cloud/app.py`, `cloud/store.py`, `cloud/features.json`, `cloud/bundle.py`, `components/AppShell.tsx`, `app/admin/_layout.tsx`, `apps/desktop/**`) have **one owner per wave**; any other stream that needs a line there writes it in its report and the master adds it at merge (D-058).

| Wave | Stream (branch `phase9/<stream>`) | Tracker | Items | Model | Depends on |
|---|---|---|---|---|---|
| 1 | `review-ui-core` — shared UI primitives, live card, toast | T-072 | 13 | main | – |
| 1 | `review-copy-brand` — product voice, brand, flags page, owner console polish, landing | T-073 | 11 | **sonnet** | – |
| 1 | `review-server-core` — endpoints and data the later waves need | T-074 | 9 | main | – |
| 2 | `review-live-call` — rail, start screen, audio auto-setup | T-075 | 9 + W1-L1 | main | W1 (primitives, deep links, ZC-02) |
| 2 | `review-post-call` — after-call checklist, one follow-up, review | T-076 | 12 + UX-02h | main | W1 (primitives, `EndedView` split, INT-01 route) |
| 2 | `review-home-shell` — first run, Home, navigation, admin grouping, sign-in | T-077 | 10 + UX-39r | main | W1 (health, reset route, defaults data) |
| 3 | `review-integrations` — Integrations page, presets, Gallabox auto-import, Zoho invites | T-078 | 6 | main | W2 (admin grouping) |
| 3 | `review-owner-platform` — owner console: Zoho multi-DC, providers/routing/prompts, health, sign-up queue | T-079 | 6 | main | owner Q1, Q6, Q10 |
| 3 | `review-company-coaching` — Company defaults page, consent, learning, manager coaching | T-080 | 8 | main | W1 defaults data; owner Q4, Q5 |
| 4 | `review-followup-automation` — sequences, reminders, status webhooks, Zoho webhooks, attachments | T-081 | 5 | main | W2 post-call; owner Q12, Q13 |
| 4 | `review-zoho-scopes` — one-reconnect scope bundle: Tasks, Blueprint, custom fields, Campaigns, Analytics | T-082 | 6 | main | owner Q11, Q14 |
| 4 | `review-ai-autoconfig` — playbook bootstrap, silent routing, key rotation and spend caps | T-083 | 3 | main | W3 owner-platform; owner Q1–Q3, Q8, Q9; golden calls (P0.5) |

Only `review-copy-brand` is mechanical enough for sonnet. `review-company-coaching` could run on sonnet if the owner rejects INT-05's per-agent views; keep it on main by default (HR-sensitive data).

### Owned files per stream

**Wave 1**
- `review-ui-core`: `packages/ui/src/**` (not `src/brand/**`), `apps/app/app/gallery.tsx`, `apps/app/app/call.tsx`, `apps/app/features/call/components/{CardStack,CallHeader,ListenBar}.tsx`, new `apps/app/features/call/components/EndedView.tsx`, new `apps/app/features/call/strings.ts`, `apps/app/features/rating/**`, tests `__tests__/{card-stack,call,call-peek,call-survives-navigation}.test.tsx`, `packages/ui` tests.
- `review-copy-brand`: `apps/app/lib/i18n.ts` (values of existing keys; en + ar), `apps/app/features/flags/**`, `apps/app/app/admin/features.tsx`, `apps/app/app/admin/settings.tsx`, `apps/app/app/history/index.tsx`, `apps/agent-worker/sotto_worker/cloud/owner/**`, `cloud/features.json`, `cloud/features.py`, `packages/ui/src/brand/**`, `scripts/a11y.mjs`, `apps/landing/**`, tests `__tests__/{feature-gate,no-samples,history-server,i18n}.test.*`, `tests/cloud/{test_owner,test_features}.py`.
- `review-server-core`: `cloud/{app,store,auth,bundle,mail,passwords}.py`, `cloud/zoho/**`, `apps/agent-worker/sotto_worker/adapters/crm/**`, `seed/prompts/crm_brief.md`, `seed/company/**`, `apps/desktop/**`, `apps/app/lib/{cloud,cloudCompat}.ts`, new tests under `apps/agent-worker/tests/cloud/` and `apps/desktop/test/`.

**Wave 2** (exact lists, refined 2026-11-13 with the wave-1 handover, are in `docs/prompts/review-{live-call,post-call,home-shell}.md`; those win)
- `review-live-call`: `apps/app/app/call.tsx`, `apps/app/features/call/**` (except `components/EndedView.tsx`), `apps/app/features/crm/{api,useZoho,attached,mock,ZohoConnect}.ts*`, `apps/app/lib/{format,desktop,callNotes}.ts`, `apps/app/components/CallPeek.tsx`, `apps/desktop/**`, `__tests__/{crm-rail,call*,card-stack}.test.tsx`. Also W1-L1 (`desktop.ts` types for `openPrivacySettings`/`onDeepLink`, deep link → Zoho status re-read).
- `review-post-call`: `apps/app/features/call/components/EndedView.tsx`, `apps/app/features/{actions,email,whatsapp,review,rating,history}/**` (not `SmtpSettings`/`GallaboxSettings`), `apps/app/app/history/**`, `apps/app/lib/{cloud,deviceHistory}.ts`, `packages/engine/src/{review,types}.ts`, `seed/prompts/{review,followup,summary}.md`, `cloud/email/defaults.json`, hubs `cloud/{app,store,bundle}.py` this wave, `__tests__/{zoho-actions,messaging,history-server}.test.tsx`. Also UX-02h (rating in History).
- `review-home-shell`: `apps/app/lib/i18n.ts` this wave, `apps/app/lib/{locale,role,prefs}.ts*`, `apps/app/features/home/**`, `apps/app/features/crm/{HomeMeetings,UpcomingMeetings}.tsx`, `apps/app/app/{home,index,account,settings,_layout,reset-password}.tsx`, `apps/app/components/**` (except `CallPeek.tsx`), `apps/app/app/admin/{_layout,index,recordings,devices,activity}.tsx` (+ the `code=` line in `keys.tsx`), `apps/app/features/{account,settings}/**`, `scripts/{a11y,screenshots}.mjs`, `__tests__/{home-meetings,admin-desktop-tabs,admin-tools,admin-team,tutorial,screens,plan-paused,persistent-login,i18n,settings-server,settings-web-admin,app-link,feature-gate}.test.*`. Also UX-39r (`/reset-password` page).
- `packages/ui/**` is read-only in wave 2 (changes go through the master).

**Wave 3** (exact lists, refined 2026-11-14 with the owner's answers, are in `docs/prompts/review-{integrations,owner-platform,company-coaching}.md`; those win)
- `review-integrations`: `apps/app/app/admin/integrations.tsx`, `apps/app/features/email/SmtpSettings.tsx`, `apps/app/features/whatsapp/GallaboxSettings.tsx`, `apps/app/features/team/**`, `cloud/email/**`, `cloud/gallabox/**`, `cloud/zoho/{routes,lookup}.py`, `adapters/{email,whatsapp}/**`, their tests.
- `review-owner-platform`: `cloud/owner/**`, `cloud/{app,store,bundle,features}.py`, `cloud/features.json`, `cloud/zoho/oauth.py`, `apps/app/app/admin/{keys,models,prompts}*`, `apps/app/features/{keys,prompts}/**`, `seed/models/**`, their tests.
- `review-company-coaching`: `apps/app/app/admin/{settings,instructions,index,features}.tsx`, `apps/app/app/{reports,playbook,inbox,settings}.tsx`, `apps/app/features/{learning,reports,playbook,escalations,admin}/**`, `cloud/learning/**`, `seed/prompts/learned_*.md`, `apps/app/lib/i18n.ts` this wave, their tests.

**Wave 4** (exact lists in `docs/prompts/review-{followup-automation,zoho-scopes,ai-autoconfig}.md`; those win)
- `review-followup-automation`: new `cloud/scheduler/**`, new `cloud/gallabox/webhook.py`, new `cloud/zoho/webhooks.py`, new `apps/app/features/followup/**`, `apps/app/features/call/components/EndedView.tsx`, `cloud/email/attachments*`, hubs `cloud/{app,store}.py` this wave, `apps/desktop/**` (notifications).
- `review-zoho-scopes`: `cloud/zoho/{oauth,actions,lookup,routes}.py`, `adapters/crm/**`, new `cloud/export/**`, `apps/app/features/crm/**`, `apps/app/features/call/components/CrmRail.tsx`, `apps/app/features/actions/**`.
- `review-ai-autoconfig`: new `cloud/bootstrap/**`, new `cloud/routing/**`, `seed/models/**`, `scripts/replay*`, owner-console views it adds (after `review-owner-platform` merged).

---

## Backlog

### Wave 1 · `review-ui-core` (T-072)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-02 | – | No rating controls on the live hero card; thumbs (two 44 px icon buttons, no visible question) on collapsed cards on hover/focus, after the call and in History | S | done |
| UX-11 | – | Remove "On screen x s after…" from the card; timing stays in logs, History detail, Reports | S | done |
| UX-12 | – | Card type = voice-bar colour + icon only; source + R2 notice merged into one line under the sentence | S | done |
| UX-13 | – | At most 2 earlier cards + "Show earlier (n)"; background-tone fill so they recede | S | done |
| UX-14 | – | Compact holding cards keep the dashed edge, or drop once a real card for that turn exists | S | done |
| UX-15 | – | Rail toggle gets a visible "Context" label and moves to the start side; End call alone on the end side | S | done |
| UX-06a | UX-06 (header) | Header: "Practice" only for practice calls; model/mode in the live-dot tooltip; mock badge never in release | S | done |
| UX-07 | – | Escalation toast: top-end on wide, above the composer on narrow, short text "Sent to your manager" | S | done |
| UX-40 | – | Dark-mode toast is a raised dark surface with border, not an inverted light slab | S | done |
| UX-43a | UX-43 (live) | Live call shows a small live dot, not the mascot, beside "Listening to the customer" | S | done |
| UX-44a | UX-44 (components) | Visible focus rings and 44 px targets on every icon-only button in `packages/ui`; disabled controls can carry helper text | S | done |
| W1-UI | UX-01, UX-04, UX-23, UX-26, UX-41 (enablers) | New `packages/ui` primitives: `Disclosure`, `Sheet` (bottom sheet < 768 px), `ChecklistRow`, `Toast` with an action (Undo), neutral `StatTile`, `LtrRun` (bidi-isolated run); gallery entries + tests | M | done |
| W1-SPLIT | – | Extract the ended/after-call composition from `app/call.tsx` into `EndedView.tsx`, no behaviour change, so wave 2 can split call.tsx ownership | S | done |

### Wave 1 · `review-copy-brand` (T-073)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-06b | UX-06 (copy) | Remove "Phase 4", `pnpm demo`, "Fake AI" wording from user-facing strings (en + ar), incl. offline and not-in-build states | S | done |
| UX-42 | – | Product voice for connecting/error/empty states; never "demo", "server" or "log" to an agent | S | done |
| UX-08 | – | Owner console header and `<title>` "AGN Sales Shield · Owner"; owner console inside the R8 grep test; re-shoot Features evidence | S | done |
| UX-09 | ZC B11 | Features page: off-by-platform/plan = disabled switch with the reason; shipped features `built: true` (no "later version"); page copy matches; plumbing rows hidden, plain names | S | done |
| UX-33 | – | Owner kill switch as a status table ("Live / Killed since …") with a confirmed destructive action; sticky first column; sentence-case headers | S | done |
| UX-44b | UX-44 (owner) | `pnpm a11y` also checks `/owner` pages | S | done |
| UX-28 | – | History: "Your calls"; samples only as an empty-state link | S | done |
| UX-34 | – | Desktop Admin › Settings: "AI models are managed in the web admin" + Open web admin | S | done |
| UX-36 | – | Landing: real screenshots, versions read from `downloads.json`, form skeleton + mailto fallback, "First open on Mac and Windows" | S | done |
| UX-37 | – | Landing: "Works with Zoho CRM" feature card + text badge near the CTA (no Zoho logo) | S | done |
| UX-38 | – | Landing CTA: detect platform, "Download for Mac", small line with the other builds | S | done |

### Wave 1 · `review-server-core` (T-074)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| ZC-02 | ZC A9 (DC part) | Zoho data centre detected from the OAuth callback (`location`, `accounts-server`), stored per user; "Change" stays (R10) | S | done |
| UX-35 | – | Zoho connect page lists what is read/written, shows DC with Change, has Cancel; done page says "You can close this tab" + deep link to the app | S | done |
| W1-DESK | UX-21, UX-35 (enablers) | Desktop registers `agn-sales-shield://`; preload exposes "open the OS privacy pane" (Mac screen/system audio, mic; Windows mic) | S | done |
| ZC-14s | ZC-14 (server) | Server computes one config health per org (`ok` / `needs_attention` + reason: Zoho token expired, SMTP failing, quota near) in the session config | S | done |
| UX-39s | UX-39 (server) | Password reset by email: single-use, 30-minute token, rate-limited, audited | M | done |
| ZC-11s | ZC-11, ZC A4, B4, B9, DD-4 (data), DD-5 (data) | Company defaults data: `record_calls` org policy, manager auto-derived from roles, consent record (choice + timestamp, audited), `vendor_allow_list`; no legal text | M | done |
| INT-01s | INT-01 (server) | `call_log` action: structured Note on Deal, else Contact, else Lead; idempotent per call; audited | S | done |
| INT-03 | – | Stage → guidance block in the `crm_brief` seed prompt (data, ≤ 150 tokens, "stage as of prep"); replay | S | done |
| INT-16 | INT-16 (fields part) | `Lead_Source` and campaign name already on the record go into the brief; replay | S | done |

### Wave 2 · `review-live-call` (T-075)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-01 | ZC A10 | Rail: full brief editor before the call; live = 4-line read-only brief + Edit link, then transcript; CRM details behind "More from Zoho"; at 390 px a bottom sheet over the card | M | todo |
| UX-03r | UX-03 (rail) | Rail shows the candidate picker only when the call started unlinked, as one line "Not linked to Zoho · Link" | S | todo |
| UX-16 | – | "Linked to this call."; timing note moves to brief-editor help | S | todo |
| UX-17 | – | Zoho values through `lib/format.ts` (currency, grouping, dates) | S | todo |
| UX-18 | – | Talk-ratio bar only when "You're talking a lot"; full bar in the review | S | todo |
| UX-19 | INT-11 | No CRM forms in the live rail; one "Note for after the call" field; unknown caller → dedupe search + prefilled Lead offered before the call starts and in the after-call checklist | S | todo |
| UX-20 | – | One start screen: detected call app → "Start listening"; secondary microphone; tertiary practice; one verb | S | todo |
| UX-21 | – | Desktop permission copy + button that opens the exact OS privacy pane | S | todo |
| ZC-08 | ZC A2, A6, A7, DD-8 (audio) | Audio auto-setup: OS default devices, call-app detection → system audio = customer; 5 s level check on both tracks; plain-language fix; remembered per device; auto-pickup default on; never a mixed track (R4) | M | todo |

### Wave 2 · `review-post-call` (T-076)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-04 | ZC A12 | After-call order: one-line review → "Suggested updates (n)" checklist (nothing pre-ticked, Edit disclosure, one "Save n to Zoho") → follow-up → done state "Saved to Zoho ✓ · Open in Zoho"; cards and transcript move to History | M | todo |
| UX-05 | – | One "Follow up with <name>" card: follow-up draft = email body, WhatsApp as second tab | S | todo |
| UX-22 | – | Email preview as a mail client (From/To/Subject rows); warn when the body says "attached" with no attachment | S | todo |
| UX-23 | – | "Skip" with 5 s Undo toast; skipped items listed in History detail | S | todo |
| UX-24 | – | "Start another call" secondary until follow-up items are saved or skipped | S | todo |
| UX-27 | – | Review leads with the coach's tip + mascot mood; dimensions under Details; chance to close as Likely/Unclear/Unlikely | S | todo |
| UX-41 | – | Deal note heading "Note on <deal>" with the name in an LTR-isolated run; no repeated "Deal:" | S | todo |
| INT-01c | INT-01 (client) | "Call log" item in the checklist: summary, objections, commitments, next step, chance band; preview before save | S | todo |
| INT-02m | INT-02 (Meeting) | Next-step Meeting prefilled from the review's agreed date; agent must confirm date/time and timezone | S | todo |
| INT-07 | – | Deal-risk signals in the review (reason + quote, "AI-estimated"); offered as part of the call-log Note | M | todo |
| INT-14a | INT-14 (links), ZC B15, DD-7 (formats) | Good default email formats per action; customers edit only static blocks; links (proposal, booking) as static blocks | S | todo |
| W2-REPLAY | – | Replay after the review/follow-up prompt changes; p50/p95 reported | S | todo |

### Wave 2 · `review-home-shell` (T-077)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-10 | ZC-09, DD-8, ZC A8, A15 | Role-based first-run checklist on Home (agent: Connect Zoho, Test audio, Practice call*; admin: playbook, invite, connect email/WhatsApp), deep links, hidden when done. *Practice step per owner Q15 | M | todo |
| UX-03h | UX-03 (Home) | Home "Next meetings": Prepare (opens the brief) and "Start call with this meeting" | M | todo |
| UX-25 | ZC A14 | Agent Home: next meetings, last call's tip, own open questions; company block for admin/manager only; no model names for agents; trial/seats as one status line | S | todo |
| UX-26 | – | Neutral stat tiles (card colours only on cards) | S | todo |
| UX-43b | UX-43 (Home) | Replace the greeting with "Next: <meeting> at <time>"; mascot only for review moods | S | todo |
| UX-29 | ZC B16, ZC app map (admin), D-038 | Desktop admin grouped: People, Connections, AI, Company; Keys & providers removed from the desktop (D-038); Recordings/Devices/Activity in one Company page | M | todo |
| UX-39 | – | Sign in and "Create a company" separated; Forgot password; "You'll stay signed in on this computer." | S | todo |
| ZC-14c | ZC-14 (client) | One health banner from the server status with a fix link | S | todo |
| ZC-map-agent | ZC A1, A3, A5, app map (agent) | Agents do not see Inbox/Playbook editor; Settings = language/theme, Audio, Advanced (mini window, sounds, auto-pickup), About; "Soon" placeholders gone; UI language from the OS on first start | S | todo |
| W2-A11Y | UX-44 | `pnpm a11y` routes updated for the new Home/admin structure; 0 serious | S | todo |

### Wave 3 · `review-integrations` (T-078)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| UX-30 | DD-6 (company side) | Integrations order: your Zoho connection → Email → WhatsApp → Advanced (own OAuth client) collapsed or moved to owner console per Q6; "Client ID ends …a1b2"; clear "remove" copy | S | todo |
| UX-32 | ZC-03, ZC B13, DD-7 (presets) | SMTP presets (Google, Microsoft 365, Hostinger, Zoho Mail, Other) from the admin's domain (known map + MX lookup), only the password field shown, test email on save with the result inline | M | todo |
| ZC-07 | ZC B14, DD-7 (WhatsApp) | Gallabox: after a valid key, pull channels and APPROVED templates into pick lists; allow-list defaults to approved; parameter → CRM/brief field mapping guessed, only unmapped shown | M | todo |
| ZC-13 | – | "Invite everyone with a Zoho CRM user in sales roles" (default role agent) | M | todo |
| UX-44c | UX-44 (disabled) | Disabled Save/Send buttons on Integrations explain why ("Enter a client ID first") | S | todo |
| W3-PRACTICE | UX-10 (practice step), ZC-09, T-038 | Practice call in real accounts, labelled "Practice", never saved to History/Reports/learning; first-run step (Q15 → D-073) | M | todo |
| W3-INT-EVID | – | Integrations screenshots light/dark/RTL/390/1280; axe 0 serious | S | todo |

### Wave 3 · `review-owner-platform` (T-079)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| ZC-01 | T-070, DD-6, ZC C3 | Platform Zoho client per DC family in the owner console; server picks by detected DC; per-org client becomes an owner-console override | M | todo |
| ZC-06 | – | Platform circuit breaking: a failing primary is demoted for all tenants for N minutes via the 10-min config refresh; owner health board | M | todo |
| DD-1 | ZC B2, B3, C6 | Owner console "Providers and keys" (platform keys, per-company BYO) and "Model routing" (per stage, benchmark column, rollback) — **gated Q1** | L | todo |
| DD-2 | ZC B5, P6.2, T-040 | Prompt studio in the owner console with persisted `prompt_versions`, test, publish, rollback; company override owner-only — **gated Q1** | L | todo |
| ZC-10 | ZC C1 | Zoho Forms sign-up creates a trial org + first admin invite; rate limit; owner sign-up queue — **gated Q10** | M | todo |
| W3-OWN-A11Y | UX-44 | axe 0 serious on every new owner view | S | todo |

### Wave 3 · `review-company-coaching` (T-080)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| ZC-11c | ZC-11, ZC B6, B7, B9, A4 | One "Company defaults" page: tone, call goal (prefilled), record calls (org policy; agents see a read-only line), allow unverified AI answers, manager | S | todo |
| DD-4 | ZC B4 | "Who processes your calls" consent step at onboarding, choice + timestamp audited, "primary vendors only" switch; text from the owner — **gated Q5** | M | todo |
| DD-5 | ZC B8 | Agent-track-context toggle removed (AGN default) — **gated Q4** | S | todo |
| ZC-B10 | ZC B10 | Learned instructions auto-apply by default; "AGN learned n things" card on admin home links to the editor | S | todo |
| UX-31 | – | Instructions: pending version as a diff with Approve/Reject; editor hidden until decided; word counter only > 20; 44 px reorder | S | todo |
| UX-06c | UX-06 (instructions) | "From the call with <name>, <date>" instead of a call id | S | todo |
| INT-05 | – | Manager coaching view (rejected cards, repeated objections, weakest skill, learned instructions) + opt-in weekly email; agents see own data first, no ranking by default | M | todo |
| INT-15 | – | Playbook suggestions from repeated "not helpful" ratings and manager answers, always a manager approval card | M | todo |

### Wave 4 · `review-followup-automation` (T-081)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| INT-08 | – | Follow-up plan (email day 0 → WhatsApp template day 2 → reminder): in-process server scheduler; each step re-asks the agent with a desktop notification, one tap; never auto-sends | L | todo |
| INT-09 | – | Meeting reminders (UTILITY template), org flag default off, approval mode per **Q12** | M | todo |
| INT-10 | – | Gallabox status webhook (HMAC-verified), status only, no text — **gated Q13** | M | todo |
| INT-13 | – | Zoho Notifications watch for Deals/Events changes per connection, renewal job, brief refresh | L | todo |
| INT-14b | INT-14 (files) | Admin-curated attachment list for follow-up emails (no agent uploads) | M | todo |

### Wave 4 · `review-zoho-scopes` (T-082)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| W4-SCOPES | – | One scope bundle and one reconnect prompt for all new scopes — **gated Q11** | S | todo |
| INT-02t | INT-02 (Tasks) | Next-step Task (`tasks.CREATE`), agent-confirmed | M | todo |
| INT-04 | – | Blueprint read-only checklist in the rail ("to move to X you still need …"); suggests a Note, never executes a transition | M | todo |
| INT-06 | – | Allow-listed AGN custom fields on Deals (score, chance band, top objection, last call date); Stage/Amount blocked by test — **gated Q11** | M | todo |
| INT-16c | INT-16 (Campaigns) | Campaign module read for attribution — **gated Q11** | S | todo |
| INT-12 | – | Weekly CSV export (scores, counts, categories, Zoho ids; no transcript) for Zoho Analytics; live push only per **Q14** | S | todo |

### Wave 4 · `review-ai-autoconfig` (T-083)
| Key | Merged | Summary | Size | Status |
|---|---|---|---|---|
| ZC-04 | ZC A13 | Playbook bootstrap from Zoho, website and a pasted document into "needs review" entries — **gated Q8** | L | todo |
| ZC-05 | – | Benchmark-based routing job, staged + canary on AGN's demo org, rollback; replay is the evidence — **gated Q9, needs golden calls (P0.5)** | L | todo |
| ZC-12 | DD-3 (metering) | Key rotation without a release, per-tenant sub-keys/tokens where vendors allow, per-company metering + spend caps + 80 % alert — **gated Q1–Q3** | M | todo |

---

## Needs the owner

**Answered 2026-11-14: "all recommended" (1a … 15a), recorded as D-059 (Q1) … D-073 (Q15) in `docs/DECISIONS.md`.** Open owner inputs: cost-per-minute live replay (D-060), spend cap values (D-061, D-067), sub-processor list and legal text (D-063), Zoho multi-DC switch (D-064), Gallabox webhook plan (D-071).

Only items that spend money, need a new paid account, change production/infra beyond a normal deploy, change R1–R12, delete data, or add a major dependency. Answer like "1a, 2a, …". *(rec)* = what we build if you agree.

1. **Move providers, keys, model routing and the prompt studio from the company admin to the owner console (DD-1, DD-2; amends R6 "Keys & providers panel" and "Prompt studio" audience)?** (a) yes, both; company BYO only when AGN enables it *(rec)* · (b) keys and models only, prompts stay with the company · (c) no, keep today's split (D-038).
2. **Who pays vendor usage (DD-3, spends money)?** (a) AGN, bundled in the plan minutes, after we give you a cost-per-minute estimate from the live replay *(rec)* · (b) metered overage billed to customers · (c) customers bring their own keys, as today.
3. **Shared platform keys across companies (ZC-12, B2)?** (a) yes, with per-tenant sub-keys/short-lived tokens where the vendor offers them, spend caps and alerts *(rec)* · (b) one key per company, created by AGN (more vendor accounts) · (c) all model traffic through an AGN relay (risks R1).
4. **Remove the "agent track as context" setting (DD-5; R4 text "(setting)" becomes "(platform default)")?** (a) yes, AGN default, behaviour unchanged *(rec)* · (b) keep the admin toggle.
5. **AI-vendor consent step (DD-4): the sub-processor list and legal text must come from you or counsel.** (a) we build the step with a "DRAFT — not legal text" placeholder now; you supply the wording before release *(rec)* · (b) skip the step for now.
6. **Zoho data centres (ZC-01/DD-6): you register the extra DC clients (EU, IN, AU, …) or enable multi-DC on the existing client in the Zoho API console.** (a) enable multi-DC on the existing client; per-org client form moves to the owner console as an override *(rec)* · (b) keep the per-org client form in Admin › Integrations (collapsed under Advanced).
7. **Default email sender (DD-7, new paid account)?** (a) customer SMTP with presets; AGN's Hostinger SMTP stays the fallback *(rec)* · (b) a paid transactional vendor (e.g. Resend) as the default sender.
8. **Playbook bootstrap from CRM and website (ZC-04; LLM cost, customer data)?** (a) allowed after the consent step, entries land as "needs review" *(rec)* · (b) not now.
9. **Automatic model routing (ZC-05; recurring paid replays, needs your golden calls)?** (a) build it, run weekly with a monthly spend cap you set, golden calls first *(rec)* · (b) AGN switches models by hand.
10. **Self-signup creates a trial company (ZC-10; amends R3 "only the platform owner creates companies")?** (a) yes, from the Zoho Forms sign-up, rate-limited, visible in an owner queue *(rec)* · (b) no, AGN creates every company.
11. **Zoho scope bundle (INT-02 Tasks, INT-04 Blueprint definitions, INT-06 custom Deal fields, INT-16 Campaigns): every agent reconnects once; INT-06 creates AGN fields in customer Zoho orgs and supersedes D-031's "no Deal writes" for an allow-list (Stage/Amount stay blocked, R12).** (a) all in one release *(rec)* · (b) read scopes only (Tasks, Blueprint, Campaigns), no Deal field writes · (c) none.
12. **WhatsApp meeting reminders (INT-09; R12 says each send waits for its own approval).** (a) one tap per reminder, no requirement change *(rec)* · (b) standing approval ticked when the meeting is booked (amends R12).
13. **Gallabox delivery/read status (INT-10): needs a Gallabox plan with webhooks (Essential/Advanced) and stores status only (no message text).** (a) yes if your plan includes webhooks *(rec)* · (b) no.
14. **Zoho Analytics (INT-12)?** (a) weekly CSV export only *(rec)* · (b) live push (new vendor integration, likely a paid Analytics plan).
15. **Practice call in real accounts (UX-10, ZC-09; conflicts with D-024, already open as T-038).** (a) allowed, labelled "Practice", never saved to History or Reports *(rec)* · (b) no; first run skips the practice step.

---

## Technical decisions (recorded in `docs/DECISIONS.md` on 2026-11-14 with these numbers)

The zero-config review's DD items became owner decisions D-059…D-073 above. Code comments that say "draft D-0NN (backlog)" refer to these numbers. Our own technical choices:

- **D-058 — Review-backlog ownership.** One owner per hub file per wave (i18n.ts, cloud/app.py, store.py, features.json, bundle.py, AppShell, admin/_layout, apps/desktop). New strings go in feature-local `strings.ts` files (pattern of `features/email/strings.ts`). Other streams request hub lines in their report; the master adds them at merge.
- **D-042 — The live call carries no rating question, no timing line and no CRM form** (UX-02, UX-11, UX-19). R11 is unchanged: only AI advice cards are rateable, now on collapsed cards, after the call and in History. R1 timing is still logged per card.
- **D-043 — No during-call side panel for Lead/Contact** (UX-19 + INT-11). Unknown callers get a dedupe search and a prefilled Lead before the call starts and in the after-call checklist; during the call one "Note for after the call" field. Supersedes the phase 9 brief line "During the call, a side panel limited to lead creation and contact updates".
- **D-044 — After-call checklist approval** (UX-04). Nothing is pre-ticked; each ticked item is its own approval, its own idempotent write and its own audit row; "Save n to Zoho" submits only ticked items (R12 holds).
- **D-045 — One follow-up card** (UX-05). The `followup` draft becomes the email body; WhatsApp is the second tab; there is one send path per channel.
- **D-046 — Zoho data centre detected from the OAuth callback** (ZC-02). A "Change" link keeps R10's "chosen data centre".
- **D-047 — Call-log Note** (INT-01). Parent order Deal → Contact → Lead; no transcript text, only the review's structured summary; idempotency key per call and kind.
- **D-048 — Stage and source guidance is seed data in `crm_brief`** (INT-03, INT-16), ≤ 150 tokens, labelled "as of prep"; replay p95 ≤ 1500 ms is the gate.
- **D-049 — Recording is an org policy** (ZC A4). The per-agent toggle becomes a read-only line; the admin sets it once.
- **D-050 — Agents never see model names, admin stats, the Inbox or the playbook editor** (UX-25, ZC app map), in line with the R3 role table.
- **D-051 — Desktop admin in four groups; Keys & providers leaves the desktop** (UX-29, applies D-038).
- **D-052 — SMTP presets** (ZC-03): known-domain map plus MX lookup with `dnspython` (small, pure-Python); if the master judges it major, a static map + "Other" only.
- **D-053 — Password reset** (UX-39): emailed single-use token, 30 minutes, rate-limited per address and client, audited; using it revokes the user's other refresh tokens.
- **D-054 — Desktop deep link scheme `agn-sales-shield://`** (UX-35), only for "return to the app"; it carries no tokens.
- **D-055 — Follow-up steps re-ask the agent** (INT-08): an in-process scheduler on the server (no new dependency) creates a desktop notification per step; nothing is sent without that tap (R12, D-033).
- **D-056 — Blueprint is read-only** (INT-04): the checklist suggests a Note; transitions are never executed (D-031).
- **D-057 — Config health is computed by the server** (ZC-14) and shipped in the session config with the feature map (D-036).

---

## Out / deferred

| Item | Reason |
|---|---|
| ZC-15 (card language and holding lines from the customer's language mix) | Conflicts with D-018 (English only for calls and cards). Revisit only if the owner supersedes D-018. |
| ZC B6 "card language = same as the customer" (and that part of DD-5) | Same: D-018. |
| INT-04 executing Blueprint transitions | D-031 and R12: no Deal stage write. Read-only checklist is in scope (T-082). |
| INT-06 Stage/Amount writes | R12: "No Deal stage or amount write is possible through the API". Only the allow-listed AGN fields are in scope (gated Q11). |
| INT-08/INT-09 automatic sends without a tap | R12 and D-033 (each send approved). Built as one-tap steps instead. |
| INT-10 storing inbound message text | R12/D-033 "message history is not stored". Status only (gated Q13). |
| ZC-12 option "all model calls through an AGN relay" | Adds a hop against R1; kept as a fallback, not built unless the owner picks 3c. |
| Mobile/extension/Linux-specific polish from the reviews | R5a/D-027: desktop first; those builds only keep passing tests. 390 px still checked (narrow desktop windows). |
