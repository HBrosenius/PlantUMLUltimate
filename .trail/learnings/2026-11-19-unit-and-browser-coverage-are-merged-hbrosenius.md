---
title: "Unit and browser coverage are merged as Istanbul data, because mixing V8 and Istanbul does not line up"
author: HBrosenius
date: 2026-11-19
branch: ci/browser-coverage
cost: { minutes: 40, tokens: 90398 }
id: l-f011f1ef
scope: repo
status: active
src: agent
touches:
  - apps/web/src/gantt-language.ts
  - apps/web/src/gantt-repeated-anchor-repairs.test.ts
  - packages/diagram-gantt/src/parser.ts
  - vitest.coverage.config.ts
  - apps/web/vite.config.ts
  - ".github/workflows/ci.yml"
---

## Decided
Both unit (Vitest) and browser (Playwright) coverage use the Istanbul format and are merged by a script. Browser coverage runs only in Chromium, in its own CI job, so it can never slow or fail a required check.

## Tried and ruled out
- Keeping Vitest on V8 and converting browser V8 data: the two converters produce different statement maps, so a merge would not line up.
- Flushing browser coverage from the page to the dev server on pagehide: closing a test page does not reliably fire it, so data would be lost silently.

## Watch out
- Remapped browser coverage has Infinity end columns, while unit JSON has null. Without a JSON round trip the keys never match and the combined totals roughly double.
- Merging mutates the maps it is given. Build the unit-only, browser-only and combined maps from separate loads, or the unit row is wrong.
- Browser shards run in a container, so absolute paths differ from the unit job. The merge script re-roots paths under apps/web and packages.
- Specs import test and expect from ./coverage. A spec that imports from @playwright/test directly is silently not measured.

In the code:
- tests/e2e/coverage.ts, scripts/merge-coverage.mjs, vitest.coverage.config.ts
- apps/web/vite.config.ts (coveragePlugins), .github/workflows/ci.yml (coverage-browser, coverage)
