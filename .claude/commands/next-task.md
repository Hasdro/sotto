---
description: Start a Sotto session — sync git, check the environment, read the tracker, state the plan
---

Run the Sotto session start routine from docs/WORKFLOW.md §2. Make no code changes in this step.

1. Sync git:
   - Run `git fetch --all --prune` and `git status -sb`.
   - Read the **Branch** line in docs/TRACKER.md → **Now**. If that branch is not `main`, check whether `origin/main` already contains it.
   - If it is not merged, check it out and pull. Never start the same phase on a second branch.
   - If the working tree is dirty with changes you did not make, stop and ask.
2. Run `bash scripts/doctor.sh` and note which capabilities are missing (Docker, simulators, keys, Ollama).
3. Read in full:
   - docs/TRACKER.md, including the newest Session log entry (its Next, Tried and rejected, and Notes);
   - the latest `docs/handoffs/phase-N.md` if one exists;
   - the current phase brief in docs/phases/;
   - any `spec/phase-N-*.md` and `tasks/todo.md` for the current phase.
4. Pick the next task: the first `[ ]` or `[~]` task in the current phase that this environment can do.
   - If a task needs a missing capability, mark it `[!] blocked: local-only` (or `owner`) and move on.
   - If no task in the phase is possible here, say so and suggest what the owner should do.
5. Report in at most 5 lines:
   - **Phase / task:** P-ID and title.
   - **Goal this session:** one sentence.
   - **Proof:** which tests, replay or screenshots will show it is done.
   - **Environment:** cloud or local, plus missing capabilities.
   - **Blocked / needs owner:** the items.
6. Update the tracker's **Now** section: task `[~]`, branch, and environment. Then start the task loop (WORKFLOW §3). Begin with `/spec` or `/breakdown` if the task needs it.

$ARGUMENTS
