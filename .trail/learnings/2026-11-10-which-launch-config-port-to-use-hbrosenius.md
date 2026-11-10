---
title: "Which launch config / port to use for the web dev server in worktrees, and what breaks…"
author: HBrosenius
date: 2026-11-10
id: l-3b9adfd9
scope: repo
status: active
touches:
  - "tests/e2e/gantt-task-table.spec.ts#code"
---

## Decided
Use launch config `web-alt` (port 5185) for the web app preview; port 5175 (`web`) belongs to other worktrees.
Fresh worktrees may only have `web` in `.claude/launch.json` — add a `web-alt` entry (same npm args, `--port 5185 --strictPort`) locally and revert it before committing.
If another chat session already holds 5185, add a `web-alt2` entry on 5195 instead (worked 2026-09-18).
The code editor toolbar only renders in Advanced mode (File > Settings) with view mode `code` or `split`.
Vitest sweeps `.claude/worktrees`, so run tests scoped to a path (e.g. `npx vitest run apps/web/src`).

**Why:** Ports collide across concurrent worktree sessions, and preview_start cannot stop another chat's server.

## Watch out
Check `.claude/launch.json` before preview_start; pick the first free of 5185/5195.

_From Claude Code's memory of this repo, last updated Sep 18._
