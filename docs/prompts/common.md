# Rules every phase 9 child session follows

- Read: `CLAUDE.md` (hard rules + § Session orchestration), `docs/phases/phase-9-product-round.md` (your section + Definition of done 0.3.0), `docs/TRACKER.md` Now, `docs/DECISIONS.md` D-022, D-026…D-036, `CONSTRAINTS.md`.
- Work only on your branch `phase9/<stream>` in your own worktree, cut from `claude/friendly-gates-fbhqdv`. Touch only your owned files; anything else needs the master's OK (write it in your report instead of editing).
- Tests first, small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push WIP about every 45 minutes.
- Never read, print or commit `.env*`. No secrets in git or chat. Never skip/weaken tests or thresholds. UI only through `packages/ui` tokens; check light, dark, 390 px, 1280 px, LTR and Arabic RTL; English and Arabic strings in step.
- Electron dev runs: `env -u ELECTRON_RUN_AS_NODE npx electron . --user-data-dir=<your scratchpad>/electron-profile`. Never the default profile (it is the owner's installed app).
- No production changes (us3 server, `/downloads/`, Caddy on the server) and no money or accounts; the master and owner do those.
- Before you finish: run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `bash scripts/check-boundaries.sh`, `(cd apps/desktop && npm test)`, and `pnpm a11y` for UI work; `pnpm replay --all` if anything on the live path changed (report p50/p95). Put screenshots in `docs/evidence/phase9/<stream>/`.
- Tracker: update only your task lines (state + one evidence line) and add a session-log entry `### <date> · local · <model> · phase9/<stream>`. Do not edit Now.
- End with a report of at most 10 lines: what changed, evidence, files outside your list you need touched, open questions for the owner, the branch tip.
