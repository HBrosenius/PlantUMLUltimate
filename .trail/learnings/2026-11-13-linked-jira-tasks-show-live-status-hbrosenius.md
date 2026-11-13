---
title: Linked Jira tasks show live status through the existing diagram status map
author: HBrosenius
date: 2026-11-13
branch: main
cost: { minutes: 5, tokens: 42834 }
id: l-8c543181
scope: repo
status: active
src: agent
touches:
  - packages/jira-integration/src/linked.ts
  - apps/web/src/use-jira-integration.ts
  - apps/web/src/styles/03-gantt-and-sequence-canvas.css
  - apps/integration-worker/src/index.ts
  - packages/jira-integration/src/binding.ts
---

## Decided
Tasks linked to a Jira issue by a browse URL get a read-only live status, separate from the full pull/publish sync. Live statuses are merged into the same per-task status map the synced statuses use, so no new props were threaded through the app layers. Synced tasks (jira_<id> alias) win over linked ones.

## Tried and ruled out
Adding a toolbar refresh button: it needs props threaded through several layers, so refresh happens on tab focus (at most once a minute) instead.

## Watch out
Running vitest from the repo root also picks up .claude/worktrees and tests/e2e specs, giving many false failures. Exclude them: npx vitest run --exclude '.claude/**'.

In the code:
- packages/jira-integration/src/linked.ts
- apps/web/src/use-jira-integration.ts
- CSS: apps/web/src/styles/03-gantt-and-sequence-canvas.css (data-jira-status="live-*")
