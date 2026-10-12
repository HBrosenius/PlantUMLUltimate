# Preview recovery and rendering lifecycle, 2026-10-12

Application under test: `0713174`. Follow-up to the rapid-typing change, checking that retained previews, delayed renderer replies and history operations remain associated with the active document and source.

## Controlled renderer tests

`apps/web/src/render/use-renderer.test.tsx` exercises the real renderer hook with a controlled iframe message boundary, mocked asset/font loading and fake debounce timers. It drives request/reply ordering explicitly rather than depending on a slow machine or an arbitrary sleep:

- A delayed success or error from an obsolete request cannot become the latest preview. The queued latest request is sent and its successful result becomes current; a duplicate obsolete reply is ignored.
- Switching documents retires the old frame. Its later success/error replies cannot populate or fail the active document's preview.
- A failed current render retains both the SVG and source of the previous valid render, then a correction clears the error and becomes current.
- Undo can restore a cached original while an edit is still in flight. Redo supersedes that old request, so its late result cannot masquerade as the current revision even when the source strings match.

These tests check state transitions, request identities, document/source ownership and resulting SVGs. They do not test the PlantUML engine itself; the browser scenarios below cover real rendering.

## Real-browser scenarios

`tests/e2e/preview-recovery.spec.ts` adds two scenarios in Chromium, Firefox and WebKit. All six passed, without skips, in the focused run:

1. Enter invalid syntax, verify the last valid preview is explicitly labeled, Undo to the exact original source, Redo to the exact invalid source, then correct it and verify the latest preview is current with no old title.
2. Start rendering a 150-task update in document A, switch to B while the preview reports rendering, verify B's exact source and current preview, return to A and use Undo/Redo, then verify the latest 150-task preview and absence of B's title.

The controlled hook tests establish delayed-reply behavior deterministically; the browser tests establish the application/editor/history/rendering integration. Browser rendering status alone is not proof that a worker request is already in flight at the instant of the tab switch.

No production defect was observed in these scenarios, so this change adds regression coverage without changing runtime behavior. `pushed-ci.json` records the available status of CI for the preceding `0713174` push, not CI for these new local tests.

Full `npm run validate` passed: lint, formatting, 2,323 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production application build and both worker dry-run builds. The six focused browser tests also passed. CI for `0713174` had no reported failures at the final check, with browser shards still running.

## Reproduce

Run `npx vitest run apps/web/src/render/use-renderer.test.tsx` and `npx playwright test tests/e2e/preview-recovery.spec.ts --project=chromium --project=firefox --project=webkit`. The browser tests use the existing Playwright development server configuration and fresh seeded two-document sessions.
