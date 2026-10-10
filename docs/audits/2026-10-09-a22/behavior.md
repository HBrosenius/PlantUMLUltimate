# A22 — Gantt operations through Add

Revised after usability review: Add contains Task, Milestone, Divider and Closed day. All four entries work without a prior task selection, and the same menu appears with a task selected. Dependency, resource assignment and task note remain in existing task inspector/contextual editing flows. Their Add callbacks, selection guidance and focus-routing state were removed.

Closed day opens the existing Calendar & schedule inspector at Add exception. The existing exception form defaults to closed; opening the route does not create a row or mutate source. Calendar validation, mutation and undo are reused.

Direct note selection continues to reveal its Appearance section before focusing the textarea.

## Revision validation

- Focused menu/task unit tests: two files, five tests passed (`/tmp/a22-revision-unit.log`).
- Production TypeScript/Vite build passed (`/tmp/a22-revision-build.log`). Changed-file ESLint and Prettier checks passed.
- `tests/e2e/gantt-add-operations.spec.ts` verifies the same four Add entries with and without selection, availability of task inspector controls, phone access, and closed-day editing/undo across Chromium, Firefox and WebKit (`/tmp/a22-revision-browser3.log`).
- Updated `a22-add-phone.png` was inspected and shows the simplified menu at 390 × 844.

The original implementation passed the full 201-file / 2,159-test unit suite before this revision.
