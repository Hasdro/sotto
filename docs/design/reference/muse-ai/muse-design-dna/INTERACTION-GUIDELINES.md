# INTERACTION-GUIDELINES — Quiet Paper Glass

## What was verified vs. not
- **Verified [V]:** declared transition durations and easings, keyframe names, and the Search overlay entering with a fade over the underlying page.
- **Observed [O]:** the overlay fades in as an opaque-to-clear frosted sheet with skeleton lines; navigating between rail sections swaps the main content without a visible slide.
- **Not verified [?]:** hover colours for buttons, keyboard focus rings, press (active) states, scroll-triggered animations, loading spinner design, page-transition choreography. These were not triggered or measured. Everything below marked (inferred) is a recommendation consistent with the system, not an observation.

## Timing and easing [V]
| Use | Duration | Easing |
|---|---|---|
| Fine feedback (opacity) | 100ms | cubic-bezier(.4,0,.2,1) |
| Colour, opacity, transform/scale | 150ms | cubic-bezier(.4,0,.2,1) |
| Background-color/opacity, box-shadow, width | 200ms | cubic-bezier(.4,0,.2,1) |
| Layout (padding-bottom) | 300ms | ease-out |
| Colour (some controls) | 150ms | cubic-bezier(0,0,.2,1) |

Default transition duration token is .15s with the standard ease [V]. Nothing slower than 300ms was declared.

## Motion principles [I]
1. **Fast and level.** 150–200ms, standard ease, no overshoot on routine UI.
2. **Fade over slide.** Overlays fade in (named `fadeIn`/`lightboxFadeIn` [V]); at most a few pixels of translate (inferred).
3. **Skeleton before content.** Loading states are structural gray blocks with a `shimmer`/`shimmerSweep` keyframe [V], never spinners alone [O].
4. **Reserve personality for the character.** Declared keyframes `wiggle`, `avocado-pop`, `avocado-wobble`, `avatar-ring-pulse`, `hatch-dot-pulse` [V] indicate playful motion exists for the mascot and status dots; UI chrome stays calm.
5. **Pulse for presence.** `pulse-light/medium/strong` and `activity-indicator-fade` [V] suggest "agent is working" signals use soft opacity pulses.
6. **Route headers animate subtly.** `hatch-route-header-title-shrink`, `-bg-reveal`, `-description-fade` [V] imply a large page title shrinks into a compact header on scroll [I, not triggered].

## Recommended state specs (inferred unless noted)
| Element | Hover | Active/pressed | Focus |
|---|---|---|---|
| Rail item | circle backdrop `#f3f4f5` fades in 150ms | backdrop slightly darker (`#e9eaeb`) | 2px outline in `--qpg-accent` offset 2px |
| Glass pill | background to opaque white 150ms; shadow unchanged | scale .98 for 100ms | same ring |
| Primary button | opacity .92 | opacity .85 | same ring |
| List row | none or `#f3f4f5` fill with 12px radius | same | same ring |
| Link card | fill `#e0e2e4` (gray-150) | fill `#d1d3d5` (gray-200) | same ring |

## Interactions that carry most of the perceived quality
1. Frosted glass staying live under scrolling content [V blur, O effect].
2. Consistent 150–200ms standard-ease transitions everywhere (no outliers).
3. Skeleton shimmer instead of blank states.
4. Soft pulses for agent activity instead of spinners.

## Accessibility notes
- Respect `prefers-reduced-motion`: disable shimmer, pulses and wiggles; keep opacity fades.
- Provide visible keyboard focus; the original's focus styles were not verified.
