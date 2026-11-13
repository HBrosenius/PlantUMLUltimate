---
title: "Jira markers must be added to exports separately, because exports use the renderer's raw SVG"
author: HBrosenius
date: 2026-11-13
branch: main
cost: { minutes: 32, tokens: 130250 }
id: l-1e051aab
scope: repo
status: active
replaces: l-c19342c4
src: agent
touches:
  - apps/web/src/use-jira-integration.ts
  - apps/web/src/App.tsx
  - apps/web/src/app/use-export-actions.ts
  - tests/e2e/jira.spec.ts
---

## Decided
Linked Jira tasks show live status through the per-task status map, with issue details, last-synced time, refresh and connect actions shared through a small React context. Preview markers are drawn on the interactive SVG. Exports (SVG, PNG, PDF, copy image, export dialog) use the renderer's raw SVG, which has no task groups, so they get markers through a separate path: the canonical overlay is used only to locate each bar, and markers are drawn onto the untouched raw SVG. Badge glyphs are shapes, not text, so they render the same in any export.

## Tried and ruled out
Passing refresh and details as props through the workspace layers (too many components). Assuming the preview's decorated SVG is what gets exported (it is not; the first version silently left markers out of exports). Putting the badge only to the left of the bar (clipped for bars at the chart's left edge, so it moves to the right there).

## Watch out
Linked tasks get a link overlay (an anchor) over the bar: the hover card must also match on the anchor's Jira URL, and the e2e test hovers it with force. A second role="status" inside the Jira dialog breaks an existing strict locator. Running vitest from the repo root picks up .claude/worktrees, tests/e2e and worker tests: exclude them.

In the code:
- packages/jira-integration/src/linked.ts
- apps/web/src/use-jira-integration.ts, apps/web/src/jira-linked-context.tsx
- apps/web/src/render/jira-link-marker.ts (preview and export variants)
- apps/web/src/App.tsx (decorateExportSvg), apps/web/src/app/use-export-actions.ts
- docs/jira-linked-tasks.md, tests/e2e/jira.spec.ts
