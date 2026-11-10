---
title: Splitting the big app component into hooks fails where code refers to values declared further down
author: HBrosenius
date: 2026-11-10
branch: claude/unruffled-lalande-872173
cost: { minutes: 20, tokens: 214936 }
id: l-44e11457
scope: repo
status: active
src: agent
touches:
  - apps/web/src/App.tsx
  - apps/web/src/app/build-presentation-data.ts
  - apps/web/src/app/build-apply-semantic-rename.ts
  - apps/web/src/app/use-outline-mode-effects.ts
  - apps/web/src/app/use-linked-diagram-summary.ts
  - apps/web/src/app/use-dialog-kinds.ts
  - apps/web/src/app/DiagramDialogs.tsx
  - apps/web/src/app/WorkspaceDiagramPane.tsx
  - apps/web/src/app/WorkspaceMain.tsx
  - apps/web/src/app/lazy-diagram-dialogs.tsx
---

## Decided

Extract App.tsx in typecheck-gated steps: JSX chunks become components with typed props, logic ranges become hooks or builders. Revert any step where tsc fails.

## Tried and ruled out

Extracting early logic (parsed documents, outline reveal, symbol-adjacent code) into hooks: closures there reference consts declared later (update, commitGeneratedSource), so passing them as hook inputs reads them before assignment. Reordering declarations was ruled out because it changes effect order.

## Watch out

Functions named use* must not follow the early return for hydration unless they are real hooks; name non-hook builders build*. Moving effects into hooks makes lint demand stable setters and refs as deps; add them.

In the code: apps/web/src/App.tsx, apps/web/src/app/*
