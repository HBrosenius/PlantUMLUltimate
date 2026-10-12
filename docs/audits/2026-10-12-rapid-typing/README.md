# Rapid typing responsiveness, 2026-10-12

Baseline application: `bf1277d`. The earlier audits measured complete edit-to-preview time. This follow-up separates editor DOM changes, the next animation frame and final preview completion during twelve individual keystrokes in a 200-diagram project.

## Finding and change

The editor DOM changed quickly, but substantial main-thread work ran before the next animation frame. A source-mapped Chromium CPU profile of the typing phase identified SVG parsing, DOMPurify, SVG insertion and geometry/layout work alongside parsing and scheduling calculations. `DiagramPreview` rebuilt canonical overlays from current source/task objects even while the renderer was still displaying an older SVG. This repeated work on each keystroke and associated new task metadata with old rendered geometry.

The app now passes the rendered source alongside its SVG. Canonical overlays, their calendar and legend metadata use that source snapshot, parsed once per rendered source. Ordinary source edits reuse the displayed overlays until a new render arrives. Resource filtering and schedule ghosts still update overlays; current-source task analysis and editor state remain current. Sanitization, renderer debounce, isolation and history recording are unchanged. Callers without a rendered source retain the previous behavior.

The regression test checks overlay reuse and SVG node identity while a new source is rendering, then verifies overlay task data and the displayed SVG refresh when the new rendered source arrives.

## Browser observations

| 200 diagrams, 12 keystrokes                | Chromium baseline | Chromium optimized | WebKit baseline | WebKit optimized |
| ------------------------------------------ | ----------------: | -----------------: | --------------: | ---------------: |
| Median keydown-to-next-animation-frame     |         152.65 ms |           62.25 ms |          301 ms |            92 ms |
| Maximum keydown-to-next-animation-frame    |         195.70 ms |           75.60 ms |          529 ms |           244 ms |
| Maximum keydown-to-editor-DOM-mutation     |           33.5 ms |              13 ms |           20 ms |            17 ms |
| Typing phase through final editor text     |            2.53 s |             1.57 s |          4.04 s |           1.63 s |
| Typing phase through current preview/index |            3.14 s |             2.15 s |          5.55 s |           3.11 s |

The optimized Firefox run measured a 47 ms median and 79 ms maximum next-frame delay; no matching Firefox baseline was collected. Every run preserved all typed characters, produced the final title in the preview, and restored the original source with one Undo. Save/reopen verified all 200 original sources, 100 links and 1,000 original revision contents and metadata.

These are separate local observations, twelve keystrokes per browser rather than randomized repeated trials. The next-animation-frame metric is a scheduling opportunity, not a physical paint measurement or input-queue latency. DOM mutation observation is not proof of paint. Playwright's 30 ms typing delay and command transport affect total typing time. Performance runs were completed before starting full validation and focused E2E checks. Sampling also affects the separate profiled run. Do not turn these values into hardware-independent pass/fail thresholds.

Retained evidence: `baseline.json`, `final.json`, the raw `baseline-typing.cpuprofile` and its source-mapped `baseline-profile-summary.json`. The profiling build used Vite production source maps and the installed trace-mapping package; no dependency was added.

## Validation

Full `npm run validate` passed: lint, formatting, 2,319 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production build and both worker dry-run builds. The initial full run exposed an existing race in the encrypted-history lifecycle test: awaiting one member did not await the other eager imports, which could then leak into the following test. The test now explicitly waits for all expected imports before checking them. Production history behavior was not changed.

Nine focused Chromium/WebKit E2E checks passed for rename, baseline reporting, filtering, multi-selection and drag behavior; the existing WebKit drag condition skipped one case. All six 50/200-diagram production workloads passed across Chromium, Firefox and WebKit, including rapid typing, final preview/index readiness, Undo and save/reopen integrity. The 50-diagram results are retained in `small-projects.json`; those were correctness runs concurrent with validation and are not used in the performance comparison. The benchmark now asserts the exact final title and preservation of intermediate typed prefixes; the saved 200-diagram snapshots were also checked against these stricter assertions.

`bf1277d` was pushed before this investigation.

## Reproduce

Build the app and serve production preview on port 4175. Set `LARGE_DOCUMENT_RUNS=1`, `LARGE_DOCUMENT_FILTER=^document-200$`, `LARGE_DOCUMENT_TYPING=1`, and a distinct `LARGE_DOCUMENT_OUTPUT`; run `node benchmarks/large-documents.mjs chromium firefox webkit`. The opt-in workload records per-key DOM-mutation and next-frame delays, final editor/preview readiness, and Undo, then performs the existing full save/reopen checks. Set `LARGE_DOCUMENT_PROFILE=1` with a source-map build for the Chromium typing CPU profile.
