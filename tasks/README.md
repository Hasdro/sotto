# Current plan

`/breakdown` writes `tasks/plan.md` (the approach) and `tasks/todo.md` (small steps with
checks) for the task in progress. `/build` works through `todo.md`.

When a phase closes, move both files to `tasks/archive/phase-N/`, so the next phase starts
clean. Phase-level status lives in `docs/TRACKER.md`, not here.
