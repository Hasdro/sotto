# Quiet Paper Glass — Design DNA package

Extracted from the authenticated app shell of https://muse.ai/ on 2026-11-14 using live computed styles, stylesheet variables and screenshots (light theme, 1012x688 viewport).

## What this is
A portable description of a visual language: near-white canvas, flat cool-gray surfaces, pill controls, a bubble with one sharp corner, and translucent frosted floating chrome with one large soft shadow. One blue accent. One sans family at three weights. 150–200ms standard-ease motion.

This is not a clone. Do not reuse the original's mascot, fonts, copy or branding.

## Personality
Calm, personal, unhurried. Plain until it matters; softness from geometry and translucency, not colour. See `DESIGN-DNA.md`.

## Package map
| File | Purpose |
|---|---|
| DESIGN-DNA.md | Identity, essentials, what not to break |
| DESIGN-TOKENS.json | Machine-readable tokens with verification status |
| COMPONENT-LIBRARY.md | 23 components with dimensions and states |
| INTERACTION-GUIDELINES.md | Motion timings, principles, state specs |
| BRAND-AND-GRAPHICS.md | Icon and illustration language |
| IMPLEMENTATION-GUIDE.md | Framework mapping, adaptation, mistakes |
| AGENT-DESIGN-INSTRUCTIONS.md | Paste-ready brief for a coding agent |
| examples/css-variables.css, component-examples.css | Usable CSS consistent with the tokens |
| reference/ | Screenshots, measured details, asset notes |

## How to use
1. Read DESIGN-DNA.md (5 minutes).
2. Import `examples/css-variables.css`, swap the font for a licensed one.
3. Build components from `COMPONENT-LIBRARY.md`, borrowing `component-examples.css`.
4. Give the coding agent `AGENT-DESIGN-INSTRUCTIONS.md`.

## Instruction for an AI coding agent (short form)
"Use `design-dna/` as the design source of truth. Follow AGENT-DESIGN-INSTRUCTIONS.md exactly. Use only tokens from DESIGN-TOKENS.json. Do not copy any original content or branding."

## Verification status
Values tagged verified in the docs came from computed styles or CSS variables. Items tagged observed came from screenshots only. Hover, focus, dark mode, mobile and marketing pages were not inspected. See `reference/visual-details.md`.

## Privacy note
The screenshots in `reference/screenshots/` show the capturing user's real Muse conversations and account content. Review or crop them before sharing this package outside your team.
