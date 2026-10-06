# Save and recovery release candidate

This release protects unsaved document changes and makes file-save and local-recovery status visible.

## Changes

- New, imported, and locally recovered documents remain unsaved until a file save succeeds.
- The document navigator distinguishes file-save status from local recovery status.
- Edited diagrams remain part of the document after their editor tabs close, so subsequent saves and recovery retain those edits.
- New, Open, Import, linked WBS/Gantt creation, and Close offer Save, Discard, or Cancel when the current document has unsaved changes. Browser unload also warns about unsaved changes.
- Failed or cancelled saves retain edits and give actionable feedback. Cancellation aborts staged writes before commit when possible.
- A save that finishes after a different document is opened cannot mark the replacement saved or attach the previous document's file handle or review baseline.
- Workspace backup import validates the complete payload and remaps document, history, and version identifiers. A checkpoint downloads before restore, and failed or cancelled restoration retains the current workspace.

## Recovery limits

Local recovery is browser storage, not a saved document file. Encrypted document tabs are omitted from the workspace checkpoint; the restore confirmation explains this before replacement. Reopen the encrypted `.pumlu` file to unlock it.

## Validation

The staged release candidate was exported into an isolated checkout, excluding unrelated repair-workspace and demo changes.

- Lint, formatting, TypeScript, and web and Worker builds passed.
- 1,904 unit tests, 8 collaboration Worker tests, and 9 integration Worker tests passed.
- Production PWA checks passed in Chromium and WebKit: 6 tests.
- Live collaboration checks against a local Durable Object passed: 2 tests, including offline edits and document management.
- Full Chromium, Firefox, and WebKit browser matrix: 838 passed, 34 skipped, 4 failed on the initial run (876 total).
- The Firefox version-history rename failure exposed a test initialization race. The test now waits for the selected version name to load before renaming; the revised test passed 9 repetitions across the three browsers.
- WebKit shortcut-focus and viewer-link join checks each passed 3 isolated repetitions after failing in the matrix. These remain intermittent failures rather than a clean full-matrix pass.
- The WebKit Class tooltip preview check failed 2 of 3 isolated candidate repetitions and 1 of 3 repetitions on unchanged HEAD. This is a pre-existing browser issue outside the save/recovery change.

## Deployment gate and next action

The save/recovery candidate is committed independently of unrelated local changes. The full browser matrix is not green. Resolve the WebKit Class tooltip interaction in a separate focused task, investigate the intermittent focus and join checks, and obtain deployment approval before publishing.

Worker builds are dry runs. This candidate has not been deployed.
