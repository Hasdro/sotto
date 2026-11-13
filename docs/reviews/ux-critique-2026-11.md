# AGN Sales Shield — UX critique, November 2026 (0.4.0)

Reviewer stance: demanding senior product designer. Findings only; no code changed.
Sources: `docs/DESIGN.md`, `docs/REQUIREMENTS.md` (R1, R8, R10–R12), the phase 9 screenshots under `docs/evidence/phase9/**`, and the screen code in `apps/app`, `apps/agent-worker/sotto_worker/cloud/owner/` and `apps/landing/`. Screenshot paths are relative to the repo root. Ids are stable so the owner can pick them one by one ("do UX-03, UX-11").

Effort: **S** ≤ 1 day, **M** 2–4 days, **L** a week or more.

---

## Top 10 issues, ranked by impact on a sales agent

| # | Id | Issue | Effort |
|---|---|---|---|
| 1 | UX-01 | The live-call rail opens on a long Zoho record and an editable brief form; the transcript is pushed below the fold. The rail fights the card for the agent's eyes. | M |
| 2 | UX-02 | Rating controls sit under the hero card during the live call: a second interactive target beside the one thing the agent must read. | S |
| 3 | UX-03 | Zoho meeting → contact is chosen *during* the call, in the rail. The right moment is before the call, from Home. | M |
| 4 | UX-04 | The after-call screen is a long stack of three near-identical forms (meeting, contact, deal note) with the call review below them; there is no "approve all" and no sense of done. | M |
| 5 | UX-05 | Two email paths after a call: the old "Follow-up" draft and the new "Send email" action. The agent cannot tell which one sends. | S |
| 6 | UX-06 | Dev and engineering vocabulary on agent screens: "Fake AI", "Mock stream (dev only)", "The demo is not running · pnpm demo", "Live calls arrive in Phase 4", "From call 11111111". | S |
| 7 | UX-07 | The "Sent to your manager" toast covers the bottom of the screen (composer, Approve buttons) and is repeated as a yellow block in the transcript. | S |
| 8 | UX-08 | Brand is still split: owner console says "Sotto", Admin › Features shows the old `sotto` wordmark (R8 fails its own grep test in screenshots). | S |
| 9 | UX-09 | Admin › Features contradicts itself: a toggle shows **on** next to "Off by AGN"; Zoho CRM says "Needs a connection · Coming in a later version" although 0.4.0 ships it. | S |
| 10 | UX-10 | First run has no guided path for a new agent: sign in → connect Zoho → pick audio source → first call is spread over Home, Admin › Integrations, Settings and the Call screen. | M |

---

## Findings by screen

### Live call — suggestion card and header

**UX-02 · Rating controls on the live hero card** — S
- *Screen:* Call, live (`features/call/components/CardStack.tsx:71` renders `RatingControls` under the hero).
- *Problem:* "Was this card helpful? Helpful / Not helpful / Why?" sits directly below the card while the customer is talking.
- *Why it matters:* DESIGN §1 says the card is the only loud thing. A question aimed at the agent mid-call invites a decision at the worst moment and adds motion in the reading zone when the reason chips expand.
- *Fix:* Hide ratings on the hero while the call is live. Show them on the *collapsed* earlier cards on hover/focus only, and on every card in the after-call view and in History. Keep thumbs as two 44 px icon buttons with accessible names; drop the visible question.

**UX-06 · Engineering words on agent screens** — S
- *Screen:* Call header ("Fake AI", "Mock stream (dev only)"), offline state ("The demo is not running", `pnpm demo`), `call.notInThisBuild` ("Live calls arrive in Phase 4"), Instructions ("From call 11111111").
- *Screenshot:* `docs/evidence/phase9/zoho-actions/rail-brief-1280-light-en.png` (header), `docs/evidence/phase9/learning-admin/instructions-light-1280.png` (call id).
- *Why it matters:* Each of these appears in the Zoho Partner demo and makes a shipped product look like a prototype. "Phase 4" is an internal plan, not a promise to a customer.
- *Fix:* Header: show "Practice" only for practice calls, nothing for real ones; move the model/mode to a tooltip on the live dot. Hide the mock badge in release builds (it is already dev-only; make the screenshot path match). Offline state: "Sales Shield can't reach its call engine. Restart the app; if it keeps happening, contact your admin." Remove the Phase copy. Show "From the call with Jane Doe, 13 Nov" instead of a call id.

**UX-11 · "On screen 0.39 s after the customer stopped" on every card** — S
- *Screen:* hero card footnote.
- *Problem:* A latency metric printed in the reading area of every card.
- *Why it matters:* The agent cannot act on it; it is a third line of text to skip, and at 1.4 s it advertises slowness to anyone watching the screen share.
- *Fix:* Remove from the agent's card; keep it in the a11y label off, in History detail and in Reports (R1 dashboard already holds it). Optional: a setting "Show timing" for admins.

**UX-12 · Card type label and source compete with the sentence** — S
- *Screen:* hero card header: icon disc + "Answer" + "AI answer" + yellow "Not in playbook — check before promising" pill.
- *Problem:* Three labels before the sentence; "Answer" and "AI answer" say almost the same thing.
- *Why it matters:* One-glance reading. Every line above the sentence delays it.
- *Fix:* Keep the type as the voice-bar colour + icon only; merge source and R2 notice into one short line *under* the sentence ("Not in playbook — check first"). The notice must stay (R2), but it does not have to lead.

**UX-13 · Earlier cards take half the column** — S
- *Screen:* "Earlier in this call" with up to 4 compact cards at full width.
- *Problem:* At 1280 px the compact cards are as wide as the hero and read at nearly the same weight (white fill vs a dark hero, so they are actually the brightest surfaces on screen in light mode).
- *Fix:* Show at most 2 earlier cards by default with a "Show earlier (n)" link; use the background tone, not white, for their fill so they recede.

**UX-14 · The holding line looks like any other earlier card** — S
- *Screen:* earlier-card list; "Holding line · Good question. Let me confirm…".
- *Problem:* Once it collapses, the dashed outline that marks it as provisional is gone; it reads like advice.
- *Fix:* Keep the dashed edge on compact holding cards, or drop holding cards from the earlier list once a real card of that turn exists (DESIGN §5 already replaces it in the hero).

**UX-15 · End call and the rail toggle sit side by side** — S
- *Screen:* header, `rail-brief-390-dark-en.png`.
- *Problem:* The unlabeled panel glyph sits next to a red End call; on 390 px both are in the thumb zone at the same height.
- *Fix:* Give the toggle a visible label ("Context") or move it to the start side of the header; keep End call alone on the end side (its existing confirm dialog stays).

### Live call — context rail (Zoho, brief, transcript, quick actions)

**UX-01 · The rail is a second app** — M
- *Screen:* rail at 1280 and 390 (`docs/evidence/phase9/zoho-actions/rail-brief-1280-light-en.png`, `…/rail-brief-390-dark-en.png`).
- *Problem:* The rail opens with the Zoho block (meeting, contact, account, deals, notes, "Change"), then the "Call brief" *form* (TLDR, objective, attendees, pains, competitors, next step), then quick actions, then the transcript. At 390 px the rail replaces the card entirely. During a call the agent sees forms, not context.
- *Why it matters:* R8 says the live call shows only the card, status and one collapsed toggle. Opening the toggle should give a glanceable summary, not editing work. Every edit field is a temptation to type while the customer talks.
- *Fix:* Split the rail into two states. **Before the call starts:** the full brief editor. **Live:** a read-only "Brief" summary of 4 lines (who, company, objective, next step) with "Edit" behind a link, then the transcript. Move CRM details (deals, notes) behind a "More from Zoho" disclosure. On 390 px, open the rail as a bottom sheet over the card, never instead of it.

**UX-03 · Picking the Zoho meeting happens too late** — M
- *Screen:* rail candidates (`docs/evidence/phase9/zoho-slice/rail-candidates-1280-light-en.png`).
- *Problem:* "Phone, email or name → Find in Zoho → Use Jane Doe / Use John Doe" is offered after the call is already live, beside a streaming card.
- *Why it matters:* R10 wants confirmation, but confirmation during the greeting is the most expensive moment. The demo flow (meeting → brief → call → actions) breaks here.
- *Fix:* Home shows "Next meetings from Zoho" (today, up to 3) with a "Prepare" button that opens the brief, and "Start call with this meeting". The rail only shows the candidate picker when the call started without one, collapsed to a single line: "Not linked to Zoho · Link".

**UX-16 · "Attached to this call. The AI uses it from the next sentence."** — S
- *Screen:* Zoho block footer.
- *Problem:* Engineering truth phrased as UI copy; the agent does not care when the prompt changes.
- *Fix:* "Linked to this call." Move the timing note to the help text of the brief editor.

**UX-17 · Raw data formatting in the Zoho block** — S
- *Screen:* "Acme renewal 2027 · Negotiation · 12000 · 2026-12-01", "Starts 01:53 PM".
- *Problem:* Amount without currency or grouping, ISO date, mixed date formats in one card.
- *Fix:* Use `lib/format.ts` for every value: "AED 12,000 · closes 1 Dec", "Today 1:53 PM". Same in Notes ("4 Nov · Pricing call…").

**UX-18 · Talk-ratio bar has no meaning attached** — S
- *Screen:* transcript header ("Customer 73% / You 27%").
- *Problem:* A two-colour bar with no target. Is 73% good?
- *Fix:* Show it only when it crosses a threshold ("You're talking a lot") — the `call.talk.tooMuch` string exists; make that the only visible state, otherwise hide the bar during the call and show it in the review.

**UX-19 · The quick-actions toggle in the rail** — S
- *Screen:* rail, `QuickActions` ("Show / Hide" Lead and Contact update forms during the call).
- *Problem:* A write-to-CRM form inside the live call; R12 writes belong after the call.
- *Fix:* Remove from the live rail; if the agent needs to note a new phone or email, give them one "Note for after the call" field that pre-fills the after-call contact card.

### Call idle / start

**UX-20 · Two different "start" screens** — S
- *Screen:* `ListenStart` ("Start listening to a call · Where is the call?") vs `call.wait` ("Waiting for your call · Watching for Zoom, Teams…") vs the practice `ScenarioPicker`.
- *Problem:* Three start states with different headings and button labels ("Start", "Start now", "Start call").
- *Fix:* One start screen: auto-detect when a call app is active ("Zoom call detected · Start listening"), one secondary "Use the microphone instead", one tertiary "Practice call". One verb: "Start listening".

**UX-21 · Permission failure copy is OS-generic** — S
- *Screen:* `call.listen.computerDenied*`, `call.mic.unsupported` ("It needs HTTPS").
- *Problem:* "HTTPS" is meaningless on a desktop app; the Mac path does not deep-link to System Settings › Privacy › Screen & System Audio Recording.
- *Fix:* Desktop copy: "Allow Sales Shield to record system audio" + a button that opens the exact settings pane (`x-apple.systempreferences:` URL on Mac, `ms-settings:privacy-microphone` on Windows).

### After-call panel

**UX-04 · Three forms, no finish line** — M
- *Screen:* `docs/evidence/phase9/zoho-actions/post-call-1280-light-en.png`, `…/post-call-390-light-ar.png`.
- *Problem:* Meeting, contact and deal note cards are full forms with every field open, each with its own "Approve and save / Dismiss". Empty Title and Description fields look like required work. The call review (the payoff for the agent) sits below all of them; the cards from the call sit below that.
- *Why it matters:* After a call the agent has about 30 seconds before the next one. A long form stack is skipped, which defeats R12.
- *Fix:* Order: (1) one-line review ("Call result: good · tip"), (2) "Suggested updates (3)" as a checklist of one-line summaries ("Log meeting: Acme renewal call, 13 Nov", "Update Jane Doe's phone", "Add note to Acme renewal 2027") each with a checkbox, an "Edit" disclosure and one primary "Save 3 to Zoho"; individual approval stays (R12) because each item is a separate checkbox the agent ticks. (3) Follow-up message. (4) Cards and transcript in History, not here. Show a done state: "Saved to Zoho ✓ · Open in Zoho".

**UX-05 · Two email follow-ups** — S
- *Screen:* `call.tsx` renders both `FollowUp` (feature `follow_up`, a drafted email) and the `MessagingSlot` `EmailAction` ("Send email").
- *Problem:* The agent sees a drafted follow-up and a separate send-email card.
- *Fix:* Merge: the follow-up draft becomes the body of the Send email action, with WhatsApp as a second tab of the same "Follow up with Jane" card.

**UX-22 · Email preview header shouts its own guarantee** — S
- *Screen:* `docs/evidence/phase9/messaging/email-preview-1280-light-en.png` ("This is exactly what will be sent").
- *Problem:* Reassurance text styled as the heading of the preview; the subject line is the real heading.
- *Fix:* Drop the sentence; render the preview as a mail client would (From, To, Subject as rows, then body) with "Confirm and send" and "Edit". Add the attachment the body mentions, or warn when the body says "attached" and nothing is attached.

**UX-23 · "Dismiss" is permanent with no undo** — S
- *Screen:* every action card.
- *Fix:* Replace with "Skip" and show a 5 s "Skipped · Undo" toast; skipped items stay listed in History detail.

**UX-24 · "Call ended · Suggestions in this call: 4" then "Start another call"** — S
- *Problem:* The ended panel's primary action pulls the agent away from the follow-up work below it.
- *Fix:* Make "Start another call" secondary until the follow-up items are saved or skipped.

### Toasts and escalation

**UX-07 · Escalation toast covers controls and is duplicated** — S
- *Screen:* `post-call-1280-light-en.png` (toast over the deal note's form), `rail-brief-390-dark-en.png` (toast over the brief).
- *Problem:* 8-second dark toast at the bottom over buttons and fields, plus a yellow "Sent to your manager" block in the transcript.
- *Fix:* Top-end placement on wide, above the composer on narrow, with `pointerEvents="none"` already set — also keep it clear of interactive rows. Keep the transcript line; shorten the toast to "Sent to your manager" without repeating the question (the question is in the transcript).

### Home

**UX-10 · No first-run path** — M
- *Screen:* `features/home/HomeScreen.tsx` (greeting, stat tiles, Company, AI, Playbook sections, Start button, recent calls).
- *Problem:* A new agent lands on stats that are all zero and admin facts (seats, minutes, provider · model). The steps that make the product work — connect Zoho, test audio, run a practice call — live in four places.
- *Fix:* A first-run checklist on Home for the signed-in role, hidden once done: Agent: "Connect Zoho", "Test your audio (10 s)", "Try a practice call". Admin: "Add playbook answers", "Invite your team", "Connect email/WhatsApp". Each item deep-links.

**UX-25 · Home shows admin data to agents** — S
- *Problem:* Seats, minutes, provider and model names, "AI ready" on the agent's Home.
- *Fix:* Agents: next meetings (UX-03), last call's tip, open questions they raised. Admin/manager: the company block. Never show a model name to an agent.

**UX-26 · Stat tiles in four accent colours** — S
- *Problem:* Calls/minutes/cards/speed tiles each take a card-type accent, so the card colour code (answer/question/objection) is spent on statistics. This is a typical templated-dashboard tell.
- *Fix:* One neutral style for stats; card colours only on cards.

### History and review

**UX-27 · Review dimensions as a list of numbers** — S
- *Screen:* `CallReviewPanel` (six dimensions, chance to close %, mood, tip, strengths, improve, disclaimer).
- *Problem:* Seven blocks of equal weight; "Chance to close 63%" is a precise-looking guess.
- *Fix:* Lead with the coach's tip (one sentence) and the mascot mood; collapse dimensions under "Details". Show the chance as a band ("Likely / Unclear / Unlikely").

**UX-28 · History separates "Calls on this server" and "Sample calls"** — S
- *Problem:* "Server" is infrastructure language; sample calls mixed into a real history confuse.
- *Fix:* "Your calls"; samples only in an empty state ("No calls yet — open a sample call to see what a review looks like").

### Admin (desktop app)

**UX-08 · Old brand still visible** — S
- *Screen:* `docs/evidence/phase9/flags-auth/admin_features-light-en-1280.png` (sidebar wordmark `sotto`), owner console (`owner-features-light-1280.png`: "Sotto Owner console").
- *Fix:* Re-shoot the Features evidence on the current build; rename the owner console header and `<title>` to "AGN Sales Shield · Owner". Add the owner console to the R8 grep check.

**UX-09 · Features page contradicts itself** — S
- *Screen:* `admin_features-light-en-1280.png`.
- *Problem:* "Call review: Off by AGN" with the toggle on; "Zoho CRM: Needs a connection · Coming in a later version" with the toggle on; header copy "Features your plan does not include are not listed" yet an off-by-plan item is listed. The Admin tab row on that screen does not include "Features" while it is the active page.
- *Fix:* When a feature is off by platform/plan, render the switch disabled and off with the reason as its label. Remove "later version" for shipped features (flags catalog). Make the page copy match the behaviour. Keep the tab row consistent (the newer screenshots have it).

**UX-29 · Nine admin tabs in one row that scrolls** — M
- *Screen:* `instructions-light-1280.png` (Team, Keys & providers, Settings, Instructions, Features, Integrations, Recordings, Devices, Activity — "Activ" is cut at 1280 px).
- *Problem:* Tabs overflow without an affordance; related items are scattered (Keys vs Integrations, Settings vs Features).
- *Fix:* Group into four: **People** (Team, Devices), **Connections** (Integrations, Keys & providers), **AI** (Instructions, playbook link), **Company** (Settings, Features, Recordings, Activity). Since D-038 moved model settings to the web admin, decide whether "Keys & providers" belongs in the desktop app at all.

**UX-30 · Zoho OAuth client form is first on Integrations** — S
- *Screen:* `docs/evidence/phase9/zoho-slice/integrations-1280-light-en.png`.
- *Problem:* The optional, expert "Zoho OAuth client" (ID, secret, data centre) is the first and largest card; the thing every user needs — "Your Zoho connection" — is second. Badge says "Using your organisation's client" while both fields are empty; "Remove our client" is ambiguous (whose is "our"?).
- *Fix:* Order: Your Zoho connection → Email (SMTP) → WhatsApp → "Advanced: use your own Zoho OAuth client" collapsed. Copy: "Remove your organisation's client (use AGN's)". Show the stored client as "Client ID ends …a1b2" so the empty fields don't look unsaved.

**UX-31 · Instructions page: approve card, toggle and editor repeat the same list** — S
- *Screen:* `docs/evidence/phase9/learning-admin/instructions-light-1280.png`.
- *Problem:* The pending version lists 4 rules as bullets, then the editor lists them again as textareas below; reorder uses tiny chevrons; "11/25 words" next to each.
- *Fix:* When a version is waiting, show a diff against the live version (added / changed / removed) with Approve / Reject; hide the editor until decided. Show the word counter only when > 20. Drag handles or larger up/down buttons (44 px).

**UX-32 · SMTP and Gallabox forms are raw config** — M
- *Screen:* `docs/evidence/phase9/messaging/integrations-smtp-390-light-ar.png`, `…/integrations-gallabox-1280-*.png`.
- *Problem:* Host, port, security, user, password, from; Gallabox API key, secret, channel id, template names typed by hand.
- *Fix:* Presets ("Hostinger", "Google Workspace", "Microsoft 365", "Other") that fill host/port/security; a "Send me a test email" button with the result inline. For Gallabox: after the key is valid, fetch channels and approved templates into pick lists instead of free text.

### Web admin panel and owner console

**UX-33 · Owner console Features: kill switch as a cloud of checkboxes** — S
- *Screen:* `docs/evidence/phase9/flags-auth/owner-features-light-1280.png`.
- *Problem:* A checked checkbox means "killed" (inverted meaning); the entitlements table scrolls horizontally with no sticky company column; ALL-CAPS headers.
- *Fix:* Kill switch as a table of features with a status column ("Live / Killed since 12 Nov") and a destructive "Turn off for everyone" button with confirm. Sticky first column; sentence-case headers; feature names as rows, companies as columns (fewer companies than features soon? decide by count).

**UX-34 · Model settings live only in the web admin (D-038) without a pointer** — S
- *Problem:* A desktop admin looking for "which model" finds nothing in the app.
- *Fix:* In desktop Admin › Settings, one line: "AI models are managed in the web admin" with an "Open web admin" button.

### Zoho connect pages

**UX-35 · Connect page is bare and leaves no way back** — S
- *Screen:* `docs/evidence/phase9/zoho-actions/oauth-start-light.png`, `oauth-done-*.png`.
- *Problem:* "Continue only if that is you" is alarming without context; no data-centre choice visible; no Cancel; the done page does not say "return to the app" with a button.
- *Fix:* Say what will be read and written ("Read meetings, contacts and deals; write meetings and notes after you approve them"), show the chosen data centre with "Change", add Cancel. Done page: "Zoho is connected. You can close this tab." plus an `agn-sales-shield://` deep link back to the app.

### Landing page

**UX-36 · Placeholder slots and stale versions in public** — S
- *Screen:* `docs/evidence/phase9/landing/light-1280.png`.
- *Problem:* Three dashed "Screenshot slot: …" boxes, version 0.2.0 shown while 0.4.0 ships, an empty white "Talk to us" box when the form embed has not loaded, and a "not code-signed yet" section heading.
- *Why it matters:* This is the page the Zoho partner will open.
- *Fix:* Use the real card screenshot (the 1280 call screen, cropped to the card) and the after-call actions screen; drive versions from `downloads.json` at publish; give the form a fixed-height skeleton with "Loading the form…" and a mailto fallback; rename to "First open on Mac and Windows" and keep the steps.

**UX-37 · Landing says nothing about Zoho** — S
- *Problem:* The four feature cards predate 0.4.0; the Zoho meeting → brief → call → actions loop is the strongest story for the partner audience and is absent.
- *Fix:* Replace "Your company, your settings" with "Works with Zoho CRM: prepares from your meeting, saves after your approval". Add a "Works with Zoho CRM" badge near the hero CTA.

**UX-38 · Hero CTA text is long and technical** — S
- *Problem:* "Download for macOS (Apple silicon (M1 and later))" — nested parentheses.
- *Fix:* Detect the platform; button "Download for Mac"; small text "Apple silicon · Intel Mac · Windows".

### Cross-cutting

**UX-39 · Sign-in screen** — S
- *Screen:* `features/account/AccountGate.tsx`.
- *Problem:* Company, name, email fields shown together (sign-up and sign-in on one form); no "Forgot password"; no "Stay signed in" reassurance despite R9.
- *Fix:* Separate "Sign in" (email, password, Forgot) from "Create a company" (link). Under the button: "You'll stay signed in on this computer."

**UX-40 · Dark mode hero turns into a light block** — S
- *Screen:* `rail-brief-390-dark-en.png` (End call becomes salmon, toast becomes a light slab in dark).
- *Problem:* In dark, the toast is the brightest surface on screen and outshines the card.
- *Fix:* Dark toast on dark (`surface` raised + border), not inverted.

**UX-41 · Arabic: mixed-direction rows** — S
- *Screen:* `post-call-390-light-ar.png` ("أضف ملاحظة إلى الصفقة · الصفقة: Acme renewal 2027").
- *Problem:* "Deal:" repeated ("Add a note to the deal · Deal: …") in both languages; the Latin deal name breaks the line awkwardly in RTL.
- *Fix:* Heading "Note on Acme renewal 2027" with the name in its own `<bdi>`-isolated span (`writingDirection: "ltr"` on the run).

**UX-42 · Many empty, loading and error states still say "demo" or "server"** — S
- *Problem:* `call.connecting.title` "Connecting to the demo", `call.error.title` "The demo reported a problem · Details are in the server log".
- *Fix:* Product voice: "Connecting…", "Something went wrong with this call. Your notes are saved. Try again." Never mention logs to an agent.

**UX-43 · Mascot and greeting are the templated tells left** — S
- *Screen:* Home greeting "Good morning, {name}", "Powered by", mascot beside "Listening to the customer".
- *Problem:* The mascot face beside the listening line is decoration on the live screen; the greeting + four stat tiles is the most common AI-dashboard layout.
- *Fix:* Keep the mascot for review moods (R8) only; on the live call use the small live dot. Replace the greeting with something useful ("Next: Acme renewal call at 1:53 PM").

**UX-44 · Accessibility gaps worth checking** — M
- Icon-only buttons (rail toggle, instruction reorder chevrons ×, ✕) need visible focus rings and 44 px targets — the chevrons in `instructions-light-1280.png` look ~24 px.
- Disabled "Save client" / "Send" use a pale teal that likely fails 3:1 against the surface; disabled controls are exempt, but they also carry no explanation — add helper text ("Enter a client ID first").
- Owner console checkboxes and table headers need an axe run; `scripts/a11y.mjs` covers the app routes, not `/owner`.

---

## Quick wins (≤ 1 day each)

- UX-02 hide ratings on the live hero card.
- UX-05 merge the two email follow-ups.
- UX-06 remove "Fake AI", "Phase 4", `pnpm demo`, call ids from agent screens.
- UX-07 move and shorten the escalation toast.
- UX-08 finish the rename in the owner console and re-shoot Features.
- UX-09 make feature switches match their state; drop "later version" for shipped features.
- UX-11 remove the latency footnote from the card.
- UX-12 move the R2 notice under the sentence; drop the duplicate source label.
- UX-16, UX-17 rail copy and number/date formatting.
- UX-19 remove CRM forms from the live rail.
- UX-22, UX-23 email preview header; Skip with Undo.
- UX-30 reorder Integrations (connection first, own OAuth client collapsed).
- UX-34 pointer to the web admin for models.
- UX-35 Zoho connect page: scopes, Cancel, back to app.
- UX-36, UX-37, UX-38 landing: real screenshots, current versions, a Zoho line, shorter CTA.
- UX-40, UX-41, UX-42 dark toast, RTL deal heading, product-voice error copy.

**For the Zoho Partner demo specifically**, the cheapest set with the biggest visible effect: UX-06, UX-08, UX-09, UX-36, UX-37, UX-02, UX-07, UX-30.
