# A27 — Gantt Tasks view

Optional Tasks view beside Code / Split / Diagram. Desktop has an independent, resizable table/chart divider; at 900px and below, Table / Chart switches retain the current row draft. Names, progress and resource assignments across multiple rows are staged and applied together through validated source history. Invalid/stale drafts cannot apply. Explicit aliases, scheduling, comments and unrelated unsupported syntax are retained.

## Validation

- Full unit suite: 208 files, 2,225 tests passed.
- Final focused unit checks: 7 files, 359 tests passed (including shared Gantt operations).
- Production TypeScript/Vite build passed; changed-file ESLint and Prettier checks passed; `git diff --check` passed.
- All 24 browser checks passed across Chromium, Firefox and WebKit. Browser journeys cover synchronized selection, row validation, three-field editing, alias/dependency preservation, single undo/redo, draft recovery after source changes, narrow Table/Chart switching, desktop restoration, divider keyboard control and Details. Existing editing-mode settings journeys verify normal views, reload and phone layouts.
- Desktop and phone screenshots inspected: header and Apply/Cancel remain visible; the narrow table scrolls horizontally within its own pane.

## Evidence

- [Desktop](desktop.png)
- [Phone staged row](phone.png)

## Boundaries

Date/dependency cells and bulk paste are deferred. Drafts and Tasks view selection last for the app session. Milestones and reference-only tasks use the existing Details inspector. Source changes require explicit row reload or cancellation. The table starts with 100 rows and reveals more on request or selection. This is targeted validation, not a complete release regression run.

## Multi-row follow-up

Multiple row drafts remain editable together. Apply changes validates the entire batch before one source-history commit. Invalid rows preserve every draft and block Apply. Discard changes clears all staged edits; individual discard clears only that row. Source changes invalidate the complete batch and require explicit reload or discard. Linked WBS name updates accumulate into one linked-source update.

Full unit suite: 208 files / 2,227 tests passed. Nine updated browser journeys passed across Chromium, Firefox and WebKit, including an invalid second row, two task renames/progress edits and one-step undo/redo. Production build and changed-file lint/format checks passed. Literal aliases and renamed label references remain distinct, even when their spelling differs only by case.

## Direct editing and Duration — 2026-10-10

Edit buttons are removed. Regular task rows expose all fields immediately, including Duration with Days/Weeks/Months. Focus synchronizes chart selection; it does not stage a change. Changed fields create pending row drafts for the existing atomic Apply/Discard workflow. Unchanged rows are excluded.

Duration must be a positive whole number. Inline duration updates preserve surrounding dependencies and resource syntax. Explicit or relative end constraints and duplicate duration declarations require schedule adjustment through Details rather than introducing competing constraints. Milestones remain available through Details.

Validation: full unit suite passed 208 files / 2,234 tests before the final two edge-case tests; final helper/table unit checks passed 24 tests. All nine browser journeys passed across Chromium, Firefox and WebKit, including direct editing and duration/unit changes within a multi-row Undo transaction. Production build, changed-file lint/format and diff checks passed. Updated desktop/phone screenshots inspected.
