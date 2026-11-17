# Muse → Mac requests

Muse writes here whatever it cannot do (run, build, deploy, test on a device, reach production, access keys). Mac-Claude does them after pulling and fills in "Result". Muse reads the results on its next pull.

Format:
```
### R-001 · <date> · <open|done|blocked>
**Needs:** the exact command or action
**Why:** what it unblocks
**Result:** (Mac-Claude fills in: output, numbers, screenshots path, pass/fail)
```

## Open

### R-001 · 2026-11-17 · open
**Needs:** after Muse's round-1 push lands on `claude/friendly-gates-fbhqdv`, pull and run the full gate from the repo root: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm replay --all`, `pnpm a11y`. Report the exact numbers (app jest suites/tests, worker pytest + coverage, engine vitest, replay p50/p95, R4, a11y serious).
**Why:** Muse's round-1 code (T-091 Arabic source names in `lib/callSource.ts` + `SourceChip`, T-092 PageHeader move to `@sotto/ui`) was only parse-checked with esbuild in the sandbox; nothing was test-run and nothing was pushed yet (GitHub 429 blocked the push).
**Result:**

### R-002 · 2026-11-17 · open
**Needs:** (a) confirm which font files the HTML pages actually serve today (landing `apps/landing/`, owner console `cloud/owner/`, Zoho connect pages) — WOFF or WOFF2 — and where the Google Fonts `<link>`s still are; (b) download Inter + IBM Plex Sans Arabic woff2 (400/500/600), place them where the HTML pages self-host fonts, remove the Google Fonts links, keep CSP `font-src 'self'` (no widening, D-077); (c) verify the landing + owner console render in Inter/Plex (screenshots light/dark, LTR/RTL) with no console errors.
**Why:** the font files are binary and cannot go through Muse's GitHub snapshot push; HTML pages fall back to system fonts today.
**Result:**

### R-003 · 2026-11-17 · open
**Needs:** after R-001 passes, rebuild the app from the branch and install it on the Mac (newest only, per the owner rule), then check: (a) the Arabic call header shows تدريب (not "Practice") on a practice call, with the source chip; (b) screens using PageHeader look right at 390/1280 px, light/dark, LTR/RTL — screenshots in `docs/design/screens/` or the session evidence folder.
**Why:** visual confirmation of T-091/T-092 that Muse cannot do from GitHub alone.
**Result:**

## Done
(none yet)
