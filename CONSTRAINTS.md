# Constraints: Sotto's quality bar

This file is the contract. No change may weaken it to get to green. Lowering a number, adding an exception or removing a check needs:
- a decision entry in `docs/DECISIONS.md`;
- a tracker entry (`T-NNN`) with an owner and an expiry.

Set on 2026-10-18 (P1.8). The owner deferred the interview (D-009), so the numbers are Claude's defaults; the reason for each is given. The owner may raise or lower any of them with a decision.

## Floor (always on, every change)

| Rule | Enforced by | Where it runs |
|---|---|---|
| Types are clean: TS `strict` + `noUncheckedIndexedAccess`; mypy `--strict` | `pnpm typecheck` | Stop hook, CI |
| Lint and format are clean (Biome, ruff) | `pnpm lint` | PostToolUse format hook, CI |
| All tests pass | `pnpm test` | Stop hook, CI |
| No suppressions and no skipped or focused tests, unless the same line names a `T-NNN` that exists in `docs/TRACKER.md`. This covers:<br>• `@ts-ignore`, `@ts-expect-error`, `# type: ignore`;<br>• `# pragma: no cover`, `biome-ignore`, `eslint-disable`;<br>• `.skip*`, `.only`, `.todo`, `.fails`, `.runIf`;<br>• `pytest.mark.skip*`/`xfail`, `pytest.skip()`/`importorskip()`, `unittest.skip*`. | `scripts/check-boundaries.sh` (rule `suppression`); at runtime, pytest fails the run if any test is skipped or xfailed (`tests/conftest.py`), and vitest refuses `.only` in CI | `pnpm lint`, `pnpm test`, CI |
| Architecture boundaries (ENGINEERING §3): provider SDKs only in `adapters/`; no model names or prompt text in code; the app never imports the worker or holds provider keys; no raw colours in the app | `scripts/check-boundaries.sh` | `pnpm lint`, CI |
| The card protocol is generated from one schema, so the TS and Python copies never drift | `pnpm gen` + `git diff --exit-code` | CI |
| No secrets in git | gitleaks (`--redact`), full history | pre-commit hook (`.githooks/`, when gitleaks is installed), CI |

## Enforced numbers

| Metric | Threshold | Why this number | Command |
|---|---|---|---|
| Live-path latency (R1) | replay p95 total ≤ **1500 ms** | R1 makes this the maximum, not the average | `pnpm replay --all`. A stub until P2.8: it exits 0 only when there are no golden calls, and fails if calls exist but the harness does not. |
| Worker coverage, overall | ≥ **90%** statements + branches | The worker is the product's core and is mostly pure logic with fakes, so 90% is cheap to hold. Today it is 96%. | `pnpm test:worker` (runs `scripts/check_coverage.py`) |
| Coverage of `sotto_worker/pipeline/`, `router/`, `adapters/` | ≥ **90%** each | These decide what the agent sees and when (R1, R2, R4). They start to count with their first file (P2.1). | same |
| Engine coverage (`packages/engine`, the live pipeline since D-022) | ≥ **80%** statements + branches; **90%** at Phase 8 | The engine runs every real call, so it needs a floor like the worker's. Set 2026-10-21 (T-042) at 92.6% statements / 82.0% branches. | `pnpm --filter @sotto/engine test` (vitest + `@vitest/coverage-v8`, thresholds in `packages/engine/vitest.config.ts`) |
| Colour contrast of every token pair the app uses for text | ≥ **4.5 : 1** (WCAG 2.2 AA), light and dark | ENGINEERING §11 | `pnpm --filter @sotto/ui test` |
| Web bundle | ≤ **450 KB** gzipped JS in total | Today it is 291 KB, which is mostly React Native Web and Expo Router. That leaves about 150 KB for LiveKit and the call UI before a PWA on 4G feels slow. | `python3 scripts/check_bundle_size.py apps/app/dist` (CI, after `export:web`) |
| Dependency advisories | none at **high** or above in production npm deps; none in Python runtime deps | Known exploitable issues must not ship | CI `audit` job: `pnpm audit --prod --audit-level high`, `uvx pip-audit --strict` |

## Measured only (not enforced yet)

| Metric | Today | Becomes enforced |
|---|---|---|
| TypeScript coverage (`packages/shared`, `packages/ui`, `apps/app`) | not measured (`packages/engine` is enforced above) | add `@vitest/coverage-v8` with a floor for `packages/shared` |
| Accessibility of screens (axe-core) | 11 screens × light/dark/Arabic RTL = 33 checks, 0 serious/critical (2026-10-20) | `pnpm a11y` on the web build, in CI; zero serious or critical violations (WCAG 2.1 A/AA) |
| Stop-hook duration | ~8 s | Keep it under 20 s (P1.4); move slow suites to CI if it grows |

## Exceptions

| ID | What | Owner | Expires |
|---|---|---|---|
| T-001 | `pnpm audit` ignores GHSA-86w9-cpqp-85rv (node-forge) and GHSA-vfj7-8cjw-p6xm (braces). Both are in Expo build tooling and have no patched version. | Claude (check at each Expo SDK upgrade) | the next Expo SDK upgrade, at the latest 2027-01-31 |

## Agent rules

- Read this file before changing tests, lint config, CI or thresholds.
- Never make a check pass by weakening it. That includes deleting or skipping tests, adding suppressions, lowering a number, adding an ignore, or narrowing what a check scans.
- If a constraint is wrong, say so and propose a decision. Until it is accepted, the constraint stands.
