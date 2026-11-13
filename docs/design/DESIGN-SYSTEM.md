# AGN Sales Shield — Design System: "Quiet Paper Glass"

> **Status:** adopted 14 Nov 2026 (D-041, owner request). Replaces the "Prompter's box" visual style of `docs/DESIGN.md` §2–3; the product rules of DESIGN.md (the job of the interface, one loud thing, motion never on the read path, RTL) still hold.
> **Source of the style:** the owner's reference `docs/design/reference/muse-ai/` (extracted from muse.ai on 14 Nov 2026). Where the reference and the generic `ui-ux-pro-max` suggestions disagree, the reference wins. Where the reference and our requirements disagree (44 pt targets, WCAG AA, a safety-critical warning card), the requirement wins and the exception is listed in §10.
> **Code:** `packages/ui/src/tokens.ts` (React Native, the source of truth), `packages/ui/tokens.css` (generated CSS variables for HTML pages), `packages/ui/components.css` (HTML component classes). Gallery: `/gallery` in the app; screenshots in `docs/design/screens/`.

---

## 1. Principles

1. **Paper, not chrome.** A near-white canvas (`#fcfcfc`), flat cool-gray fills, no borders or shadows on content. Depth comes from one place: translucent **glass on floating chrome only**.
2. **One accent, used once.** Blue `#005bbf` fills the single primary action of a view — and, on the live call, the suggestion card, which *is* the primary thing. Everything else is neutral. Semantic colours (green, amber, violet, red) appear only as small dots, icon discs, bars and labels.
3. **Soft geometry.** Pills for controls, 22 px bubbles with one 6 px tail corner, 12 px rows, 24 px sheets, a 32 px composer. Radius grows with the size of the thing.
4. **Quiet type.** One family per script, three weights (400/500/600), sentence case, no letter-spacing tricks, no bold 700, no ALL CAPS.
5. **Fast and level motion.** 100–300 ms, standard ease, fades over slides, skeletons over spinners, soft pulses for "working". Nothing on the card's read path.
6. **The live call stays the product.** The design spends its boldness on the suggestion card. The live screen shows only the card, the call status and one collapsed context-rail toggle (R8).
7. **Accessible by construction.** Text ≥ 4.5:1, control outlines and focus ≥ 3:1 (tested), visible focus rings, 44 pt targets, RTL mirrored, reduced motion honoured.

**Avoid:** purple/blue gradients, glass on content cards, shadows on cards/rows, 8 px-radius buttons, a second accent colour, emoji as icons, dashboards of equally weighted cards, bold uppercase labels.

## 2. How the skill output was used

`ui-ux-pro-max` (`search.py … --design-system -p "AGN Sales Shield"`) proposed, for a B2B SaaS dashboard, **Glassmorphism** with a trust-blue primary, Plus Jakarta Sans, and for Arabic the **Noto Sans Arabic** family; for a "sales copilot" query it proposed a vibrant block style. Kept: glass on floating layers, a single blue, the pre-delivery checklist (focus states, 150–300 ms transitions, reduced motion, 4.5:1). Overridden by the reference: the orange CTA accent, vibrant blocks, Plus Jakarta (→ Inter, the reference's first open stand-in), large 48 px section gaps on app screens. Arabic: IBM Plex Sans Arabic chosen over Noto Sans Arabic (§3.3).

## 3. Tokens

All values live in `packages/ui/src/tokens.ts`. HTML pages use the same values as `--ss-*` CSS variables from `packages/ui/tokens.css` (generated; a test fails if stale).

### 3.1 Neutral ramp (`gray`)

The reference's `ai-gray` ramp, used for every neutral in both themes:
`25 #fafafa · 50 #f3f4f5 · 75 #eeeff0 · 100 #e9eaeb · 150 #e0e2e4 · 200 #d1d3d5 · 250 #c4c6c9 · 300 #b5b7bb · 400 #a1a4a8 · 500 #8f9296 · 550 #818487 · 600 #717477 · 650 #686a6e · 700 #5c5e61 · 800 #4b4d4f · 900 #383b3d · 950 #323435 · 1000 #28292b · 1050 #1f1f20 · 1075 #181819 · 1100 #111112`.

### 3.2 Colour roles (`themes.light.color` / `themes.dark.color`, CSS `--ss-<kebab-key>`)

The reference has no dark theme; dark is derived from the ramp (same radii, same glass logic).

| Role | Light | Dark | Use | Tested floor |
|---|---|---|---|---|
| `background` | `#fcfcfc` | `#111112` | canvas | — |
| `surface` | `#ffffff` | `#181819` | outlined cards, panels, inputs | — |
| `surfaceSunken` | `#f3f4f5` | `#1f1f20` | chips, secondary buttons, hover rows, wells, stat tiles | — |
| `bubble` | `#e9eaeb` | `#323435` | customer transcript bubble, link cards, skeletons | — |
| `surfaceRaised` | `#ffffff` | `#28292b` | sheets/popovers (opaque fallback) | — |
| `text` | `#111112` | `#f3f4f5` | body text | ≥ 4.5 on every surface |
| `textMuted` | `#5c5e61` | `#a1a4a8` | secondary text, timestamps, placeholders | ≥ 4.5 on every surface incl. bubble |
| `textTertiary` | `#989b9e` | `#686a6e` | decorative only, never meaning | < muted (tested) |
| `border` | `#e0e2e4` | `#323435` | hairlines (structural dividers, outlined cards) | — |
| `borderStrong` | `#818487` | `#818487` | input and control outlines | ≥ 3 (WCAG 1.4.11) |
| `primary` / `onPrimary` | `#005bbf` / `#ffffff` | `#6aa8f7` / `#0b1a2e` | the one primary action, links, focus | ≥ 4.5 |
| `focus` | `#005bbf` | `#6aa8f7` | 2 px focus ring, 2 px offset | ≥ 3 |
| `signal` / `signalFill` / `onSignalFill` | `#0064d4` / `#e6f0fb` / `#00408a` | `#6aa8f7` / `#1c2d45` / `#cfe2fb` | live dot, unread dot, active-nav tick | ≥ 4.5 |
| `danger` / `onDanger` | `#cb0021` / `#ffffff` | `#ff7a85` / `#2a0608` | End call, destructive | ≥ 4.5 |
| `positive` / `negative` | `#1a7f37` / `#cb0021` | `#4cc38a` / `#ff7a85` | good/bad values, status labels | ≥ 4.5 |
| `notice*` | `#fdf1dc` / `#6b3d00` / `#8a5300` | `#3a2a08` / `#fbe3b0` / `#f3c76a` | the R2 "Not in playbook" pill | text ≥ 4.5; border ≥ 3 on card fills |
| `toastFill` / `onToast` / `toastBorder` | `#ffffff` / `#111112` / `#e0e2e4` | `#28292b` / `#f3f4f5` / `#818487` | toast (glass on web) | ≥ 4.5 |
| `inverseSurface` / `onInverseSurface` | `#28292b` / `#f3f4f5` | `#f3f4f5` / `#111112` | rare inverted slabs | ≥ 4.5 |
| `scrim` @ `scrimOpacity` 0.24 | `#111112` | `#000000` | behind sheets (light, the page reads through) | — |

### 3.3 Card palettes (`themes.*.card.<type>`)

| Key | Light | Dark | Use |
|---|---|---|---|
| `fill` / `text` / `muted` | `#f3f4f5` / `#111112` / `#5c5e61` | `#28292b` / `#f3f4f5` / `#a1a4a8` | compact cards and type badges: **neutral for every type** (tested) |
| `accent` | answer `#1a7f37` · question `#005bbf` · objection `#a15c00` · signal `#6d3fc0` · warning `#cb0021` · holding `#5c5e61` | `#4cc38a` · `#6aa8f7` · `#e5a54b` · `#b08cf5` · `#ff7a85` · `#a1a4a8` | the only place the type's hue appears: compact bar, icon disc, badge dot |
| `heroFill` / `heroText` / `heroMuted` | answer/question/objection/signal `#005bbf` / `#ffffff` / `#d6e6fa`; warning `#cb0021` / `#ffffff` / `#ffe4e6`; holding `#f3f4f5` / `#111112` / `#5c5e61` | `#2a6ccb` / `#ffffff` / `#eef4fd`; warning `#c0303f` / `#ffffff` / `#ffe4e6`; holding `#28292b` / `#f3f4f5` / `#a1a4a8` | the live hero card (§5.3) |

Colour is never the only signal: each type has its own glyph (`“ ? ≠ ↗ ! …`, mirrored in RTL) and its name in words.

### 3.4 Speaker bubbles (`themes.*.speaker`)

| | Light fill / text / label | Dark |
|---|---|---|
| customer (start side, triggers cards) | `#e9eaeb` / `#111112` / `#005bbf` | `#323435` / `#f3f4f5` / `#6aa8f7` |
| agent (end side) | `#f3f4f5` / `#111112` / `#5c5e61` | `#1f1f20` / `#f3f4f5` / `#a1a4a8` |

### 3.5 Glass (`themes.*.glass`, `glassBlur`)

| | Light | Dark |
|---|---|---|
| fill | `rgba(255,255,255,.76)` | `rgba(24,24,25,.76)` |
| fallback (native, no `backdrop-filter`) | `#ffffff` | `#181819` |
| ring (1 px) | `rgba(17,17,18,.08)` | `rgba(255,255,255,.08)` |
| shadow (float) | `0 8px 40px rgba(0,0,0,.12)` | `0 8px 40px rgba(0,0,0,.48)` |
| shadowElevated (sheets) | `0 2px 8px rgba(0,0,0,.06), 0 20px 50px rgba(0,0,0,.14)` | ×4 alpha |

Blur 36 px. RN: `useGlassStyle()` / `<GlassSurface>`; HTML: `.ss-glass` (falls back to opaque without `@supports(backdrop-filter)`).

### 3.6 Typography

- **Latin:** Inter (`Inter_400Regular`, `_500Medium`, `_600SemiBold`). **Arabic:** IBM Plex Sans Arabic (`IBMPlexSansArabic_400Regular` …). Both OFL, loaded through `@expo-google-fonts/*` in `apps/app/app/_layout.tsx`. On web the stack is `Inter_<w>, IBMPlexSansArabic_<w>, Inter, 'IBM Plex Sans Arabic', system-ui, …` so a mixed line picks the right face per glyph. Plex Arabic was chosen over Noto Sans Arabic (skill suggestion) for its closer x-height and stroke contrast to Inter and smaller files.
- HTML pages load the same families from Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap` (or self-host the same files).
- **Weights:** 400 body, 500 labels/buttons/row titles, 600 titles. Never 700.
- **Scale** (`type`, px size / line height): `timestamp 12/16 · label 13/18 · secondary 14/20 · body 16/24 · heading 18/26 · title 24/32 · pageTitle 34/42 (w600) · display 48/56 (w500, −0.01em, landing only) · cardCompact 17/25 · card 28/38 · cardWide 36/48`. Line heights are a little taller than the reference where Arabic needs room (page title 42 vs 40).
- Numbers in tables and stat tiles use tabular figures. Latin runs inside Arabic use `<LtrRun>`.

### 3.7 Spacing, radius, size, layout

- **Space** (4 px grid): `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`.
- **Radius:** `sm 6` (bubble tail, tags) · `md 10` (link cards, skeletons) · `lg 12` (nav rows, inputs, compact cards) · `xl 22` (bubbles, hero card, outlined cards, tables, stat tiles) · `sheet 24` · `composer 32` · `pill 999`.
- **Sizes:** `minTouchTarget 44` · `controlHeight 36` (reference pill, HTML only, with a 44 px hit area) · `rowIcon 44` · `iconInline 16` · `iconRail 24` · focus ring 2 / offset 2.
- **Layout:** `railWidth 72` · `sidebarWidth 248` · content column `readableMaxWidth 768` · `contentMaxWidth 1180` · `wideBreakpoint 900` · `sheetBreakpoint 768`.

### 3.8 Elevation

Exactly three levels: **flat** (everything: cards, rows, bubbles, tables — no shadow), **float** (glass pills, composer, toasts: `glass.shadow`), **overlay** (sheets, dialogs, command palette: `glass.shadowElevated`). Nothing else casts a shadow.

### 3.9 Motion (`motion`, `easing`)

| Token | ms | Use |
|---|---|---|
| `fast` | 100 | press feedback, opacity ticks |
| `base` | 150 | colour, opacity, transform, hover backdrops |
| `medium` | 200 | background, shadow, overlay fade-in (≤ 4 px translate) |
| `layout` | 300 | layout changes (ease-out) |

Easing `standard cubic-bezier(.4,0,.2,1)`, `out (0,0,.2,1)`, `in (.4,0,1,1)`. Skeletons pulse/shimmer; "working" is a soft opacity pulse; no bounce. `prefers-reduced-motion` (and the app's reduce-motion pref) disables shimmer and pulses. **Card text appears with no animation** (R1).

### 3.10 Iconography

The existing monoline `Icon` set (stroked, rounded ends, ~1.5–2 px at 24 px) matches the reference. Icons take the **text colour**, never the accent; hover/active is a gray circle behind the glyph (44 px), not a colour change. Inline 16 px, rows 18–20 px, rail 24 px. Icon-only controls always have an accessible name. No emoji as icons. Brand marks (Zoho, WhatsApp) sit on a 40 px white tile with 10 px radius.

## 4. Components (`packages/ui`)

Every component keeps its public API; restyles are internal. HTML equivalents in `components.css` are noted as `.ss-*`.

### 4.1 Button (`Button`, `.ss-btn`)
- Pill, 44 pt high in RN (`md`), 52 (`lg`); HTML draws the reference 36 px pill inside a 44 px hit area (`::after`).
- `primary`: accent fill, white label — **one per view**. `secondary`: the neutral chip (`surfaceSunken`, no border, hover `bubble`). `ghost`: transparent, accent label (link-like). `danger`: End call / destructive.
- Label 14/20 w500 (`lg`: 16/24). Hover (web) opacity .92 or chip darken; press opacity .85 + scale .98; disabled .45 with optional helper line. Focus ring 2 px accent, 2 px offset.

### 4.2 IconButton (`IconButton`, `.ss-icon-btn`)
44 px round target; glyph in `text`; hover → `surfaceSunken` circle; selected → `bubble` circle with accent hairline; `outlined` adds a `borderStrong` ring.

### 4.3 Input (`TextField`, `.ss-input`, `.ss-search`, `.ss-composer`)
- Field: `surface` fill, 1 px `borderStrong` (≥ 3:1; the reference shows no forms, so this is our accessible addition), 12 px radius, 44 px min height, label 13/18 w500 muted above, placeholder muted. Error: `danger` border + 13 px message below.
- Search: 36 px glass pill with hairline and leading magnifier. Composer: 32 px-radius glass capsule (`GlassSurface shape="composer"`), ≥ 58 px high.

### 4.4 Cards
- **Outlined card** (`Panel`, `.ss-card`): `surface`, hairline, radius 22, padding 16–24, no shadow. **Well** (`Panel sunken`, `.ss-well`): flat `surfaceSunken`, no border.
- **Link card** (`.ss-link-card`): `bubble` fill, radius 10, whole card is the target.
- **Suggestion card** (`SuggestionCard`) — see §5.3 for states.

### 4.5 Toast (`Toast`, `.ss-toast`)
Floating chrome: glass on web (opaque `toastFill` on native), radius 22 (HTML: pill), title 16 w500, body 13, one action. Light: paper with float shadow; dark: raised `#28292b` with a visible border (UX-40). Polite live region, 8 s (undo 5 s).

### 4.6 Sheet / dialog (`Sheet`, `.ss-sheet`)
Bottom sheet below 768 px (top radius 24), centred dialog from 768 px (radius 24, max 560). Glass + elevated shadow on web, `surfaceRaised` on native. Scrim at 24 %. Fade/slide in 200 ms. Escape/back/scrim/close button close it; focus trapped.

### 4.7 Disclosure (`Disclosure`, `.ss-disclosure`)
Row with chevron (muted), 16 w500 label, optional muted summary, 44 px, 12 px radius; no borders between rows. Chevron points inline-end when closed (mirrors in RTL), down when open.

### 4.8 Table (`Table`, `.ss-table`)
Dense admin data: hairline-framed (radius 22) with hairline row rules, **no filled header and no zebra**; header 13 w500 muted, cells 14–16; hover row `surfaceSunken`; numbers right-aligned (inline-end) with tabular figures. Phone width: `stacked` label/value blocks.

### 4.9 Navigation
- **Sidebar** (`NavRow`, `.ss-sidebar` / `.ss-nav-row`): 248 px column on the canvas (no fill), rows 44 px (HTML 36) with 12 px radius, 18 px icon + 16 px label; current = `surfaceSunken` fill + w500 + `aria-current="page"`; section labels 13 muted. Unread = 8 px `signal` dot.
- **Icon rail** (`.ss-rail`, optional for the owner console): 72 px, hairline end border, 44 px round backdrops.
- **Phone** (< 900 px): top bar with a glass menu pill; drawer per D-023.
- **Top-bar pills:** `GlassSurface` pills pinned to the top corners (status, account).

### 4.10 Stat tile (`StatTile`, `.ss-stat`)
Neutral: `surface` + hairline (RN) / `surfaceSunken` well (HTML), radius 22, label 13 muted, value 24 w600 tabular, hint 13 muted. Never a status colour; a row of tiles never competes with the card.

### 4.11 Badge (`Badge`, `.ss-badge`, `.ss-dot`, `.ss-status`)
Pill, 13 w500, neutral `surfaceSunken` fill for every tone except `primary` and `notice`; type tones add only the accent dot. Status labels: coloured dot + coloured 13–15 w500 text (e.g. "● Tracking").

### 4.12 New building blocks (`chrome.tsx`)
`GlassSurface` (floating chrome), `PageHeader` (34 px title + 18 px lead + actions; `compact` → 24 px), `NavRow`, `ListRow` (44 px round icon, title 16 w500, ≤ 3-line description 14 muted, trailing slot; no dividers, rows separated by space), `Skeleton` (pulse, hidden from AT).

### 4.13 Other existing components
`TranscriptLine` (reference bubble: 22 px with the 6 px tail on the speaker's bottom corner, max 86 %), `SegmentedControl` (pill track + pill segment), `ChecklistRow` (12 px rows), `ToggleRow`, `EmptyState`, `LtrRun`, `Wordmark`, `Mascot` (the product's soft round character — the reference's "companion" slot; keep it matte and use it sparingly).

## 5. Page templates

### 5.1 App shell (Electron + Expo web)
Canvas background. ≥ 900 px: 248 px sidebar (nav rows, wordmark top, account/profile at the bottom) + content column (768 px for reading pages, up to 1180 for tables), page padding 48/24. Top-corner glass pills for live status, health and account. < 900 px: glass top bar + drawer. One `PageHeader` per screen.

### 5.2 Live call (`/call`) — R1, R4, R8
- Only three things: the **hero suggestion card**, the **call status** (text: "● Live 00:11", the dot in `signal`), and **one collapsed context-rail toggle** (`IconButton`). End call is the `danger` button. The rail (transcript, notes, brief, CRM) opens as a side panel ≥ 900 px or a `Sheet` below.
- The composer / scenario controls sit in a bottom glass capsule.
- Older cards stack below as compact cards (one expanded at a time), `quiet` stepping back by colour, never opacity.

### 5.3 The suggestion card states
| State | Look |
|---|---|
| Hero, answer/question/objection/signal | reference bubble: radius 22 with a 6 px tail at the bottom of the reading-start side; **accent fill** (`heroFill`), white sentence 28/38 (36/48 wide) w500; white icon disc with the type glyph; source line 13 w500 `heroMuted` |
| Hero, warning | same shape, **red** fill (the one semantic exception, safety) |
| Hero, holding | pale `surfaceSunken` fill, 2 px dashed `accent` outline, dark text — provisional |
| Streaming | caret `▍` in `heroMuted` after the text; `aria-busy`; no entrance animation |
| R2 notice | pill (`noticeFill`/`noticeText`/`noticeBorder`) under the sentence |
| Compact (older) | canvas fill, hairline, 4 px `accent` start bar, 20 px accent disc, 17/25 text, 2 lines; `expanded` shows all; `quiet` uses muted text |
| Empty slot | keeps `heroMinHeight` 200 so the first card causes no layout jump; listening state may show a soft pulse outside the card |

### 5.4 Admin list / detail (web admin panel, Expo web)
`PageHeader` with one primary action; filters as secondary chips + a glass search pill; data in `Table` (≥ 768) or `ListRow`s; detail in a `Sheet` (≤ 768) or a two-column page (list 40 % / detail 60 %); forms in a 768 px column of `TextField`s grouped in `Panel`s, Save as the one primary at the end; destructive actions `danger` and confirmed in a `Sheet`.

### 5.5 Owner console (HTML, `cloud/owner/`)
`<link>` `tokens.css` + `components.css` (serve them from the server, or copy at build). `.ss-shell` with `.ss-rail` or `.ss-sidebar`, `.ss-page--wide`, `.ss-page-title`, `.ss-table`, `.ss-stat` rows for platform numbers, `.ss-badge` plan states, `dialog.ss-sheet.ss-glass` for edits, `.ss-toast.ss-glass` confirmations. `data-theme` on `<html>` for a manual theme switch.

### 5.6 Zoho connect pages (HTML from `cloud/zoho/routes.py`)
A single centred `.ss-card` (max 480) on the canvas: wordmark, `.ss-page-title` at 24 px, one-line lead, Zoho brand tile, data-centre `.ss-select`, one `.ss-btn--primary`; success/failure as `.ss-status--positive/danger` + plain text; disconnect as `.ss-btn--danger` behind a confirm.

### 5.7 Landing (`apps/landing`)
Canvas page, max 1180, sticky glass top bar (`.ss-topbar.ss-glass`) with wordmark and one primary "Download". Hero: `.ss-display` 48/56 headline, 18 px lead, a static `.ss-suggestion` card demo (the product shot), no gradients/blobs. Sections separated by 64–96 px of space, each a heading + lead + 2–3 neutral `.ss-well`s or screenshots in 22 px-radius frames. Arabic version mirrors with `dir="rtl"`.

## 6. Accessibility rules

- Text ≥ 4.5:1 on its fill; control outlines, focus rings and the hero card's edge ≥ 3:1 — all pairs are in `tokens.test.ts` and fail CI if broken.
- Visible focus on every interactive element: 2 px `focus` outline, 2 px offset (`useFocusRing`, `:focus-visible`). The reference had none; this is ours.
- Targets ≥ 44 × 44 pt (RN controls are 44 px; HTML pills draw 36 px with a 44 px hit area).
- Icon-only controls have accessible names; decorative glyphs are hidden; colour is never the only signal.
- RTL: logical properties only (`start/end`, `inline-*`); chevrons and directional glyphs mirror; Latin runs wrapped in `LtrRun`.
- Reduced motion: no shimmer, pulses, slides; fades may stay.
- Glass always has an opaque fallback; text on glass is tested against the fallback.
- axe: 0 serious on every redesigned page (R8).

## 7. Screen-by-screen mapping for the redesign sessions

| Surface | Files | Template | Key components / notes |
|---|---|---|---|
| App shell, nav, drawer | `apps/app/components/AppShell.tsx`, `PageHeader.tsx`, `ProfilePopup.tsx`, `CommandPalette.tsx`, `HealthBanner.tsx`, `PlanBanner.tsx` | §5.1 | `NavRow`, `GlassSurface` top pills, `PageHeader` from `@sotto/ui` (replace the app's own PageHeader), palette = glass `Sheet` |
| Home | `app/home.tsx`, `features/home/*` | §5.1 + list | `PageHeader`, `ListRow` checklist, one primary "Start call" |
| Live call | `app/call.tsx`, `features/call/components/*` (CallHeader, CardStack, Composer, TranscriptPane, CrmRail, ListenBar, ConfirmEnd, EndedView, ScenarioPicker, AudioCheck) | §5.2/5.3 | `SuggestionCard`, status text + `signal` dot, rail `IconButton`, composer `GlassSurface shape="composer"`, `TranscriptLine`, End call `danger`. Replay p95 after any change to card rendering |
| Mini window | `app/mini.tsx` | §5.3 | hero card only, glass header pill |
| Call review / follow-up | `features/review/*`, `features/actions/*`, `features/email/*`, `features/whatsapp/*` | §5.4 detail | `Panel`, `Disclosure`, `Badge`, mascot moods, one primary per action card |
| History | `app/history/index.tsx`, `[id].tsx` | §5.4 | `Table` / `ListRow`, detail page |
| Inbox (escalations) | `app/inbox.tsx`, `features/escalations/*` | §5.4 | status badges with dots, `Sheet` for the answer |
| Playbook | `app/playbook.tsx`, `features/playbook/*` | §5.4 | search pill, `ListRow`, `Sheet` editor |
| Reports | `app/reports.tsx`, `features/reports/*` | §5.4 | `StatTile` row, hairline `Table`; charts neutral with one accent series |
| Settings / Account | `app/settings.tsx`, `app/account.tsx`, `features/settings/*`, `features/account/*` | §5.4 form | `ToggleRow`, `SegmentedControl`, `TextField` |
| Web admin panel | `app/admin/*` (company, devices, features, instructions, integrations, keys, models, prompts, recordings, activity, settings), `features/webadmin/*`, `features/admin/*`, `features/keys/*`, `features/prompts/*`, `features/learning/*`, `features/team/*`, `features/flags/*` | §5.4 | `Table`, `Sheet`, `Badge`; feature flags greyed with a one-line reason (R7) |
| Sign-in / reset password | `components/AccessGate.tsx`, `app/reset-password.tsx` | §5.6 style | centred `Panel`, one primary |
| Owner console | `apps/agent-worker/sotto_worker/cloud/owner/index.html`, `owner.css`, `owner.js` | §5.5 | link `tokens.css` + `components.css`; replace Readex in `owner.css` with `--ss-font` |
| Zoho connect pages | `apps/agent-worker/sotto_worker/cloud/zoho/routes.py` (inline HTML) | §5.6 | `.ss-card`, `.ss-btn--primary` |
| Landing + legal | `apps/landing/index.html`, `styles.css`, `privacy.html`, `terms.html` | §5.7 | `.ss-display`, `.ss-topbar.ss-glass`, `.ss-suggestion`; refresh `shot-*.png` after the app redesign |
| Desktop chrome | `apps/desktop` (tray, About, installer art) | — | canvas `#fcfcfc` / `#111112` window backgrounds; brand rules R8 |

## 8. For HTML pages: how to use the CSS

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/tokens.css">     <!-- copy of packages/ui/tokens.css -->
<link rel="stylesheet" href="/static/components.css"> <!-- copy of packages/ui/components.css -->
```
Never hard-code a colour; use `var(--ss-…)`. Regenerate `tokens.css` with `pnpm --filter @sotto/ui gen:css` after changing `tokens.ts`.

## 9. Pre-delivery checklist (every redesigned screen)

1. Exactly one primary (accent-filled) action per view; all buttons are pills.
2. Only token colours, radii, sizes and timings; weights 400/500/600 only; sentence case.
3. Glass + float shadow only on floating chrome; no shadows or borders on bubbles and list rows.
4. Light, dark, LTR, Arabic RTL at 390 px and 1280 px screenshots; axe 0 serious.
5. Focus visible on every control; 44 pt targets; reduced motion respected.
6. No user-facing "Sotto" (R8 grep test).
7. Live call: card + status + one rail toggle only; replay p95 ≤ 1500 ms if card rendering changed.

## 10. Deliberate departures from the reference

| Reference | Ours | Why |
|---|---|---|
| 36 px pills | 44 px in RN; 36 px drawn + 44 px hit area in HTML | 44 pt target rule (ENGINEERING §11) |
| No form inputs observed | inputs with a `borderStrong` outline | WCAG 1.4.11 |
| Semantic colours only as dots/labels | warning hero card is solid red | a "do not promise this" card must read as danger at a glance |
| Accent only on the primary button | the hero card uses the accent | the card *is* the one primary thing on the live call |
| No dark theme | dark derived from the ramp | R5a / R8 require light and dark |
| No focus rings | 2 px accent ring, 2 px offset | WCAG 2.4.7 |
| Page title 34/40 | 34/42 | Arabic ascenders/descenders |
| Proprietary fonts / mascot | Inter + IBM Plex Sans Arabic; our own Mascot | licences; no copying of muse assets |
