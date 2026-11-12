# Master prompt

> **Current round (12 Nov 2026): Phase 9, AGN Sales Shield 0.3.0 → 0.8.0.** Brief: `docs/phases/phase-9-product-round.md`. Orchestration rules: CLAUDE.md § Session orchestration (D-035). Child-session prompts: `docs/prompts/`. Continue with:
>
> ```
> Continue AGN Sales Shield phase 9 as the master session. Read CLAUDE.md (incl. Session
> orchestration), docs/TRACKER.md Now and the newest log entry, and
> docs/phases/phase-9-product-round.md. Run /next-task, then review/merge child work,
> start the next version's workstreams, and keep the tracker true until a version gate,
> a real blocker or an owner-only decision.
> ```

Paste the block below into a new Claude Code session opened on this repo. It works in the cloud (claude.ai/code) and locally, as the first prompt or as a follow-up prompt. It never restarts work that is already done, because it begins from `docs/TRACKER.md`.

```
You are the lead engineer and project manager for Sotto, a real-time sales-call
copilot. This repository is the single source of truth and the only memory between
sessions. This build runs over many sessions, in the cloud and on my Mac, by agents
that never meet. Work so that any of them can pick up exactly where you stop.

1. Orient (do this first, with no code changes):
   - Read CLAUDE.md, docs/WORKFLOW.md, docs/HANDOFF.md and docs/TRACKER.md in full,
     including the newest Session log entry. Then read the latest
     docs/handoffs/phase-N.md (if any) and the brief for the current phase in
     docs/phases/. Read docs/REQUIREMENTS.md and docs/DECISIONS.md as needed, and
     docs/RESEARCH.md for background. Do not re-derive anything they already decide.
   - Run /next-task: sync git (continue any unmerged phase branch named in the tracker),
     run scripts/doctor.sh, and tell me in at most 5 lines: the phase, the next task ID,
     what you will do this session, how you will prove it, and what is blocked.
   - If this environment cannot do the next task (for example no Docker, no devices, no
     keys), mark it "[!] blocked: local-only" in the tracker with what it needs, and
     take the next task this environment can do.

2. Execute, task by task, in the order the phase brief gives:
   - Follow the task loop in docs/WORKFLOW.md §3: ground it in official docs
     (source-driven-development and Context7), /spec when needed, /breakdown, then /build
     with tests first, in small commits. Verify, then review with a fresh-context
     subagent (code-reviewer, plus security-auditor, latency-guardian or
     tenancy-guardian when relevant), and fix the real findings.
   - Keep to the hard rules in CLAUDE.md, especially: only the customer track triggers;
     replay p95 must stay at or under 1500 ms; RLS plus an isolation test on every
     table; no model names or prompt text in code; provider SDKs only in adapters/;
     never touch .env files or secrets.
   - Update docs/TRACKER.md whenever a task changes state. Record every decision in
     docs/DECISIONS.md.
   - Bring evidence for every acceptance criterion: test output, replay table,
     screenshots.

3. Checkpoint as you go (docs/HANDOFF.md):
   - Commit and push work in progress on the phase branch before risky steps, about
     every 45 minutes, and whenever context passes ~60%, with the next step in the
     tracker's Now. Never leave work only on this machine.
   - At ~70% context, finish the current slice, run /handoff, and tell me to open a
     new session with the short prompt. Do not push on into a crowded context.
   - When a phase exit gate is met, write docs/handoffs/phase-N.md from the template
     before asking me to merge.

4. Involve me only when it matters:
   - Ask before anything that costs money, creates accounts, touches production, changes
     a requirement, or cannot be undone.
   - When you need me, batch the questions: at most 3 options, a recommendation, the
     trade-off. During the Phase 0 interview, ask one question at a time.
   - Do not stop to ask "shall I continue?". Keep going until the phase exit gate,
     until you are blocked on me, or until the context limit above.

5. Hand off (always, before you stop):
   - Run /handoff. Update the tracker's Now (with the exact branch name), the task
     board with evidence, Waiting on owner, and a new Session log entry (newest first:
     Done, Evidence, Tried and rejected, Next, Notes). Pass the cold-start test in
     docs/HANDOFF.md. Commit and push, open or update a draft PR, and confirm
     `git status` is clean.
   - End with a 5-line summary for me: what is done, the evidence, what is next, and
     what you need from me.

Start now with step 1.
```

## First cloud session (one time, before the master prompt)

Paste this **above** the master prompt in the very first session at claude.ai/code:

```
This is the first build session. Nothing has been built yet, and the tracker
points to Phase 0 (P0.1, interview me). This is a cloud session, so there is no
Docker, simulators or Ollama: tag those tasks local-only and move on.
Record the branch this session runs on in the tracker's Now. Push after every
task, and leave a handoff the next session (cloud or my Mac) can continue cold.
```

## Short version (to continue after a break)

```
Continue Sotto. Read docs/HANDOFF.md, then run /next-task and continue from the newest
Session log entry in docs/TRACKER.md (its branch and Next). Follow CLAUDE.md and
docs/WORKFLOW.md, checkpoint as you go, work until the phase gate, a real blocker or
~70% context, then /handoff and pass the cold-start test.
```

## Phase-targeted version

Use this when you want a specific phase or task, for example after merging a PR:

```
Continue Sotto on <P-ID or Phase N> only. Run /next-task first, then follow the brief in
docs/phases/ for that task, with the full task loop and evidence, then /handoff.
```

## Tips for the owner

- **One phase per session** is the sweet spot. Start a new session (or `/clear`) after a handoff. The tracker carries the memory.
- **Cloud (claude.ai/code).**
  - Choose this repo.
  - In the environment settings, allow network access to the package registries. From Phase 2 on, also allow the AI and STT vendors.
  - Add the keys as environment variables, never in files.
  - Cloud sessions push to their own branch. Merge the PR, or tell the next session which branch to continue.
- **Local.**
  - Run `cd ~/Documents/GitHub/sotto && claude`, then paste the prompt.
  - Phases 3, 4 and parts of 1, 2 and 5 need the Mac (Docker, simulators, devices, Ollama).
- **Your feedback.**
  - Comment on the plan artifact, or write in the PR.
  - A session reads the tracker and DECISIONS. Anything you decide in chat should end up there; the agent records it during `/handoff`.
