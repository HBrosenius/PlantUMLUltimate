---
title: "Local e2e runs can silently test another worktree's code through a leftover dev server"
author: Henrik
date: 2026-11-21
cost: { minutes: 184, tokens: 677404 }
id: l-24c19f81
scope: repo
status: active
src: agent
touches:
  - apps/web/package.json
  - apps/web/src/AddMenu.tsx
  - apps/web/src/App.tsx
  - apps/web/src/HelpDialog.tsx
  - apps/web/src/MindmapDiagramPreview.tsx
  - apps/web/src/NewDocumentDialog.tsx
  - apps/web/src/RenameSymbolDialog.tsx
  - apps/web/src/app/StatusBar.tsx
  - apps/web/src/app/WorkspaceDiagramPane.tsx
  - apps/web/src/app/build-source-editor.tsx
---

## Decided
When agents or other worktrees may have a Vite server running, run e2e against an isolated port with a server started fresh for the run.

## Tried and ruled out
Relying on the default config. It reuses whatever already answers on 127.0.0.1:5173, so a stale server from another worktree served old code and the results were wrong. Killing that server from the session was blocked by the permission classifier.

## Watch out
Delete the temporary config afterwards, and tell agents to stop the dev servers they start.

In the code: playwright.config.ts sets reuseExistingServer: true on port 5173. The workaround is a temporary copy using port 5174 and reuseExistingServer: false.
