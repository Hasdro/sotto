# Child session: phase9/brand-ui — T-048, T-049, T-050, T-051 (AGN Sales Shield 0.3.0)

Read `docs/prompts/common.md` first and follow it. Use the `impeccable` skill (context, then critique, then a refinement of the existing "Prompter's box" world). Also use `frontend-design` and `unslop-audit` to remove the "AI template" tells. This is an evolution of the existing design, not a new world.

## Goal
1. **Logo (T-048).**
   - Three standalone vector directions with no letters: (a) a shield formed by a phone handset, (b) a handset with a subtle cape or check, (c) a shield and handset monogram.
   - Each one as SVG at 16, 32 and 512 px, on light and dark, plus a monochrome tray version.
   - Show them on one comparison page, `docs/design/logo/index.html`, and stop for the owner's choice. Meanwhile, wire option (a) as a placeholder through the pipeline.
   - Once the owner chooses, generate `.icns`, `.ico`, a macOS template tray image, a Windows tray `.ico`, the favicon and landing assets into `apps/desktop/build-assets/` and `apps/app/assets/brand/`.
2. **Rebrand (T-049, D-026).**
   - Change every user-facing "Sotto" to "AGN Sales Shield" (short form "Sales Shield") in English and Arabic.
   - Places to change: the electron-builder `productName`, window titles, tray tooltip and menu, About, the favicon and the web `<title>`.
   - Keep these technical IDs: `appId`, `app://sotto`, the storage keys, the `sotto-desktop` user-data folder (set `app.setPath('userData', …)` explicitly if a `productName` change would move it), and the package and module names.
   - Add a grep check that fails on any user-facing "Sotto".
3. **Reskin (T-050).**
   - Do it mainly through `packages/ui` tokens and components: quiet grey-blue surfaces, an ink-teal brand colour, one warm signal accent, and one loud suggestion card.
   - Then cover all screens, admin included, and go deepest on the live-call screen.
   - Density rule for the live call: only the suggestion card, the call status and one collapsed context-rail toggle (an empty slot for now). One card expanded at a time, with older cards compact.
   - Requirements: WCAG AA, light and dark at the same quality, RTL, and no added work on the card render path.
4. **Mascot moods (T-051).** Five result moods from the review success score, refined by sentiment:
   - excellent (75 or more), good (60–74), mixed (40–59), needs work (under 40), and no result.
   - Show them only in the review result and History detail.
   - Keep the existing activity states, the accessible labels and reduced motion.

## Owned files
- `packages/ui/**`, `apps/app/lib/i18n.ts`, `apps/app/lib/theme.ts`.
- `apps/app/components/**`, except `FeatureGate.tsx`, which flags-auth owns.
- `apps/app/app/**` and `apps/app/features/**` screens for styling. Do not touch `features/flags/**` or `app/admin/features.tsx`.
- `apps/app/assets/**`, `apps/desktop/build-assets/**` (new), `docs/design/**`, `docs/DESIGN.md`.
- In `apps/desktop/package.json`, only `productName` and the icons.
- In `apps/desktop/main.cjs`, only names, tray icons and tooltip strings.
- flags-auth merges first; rebase onto it before you finish and keep its `FeatureGate` wraps.

## Evidence
- Before and after screenshots for every screen: light, dark, 390 px, 1280 px, and Arabic RTL.
- Live-call screenshots showing the one-glance card.
- Mascot moods at scores 80, 65, 50, 30 and none.
- `pnpm a11y` with 0 serious issues.
- `pnpm replay --all` p95 at or below 1500 ms.
- The grep check passing.
- The web bundle size before and after. T-044 is already over budget, so do not make it worse.
