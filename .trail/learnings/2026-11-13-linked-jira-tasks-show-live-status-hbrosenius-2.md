---
title: Linked Jira tasks show live status; UI state reaches the preview through a React context
author: HBrosenius
date: 2026-11-13
branch: main
cost: { minutes: 7, tokens: 31666 }
id: l-c19342c4
scope: repo
status: active
replaces: l-8c543181
src: agent
touches:
  - apps/web/src/use-jira-integration.ts
  - apps/web/src/DiagramPreview.tsx
  - tests/e2e/jira.spec.ts
---

## Decided
Tasks linked to a Jira issue by a browse URL get a read-only live status, separate from the full pull/publish sync. Status colours go through the existing per-task status map; issue details (summary, status name, assignee), the last-synced time and the refresh action go through a small React context instead of props, which avoided threading them through many layers. Synced tasks (jira_<id> alias) win over linked ones.

## Tried and ruled out
Threading refresh and details as props through the workspace layers: too many components. Hovering the task group in tests: the label text and a link overlay sit on top of it.

## Watch out
Linked tasks get a link overlay (an anchor) over the bar, so the hover card must also match on the anchor's Jira URL; in the e2e test hover that anchor with force. Running vitest from the repo root picks up .claude/worktrees and tests/e2e specs; exclude them: npx vitest run --exclude '.claude/**' --exclude 'tests/e2e/**'.

In the code:
- packages/jira-integration/src/linked.ts
- apps/web/src/use-jira-integration.ts, apps/web/src/jira-linked-context.tsx
- apps/web/src/DiagramPreview.tsx (refresh bar, hover card)
- tests/e2e/jira.spec.ts
