---
title: "Duplicate Gantt start constraints are flagged without choosing a winner, and the fix only deletes whole standalone lines"
author: HBrosenius
date: 2026-11-19
branch: ci/unit-test-coverage
cost: { minutes: 5, tokens: 41475 }
id: l-ac49bdff
scope: repo
status: active
src: agent
touches:
  - packages/diagram-gantt/src/parser.ts
  - apps/web/src/gantt-language.ts
---

## Decided
Several start constraints on one task from different predecessors get a warning, and each offers "remove this line". The tool does not guess which one PlantUML honours, because the existing same-predecessor warning says "most restrictive wins" and that was never confirmed against PlantUML itself.
Removal is only offered when the constraint is the whole line, so a trailing "and lasts N days" is never deleted.

## Tried and ruled out
Silently keeping the last constraint: it assumes "later overrides", which is unverified.

## Watch out
Run unit tests with `npm run test:unit`. A bare `npx vitest run` also picks up `.claude/worktrees` copies and the Cloudflare worker suites, which fail for unrelated reasons.

In the code:
- packages/diagram-gantt/src/parser.ts: `duplicate-start` diagnostic, next to `conflicting-dependency`
- apps/web/src/gantt-language.ts: `quickFixesForDiagnostics` (the `duplicate-start` fix and the repeated-anchor pattern in `syntaxRepairs`)
- apps/web/src/gantt-repeated-anchor-repairs.test.ts
