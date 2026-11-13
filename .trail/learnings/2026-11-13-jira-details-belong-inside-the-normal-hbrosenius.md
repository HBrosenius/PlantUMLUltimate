---
title: "Jira details belong inside the normal task card, and exports need their own marker path"
author: HBrosenius
date: 2026-11-13
branch: main
cost: { minutes: 7, tokens: 46726 }
id: l-053949e0
scope: repo
status: active
replaces: l-1e051aab
src: agent
touches:
  - apps/web/src/DiagramPreview.tsx
  - apps/web/src/use-jira-integration.ts
  - apps/web/src/App.tsx
  - tests/e2e/jira.spec.ts
---

## Decided
Linked Jira tasks show live status through the per-task status map; details, last-synced time, refresh and connect actions are shared with the preview through a small React context. Jira details are a section of the normal task hover card (same position, styling, open and close behaviour), not a separate popup: the user explicitly asked for one consistent card after seeing two different ones. Hovering the Jira link overlay on a bar resolves back to its task so it opens the same card. Exports use the renderer's raw SVG, which has no task groups, so markers are added through a separate path that uses the canonical overlay only to locate bars and draws onto the untouched raw SVG. Badge glyphs are shapes, not text, so they render the same everywhere.

## Tried and ruled out
A separate Jira-only hover popup (different place and format from the task card). Props through the workspace layers (too many components). Assuming the decorated preview SVG is what gets exported (it is not). Badge only left of the bar (clipped at the chart's left edge, so it moves right there).

## Watch out
The task card is taller with a Jira section: its bottom edge is clamped into the preview in a layout effect. Both the bar above the diagram and the task card offer Connect Jira, so e2e locators for that button must be scoped. A second role="status" in the Jira dialog breaks an existing strict locator. Running vitest from the repo root picks up .claude/worktrees, tests/e2e and worker tests: exclude them.

In the code:
- apps/web/src/DiagramPreview.tsx (hover-jira section, taskGroupFor, clamp effect)
- apps/web/src/render/jira-link-marker.ts, apps/web/src/jira-linked-context.tsx
- apps/web/src/use-jira-integration.ts, apps/web/src/App.tsx (decorateExportSvg)
- docs/jira-linked-tasks.md, tests/e2e/jira.spec.ts
