---
title: "The done check on a Gantt bar anchors to the task's own contiguous bar, not every shape on its row"
author: HBrosenius
date: 2026-11-19
branch: ci/browser-coverage
cost: { minutes: 1, tokens: 60123 }
id: l-0e6a5450
scope: repo
status: active
src: agent
touches:
  - apps/web/src/render/canonical-gantt-overlay.ts
  - apps/web/src/render/canonical-gantt-overlay.test.ts
---

## Decided
The green done check sits at the end of the leftmost bar plus any segments within about 3 day-widths of it, so closed-day gaps inside one task still count.

## Tried and ruled out
Using the rightmost edge of all shapes crossing the label baseline. On a row not shared by several tasks, every such shape is accepted, so a stray wide rect pulled the check far to the right.

## Watch out
The stray shape was inferred from a screenshot, not confirmed on the user's diagram. The same bounds also feed hit area and progress fill, which still use all shapes.
In the code: apps/web/src/render/canonical-gantt-overlay.ts (done marker, near "gantt-done-marker"); test in canonical-gantt-overlay.test.ts.
