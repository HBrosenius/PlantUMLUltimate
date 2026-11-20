---
title: "A Gantt task may start after several predecessors; it starts after the latest one, and that is not flagged"
author: HBrosenius
date: 2026-11-20
branch: main
cost: { minutes: 2, tokens: 81387 }
id: l-95b5561e
scope: repo
status: active
replaces: l-ac49bdff
src: agent
touches:
  - packages/diagram-gantt/src/parser.ts
  - apps/web/src/gantt-language.ts
  - apps/web/src/gantt-schedule.ts
  - apps/web/src/gantt-progress-forecast.ts
  - apps/web/src/gantt-repeated-anchor-repairs.test.ts
---

## Decided
Several "starts at [X]'s end" lines for one task from different predecessors are valid and get no warning. The app's own scheduler (planned dates) and the progress forecast both start the task after the latest of those constraints, and the forecast overlay highlights that latest predecessor as the cause. Real project plans need this (a test phase waiting for both front end and back end).

## Tried and ruled out
A "duplicate-start" warning with a "remove this start constraint" fix (added Nov 19). It told users to keep only one predecessor, contradicting the app's own scheduling model; the user pointed out that a task must be able to depend on several earlier tasks. Removed.

## Watch out
Same-predecessor disagreements still get the "conflicting-dependency" warning, and a doubled anchor like "'s end's end" is still an error with its own repair. Real PlantUML's handling of several start lines was never checked against PlantUML itself.

In the code:
- apps/web/src/gantt-schedule.ts: resolveTaskDates, `choose` takes the latest "after" constraint
- apps/web/src/gantt-progress-forecast.ts: solve, causeTaskIds
- apps/web/src/gantt-repeated-anchor-repairs.test.ts: regression test for several predecessors
