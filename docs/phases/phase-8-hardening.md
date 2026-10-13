# Phase 8 — Hardening, release, pilot

## Goal
Prove Sotto is reliable enough to recommend: under load, when dependencies fail, and with real agents for a week. Ship store and desktop builds with monitoring that warns before users notice.

## Entry criteria
- Phases 2–7 gates met.

## Read first
- `docs/REQUIREMENTS.md` (all)
- `docs/ARCHITECTURE.md` failure-mode table
- `CONSTRAINTS.md`
- `docs/REFERENCES.md`:
  - EAS Build/Submit
  - Sentry
  - Tauri (if desktop installers)
  - LiveKit scaling

## Skills and subagents
- `/ship` (`shipping-and-launch`)
- `observability-and-instrumentation`
- `performance-optimization`
- `ci-cd-and-automation`
- `git-workflow-and-versioning` (release, changelog)
- `/quality-review` and `/security-review` on the full diff since Phase 1
- All reviewer subagents

## Environment
Local session, with access to staging and production. The owner must approve every production step.

## Tasks

### P8.1 — Load test
Replay calls concurrently at two levels: 25 and 100 simultaneous calls (or the BRIEF peak × 2).

**Acceptance:**
- p95 ≤ 1500 ms at the target concurrency.
- Error rate < 0.5 %.
- Cost per call minute is reported.

### P8.2 — Failure drills
Run every row of the ARCHITECTURE failure-mode table in staging. At minimum, block each of these:
- the primary LLM
- the primary STT
- the DB
- email
- the CRM
- the local model endpoint

Also kill the worker mid-call.

**Acceptance:** each drill behaves exactly as documented. Record the evidence in `docs/runbooks/drills.md`.

### P8.3 — Monitoring and alerts
Wire Sentry into the app and the worker. Build a dashboard showing:
- card p95 per company
- fallback rate
- holding-line rate
- escalations
- STT errors
- cost

Alert when any of these happens:
- p95 > 1500 ms for 10 minutes
- fallback rate > 5 %
- the worker crash-loops

**Acceptance:** a synthetic breach fires the alert.

### P8.4 — Environments and data safety
Set up separate staging and production for Supabase, LiveKit and keys.

Database migrations and backups:
- Migrations run through CI.
- Backup and restore is rehearsed.
- Retention and deletion jobs are verified.

**Acceptance:** a restore into staging is proven.

### P8.5 — Builds
- iOS through EAS to TestFlight.
- Android through EAS to Play internal testing.
- Web app as an installable PWA.
- Tauri installers for Windows, Mac and Linux, if D-NNN says so.

Version builds and write a CHANGELOG.

**Acceptance:** the owner installs each build and completes a full call per platform (R5).

### P8.6 — Full review
- `/security-review` and the `security-auditor` subagent on the whole system.
- `/quality-review` on the diff since Phase 1.
- A privacy check against BRIEF (consent, retention, residency).

**Acceptance:** no open high findings.

### P8.7 — Pilot
Two real agents use Sotto for one week. Every day, collect:
- live p95
- usage
- the holding-line rate
- escalations

Collect qualitative feedback at the end of the week.

**Acceptance:**
- The pilot report is in `docs/PILOT.md`.
- Decisions on what to fix before a wider launch are recorded.

## Exit gate
- [ ] Load test, drills and alerts are proven, and builds are installed on every platform.
- [ ] The pilot week is complete, with live p95 ≤ 1500 ms, and the owner approves a wider rollout.

## Owner actions
- Production accounts and billing.
- Store listings: privacy policy, screenshots.
- Pilot agents and their consent.
- Go/no-go decision.
