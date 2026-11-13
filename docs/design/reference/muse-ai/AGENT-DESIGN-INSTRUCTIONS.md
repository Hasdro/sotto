# AGENT-DESIGN-INSTRUCTIONS — "Quiet Paper Glass"

Paste everything below the line into Claude Code, Codex, or any coding agent. Place this package in the project (e.g. `./design-dna/`) first, or paste the token block at the end.

---

## INSTRUCTION TO THE CODING AGENT

You are building a new application. Its visual language is **Quiet Paper Glass**: a calm, neutral, soft-cornered interface where flat gray surfaces sit on a near-white canvas and only floating chrome is translucent frosted glass. Inherit the language, not any original site's content, branding, mascot or layout.

### 1. Read first
Read `design-dna/DESIGN-TOKENS.json`, `examples/css-variables.css` and `examples/component-examples.css`. Use the tokens as the single source of truth. Do not invent new colours, radii or font sizes; if something is missing, derive it from the nearest token and note it in a comment.

### 2. Personality (apply to every screen)
Calm, personal, unhurried, slightly domestic. Plain until it matters. Colour is almost absent; softness comes from geometry and translucency.

### 3. Hard rules
- Canvas `#fcfcfc`. Text `#111112`. Secondary text `rgba(0,4,9,.59)`. Never pure white canvas or pure black text.
- Surfaces are flat neutral grays (`#f3f4f5`, `#e9eaeb`). No borders or shadows on bubbles, list rows or content cards.
- Controls are pills: `border-radius:9999px`, **36px** high, label 14px/20 weight 500.
- Message/bubble shape: radius `22px 22px 22px 6px` (sharp corner at the sender side). Cards that are links: 10px. Large input capsule: 32px.
- Floating chrome (header pills, composer, search field, overlays): `rgba(255,255,255,.76)` + `backdrop-filter: blur(36px)` + `box-shadow: 0 8px 40px rgba(0,0,0,.12)` (shadow on floating pills only). Provide an opaque fallback.
- One accent: `#005bbf` fill for the single primary action per view, plus small unread dots. No gradients on UI. No second accent colour. Semantic status colours only as small dots/labels.
- Typography: one sans family, weights 400/500/600 only, sentence case, no letter-spacing tweaks. Page title 34/40 w600; section heading 18/26 w600; body 16/22–24 w400; row title 16/22 w500; secondary 14/20; caption 13/18; timestamp 12/16.
- Spacing on a 4px grid. Content column about 768px, left-aligned beside an optional 72px rail. Separate list rows with whitespace, not dividers. Hairlines `rgba(0,0,0,.1)` only for structural dividers.
- Icons: single monoline outline family at 16px inline / 32px rail, colour `#111112`; hover/active = a 44px gray circle behind the icon, never a colour change.

### 4. Components to reproduce
Icon rail, glass pill, primary pill button, neutral chip, message bubble (+ image variant), timestamp divider, link card, composer capsule, search field, sidebar nav row (12px radius, 36px), page header, list row with 44px round icon and overflow menu, disclosure row with chevron, outlined card with skeleton loading, overlay sheet. Follow `COMPONENT-LIBRARY.md` for dimensions.

### 5. Motion
All UI transitions 150–200ms with `cubic-bezier(.4,0,.2,1)`; layout changes up to 300ms ease-out. Overlays fade in (with at most 4px translate). Loading = skeleton blocks with a soft shimmer, not spinners. Agent/"working" indicators = soft opacity pulses. No bounce or overshoot on routine UI. Wrap all animation in `prefers-reduced-motion`.

### 6. Adapting to this project
Keep the tokens and component geometry; change the content, information architecture and the brand. If the project is data-dense, keep type sizes at 14–16px and use hairline table rules; if it is mobile-first, turn the rail into a bottom bar and keep bubble max-width 86%. For dark mode, derive from the gray ramp in the tokens and keep the same radii and glass logic. Give the product its own soft, round, matte mascot or emblem if it needs warmth; do not copy any existing character.

### 7. Avoiding generic AI UI
Do not add: purple/blue gradients, glassmorphism on content cards, drop shadows everywhere, emoji as icons, centered hero blobs, 8px-radius buttons, bold uppercase labels, multiple accent colours, or dashboards of equally weighted cards. Keep one primary action, plenty of whitespace, and plain language copy in first person singular ("I'll…") if the product has an assistant voice.

### 8. Consistency checks before finishing
1. Every button is a 36px pill; exactly one primary per view.
2. All font sizes appear in the scale; weights only 400/500/600.
3. Every floating surface has glass + blur + the float shadow; nothing else has a shadow.
4. All radii come from tokens.
5. Timings come from tokens.
6. Focus rings (2px `#005bbf`, 2px offset) are visible on every interactive element, since the source did not provide any (this is an addition).
7. No colour appears that is not in `DESIGN-TOKENS.json`.

### 9. Inline token block (use if the package is not available)
```css
:root{--canvas:#fcfcfc;--surface:#fff;--sunken:#f3f4f5;--bubble:#e9eaeb;--glass:rgba(255,255,255,.76);
--text:#111112;--text-2:rgba(0,4,9,.59);--text-3:rgba(0,7,17,.37);--hairline:rgba(0,0,0,.1);--accent:#005bbf;
--r-pill:9999px;--r-composer:32px;--r-bubble:22px;--r-tail:6px;--r-card:10px;--r-row:12px;
--shadow-float:0 8px 40px rgba(0,0,0,.12);--blur:blur(36px);
--ease:cubic-bezier(.4,0,.2,1);--t-fast:100ms;--t-base:150ms;--t-med:200ms;--t-layout:300ms}
```
