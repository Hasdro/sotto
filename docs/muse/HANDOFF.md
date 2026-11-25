# Handoff — AGN Sales Shield (repo `Hasdro/sotto`)

**To the incoming build agent, from Hasan (owner) via Muse, 25 Nov 2026.** This file supersedes the 17 Nov 2026 handoff. You are taking over the rest of the build. Read this file fully, then `CLAUDE.md`, `docs/TRACKER.md` ("Now" first), `docs/DECISIONS.md`, `docs/REQUIREMENTS.md`, `docs/muse/INBOX.md`, `docs/muse/MAC-REQUESTS.md`, `CONSTRAINTS.md`.
This file is self-contained on purpose: nothing lives in chat history or anyone's memory. If it is not in the repo, it does not exist.

## 1. The product
AGN Sales Shield (technical name `sotto`) is a real-time sales-call copilot. It listens **only to the customer's audio track** and shows the agent one suggestion card within **1.5 s p95**. Multi-tenant SaaS, Zoho CRM integration, WhatsApp (Gallabox), email, post-call follow-up, coaching, owner console.

- `apps/app` Expo web/React Native app (jest). `apps/desktop` Electron wrapper (macOS first, then Windows).
- `apps/agent-worker` Python (Starlette + SQLite) management server and worker pipeline (`sotto_worker/cloud/…`, pytest).
- `packages/ui` design system (`@sotto/ui`), `apps/landing` landing and downloads page. Engine in TS (vitest).
- Production: app https://104-168-48-116.sslip.io · owner console `/owner` on https://owner.104-168-48-116.sslip.io · landing and downloads https://salesshield.agncompu.com/ · server us3 `root@104.168.48.116`.

## 2. State at handoff (25 Nov 2026)
- Latest release **0.6.1** (Mac arm64/x64 + Windows, unsigned), published and installed on the owner's Mac. Server deployed with Round 3.
- **Round 3 (M-003, D-081–D-093) merged to `main` 20 Nov (fast-forward, no force; main HEAD `834b96e`).** DeepSeek (flash + v4-pro) and custom providers with per-model enable toggles and server-resolved endpoints; company page as tiles opening popups; dropdown fixes; take-a-tour (client + admin); GitHub issue reporting from the owner console; client bug reports → vendor review queue → GitHub; signup via new-company API + OTP + welcome email; client billing screen; landing Pricing section with the real Zoho hosted payment URLs (SHIELD-STARTER/GROWTH/SCALE). Gate R-008 green on the Mac; R-009 screens verified (42 screenshots `docs/design/screens/round3/`); R-010 deployed to us3; R-011 commercialised (GitHub repo/token + `sales-shield@agncompu.com` SMTP in the owner console). Version still **0.6.1 — do not bump unless the owner asks.**
- **Housekeeping (owner's pick C, Nov 20–22):** CI was red on `main`. Fix is committed on branch `chore/ci-green` (`cf84104` + tracker `6560e69`), **draft PR #2 to `main`, NOT merged**. Lint green (ruff format on two long Zoho URL lines); audit green (overrides in `pnpm-workspace.yaml`: `@expo/cli` 58.1.21 + `node-forge` 1.4.3 — clears the 8 high advisories from `@expo/cli` 58.1.11's zod 3.25.76 + node-forge 1.4.0). **CI cannot run right now:** GitHub blocked all jobs over a billing/spending limit; it resets only after **1 Dec 2026**. Do not waste time trying to run CI before then. A check is already scheduled for 2 Dec (cron `sotto-ci-check-dec`). **Bundle budget still fails: 573/450 KB (T-044, was 476 KB in Oct) — the owner decided to leave it failing for now (no raise, no cut).** Even after billing clears, the CI job will fail at the bundle step; that is known and accepted until the owner revisits T-044. Old installers 0.3.0/0.3.1/0.5.1/0.5.2 stay on the server — the owner said KEEP them. Gallabox live check skipped for now (needs owner-console sign-in; no credentials on file, never guess them).
- **Next ladder step after 0.6.1:** 0.7.0 WhatsApp — wire the existing `WhatsAppAction` (T-065) and `EmailAction` (T-063) into the post-call panel (T-061; AI-suggested actions with reason/confidence still open), then Gallabox panel wiring on a real account. T-053 left: verify on the owner's org (`GET /api/v1/zoho/modules`). T-056 left: prep chat + AI TLDR, History view of the brief. See `docs/TRACKER.md` for the full open list (T-094 design-system staleness, landing `shot-*.png` old UI, R-009 quirks: vendor-consent sheet stacking, `create-owner` minting its own password; deferred: TTS stored-only D-081, live DeepSeek benchmark D-083, Zoho Billing webhook D-090).
- Owner-side items still open (not yours to do unless the owner asks): spend caps (`routing.monthly_cap_usd`, per-company), Gallabox plan webhooks, Zoho multi-DC, Zoho Forms sign-up webhook, legal consent text + sub-processor list, agents reconnect Zoho once, live-cost replay (`pnpm replay:live`, costs money).

## 3. Who does what — you are working with other agents on Hasan's desktop
- **You (incoming build agent):** the builder. You read the repo, plan, write code, tests and docs. You work in your own sandbox/cloud environment; you do **not** have the owner's Mac, the server, or the owner's credentials. You also do **not** have GitHub access — you cannot pull from or push to the repo. You work from a zip of the project the owner sends you, and you hand your work back the same way (see §6).
- **Muse (owner-side agent, on a Linux VM):** reads/verifies from the repo and the live sites, prepares prompts for the desktop agent. Hasan and Muse build, test and maintain the project together. Viva is no longer active on this project — do not send reports to Viva or ask Viva for values.
- **The desktop agent (on Hasan's Mac, "DeepAI code"):** has the real machine and shell access. It pulls, runs the full test suite, builds and installs the Electron app, runs the replay, deploys to the server, publishes installers, tests the installed app, pushes to GitHub, and does browser work. It has ssh to production and the owner's Zoho/Gallabox/server access. You do not.
- **Owner (Hasan):** carries messages between agents, requests features, reports bugs, answers decisions. He is the only one who approves outward-facing or hard-to-reverse actions.
- **Desktop agent only acts on production (deploy, installer publish, push, delete) with the owner's go.**

### Asking the desktop agent for help (important)
When you hit anything you cannot do (run the app, build installers, deploy, reach the server, run live-key replay, take screenshots, test on Windows/Mac, check Zoho/Gallabox settings, upload the web app, push to GitHub), **write it clearly** in `docs/muse/MAC-REQUESTS.md` (template inside) and mention it in your final message to the owner. Be precise: the command or action, why, and what output you need back. The desktop agent reads that file after every pull, does the work, and writes results in the same file ("Result" line) so you see them on your next pull. **At the end of every round, also give the owner a short verbatim prompt for the desktop agent to continue the build — because some things only the desktop agent (and the website) can do.** Never silently skip something you could not verify; say "not verified, needs desktop agent".

### Feature requests and bugs
The owner reports them; they land in `docs/muse/INBOX.md`. **Read INBOX.md at the start of every round**: it is your queue of owner-requested work. Move done items to its "Done" section with the commit and version. Prioritise by owner urgency, then by the ladder in `docs/TRACKER.md`.

## 4. The owner's standing instruction — do this first
> Read this entire project and find everything that's broken, inconsistent, inefficient, or no longer needed. Prefer deleting over simplifying, simplifying over optimizing, and optimizing over automating. Run my app, open every page in Chrome yourself and screenshot it. List the 5 biggest hierarchy and density problems first. Fix what you're sure about and list the rest for me to review.

That is the first task of your first round, before new features. You cannot run the Mac app or Chrome on the owner's Mac yourself — for the run-it-and-screenshot-it part, put the exact steps in `docs/muse/MAC-REQUESTS.md` and in your desktop-agent prompt (see §3), and do the code-level part of the audit (broken/inconsistent/inefficient/dead code) in your own environment.

## 5. Bugs + feature requests in the queue (from the owner, 25 Nov)
- **M-004 · Mascot smile too small.** The little smiley character's smile is a bit small — make it a bit bigger, but not too big. The character is `packages/ui/src/components/Mascot.tsx` (built from Views + Animated API, no SVG). Its smile is the `Smile` component at the bottom of that file: a soft "U" drawn as the lower half of a ring, width `w = wide ? s * 0.3 : s * 0.22` (s = size). Enlarge the default smile slightly (small step, e.g. 0.22 → ~0.26 of size) and keep the suggesting state's wider smile proportional; check the call-result mouths (`MoodMouth`: excellent/good) still look consistent, and do not change the eyes, blink, breathing or gaze behaviour. Acceptance: the smile is visibly a little larger in the app (idle and suggesting states) without looking oversized; existing mascot tests still pass. Also logged in `docs/muse/INBOX.md` as M-004.

## 6. Handing work back (hard rule) — you have no GitHub access
You cannot pull from or push to GitHub. You work from the zip of the project the owner sends you, and you hand work back the same way.
- A round = one coherent batch of work taken from INBOX.md/tracker. Work locally, commit as often as you like in your local copy (small conventional commits: `feat(app): …`, `fix(worker): …`, `docs(tracker): …`; no WIP/fixup chains), but **do not push anything anywhere** — you have no remote to push to.
- Work on a **fresh branch off `main`** in your local copy for each round (the Round 3 branch is merged; PR #2 `chore/ci-green` is separate housekeeping — do not build on it). Only the owner merges to `main`. **Never force-push.**
- **At the end of each round, once your work is done and the owner has confirmed it, zip the whole project back** (exclude `node_modules`, `Pods`, build outputs and other generated folders) **together with two things: (1) notes of what changed** — files changed, what each change does, tests run and their results, anything not verified; **(2) a prompt for the owner to give to Muse (or another agent) to push your changes to GitHub** — it must say which branch the changes are on, what to commit, and that the push goes to that branch (never to `main` directly, never force-push).
- Do not send the zip back per change, per file, or "to save progress" — once per round, after the owner's confirmation. Only send early when the owner explicitly asks or when you are about to hit a hard limit; then send once and say so.
- Final message of each round to the owner: at most 5 bullets: what changed, what is left, what the owner/desktop agent must check. Include the exact desktop-agent prompt (pull, test, build, deploy) — and remember the push happens separately, by Muse or another agent from your zip, after the owner's go.

## 7. Round routine (every round, same order)
1. `git pull`; read `docs/muse/INBOX.md`, `docs/muse/MAC-REQUESTS.md` (results from the desktop agent), `docs/TRACKER.md` Now.
2. Plan the round: pick items, write the plan in the tracker (task lines). Use `planning-and-task-breakdown`, `spec-driven-development` for anything new.
3. Build in thin slices, tests first (`test-driven-development`, `incremental-implementation`).
4. Run what you can in your sandbox: `pnpm lint`, `pnpm typecheck`, `pnpm test` (see CLAUDE.md Commands). If your sandbox cannot run something, put it in MAC-REQUESTS.md. **Do not try to run GitHub CI before 2 Dec 2026 — it is billing-blocked; the check is already scheduled.**
5. Review your own diff (`code-review-and-quality`; `security-and-hardening` for auth/keys/tenancy; `doubt-driven-development` for risky logic).
6. Update `docs/TRACKER.md` (Now, task board, session log at top), `docs/DECISIONS.md` for any decision, `docs/REQUIREMENTS.md` only with the owner's OK. Update CLAUDE.md commands if behaviour changed.
7. Version bump only when a release is wanted (see §8).
8. **Hand the round back as a zip (see §6)** — only after the owner's confirmation, with change notes and a push prompt for Muse/another agent. Then tell the owner what the desktop agent should do, as a verbatim prompt.
9. Next round: read the desktop agent's results, fix what failed.

## 8. Release, build, deploy (done by the desktop agent, with the owner's go)
You request, the desktop agent executes. Routine, so you can prepare for it:
- **Version:** bump `apps/desktop/package.json` "version" and `APP_VERSION` in `apps/app/lib/cloud.ts` together; update `apps/landing/downloads.json`. Any new local module the Electron main process requires must be in `build.files` (guard test: `apps/desktop/test/packaged-files.test.cjs`; 0.6.0 crashed at launch from this).
- **Build:** `cd apps/desktop && npm ci && npm run web && npx electron-builder --mac --win`, then `node scripts/downloads-manifest.mjs`, `bash deploy/publish-landing.sh root@104.168.48.116 --apply`, verify installers return 206 on the downloads URLs.
- **Server deploy:** back up the DB first (`/var/lib/sotto/cloud.db.pre-<tag>`), then `bash deploy/push.sh root@104.168.48.116`, then curl-verify health, owner console, landing, Zoho notify.
- **Mac install:** only the newest app stays on the Mac (owner rule): quit, delete old /Applications copy, install new, trash build-folder copies and older installers.
- **VM quirk (Muse's environment, for reference):** `pnpm install` fails EPERM chown on an existing `node_modules/.modules.yaml` — delete that file first, then install works. `pnpm audit` cannot reach the npm registry from the VM (ECONNRESET); the audit check must run on the Mac.

## 9. Quality bars and hard rules (never lower)
Full text in `CLAUDE.md` and `CONSTRAINTS.md`. Summary:
- Only the **customer** track may trigger a suggestion (R4). R4 agent-triggered cards = 0.
- After any change to prompts, models, STT, LLM adapters or the worker pipeline: `pnpm replay --all`; p95 ≤ 1500 ms or it is a failure. (Desktop agent runs the live one.)
- Worker coverage floor 90%; app jest `maxWorkers` 2; a11y 0 serious; every table has `company_id` + isolation test.
- No skipped/deleted tests, no `@ts-ignore` without a tracker entry, no loosened thresholds.
- No model names or prompt text in app code (router + prompt registry; defaults in `seed/`). Provider SDKs only in `adapters/`.
- No secrets in git or client. Never read, print or commit `.env*`; new env vars go in `.env.example` without value.
- UI: `packages/ui` tokens/components only; check light/dark, 390 px and 1280 px, LTR and Arabic RTL. Brand is "AGN Sales Shield" (no user-facing "Sotto").
- Customer recordings/transcripts never in git.
- **Never publish the landing page with TODO-ZOHO-HOSTED-URL-* placeholders. Never touch production without the owner's go.**
- **Ask the owner before:** spending money or creating paid accounts, touching production, changing a requirement, deleting data, adding a major dependency. Batch these as multiple-choice questions ("1a, 2b" style, recommended option first). Technical and sequencing decisions are yours: record them in DECISIONS.md.
- Do not commit `.claude/skills/grill-me/`, `.claude/skills/grilling/`, `.claude/skills/README.md` edits or `.env.example` edits that are local-only unless you made them deliberately.
- Do not open VS Code on the owner's Mac, and do not ask for Terminal/SSH access to it — the desktop agent runs Mac commands; you reach the Mac only through `docs/muse/MAC-REQUESTS.md` and the owner's prompts.

## 10. Skills — use them
Skills are vendored in `.claude/skills/` (see `.claude/skills/README.md` and the licence files). Use them, do not improvise when a skill fits:
- Workflow: `/spec` → `/breakdown` → `/build` → `/test` → `/quality-review` → `/ship`, and `handoff` at the end of a session.
- By task: `frontend-design`, `frontend-ui-engineering`, `ui-ux-pro-max`, `antislop*` (UI, copy, code comments, layout, accessibility) for any UI; `api-and-interface-design`; `debugging-and-error-recovery` for failures; `security-and-hardening` (auth, RLS, keys); `performance-optimization` and `latency-guardian` reasoning for the live path; `documentation-and-adrs` for decisions; `source-driven-development` before using an external API; `git-workflow-and-versioning`; `ci-cd-and-automation`; `shipping-and-launch` before releases; `constraint-driven-development` (read `CONSTRAINTS.md`); `context-engineering`; `interview-me`/`grilling` when a request is vague.
- Reviewer personas in `.claude/agents` (code-reviewer, security-auditor, test-engineer, latency-guardian, tenancy-guardian) if your environment supports them; otherwise apply their checklists yourself.
- If your platform has additional installed skills beyond these, use them as well, but the repo's skills and `CLAUDE.md` win on project facts.

## 11. Style for talking to the owner (his standing instructions)
- Reply in **English**, even if he writes in another language. Task content keeps the language the task or repository sets.
- Lead with a **TL;DR** (one or two sentences) before any detail. Keep answers **minimal**: only what he needs to act. **Define jargon** the first time you use it, in a short phrase.
- Prefer a **table** when one fits; prefer an **example** when one fits; prefer a **diagram** when one fits (ASCII or Mermaid).
- Final reports: **at most 5 bullets**, in this order: 1. What changed 2. What is left 3. What I must check. If something **failed, was skipped, or was not verified**, say so first. Show **only changed code**, not whole files. Do not generate HTML, artifacts, or extra documents unless he asks.
- **Interrupt him only when you are blocked.** Otherwise keep working. For a **reversible choice** you are already allowed to make, **decide it and report** the decision afterward.
- When you need a decision from him, ask with **multiple-choice options** (A, B, C) or **numbered options** he can answer like "1b, 2a". Ask only what you cannot resolve yourself. Do not ask for approval on routine, reversible steps.
- Do not take **outward-facing or hard-to-reverse actions** (send, publish, push, deploy, delete, pay) without his explicit yes in that conversation.
- Do not list next steps like merge or deploy in closing lines unless he asks for them.
