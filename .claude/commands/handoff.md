---
description: End a Sotto session — update the tracker, record decisions, commit, push, summarize
---

Run the Sotto session end routine from docs/WORKFLOW.md §9 and docs/HANDOFF.md. Write as if the next reader is a different agent on a different machine with no memory of this conversation.

1. **Verify.** Run the checks relevant to what changed, using the commands from CLAUDE.md. If something fails and you cannot fix it now, that failure becomes the next action. Never hide it.
2. **Update docs/TRACKER.md.**
   - **Now:** phase, next task, branch, environment used, blockers, and one concrete next action (a command or file to open).
   - **Task board:** set the state markers. For each `[x]`, add one evidence line, for example "pytest 48 passed; replay p95 1,180 ms".
   - **Phase board:** set the status and the PR link.
   - **Waiting on owner:** add anything new you need from the owner, in plain language.
   - **Known issues / Ideas:** add anything you noticed but did not do.
   - **Session log:** add a new entry at the top: `### <date> · cloud|local · <model> · <tasks>`, followed by Done / Evidence / Tried and rejected / Next / Notes (format in docs/HANDOFF.md).
   - **Branch:** write the exact branch name, including a cloud `claude/…` branch, in Now.
3. **Decisions.** Anything decided this session needs a `D-NNN` entry in docs/DECISIONS.md. If behaviour changed, update ARCHITECTURE, ENGINEERING, DESIGN, `.env.example`, and the CLAUDE.md commands as needed.
   - **Phase gate:** if this session met a phase exit gate, write `docs/handoffs/phase-N.md` from the template in docs/HANDOFF.md.
   - **Cold-start test:** reread Now and the log entry as a stranger. Can they answer the six questions in docs/HANDOFF.md? If not, fix it now.
4. **Commit and push.**
   - Review `git status` and `git diff --cached --stat`.
   - Check that no `.env*` files, recordings, transcripts or secrets are staged.
   - Commit with `docs(tracker): handoff <date> <tasks>`, plus any pending work commits.
   - Push the phase branch, then open or update a draft PR if `gh` is available.
   - Confirm `git status` is clean.
5. **Report to the owner** in at most 5 lines: what is done, the evidence, what is next, what you need from them, and the PR link.

$ARGUMENTS
