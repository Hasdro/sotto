# Vendored skills

| Source | Version | License | What |
|---|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | v0.6.12 @ `1be8e34` (2026-10-10) | MIT (`AGENT-SKILLS-LICENSE.txt`) | 24 skills (all folders except `frontend-design`), `.claude/commands/*` except `next-task`/`handoff`, `.claude/agents/{code-reviewer,security-auditor,test-engineer,web-performance-auditor}.md`, `.claude/references/*` |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `frontend-design` | 2026-10 | Apache-2.0 (`frontend-design/LICENSE.txt`) | `frontend-design` skill |

Sotto's own additions: `.claude/commands/next-task.md` and `handoff.md`, plus
`.claude/agents/latency-guardian.md` and `tenancy-guardian.md`.

## Why vendored instead of plugins (D-006)

The skills are copied into the repo. That means a cloud session (claude.ai/code), a local
session and any future machine get exactly the same skills, with no install step and no
version drift.

## Changes from upstream

- The commands drop the `agent-skills:` plugin prefix. Skills are project skills here.
- `/plan` was renamed `/breakdown`, and `/review` was renamed `/quality-review`. The
  originals clash with Claude Code's built-in `/plan` and `/review`.
- Paths to `references/` now point to `.claude/references/`.

## Updating

1. Clone upstream into a temp folder.
2. Diff the upstream `skills/`, `references/`, `agents/` and `.claude/commands/` against these copies.
3. Copy the changed files over, then re-apply the three changes above.
4. Bump the version in this table.
5. Record the update in docs/DECISIONS.md if behaviour changes.

Do not install the agent-skills plugin as well, or every skill loads twice.
