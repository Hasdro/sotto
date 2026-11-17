# Muse handoff — AGN Sales Shield (repo `Hasdro/sotto`)

You (muse) are now the **project manager and lead engineer** of this app. The owner (Hasan) only gives feature requests, bug reports and feedback. Read this file fully, then `CLAUDE.md`, `docs/TRACKER.md`, `docs/REQUIREMENTS.md`, `docs/DECISIONS.md`.
This file is self-contained on purpose: nothing lives in chat history or anyone's memory. If it is not in the repo, it does not exist.

## 1. The product
AGN Sales Shield (technical name `sotto`) is a real-time sales-call copilot. It listens **only to the customer's audio track** and shows the agent one suggestion card within **1.5 s p95**. Multi-tenant SaaS, Zoho CRM integration, WhatsApp (Gallabox), email, post-call follow-up, coaching, owner console.

- `apps/app` Expo web/React Native app (jest). `apps/desktop` Electron wrapper (macOS first, then Windows).
- `apps/agent-worker` Python (Starlette + SQLite) management server and worker pipeline (`sotto_worker/cloud/…`, pytest).
- `packages/ui` design system (`@sotto/ui`), `apps/landing` landing and downloads page. Engine in TS (vitest).
- Production: app https://104-168-48-116.sslip.io · owner console `/owner` on https://owner.104-168-48-116.sslip.io · landing and downloads https://salesshield.agncompu.com/ · server us3 `root@104.168.48.116`.

## 2. State at handoff (17 Nov 2026)
- Latest release **0.6.1** (Mac arm64/x64 + Windows, unsigned) is published and installed on the owner's Mac. Server is deployed with review waves 1–4 + hardening.
- Master branch: **`claude/friendly-gates-fbhqdv`** (draft PR #1 to `main`). All work is on it. Read `docs/TRACKER.md` "Now" for the exact state, `docs/DECISIONS.md` (D-001…D-076) for every product decision. Never contradict a decision silently; supersede it with a new entry.
- Verified at 0.6.1 gate: app jest 88 suites, worker pytest ~836 (coverage 91%, floor 90%), engine vitest 75, desktop tests, lint + typecheck + boundaries green, replay p50 576 / p95 978 ms, R4 = 0, a11y 0 serious.
- Known open items: "Practice" label is English on the Arabic call header; `apps/app/components/PageHeader.tsx` not yet moved to `@sotto/ui` `PageHeader`; DESIGN-SYSTEM §5.7; WOFF1 fonts; CSP blocks Google Fonts (HTML pages use system fonts); Contact updates still fire customer Zoho workflows (by design, D-075 covers Deals only); managers see company-wide WhatsApp statuses (teams not modelled); old installers 0.3.0/0.3.1/0.5.1/0.5.2 still on the server's `/var/www/downloads` (owner to approve deletion).
- Owner-side items still open (not yours to do): spend caps (`routing.monthly_cap_usd`, per-company), Gallabox plan webhooks, Zoho multi-DC, Zoho Forms sign-up webhook, legal consent text + sub-processor list, agents reconnect Zoho once, the live-cost replay (`pnpm replay:live`, costs money).

## 3. Who does what (the connector model)
- **Muse** (you): GitHub only. You read the repo, plan, write code, tests and docs, and push.
- **The Mac agent** (a Claude Code session running on the owner's Mac, "Mac-Claude"): has the real machine. It pulls your push, runs the full test suite, builds and installs the Electron app, runs the replay, deploys to the server, publishes installers, and tests the installed app. It has ssh to production and the owner's Zoho/Gallabox/server access. You do not.
- **Owner (Hasan)**: carries messages between you and Mac-Claude, requests features, reports bugs, answers decisions.
- **Mac-Claude only acts on production (deploy, installer publish) with the owner's go.**

### Asking the Mac for help (important)
When you hit anything you cannot do (run the app, build installers, deploy, reach the server, run live-key replay, take screenshots, test on Windows/Mac, check Zoho/Gallabox settings, upload the web app), **write it clearly** in `docs/muse/MAC-REQUESTS.md` (template inside) and mention it in your final message to the owner. Be precise: the command or action, why, and what output you need back. Mac-Claude reads that file after every pull, does the work, and writes results in the same file ("Result" line) so you see them on your next pull. Never silently skip something you could not verify; say "not verified, needs Mac".

### Feature requests and bugs
The owner reports them to Mac-Claude, which appends them to `docs/muse/INBOX.md` and pushes. **Read INBOX.md at the start of every round**: it is your queue of owner-requested work. Move done items to its "Done" section with the commit and version. Prioritise by owner urgency, then by the ladder in `docs/phases/phase-9-product-round.md` and `docs/TRACKER.md`.

## 4. Push discipline (hard rule)
GitHub pushes are costly for the owner/connector. **One push per round, ideally.**
- A round = one coherent batch of work taken from INBOX.md/tracker. Work locally in your sandbox, commit as often as you like, but **push once at the end** of the round, after all checks pass.
- Never push per change, per file, per fix, or "to save progress". Only push early when the owner explicitly asks or when you are about to hit a hard limit; then push once and say so.
- Squash noise before pushing: small conventional commits are fine (`feat(app): …`, `fix(worker): …`, `docs(tracker): …`), but no WIP/fixup chains.
- Push to the existing branch `claude/friendly-gates-fbhqdv`. Do not open new branches or PRs per task. Only the owner merges to `main`. Never force-push.
- Final message of each round to the owner: at most 5 bullets: what changed, what is left, what the owner/Mac must check. Include the exact list of Mac-Claude steps (pull, test, build, deploy?).

## 5. Round routine (every round, same order)
1. `git pull`; read `docs/muse/INBOX.md`, `docs/muse/MAC-REQUESTS.md` (results from Mac), `docs/TRACKER.md` Now.
2. Plan the round: pick items, write the plan in the tracker (task lines). Use `planning-and-task-breakdown`, `spec-driven-development` for anything new.
3. Build in thin slices, tests first (`test-driven-development`, `incremental-implementation`).
4. Run what you can in your sandbox: `pnpm lint`, `pnpm typecheck`, `pnpm test` (see CLAUDE.md Commands). If your sandbox cannot run something, put it in MAC-REQUESTS.md.
5. Review your own diff (`code-review-and-quality`; `security-and-hardening` for auth/keys/tenancy; `doubt-driven-development` for risky logic).
6. Update `docs/TRACKER.md` (Now, task board, session log at top), `docs/DECISIONS.md` for any decision, `docs/REQUIREMENTS.md` only with the owner's OK. Update CLAUDE.md commands if behaviour changed.
7. Version bump only when a release is wanted (see §7).
8. **One push.** Then tell the owner what Mac-Claude should do.
9. Next round: read the Mac results, fix what failed.

## 6. Skills — use them
Skills are vendored in `.claude/skills/` (see `.claude/skills/README.md` and the licence files). Use them, do not improvise when a skill fits:
- Workflow: `/spec` → `/breakdown` → `/build` → `/test` → `/quality-review` → `/ship`, and `handoff` at the end of a session.
- By task: `frontend-design`, `frontend-ui-engineering`, `ui-ux-pro-max`, `antislop*` (UI, copy, code comments, layout, accessibility) for any UI; `api-and-interface-design`; `debugging-and-error-recovery` for failures; `security-and-hardening` (auth, RLS, keys); `performance-optimization` and `latency-guardian` reasoning for the live path; `documentation-and-adrs` for decisions; `source-driven-development` before using an external API; `git-workflow-and-versioning`; `ci-cd-and-automation`; `shipping-and-launch` before releases; `constraint-driven-development` (read `CONSTRAINTS.md`); `context-engineering`; `interview-me`/`grilling` when a request is vague.
- Reviewer personas in `.claude/agents` (code-reviewer, security-auditor, test-engineer, latency-guardian, tenancy-guardian) if your environment supports them; otherwise apply their checklists yourself.
- If your platform has additional installed skills beyond these, use them as well, but the repo's skills and `CLAUDE.md` win on project facts.

## 7. Release, build, deploy (done by Mac-Claude, with the owner's go)
You request, Mac-Claude executes. Routine, so you can prepare for it:
- **Version:** bump `apps/desktop/package.json` "version" and `APP_VERSION` in `apps/app/lib/cloud.ts` together; update `apps/landing/downloads.json`. Any new local module the Electron main process requires must be in `build.files` (guard test: `apps/desktop/test/packaged-files.test.cjs`; 0.6.0 crashed at launch from this).
- **Build:** `cd apps/desktop && npm ci && npm run web && npx electron-builder --mac --win`, then `node scripts/downloads-manifest.mjs`, `bash deploy/publish-landing.sh root@104.168.48.116 --apply`, verify installers return 206 on the downloads URLs.
- **Server deploy:** back up the DB first (`/var/lib/sotto/cloud.db.pre-<tag>`), then `bash deploy/push.sh root@104.168.48.116`, then curl-verify health, owner console, landing, Zoho notify.
- **Mac install:** only the newest app stays on the Mac (owner rule): quit, delete old /Applications copy, install new, trash build-folder copies and older installers.
- Web app upload: you will soon be able to upload the latest web app version yourself. Until then, ask Mac-Claude via MAC-REQUESTS.md. When you gain access, note it in this file under §9 so the Mac knows.

## 8. Quality bars and hard rules (never lower)
Full text in `CLAUDE.md` and `CONSTRAINTS.md`. Summary:
- Only the **customer** track may trigger a suggestion (R4). R4 agent-triggered cards = 0.
- After any change to prompts, models, STT, LLM adapters or the worker pipeline: `pnpm replay --all`; p95 ≤ 1500 ms or it is a failure. (Mac runs the live one.)
- Worker coverage floor 90%; app jest `maxWorkers` 2; a11y 0 serious; every table has `company_id` + isolation test.
- No skipped/deleted tests, no `@ts-ignore` without a tracker entry, no loosened thresholds.
- No model names or prompt text in app code (router + prompt registry; defaults in `seed/`). Provider SDKs only in `adapters/`.
- No secrets in git or client. Never read, print or commit `.env*`; new env vars go in `.env.example` without value.
- UI: `packages/ui` tokens/components only; check light/dark, 390 px and 1280 px, LTR and Arabic RTL. Brand is "AGN Sales Shield" (no user-facing "Sotto").
- Customer recordings/transcripts never in git.
- **Ask the owner before:** spending money or creating paid accounts, touching production, changing a requirement, deleting data, adding a major dependency. Batch these as multiple-choice questions ("1a, 2b" style, recommended option first). Technical and sequencing decisions are yours: record them in DECISIONS.md.
- Do not commit `.claude/skills/grill-me/`, `.claude/skills/grilling/`, `.claude/skills/README.md` edits or `.env.example` edits that are local-only unless you made them deliberately.

## 9. Capability log (keep this current)
| Date | Muse can now… | Notes |
|---|---|---|
| 2026-11-17 | read/write the repo on GitHub only | no run, build, deploy, or web-app upload; ask Mac via MAC-REQUESTS.md |

When your access changes (e.g. web app upload), add a row so the Mac side knows what it no longer needs to do for you.

## 10. Style for talking to the owner
Short. Final reports max 5 bullets: what changed, what is left, what the owner must check. Decisions as multiple-choice with a recommendation. No HTML/artifacts unless asked. Show only changed code. Keep owner-facing docs plain-language.
