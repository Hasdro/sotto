# Handoff protocol

Sotto is built over many sessions, cloud and local, by agents that never meet. **The repository is the only memory.** If something is only in your conversation, it is lost when the session ends.

This file defines three levels of handoff. `/handoff` runs the session level. The other two are triggered by the situations below.

| Level | When | What you write |
|---|---|---|
| **Checkpoint** | Mid-task: before risky work, every ~45 min of work, or when context passes ~60% | WIP commit + tracker **Now** + `tasks/todo.md` |
| **Session handoff** | End of every session, always | Everything in `/handoff` |
| **Phase handoff** | When a phase meets its exit gate (or is paused for long) | `docs/handoffs/phase-N.md` from the template below |

## The cold-start test

Before you stop, read your handoff as if you were a new agent on a different machine. You have no chat history, no environment variables set by you, and no knowledge of what you tried.

The handoff passes when that agent can answer all of these **from the repo alone**:
1. Which phase, which task, which branch?
2. What exactly is the next action, as a command to run or a file and line to open?
3. What is half-done, and where is it?
4. What did I try that failed, and why? (So it is not tried again.)
5. What is blocked, on whom, and what unblocks it?
6. How do I prove the last finished task works? (The command plus its expected output.)

If any answer is missing, write it before stopping.

## Checkpoint (mid-task)

Context runs out without warning, and cloud sessions can be interrupted. Do not wait for the end:
- Commit work in progress on the phase branch as `wip(<scope>): <what> — next: <step>`. Never put WIP on `main`. Tests may be red only in a `wip` commit, and the tracker must say so.
- Update the tracker's **Now** with the next step.
- Push. A cloud session's disk does not survive it.
- When context passes ~70%, finish the current slice, run the full session handoff, and tell the owner to start a new session with the short master prompt. A fresh session with a good handoff beats a crowded one.

## Session handoff

This is `/handoff` (`.claude/commands/handoff.md`), in summary:
- tracker updated: Now, task board with evidence, phase board, waiting on owner, known issues, session log entry;
- decisions recorded;
- docs touched by behaviour changes updated;
- committed, pushed, draft PR open;
- `git status` clean;
- 5-line summary to the owner.

The **session log entry** is the most important part. Use exactly this shape:

```
### YYYY-MM-DD · cloud|local · <model> · <task IDs>
- **Done:** what changed, in plain words (task IDs).
- **Evidence:** commands run and their results (tests passed, replay p50/p95, screenshots path).
- **Tried and rejected:** approaches that failed, and why (skip if none).
- **Next:** the exact next action.
- **Notes:** gotchas, environment quirks, anything the next agent would trip on.
```

## Phase handoff

When a phase meets its exit gate, write `docs/handoffs/phase-N.md` before asking the owner to merge. Later phases read it instead of re-reading the whole phase's code.

```markdown
# Phase N handoff — <name>

- **Status:** exit gate met on YYYY-MM-DD · PR <link> · merged: yes/no
- **What exists now:** modules, apps and tables added, one line each, with paths.
- **How to run it:** install, dev, test, replay commands, with the expected output.
- **Interfaces later phases depend on:** names, files, contracts (for example the card protocol, router API, adapter interface). Changing them means a decision entry.
- **Exit gate evidence:** the numbers and tests that prove it.
- **Deviations from the phase brief:** what changed, and the decision ID.
- **Known issues / debt carried forward:** each with a tracker ID.
- **Local-only items left:** what still needs the Mac, devices or the owner.
- **Advice for the next phase:** traps and things to do first.
```

## Handing work across environments

- **Cloud → local:**
  - Cloud sessions push to their branch, often `claude/…`. Record the exact branch in the tracker's **Now**.
  - Tasks the cloud could not do are marked `[!] blocked: local-only`, with what is needed. The next local session starts by clearing them.
- **Local → cloud:**
  - Push everything, including the tracker.
  - Anything the cloud lacks (keys, network domains) goes under **Waiting on owner**.
- **Parallel sessions:** avoid them. If the owner runs two at once, each must work on a different phase branch, and only one session may edit `docs/TRACKER.md` on `main`.

## What never goes in a handoff

- Secrets, `.env` contents or keys: refer to the variable *name* only.
- Customer audio, transcripts or personal data.
- "Should work" claims without evidence.
