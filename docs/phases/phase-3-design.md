# Phase 3 — Design system and screens (mock data)

## Goal

A distinctive, calm, fast-to-read interface that the owner would proudly show a customer. It must work on a small phone and on a laptop, in light and dark mode, and in English and Arabic (RTL). This phase builds it with mock data, so the design is judged on its own merits before live calls add complexity.

## Entry criteria

- Phase 1 gate is met.
- Phase 2 does not have to be finished: the screens use the card protocol with mock streams.

## Read first

- `docs/BRIEF.md` (users, languages, brand)
- `docs/REQUIREMENTS.md` R3, R5, R6 (screens implied)
- `docs/design/refs/` (owner's references)
- `packages/shared` card protocol
- `docs/ENGINEERING.md` §11

## Skills and subagents

- `frontend-design` decides the look (aesthetic direction, typography, colour).
- `frontend-ui-engineering` handles structure, state and accessibility.
- `browser-testing-with-devtools` and Playwright cover screenshots and the web build.
- `/webperf` runs on the web build.
- `code-reviewer` reviews; the owner reviews the screenshots.

## Environment

- iOS and Android simulators need a local session.
- The web build and its screenshots can be done in the cloud.

## Tasks

### P3.1 — Two visual directions

For each direction, provide:
- a one-paragraph concept;
- a palette (light and dark);
- a type pairing (with an Arabic-capable font);
- one in-call screen rendered at 390 px and 1280 px.

**Acceptance:** the owner picks a direction, and the choice is recorded as a D-NNN entry.

### P3.2 — `docs/DESIGN.md`

Write the design rules, covering:
- **Tokens:** colour roles, type scale, spacing, radius, elevation, motion durations.
- **Card types:** each type gets a colour and an icon (answer, question, objection, warning, holding), plus the "Not in playbook" label style and the "approximate" badge (R4).
- **RTL rules.**
- **Density rules:** agent screens are low density; admin screens are higher density.
- **In-call screen rules:**
  - one large card;
  - the main sentence can be read in 1 second;
  - previous cards collapse;
  - the transcript is secondary;
  - controls stay reachable with one thumb.

**Acceptance:** every token used in code is defined here.

### P3.3 — `packages/ui`

Build:
- tokens (light and dark);
- the primitives: Text, Button, IconButton, Card, SuggestionCard (with streaming text), Badge, Input, Select, Table, Sheet/Dialog, Toast, Avatar, EmptyState, Skeleton;
- a gallery screen that shows every component in both themes and both directions.

**Acceptance:**
- the gallery renders on web and on one simulator;
- the components pass the a11y checks (labels, contrast, focus).

### P3.4 — Agent screens with mock data

Build these screens:
- sign-in;
- home / dialer (recent calls, contacts from CRM placeholder);
- **in-call** (mock card stream from a fixture of a golden call);
- call summary;
- history.

**Acceptance:**
- the in-call screen renders the first delta in under 60 ms after receipt (measured with the profiler);
- no layout jump when cards stream.

### P3.5 — Manager and admin screens with mock data

Build these screens:
- unanswered-questions inbox (R2);
- team calls and reports;
- users and roles, devices;
- plan and trial banner (R3);
- playbook editor;
- prompt studio and model settings (R6 shells; the logic arrives in Phase 6).

**Acceptance:**
- each screen maps to an R-number in a comment at the top of the route file;
- navigation is gated by role, using a mock role switch.

### P3.6 — Visual QA loop

Screenshot every screen at 390 px and 1280 px, in light and dark, LTR and RTL. Compare against DESIGN.md and the refs, list the differences, fix them, and screenshot again. Store the screenshots under `docs/design/screens/`; these are only mock data, so they are safe to commit.

**Acceptance:**
- the owner approves the in-call screen and the inbox;
- the difference list is empty or explicitly accepted.

## Exit gate

- [ ] D-NNN design direction is recorded, and DESIGN.md is complete.
- [ ] `packages/ui` gallery passes a11y on web and on one simulator.
- [ ] All screens exist with mock data, and the owner has approved the screenshots.

## Out of scope

- Real auth.
- Real calls.
- Real data.

## Pitfalls

- **Generic "AI dashboard" look.** Use the refs, and commit to one direction.
- **Treating Arabic as an afterthought.** Test RTL from the first component.
- **Animations that delay reading the card.** Motion must never sit on the critical path.

## Owner actions

- Add 5–10 reference screenshots to `docs/design/refs/`, with one line each saying what you like about it.
- Pick a direction.
- Approve the screens.
- Provide a logo, or approve a temporary wordmark.
