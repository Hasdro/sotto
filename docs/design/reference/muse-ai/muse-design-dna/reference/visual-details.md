# Visual details — measured values and observations

Source URL for all: https://muse.ai/ (authenticated shell). Capture date 2026-11-14, Chrome, viewport 1012x688, light theme.

## Measured computed styles
| Element | Size | Fill | Text | Radius | Notes |
|---|---|---|---|---|---|
| body | — | #fcfcfc | #111112, 16px | — | font optimisticAI, spacing density 1 |
| Assistant bubble | 619x118 | #e9eaeb | #111112 16/24 w400 | 22 22 22 6 | padding 11px 15px |
| Message text paragraph | 589x22 | transparent | 16/22 | — | |
| Image in bubble | 220px wide | — | — | 6 22 22 22 | |
| Chats pill | 97x36 | rgba(255,255,255,.76) | 16/22 w500 | 9999 | padding 0 14 0 12; shadow ring + 0 8px 40px rgba(0,0,0,.12) |
| Invite pill | 86x36 | rgba(255,255,255,.76) | 14/20 w500 | 9999 | padding 0 14 0 10 |
| Composer wrapper | 768x58 | rgba(255,255,255,.76) | — | 32 | 1px transparent border, backdrop blur(36px) |
| Composer inner | 766x56 | transparent | — | 0 | padding 12px |
| Link card | 313x69 | #e9eaeb | — | 10 | title 15/20 w500, sub 13/18, domain 11/13 |
| Timestamp | 75x15 | — | rgba(0,4,9,.59) 12/16 | — | |
| Avatar name chip | 112x30 | transparent | — | 18 | padding 6px 10px |
| Rail | 72x688 | transparent | — | — | right border 1px rgba(0,0,0,.1) |
| Rail item | 72x44 | — | — | — | icon circle 44x44, radius 9999 |
| H1 page title | — | — | 34/40 w600 | — | |
| H2 section | — | — | 18/26 w600 | — | |
| Ideas lead | 768x26 | — | 18/26 w400 | — | |
| Ideas row title | 676x22 | — | 16/22 w500 | — | |
| Ideas row description | 676x60 | — | 14/20, rgba(0,4,9,.59) | — | 3 lines |
| Primary button (Create a space) | 145x36 | #005bbf | #fff 14/20 w500 | 9999 | padding 0 14 0 8 |
| Search field | 215x36 | rgba(255,255,255,.76) | 16/24 | 9999 | 1px rgba(0,0,0,.1), padding 0 16 0 10 |
| Sidebar nav row (selected) | 215x36 | oklab(0 0 0 / .0255) | 16/24 | 12 | padding 0 8 |

## Stylesheet variables read
- 2,030 custom properties total, including 19 hue scales x 11–24 steps, the `ai-gray` 025–1100 ramp (with alpha variants), `--text-*` composites (title, body, caption, subheadline, response, footnote, landing display), `--hatch-*` chat tokens, spacing density and Tailwind-style radius/ease/weight scales.
- Fonts declared: optimisticAI (variable 400–600 + italic), optimisticText (300/400/700), optimisticMono (variable), hatchLetterCaveat (Caveat, 400–700).

## Computed contrast (calculated)
Calculated: text #111112 on canvas 18.4:1; secondary 5.3:1 on canvas, 5.1:1 on bubble; tertiary 2.5:1 on canvas; white on #005bbf 6.5:1.

## Screenshots
| File | What it shows |
|---|---|
| screenshots/01-chat-home.jpg | Chat view: header pills, mascot chip, phone mock-up bubble, assistant bubble, link card, composer |
| screenshots/02-search-overlay-entering.jpg | Search overlay mid-fade: frosted sheet with skeleton rows over the chat |
| screenshots/03-search-overlay-recents.jpg | Overlay settling: "Recents" rows appearing |
| screenshots/04-ideas-page.jpg | Ideas page: 34px title, lead, list rows with round icons and "..." menus, section heading |
| screenshots/05-goals-page.jpg | Goals page: status label, disclosure rows with chevrons |
| screenshots/06-spaces-page.jpg | Spaces: secondary sidebar, primary blue pill, outlined skeleton cards |
| screenshots/07-chat-task-review-tray.jpg | Composer with the "A task needs review" tray |

All screenshots were taken from the live page by the browser tool and were not edited. They contain the capturing user's private conversation content.

## Not inspected [?]
Dark theme; mobile/responsive breakpoints; marketing/landing pages (a `landing-*` token family exists); hover/focus/active states; modals other than Search; dropdown menus; settings forms; tooltips; the Chats side panel; scroll-triggered header behaviour; the logo.
