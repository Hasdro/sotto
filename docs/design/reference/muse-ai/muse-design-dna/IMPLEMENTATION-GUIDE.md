# IMPLEMENTATION-GUIDE — Quiet Paper Glass

## 1. Install the tokens
1. Copy `examples/css-variables.css` into your global stylesheet (or map `DESIGN-TOKENS.json` into your token tool).
2. Set the font. The source uses a proprietary variable font; use a licensed or open stand-in at weights 400/500/600 only. Good matches: Inter, Geist, Figtree, Instrument Sans, DM Sans.
3. Apply `html, body { background: var(--qpg-canvas); color: var(--qpg-text); }`.

## 2. Framework mapping
**Tailwind v4 (the source itself uses a Tailwind-v4-style theme):**
```css
@theme {
  --color-canvas: #fcfcfc; --color-bubble: #e9eaeb; --color-accent: #005bbf;
  --color-ink: #111112; --color-ink-2: rgba(0,4,9,.59);
  --radius-bubble: 22px; --radius-composer: 32px; --radius-card: 10px;
  --shadow-float: 0 8px 40px rgba(0,0,0,.12);
  --font-sans: "Inter", system-ui, sans-serif;
}
```
**React/Vue/Svelte:** wrap each component in `examples/component-examples.css` classes or port to CSS modules; keep tokens as CSS variables so theming stays framework-neutral.
**Native (SwiftUI, Compose):** use the same numbers; implement glass with `.ultraThinMaterial` (iOS) or `RenderEffect` blur (Android) at ~76% white tint.
**Design tools:** create colour styles from the tokens; set the glass layer as 76% white with 36px background blur.

## 3. Build order for a new app
1. Canvas + type scale.
2. Pill button (36px) and primary variant.
3. Bubble/card surfaces (flat gray #e9eaeb).
4. Glass layer for floating chrome (composer, header pills, search).
5. Navigation: 72px rail (or any nav) with round 44px hover/active backdrop.
6. Page header + list rows.
7. Skeletons and overlay sheet.
8. Motion at 150–200ms standard ease.

## 4. Adaptation rules
- **Content-dense products (tables, dashboards):** keep the canvas, type and pill controls; use 1px hairline `rgba(0,0,0,.1)` for table rules; keep numbers at 14–16px w500. Do not add a second accent colour; use gray-scale emphasis, then blue sparingly.
- **Dark theme:** not observed in the source [?]. If required, derive from the `ai-gray` scale (the source defines steps 025–1100, so the dark ramp already exists): canvas near `#111112`, bubbles `#28292b`–`#323435`, glass `rgba(17,17,18,.76)`, text `#f3f4f5`. Treat this as a design extension, not extracted fact.
- **Mobile:** observed layouts were desktop only [?]. Collapse the rail to a bottom bar; keep pills, composer capsule and 22px bubbles; set bubble max width to 86% (a source token) [V].
- **Branding:** replace the mascot and any wordmark with your own. Keep the slot (a softly lit round figure in the header) if you want the companion feel.
- **Status colours:** the source has full hue scales (red to olive, 50–950). Use them only for semantic states, at text weight 500 or as small dots.

## 5. Common mistakes
| Mistake | Fix |
|---|---|
| Drop shadow on every card | Shadows only on floating glass chrome |
| Opaque white header/composer | Use `rgba(255,255,255,.76)` + `backdrop-filter: blur(36px)`; fall back to #fff when `backdrop-filter` is unsupported |
| 8px radius buttons | Pills at 9999px, 36px high |
| Bold headings (700+) | Max 600, page title 34/40 |
| Colour-filled icons | Icons stay #111112; use gray circle backdrops |
| Spinner-only loading | Skeleton shimmer with the same geometry as final content |
| Long, bouncy animation | 150–200ms, standard ease, no overshoot |
| Pure `#fff` canvas or `#000` text | `#fcfcfc` / `#111112` |

## 6. Accessibility checklist
- Secondary text (`rgba(0,4,9,.59)`) is fine for supporting copy; never use the tertiary tone for essential text (see contrast in DESIGN-DNA.md).
- Add visible `:focus-visible` rings (2px accent, 2px offset); original focus treatment not verified.
- Honour `prefers-reduced-motion`.
- Icon-only controls need `aria-label`s (the original rail is icon-only).

## 7. Verification
Compare your build to `reference/screenshots/` for: bubble silhouette, glass over scrolling content, pill height, rail geometry, title weights. If a thing exists in the screenshots but not in the tokens, trust the tokens; if neither, follow the principles in DESIGN-DNA.md.
