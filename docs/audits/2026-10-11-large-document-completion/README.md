# Large-document completion — 2026-10-11

Implemented the remaining bounded UI work from [the current plan](../../large-document-next-steps-2026-10-11.md).

## Delivered

- Oversized renderer errors automatically expand the existing preview-details panel with actual dimensions, the engine limit, an explicit stale-preview explanation when applicable, and available source/Outline/task-table workflows. A **Continue editing** action dismisses the expanded panel so it does not cover editing controls. Unrelated errors retain their existing treatment. The source is not called invalid merely because rendering exceeds the size budget.
- The document navigator filters both member lists by name or diagram type, shows result counts and an empty state, clears the search, and sorts naturally by display name with a stable ID tie-breaker. Filtering and ordering do not mutate the stored manifest.
- Opening a document explicitly explains member selection and shows the navigator, including when reopening the same document after closing its navigator. Existing member selection, tab reuse, review and unsaved-change safeguards remain in place.
- The baseline-drag browser test now measures median date-column center spacing instead of the first two glyphs' left edges. At fitted zoom, glyph rounding made its backward movement too short: the source returned to October 3 instead of October 2. The corrected check explicitly asserts October 2 and passes in Chromium and Firefox. No scheduling algorithm was changed to make the test pass.

## Validation

Six focused unit files / **82 tests passed**. Repository ESLint, focused Prettier checks and production TypeScript/Vite build passed.

Browser checks completed before the final production workload rerun:

- Chromium and Firefox: corrected baseline drag, ordinary render failure, oversized preview explanation and recovery (six checks).
- WebKit: ordinary render failure and oversized preview explanation/recovery (two checks).
- Chromium: portable history save/reopen, document review/export, failed/cancelled saves and retry, and unsaved metadata protection including reopening the same document with its navigator hidden (four checks).

After adding Continue editing, the oversized-preview regression was rerun with dismissal assertions and passed in all three browsers. Final web TypeScript checks passed too. The local production preview was stopped after acceptance.

Production acceptance completed in **Chromium, Firefox and WebKit**:

| Workload     | Outcome in each browser                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50 diagrams  | Name search/open, empty search, clear search, late-member switching, and save/reopen passed; all sources, 250 history revisions and 24 links preserved.                                        |
| 200 diagrams | The same checks passed; all sources, 1,000 history revisions and 100 links preserved.                                                                                                          |
| 500 tasks    | Engine correctly rejected the oversized preview; guidance dismissal, Outline, expanding all 500 rows, first/last edits and Undo, exact-source save/reopen, and smaller-source recovery passed. |

The [initial production results](results.json) contain the six passing document cases and three early task-table attempts that did not dismiss the expanded guidance. That panel covered lower editing controls; the explicit dismissal action was added and verified. Use the [final oversized results](oversized-final-results.json) for the three completed 500-task workflows. Their `ok: false` reflects the expected engine-size rejection; `sizeLimitGuidance`, `smallerDocumentRecovered`, table/Undo and exact-source preservation checks passed, with no `survivalFailure`. No page errors were recorded in the final accepted cases.

The WebKit 200-member initial import/member render took about 32 seconds in this run. Passing preservation checks does not make large-document loading instantaneous, or close the original full 12-workload/browser matrix. These targeted checks replace the earlier uncertainty for these specific workflows only.

## Engine and zoom decisions

The installed browser engine remains pinned to `@plantuml/core` 1.2026.6. Its local README exposes DOM render and string-render callbacks, with no documented browser size-limit option. The upstream [FAQ](https://plantuml.com/faq) describes `PLANTUML_LIMIT_SIZE` and a Java command-line override; that does not establish a supported override for this TeaVM browser build. The [official change log](https://plantuml.com/changes) lists browser performance work in 1.2026.8, making a measured compatibility/upgrade evaluation a concrete future task. Neither document establishes that upgrading removes this browser dimension boundary. No dependency or bundled renderer cap was changed.

Existing preview Fit, zoom, Selected and Today navigation remain available. Fitting a large chart trades label readability for overview; this delivery improves finding diagrams and preserves Outline/task-table access rather than changing the default camera for every document. A broader zoom-policy change needs dedicated interaction validation.

## Scope limits

The fixtures are generated stress workloads, not private customer documents. File pickers/writes use the audit's in-memory handle adapter; actual compression, open/save and history paths run, but OS file errors and permissions are not established by those workloads. Browser timings are desktop observations. This is targeted acceptance, not a full release/PWA/collaboration certification. No deployment was performed.
