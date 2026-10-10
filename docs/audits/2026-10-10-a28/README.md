# A28 — Saved what-if scenarios

Plan → What-if scenario saves named browser-local alternatives for the active diagram identity. A save retains exact base/alternative sources, capacities, assumption notes and an update timestamp. Saving never changes the diagram. Open, new, update, save as new and confirmed deletion are explicit actions. Unsaved work survives cancelled close/switch actions; failed storage never claims success.

Comparison uses the saved base and capacities. Stale source/capacity assumptions disable Apply. Reconciliation keeps nonoverlapping line changes, requires explicit choices for overlapping changes, validates the result and returns to source review against the current plan. Apply verifies the expected base again before committing through normal source history.

## Validation

- Full unit suite: 209 files / 2,247 tests passed.
- Production TypeScript/Vite build passed.
- Changed-file ESLint, Prettier and diff checks passed.
- Eighteen scenario/planning-menu browser checks passed across Chromium, Firefox and WebKit.
- Existing rendered-preview scenario editing passed in Chromium and Firefox; its pre-existing WebKit SVG-pointer skip remains.
- Final desktop/phone evidence capture passed two Chromium journeys.
- Initial Chromium planning-menu keyboard/viewport journey failed before opening any scenario; it passed unmodified on the final cross-browser run.
- Desktop/phone screenshots inspected: compact review exposes the patch/impact, fixed actions remain reachable, phone storage errors are visible.

## Evidence

- [Desktop source review](desktop.png)
- [Phone storage error](phone.png)

## Limits

Browser-local storage, scoped to the recovered diagram identity; not embedded in saved files or shared. Twenty alternatives / 2 MB total, with 500,000 characters / 5,000 lines per source. Invalid or corrupt libraries are not overwritten. Line-based reconciliation deliberately requires choices for overlapping changes. Branch ancestry, portable persistence and comparisons between several alternatives at once remain deferred.
