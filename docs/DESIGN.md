# Sotto — Design

The design rules for every screen. Tokens live in `packages/ui/src/tokens.ts`; this file
defines every key used there. Components live in `packages/ui/src/components/`.

- **Status (2026-10-18):** written during the autonomous overnight run (D-013). The owner was
  not available to pick a direction (P3.1), so Claude chose one and records the reasoning here.
  The lead records the choice as **D-014**. The owner can overturn it; the tokens are the only
  place that would change.
- **References:** `docs/design/refs/` is still empty. The direction below comes from the
  product's job (one glance during a live call) and its users (Gulf real-estate and B2B sales
  agents, Arabic and English, phone and laptop), not from reference apps.

---

## 1. The job of the interface

An agent is on a live call, listening to a customer. Sotto shows one suggestion within 1.5 s
of the customer finishing a sentence (R1). The agent reads it **in one glance, at arm's length,
mid-sentence**, and says it in their own words. Everything else on the screen is secondary.

So the design spends its boldness in one place: **the suggestion card**. The rest of the app
is quiet, so the card is the only loud thing on screen.

## 2. Visual direction (P3.1)

### Direction A — "Prompter's box" (chosen)

*Sotto voce* means "under the voice". In a theatre the prompter sits in a box below the stage
and whispers the next line to the actor, who must catch it without breaking the scene. Sotto
is that prompter. The surfaces are a cool, quiet grey-blue, like a dim box under the stage
lights. The only saturated colour is the card itself: one colour per kind of line (answer,
question, objection, warning, holding), carrying one large sentence. The brand colour is a
deep ink-teal, used sparingly for navigation and the wordmark. The card has a thick
"voice bar" on the side where reading starts (left in English, right in Arabic), so the eye
lands on the line first.

| Role | Light | Dark |
|---|---|---|
| Background (the box) | `#f2f4f6` | `#0e151c` |
| Surface | `#ffffff` | `#151f28` |
| Ink (text) | `#15212c` | `#e7edf2` |
| Brand ink-teal | `#0b5f63` | `#5fc4bb` |
| Answer card | `#d9efea` / text `#0a3a35` | `#0f302c` / text `#d0f1ea` |

- **Type:** Readex Pro, one family for Latin and Arabic (see §4).
- **In-call at 390 px and 1280 px:** `docs/evidence/p3/call-*.png`.

### Direction B — "Night console" (not built)

A dark-first, high-density console: near-black panels, amber cards, condensed type (IBM Plex
Sans Arabic with IBM Plex Sans Condensed), a waveform strip across the top, and cards that
slide in from the edge.

- **Palette:** background `#0a0d10`, surface `#13181d`, text `#e9edf0`, accent amber
  `#f2a93b`; light mode as an inverted afterthought (`#fafafa` / `#1a1a1a`).
- **Why it lost:**
  - it reads as the generic "dark dashboard with one bright accent";
  - condensed type is slower to read at arm's length;
  - sliding cards put motion on the read path (Phase 3 pitfall);
  - and agents work in bright offices on phones, where light mode is the main mode.
- It was not rendered; only A was built, because the run had one shot at a polished screen.

### Why A

- Reading speed first: one family designed for reading, a large card size, high contrast.
- Light and dark are equal citizens; both pass WCAG AA by test.
- Arabic is first-class: one typeface covers both scripts at the same weight and colour.
- It avoids the common generated looks (cream + terracotta, black + acid accent, purple
  gradients, identical rounded cards with grey shadows): there are no shadows and no
  gradients, and radius grows with the size of the element.

## 3. Tokens

All values are in `packages/ui/src/tokens.ts`. `pnpm --filter @sotto/ui test` checks that
light and dark define the same keys and that every pair below meets its contrast floor.

### 3.1 Colour roles (`themes.light.color`, `themes.dark.color`)

| Key | Used for | Contrast rule (tested) |
|---|---|---|
| `background` | page background | — |
| `surface` | panels, sidebar, list rows, compact cards, composer | — |
| `surfaceSunken` | inputs, transcript system lines, segmented-control track, avatars | — |
| `text` | body text | ≥ 4.5 on background, surface, surfaceSunken |
| `textMuted` | secondary text, timestamps, placeholders | ≥ 4.5 on background, surface, surfaceSunken |
| `border` | hairlines between rows and panels (decorative) | none |
| `borderStrong` | outlines of inputs, secondary buttons, radios | ≥ 3 on background and surface (WCAG 1.4.11) |
| `primary` | brand ink: primary buttons, links, active nav, wordmark, customer label | ≥ 4.5 on background and surface |
| `onPrimary` | text on `primary` | ≥ 4.5 on primary |
| `focus` | keyboard focus ring (reserved: components rely on the browser's focus-visible outline today) | ≥ 3 on background and surface |
| `danger` / `onDanger` | End call, destructive actions | onDanger ≥ 4.5 on danger; danger ≥ 4.5 on background and surface |
| `positive` / `negative` | good/bad values (benchmark p95 vs budget) | ≥ 4.5 on surface and background |
| `inverseSurface` / `onInverseSurface` | toasts | ≥ 4.5 |
| `noticeFill` / `noticeText` / `noticeBorder` | the R2 "Not in playbook" label, escalation lines, the mock-stream badge | text ≥ 4.5 on fill; border ≥ 3 on its fill and on every card fill |

### 3.2 Card palettes (`themes.*.card.<type>`)

One palette per card type in the protocol (`answer`, `question`, `objection`, `warning`,
`holding`). Each has four keys:

| Key | Used for | Contrast rule (tested) |
|---|---|---|
| `fill` | hero card background; badge fill of that tone | — |
| `text` | the main sentence and the type name | ≥ 4.5 on fill |
| `muted` | the source line and the delay footnote | ≥ 4.5 on fill |
| `accent` | voice bar, icon disc, badge dot | ≥ 3 on background and surface; `fill` on `accent` ≥ 4.5 (icon glyph) |

| Type | Meaning to the agent | Hue | Icon (glyph in a disc) | Label (en / ar) |
|---|---|---|---|---|
| `answer` | Say this | teal (brand family) | `“` | Answer / إجابة |
| `question` | Ask this next | indigo | `?` (`؟` in RTL) | Ask next / اسأل بعدها |
| `objection` | Handle the pushback | amber | `≠` | Objection / اعتراض |
| `warning` | Do not say or promise this | red | `!` | Careful / انتبه |
| `holding` | Buy time; a manager is asked | slate | `…` | Holding line / جملة انتظار |

Colour is never the only signal: every card also has its icon and its type name in words.

### 3.3 Type (`fontFamily`, `type`, `webFontFallback`)

- **Family:** Readex Pro (Google Fonts, OFL), loaded through `@expo-google-fonts/readex-pro`
  in `apps/app/app/_layout.tsx`.
  - It extends Lexend, which was designed for reading proficiency, and adds an Arabic design
    with matched weights, so mixed Arabic/English calls look like one voice.
  - Weights: `fontFamily.regular` (400), `fontFamily.medium` (500), `fontFamily.semibold` (600).
    Bold (700) is not used.
  - On web, `webFontFallback` (system UI stack) is appended until the font loads.
- **Scale** (`type`; size / line height in px):

  | Key | Size | Use |
  |---|---|---|
  | `label` | 13 / 18 | meta lines, badges, table headers. Never the card sentence. |
  | `body` | 16 / 24 | default text, transcript |
  | `heading` | 18 / 26 | section titles, the hero card's type name |
  | `title` | 24 / 32 | page titles |
  | `cardCompact` | 17 / 25 | older cards (2 lines max) |
  | `card` | 28 / 38 | the hero sentence below the wide breakpoint |
  | `cardWide` | 36 / 48 | the hero sentence at and above the wide breakpoint |

- The hero sentence uses `medium` weight: heavier than body, lighter than a shout.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows.

### 3.4 Space, radius, size, motion, layout

| Token | Values | Rule |
|---|---|---|
| `space` | xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, xxxl 48 | agent screens use `lg` and up between blocks; admin screens may use `sm`/`md` |
| `radius` | sm 6, md 10, lg 16, xl 22, pill 999 | grows with the element: notice 6, controls 10, panels and compact cards 16, hero card 22, badges pill |
| `minTouchTarget` | 44 | every control is at least 44 × 44 pt; primary agent actions use `Button size="lg"` (52) |
| `motion` | fast 120, base 200, toastMs 8000 | see §7 |
| `layout` | wideBreakpoint 900, sidebarWidth 248, transcriptWidth 380, contentMaxWidth 1180, readableMaxWidth 760 | see §6 |

Elevation: none. Surfaces are separated by colour and 1 px borders, never by shadows.

## 4. Components (`packages/ui`)

All are React Native components that also run on web (react-native-web). Each reads the theme
from `useTheme()`, which follows the device unless `<UIProvider scheme direction>` overrides it.

| Component | Notes |
|---|---|
| `Text` | `variant` (type role), `weight`, `tone` (colour role) or `color` (a token value) |
| `Button` | primary / secondary / ghost / danger; md 44, lg 52 |
| `Badge` | tone = any card type, `neutral`, `primary`, `notice`; optional dot |
| `SuggestionCard` | hero and compact variants; see §5 |
| `TranscriptLine` | customer, agent (muted), system (notice style) |
| `Screen`, `Stack`, `Panel`, `Divider` | layout primitives on token spacing |
| `EmptyState` | title, body, optional command box and action. Never a blank screen. |
| `TextField`, `SegmentedControl`, `ToggleRow`, `Table`, `Toast`, `Wordmark` | form, admin and feedback primitives |

The gallery at `/gallery` shows every component in light and dark, LTR and RTL.

## 5. The suggestion card

### Anatomy (hero)

```
┌─────────────────────────────────────────────┐
█ (“) Answer                        AI answer │  ← icon disc, type name (heading), source (label, muted)
█ ┌──────────────────────────────────────┐    │
█ │ Not in playbook — check before promising │ ← R2 notice, only for source ai/backup or a worker label
█ └──────────────────────────────────────┘    │
█ District cooling is billed separately.      │  ← main sentence: card / cardWide, medium, card.text
█ Offer to confirm the rate today. ▍          │  ← caret while streaming (accent); gone when done
█ On screen 0.39 s after the customer stopped │  ← delay footnote (label, card.muted)
└─────────────────────────────────────────────┘
█ = 8 px voice bar in card.accent, on the start side
```

### Rules

- **One sentence, read in one second.** The card shows only what the worker streams; prompts
  must keep suggestions to one or two short sentences. At 390 px the hero fits about 20
  characters a line.
- **The first delta renders on the next frame.** There is no entrance animation, fade or
  skeleton between the delta and the glyphs. The streaming caret is static, not blinking.
- **No layout jump.** The hero slot keeps `minHeight: 200` from the moment the call is live
  (the "Listening to the customer" placeholder holds it), so the first card does not push
  anything down.
- **Previous cards collapse.** When a new card arrives, the old hero becomes a compact card:
  surface fill, 4 px accent bar, type name, two lines. At most 4 earlier cards show.
- **Holding line.** It has a dashed 2 px outline in its accent instead of the voice bar, so it
  reads as provisional. A real card in the same turn replaces it in place.
- **R2 label.** The worker's `label` (already localised) always wins. If there is none and
  the source is `ai` or `backup`, the app shows its own "Not in playbook — check before
  promising". The label uses the notice colours on every card type.
- **Approximate badge (R4).** In speaker-matching mode the call header shows
  `Badge tone="objection" dot` with "Approximate: speaker matching". The string and style
  exist (see the gallery); the mode arrives with live calls in Phase 4.
- **Screen readers** get one label per card: type, notice, text, plus "still arriving" while
  it streams. The card is not a live region, so deltas are not read out word by word.

## 6. Layout

### Breakpoint

One breakpoint: `layout.wideBreakpoint` = 900 px window width.
- Below it: bottom tabs and a single column.
- At or above it: a 248 px sidebar and two columns where a screen has them.

### In-call screen

```
390 px                               1280 px
┌──────────────────────┐             ┌────────┬──────────────────────────┬──────────────┐
│ Company        [End] │             │ sotto  │ Company            [End] │ Transcript   │
│ ● Live 02:14 Fake AI │             │        │ ● Live 02:14  Fake AI    │ Customer …   │
├──────────────────────┤             │ Call   ├──────────────────────────┤ You …        │
│ ┃ HERO CARD          │             │ History│ ┃ HERO CARD  (36 px)     │ Sent to your │
│ ┃ 28 px sentence     │             │ ...    │ ┃                        │   manager …  │
│ Earlier in this call │             │        │ Earlier in this call     │              │
│ ┃ compact card       │             │        │ ┃ compact  ┃ compact     │              │
│ Transcript (last 6)  │             │        │                          ├──────────────┤
├──────────────────────┤             │        │ [toast]                  │ Customer|You │
│ [Customer] [____][>] │ ← thumb     │ user   │                          │ [_____] Send │
│ Call History … Admin │             └────────┴──────────────────────────┴──────────────┘
└──────────────────────┘
```

- **Hierarchy:** the card is primary. The transcript is secondary: smaller, muted for the
  agent's own words, below the cards on a phone and in a side pane on a laptop.
- **One thumb:** on a phone, the composer (speaker chip, field, Send) sits directly above the
  tab bar. End call is in the header, away from Send, so it is not hit by mistake.
- **States:**
  - connecting;
  - offline ("The demo is not running", the `pnpm demo` command, Try again; it also retries
    every 3 s);
  - idle (scenario picker);
  - live;
  - ended (summary line and "Start another call").
- **Escalation:** a toast "Sent to your manager" with the question, for 8 s. It is also kept
  as a system line in the transcript.

### Navigation

Call, History, Playbook, Inbox (count of open questions), Admin. Items are links: anchors on
web, with `aria-current="page"` on the active one. Admin has a second row of underline tabs:
Team, Prompts, Models, Settings.

### Density

- **Agent screens** (call, history, playbook, inbox) are low density: 16 px body, at least
  `space.lg` between blocks, one column up to 920 px wide.
- **Admin screens** are higher density: tables with 52 px rows, label-size headers. Below the
  breakpoint, tables become stacked label/value blocks (`Table stacked`).

## 7. Motion

- Nothing on the read path moves: no entrance animation for cards, no typing effect beyond
  the real stream, no blinking caret.
- Motion only answers a person's action (press feedback: opacity 0.8) or confirms something
  (the toast appears and leaves).
- `motion.fast` (120 ms) and `motion.base` (200 ms) are the only durations allowed for future
  transitions. Respect "reduce motion": with it on, use none.

## 8. Right-to-left and Arabic

- The language is chosen in Admin › Settings › App language (stored per browser on web).
- `LocaleProvider` sets the direction:
  - **web:** `dir` and `lang` on `<html>` and `dir` on the root view (react-native-web resolves
    start/end from it);
  - **native:** `direction` on the root view, plus `I18nManager.forceRTL`, which takes full
    effect after a restart.
- **Layout uses logical sides only:** `start`/`end`, `marginStart`, `paddingEnd`,
  `borderStartWidth`. No `left`/`right`. Rows flip automatically.
- **Text:** never set `textAlign: "left"`; the natural alignment follows the language.
  Centred text stays centred.
- **Glyphs:** the question icon becomes `؟` in RTL. Arrows are avoided, so none need mirroring.
- **Numbers and times:**
  - Western digits in both languages, as UAE apps commonly do (`formatNumber`, `lib/format.ts`
    with `numberingSystem: "latn"`);
  - clock values (mm:ss) are left-to-right runs inside Arabic text.
- **Content language is separate from app language:**
  - card text arrives in the customer's language (or the company's forced card language);
  - the worker localises the R2 label;
  - mock data is content and is not translated, except the dev-only demo call, which has an
    Arabic version for the RTL screenshots.
- **Arabic copy** is short Modern Standard Arabic for the UI. Scenario content may use Gulf
  dialect, as customers do.

## 9. Accessibility

- Contrast: WCAG 2.2 AA, enforced by tests for every pair in §3.
- Touch targets: at least 44 pt (`minTouchTarget`); tested for `Button`.
- Every control has an accessible name.
  - Icons are hidden from screen readers; the words carry the meaning.
  - Radios, switches and the segmented control expose their checked state.
- Links are real links on web. Headers use `accessibilityRole="header"`.
- Toasts are polite live regions. Cards are not live regions (see §5).
- Not yet done (P3.3 acceptance): an axe-core run of `/gallery` on the web build in CI.

## 10. Copy

- Write as the product talking to the agent: plain verbs, sentence case, no filler.
- Name things by what the agent does: "End call", "Try again", "Sent to your manager".
- An empty or failed state says what to do next (the offline state names the exact command).
- All strings live in `apps/app/lib/i18n.ts` (en, ar).
  - The type requires every key in both languages; tests check that placeholders match.
  - Avoid count-based plurals ("Answers: 6", not "6 answers"); Arabic has six plural forms,
    and a plural helper is not worth it yet.

## 11. Dependencies added in Phase 3

| Package | Where | Why |
|---|---|---|
| `@expo-google-fonts/readex-pro` 0.4.1 | apps/app | the chosen typeface (§3.3), OFL; three weights are loaded by subpath, so the other weights are not bundled |
| `expo-font` ~58.0.8 | apps/app | loads the font files (`useFonts`); version from `bundledNativeModules.json` |
| `react`, `react-native` (peer) | packages/ui | components are React Native; versions match apps/app |
| `jest`, `jest-expo`, `@testing-library/react-native`, `test-renderer`, `@react-native/jest-preset`, `@types/jest`, `@types/react`, `react`, `react-dom`, `react-native`, `react-native-web`, `expo` (dev) | packages/ui | component tests run on jest-expo, the same versions as apps/app; vitest still runs the pure token tests |

No icon library, animation library, navigation library or i18n library was added: icons are
glyphs, motion is not used, navigation is expo-router `Slot` with a custom shell, and the
string table is a small typed module.

## 12. Dev-only pieces

- `?mock=1` on `/call` replays a canned, fictional demo call (`features/call/mock-stream.ts`).
  - It goes through the same JSON decoder (`parseDemoServerMessage`) and the same reducers as
    the real bridge.
  - It shows a "Mock stream (dev only)" badge.
  - Remove it with the demo bridge when Phase 4 brings LiveKit.
- `/gallery` is not linked from the navigation.
