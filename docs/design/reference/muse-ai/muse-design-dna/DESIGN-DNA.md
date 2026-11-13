# DESIGN-DNA — "Quiet Paper Glass"

Source: https://muse.ai/ app shell (light theme), investigated 2026-11-14 in a live Chrome tab at 1012x688.
Legend: **[V]** verified from computed style or stylesheet; **[O]** observed in screenshot only; **[I]** my interpretation; **[?]** unknown.

## 1. Identity in one paragraph

A personal-agent app that looks like a stack of frosted paper on a near-white desk. The canvas is #fcfcfc [V], text is a soft black #111112 [V], and almost everything else is a cool neutral gray. Colour is nearly absent: a single deep blue (#005bbf button fill [V]) appears only on the one primary action and on unread dots [O]. Shapes are soft and consistent: full pills for controls, 22px bubbles with one 6px "tail" corner, a 32px composer capsule. Floating chrome is translucent white with heavy blur and one very large, very soft shadow. The warmth comes from a single illustrated 3D mascot character and from conversational copy, not from the palette [I].

## 2. What makes it recognisable

1. **Neutral-only palette plus one blue.** Chat bubbles are #e9eaeb [V], flat, borderless, shadowless. No colour is used to decorate.
2. **Translucent white glass** `rgba(255,255,255,.76)` + `blur(36px)` [V] on the composer, header pills and search field, so content scrolls visibly beneath them.
3. **The asymmetric bubble.** Radius `22 22 22 6` [V]. Images attached to a message mirror it (`6 22 22 22`) [V].
4. **Pill everything.** Buttons, chips, search fields are `border-radius: 9999px` [V] at a fixed 36px height [V].
5. **Large soft float shadow** `0 8px 40px rgba(0,0,0,.12)` [V], used only on floating pills. Everything else is flat.
6. **Quiet type.** One family (a proprietary variable font), three weights (400/500/600) [V], sentence case, no letter-spacing changes except one −0.01em on the 48px landing display [V].

## 3. Simplicity vs richness

The UI is extremely simple (flat fills, one accent, no borders on content). Richness is concentrated in three places: the glass layer, the mascot/illustration moments (a 3D cream character, product mock-ups inside bubbles [O]), and a large library of declared keyframes (shimmer, pulse, wiggle, avatar-ring-pulse and more [V]). The ratio is roughly 95% plain, 5% delight.

## 4. Emotional character

Calm, personal, unhurried, slightly domestic. It reads as "a capable assistant who does not shout." The rounded geometry and absence of hard lines keep it friendly; the neutral palette and tight type keep it adult. It is not playful in colour, only in character art and copy [I].

## 5. Design Personality Profile

| Trait | Evidence |
|---|---|
| Soft | 22px bubbles, 32px composer, pill controls, 10-12px cards [V] |
| Airy | Content column 768px wide in a 1012px viewport, 72px rail, generous row spacing [V] |
| Translucent | Glass layer at 76% white with 36px blur [V] |
| Restrained | One accent colour, 3 font weights, shadows on floating chrome only [V] |
| Companionable | Mascot, first-person copy ("I'll surface my favourite ideas") [O] |

## 6. Essential vs optional

**Essential (never change):** the near-white canvas; neutral gray bubbles with the 22/22/22/6 radius; pill controls at 36px; glass + blur + big soft shadow on floating chrome; single blue accent used sparingly; sentence case; 400/500/600 weights only; flat content (no borders or shadows on bubbles and list rows).

**Optional:** the 72px icon rail (any navigation can wear the same pill and circle language); the mascot; the shimmer skeletons; the handwritten script font (declared, never seen in use [?]).

## 7. How a developer would accidentally destroy it

- Adding borders and drop shadows to bubbles and rows (they are flat).
- Using pure white (#fff) or pure black as the canvas or text. The canvas is #fcfcfc, text #111112.
- Sprinkling a second accent colour, or gradients on buttons.
- Replacing pills with 8px-radius rectangles.
- Using opaque white for the composer and header pills (the glass effect disappears).
- Using bold (700) headings or ALL CAPS labels.
- Making animations bouncy or long. Declared timings are 100–300ms with a standard ease [V].

## 8. Weaknesses worth not copying

- Secondary text `rgba(0,4,9,.59)` on #fcfcfc computes to 5.3:1 on the canvas and 5.1:1 on the bubble [calculated], passing AA; tertiary `rgba(0,7,17,.37)` falls to 2.5:1 [calculated] and should not carry meaning.
- The rail icons have no visible text labels [O]; discoverability depends on icon recognition.
- The Search overlay rendered a frosted skeleton for a noticeable moment while loading [O]; the content beneath bleeds through the glass and briefly competes with it.
- Hover/focus states were not verifiable (see limitations), so do not assume the original has accessible focus rings.

## 9. Name rationale

"Quiet Paper Glass": **Quiet** (restrained palette and type), **Paper** (near-white canvas, flat fills), **Glass** (the translucent blurred floating layer).
