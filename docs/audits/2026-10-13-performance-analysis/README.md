# Performance analysis — 2026-10-13

The strongest opportunities are to reuse Gantt schedule analysis, stop rebuilding non-Gantt preview geometry during typing, reduce the cost of installing large Gantt SVGs, and separate recovery of document content from cursor/view-state persistence. Startup also pays for optional application features and unnecessary Graphviz preparation. These are opportunities in the current implementation, rather than a proposal to replace React, CodeMirror, or the PlantUML engine.

This document records the original analysis delivery, before application changes. Its baseline evidence is preserved. The fixes and subsequent measurements are documented in the [October 14 implementation report](../2026-10-14-performance-implementation/README.md).

## Scope and evidence

Baseline: `861a050` (full revision in [summary.json](summary.json)), with a clean application working tree. Production build passed. Tests ran on Windows, AMD Ryzen 9 3900X, 32 GB RAM, Node 24.14.1. Existing audits from October 11–12 were reviewed to avoid recommending work already delivered.

- Existing responsiveness benchmark: five fresh Chromium contexts, 12 open documents, approximately 490 KB of source/session data, 300-task code editing and 100-task split editing.
- New preview audit: Chromium and WebKit, four diagram types, three successive ten-character title edits in each context. Captures SVG assignment counts, bounding-box reads, keydown-to-next-animation-frame intervals, and renderer responses.
- Existing large-document audit: one 200-task Gantt and one 200-diagram project in each browser. Includes editing, navigation, recovery/save/reopen checks and project rapid typing.
- Isolated Node microbenchmarks: five warmups and 30 observations per operation, 100/500/1,000-object documents. A separate CPU profile measures 40 diagnostic analyses of a valid 1,000-task Gantt source.

The benchmark processes ran sequentially. Local preview is not a deployed-network test. CPU profiling and instrumentation add overhead; these numbers are observations on this desktop, not performance guarantees. The small preview startup measurement includes an explicit 400 ms settling interval and should not be interpreted as a paint metric. Keydown-to-rAF is a scheduling measurement, not field INP or proof of physical paint. WebKit does not expose the same long-task observer: its recorded zero long tasks does **not** mean no blocking occurred.

The web-perf skill's Chrome DevTools MCP workflow could not run: its required tools are unavailable. The skill says, “If unavailable, STOP—the chrome-devtools MCP server isn't configured.” That specific workflow was stopped and repository-based Playwright/CPU analysis was used instead. [Skill source](C:/Users/henri/.codex/skills/web-perf/SKILL.md). No Lighthouse score, LCP rating, or field Core Web Vitals claim is made.

The first preview harness instrumented child frames and used Playwright's service-worker blocking; it produced sandbox access errors. Its results remain in `preview-pilot.json` but are excluded from accepted measurements. The corrected harness instruments only the main frame and allows the application's normal service worker. All eight accepted preview cases and four large-workload cases recorded zero page errors.

## Measured baseline

| Current production workload                                 | Chromium | WebKit |
| ----------------------------------------------------------- | -------: | -----: |
| 200-task Gantt, initial preview                             |   2.76 s | 8.29 s |
| 200-task Gantt, subsequent title edit through preview       |   1.83 s | 4.78 s |
| PlantUML engine portion of that title edit                  |   0.88 s | 1.69 s |
| 200-diagram project, opening through first selected preview |   2.19 s | 6.24 s |
| Project rapid typing: median keydown-to-next-frame          |  42.4 ms |  83 ms |
| Project rapid typing: maximum keydown-to-next-frame         |  50.3 ms | 169 ms |

Large-case timings are one observation per browser, not repeated medians. Both project runs preserved all 200 original diagrams, 100 links and 1,000 original retained revisions. The twelve-character typing burst was undone in one step. Historical audit timings are not used as an A/B comparison.

## Recommended implementation order

| Order | Change                                                                         | Expected benefit                                                              | Effort / main constraint                                                     |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Share Gantt schedule/diagnostic results per source snapshot                    | High for large-document typing; removes demonstrably repeated computation     | Medium; preserve date/time-zone and repair semantics                         |
| 2     | Keep preview geometry tied to the rendered source; update selection separately | High as Sequence/Class/WBS diagrams grow                                      | Medium; preserve hit targets, focus, dragging and stale-preview behavior     |
| 3     | Optimize large Gantt SVG matching and installation                             | High for dense previews, particularly WebKit                                  | Medium–large; measure each phase and preserve sanitization                   |
| 4     | Separate navigation persistence from content recovery                          | Moderate now, increasing with workspace size                                  | Medium; crash recovery and encrypted-document exclusions must remain correct |
| 5     | Lazy-load optional UI; defer Graphviz preparation and coordinate precaching    | High potential for cold/slow-network startup; unquantified end-to-end savings | Medium; retain offline availability and loading/error behavior               |
| 6     | Incrementally maintain the multi-diagram declaration/link index                | Medium for large projects                                                     | Medium–large; cache invalidation and link identity                           |
| 7     | Gate inactive settings/parsers and reduce shell rerenders                      | Small individually; useful follow-up cleanup                                  | Small–medium; avoid stale derived state                                      |

### 1. Reuse Gantt schedule analysis before adding more workers

`App.tsx:1078` reads diagnostics and quick fixes synchronously on each source change. The 120 ms CodeMirror linter delay in `diagram-language-extensions.ts` does not defer those reads. The shared analyzer already prevents repeated reads of the same diagnostic result by the app and editor, so adding another generic diagnostic cache would miss the main duplication.

Within that analysis, `ganttDiagnostics` (`gantt-language.ts:503`) calls `dependencyConflictFixes`, which resolves the complete schedule, and then resolves it again directly. `ganttQuickFixes` (`:592`) calls `dependencyConflictFixes` again. That is three baseline schedule resolutions inside one diagnostics-plus-fixes evaluation, before the separate resolutions in `App.tsx:1156` and `DiagramPreview.tsx:324`. Candidate repairs can trigger additional work.

| Valid Gantt tasks | Fresh parse, median | Diagnostics + quick fixes, median | One schedule resolution + calendar, median |
| ----------------- | ------------------: | --------------------------------: | -----------------------------------------: |
| 100               |             0.78 ms |                           4.37 ms |                                    1.08 ms |
| 500               |             3.98 ms |                          20.32 ms |                                    5.24 ms |
| 1,000             |             7.38 ms |                          40.60 ms |                                   10.50 ms |

These are Node component timings. The diagnostic measurement receives an already-parsed Gantt model, matching the app's intended sharing. The CPU profile attributes approximately 34.6% of samples to `shiftIsoDateSafely`, 11.5% to `isWorkingDate`, and 9.0% to `validIsoDate`; date/calendar work dominates, rather than keyword repair or React.

Create a source-owned analysis context containing the parsed model, calendar, resolved dates, duration conflicts and dependency-conflict repairs. Reuse it for diagnostics, fixes and compatible UI consumers. Preserve distinct contexts when time zone, today's date, forecast settings, baseline source or candidate repair source differs. Do not globally memoize dates without those inputs.

Removing two redundant baseline solves addresses roughly 21 ms of standalone schedule work at 1,000 tasks in this fixture. That is a work-removal estimate, **not** a measured 21 ms application speedup. Verify it with before/after profiling. If larger documents still block input, then move pure analysis into a cancellable worker with source-revision checks; keep editor text/undo immediate and bind fixes to their original source snapshot. Wrapping synchronous work in a promise alone will not move it off the main thread.

### 2. Reuse the displayed preview's geometry

Gantt already associates its canonical overlay with `renderedSource`. Sequence and Class have not adopted the same boundary: their layout effects assign `innerHTML` and annotate geometry when source-derived models or selection change (`SequenceDiagramPreview.tsx:111–241`, `ClassDiagramPreview.tsx:148–298`). WBS avoids replacing the canonical SVG for these edits but still reruns geometry annotation (`WbsDiagramPreview.tsx:475`).

For each ten-character title edit, **before any new renderer response**, both browsers consistently recorded:

| Fixture                               | SVG `innerHTML` assignments | `getBBox` calls |
| ------------------------------------- | --------------------------: | --------------: |
| Sequence: 8 participants, 60 messages |                          10 |             760 |
| Class: 15 classes                     |                          11 |             660 |
| WBS: root + 60 nodes                  |                           0 |             671 |

Across 30 keystrokes, median next-frame intervals were 11.8/10.3/10.4 ms respectively in Chromium and 35/30/25 ms in WebKit. These moderate diagrams are already reasonably responsive in Chromium; the counts establish unnecessary work, not a claim that every diagram currently feels slow.

Parse the rendered source once, build its geometry once per SVG/geometry-affecting revision, and apply selection classes, accessibility state and connection handles independently. Batch geometry reads before DOM writes where possible. Avoid treating an old SVG's geometry as belonging to newly edited source; resolve actions against current source and disable actions that cannot be mapped safely. The same pattern deserves verification in Use Case and Activity, which were inspected but not benchmarked here.

Acceptance: title typing leaves displayed geometry stable until a new SVG arrives; selection remains immediate; source navigation, focus restoration, keyboard editing, drag/drop, reconnect and Undo continue to work. [Browser guidance on separating layout reads and writes](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing).

### 3. Reduce large Gantt SVG work

The 200-task fixture produces 7,223 SVG elements. Its Chromium initial preview included a 777 ms main-thread task; the subsequent title edit included a 293 ms task. WebKit's initial maximum timer delay was 3.44 s. The engine accounted for only 0.88 s of a 1.83 s Chromium edit and 1.69 s of a 4.78 s WebKit edit. The remainder includes debounce, messaging, preparation, SVG work and benchmark overhead; it cannot all be attributed to the overlay.

`canonical-gantt-overlay.ts:436` still searches labels and scans shape collections per task. Geometry values are cached, but matching remains approximately tasks × candidate shapes. Build a label index and a vertical-range index over the existing cached geometry, preserving original order, inclusive row predicates, shared-row date disambiguation and milestone rules.

Separately measure sanitization, XML parsing, overlay construction, serialization, DOM installation and resulting layout. The current path sanitizes incoming renderer SVG (`use-renderer.ts:264`), parses the overlay input (`canonical-gantt-overlay.ts:218`), and sanitizes the decorated markup in `DiagramPreview.tsx:2033`. Explore a coherent DOM/fragment pipeline to reduce conversions only after proving each trust boundary remains covered; do not simply delete sanitization. Keep canonical export independent of interactive decorations.

Do not start by replacing all diagrams with canvas or virtualizing arbitrary SVG subtrees: text measurement, connectors, selection, accessibility and exports make those materially larger projects. Optimize the demonstrated pipeline first.

### 4. Stop rewriting source snapshots for cursor movement

`App.tsx:4554` persists cursor updates through workspace state. Every session change calls `saveWorkspaceRecovery` immediately (`use-persisted-workspace.ts:40`); that serializes the recovery snapshot and writes both scoped and shared local-storage copies (`workspace-storage.ts:771`). The delayed IndexedDB save writes the recovery copies again.

Five-run Chromium medians for the 490 KB workspace:

| Interaction            | Recovery writes | Local-storage time | Serialization time |
| ---------------------- | --------------: | -----------------: | -----------------: |
| 20 cursor moves        |              42 |            24.8 ms |            11.3 ms |
| Typing benchmark burst |              50 |            30.9 ms |            15.3 ms |
| 10 tab switches        |              40 |            24.7 ms |            16.0 ms |

This is measurable overhead but was not the largest latency source in the current fixture. Separate content revisions from cursor/zoom/scroll metadata. Coalesce navigation-state updates, avoid no-op updates, and persist changed documents rather than repeatedly serializing unchanged sources where the recovery format allows it. Keep content durability explicit: do not merely debounce all recovery writes and assume `beforeunload` will always run. Test reload, forced interruption, quota fallback, multiple windows and encrypted-document exclusions.

### 5. Reduce startup execution and renderer preparation

The production HTML preloads all four application JavaScript chunks:

| Asset                            |       Raw size | Locally calculated gzip size |
| -------------------------------- | -------------: | ---------------------------: |
| Application index                |     1,790.8 KB |                     452.8 KB |
| CodeMirror/editor vendor         |       395.5 KB |                     128.5 KB |
| React vendor                     |       192.4 KB |                      60.3 KB |
| Diagram engines                  |       127.9 KB |                      36.4 KB |
| **Initial application JS total** | **2,506.6 KB** |                 **678.0 KB** |
| PlantUML renderer asset          |     7,152.2 KB |                   1,413.5 KB |
| Graphviz asset                   |     1,445.4 KB |                     600.6 KB |

Gzip values are file calculations, not verified deployed transfer sizes. `App.tsx` eagerly imports Jira, history/review, reports, scenario planning, presentation, all inspectors and all previews. Vendor chunking organizes downloads but does not defer these features. Start with conditionally mounted dialogs and their exclusive dependencies using module-level `React.lazy` and scoped Suspense boundaries. [React's supported lazy-loading API](https://react.dev/reference/react/lazy). Verify dependency graphs so an eager shared import does not pull the feature back into the initial chunk. Consider deferring CodeMirror in diagram-only startup separately.

`loadRendererAssets` (`renderer-assets.ts:18`) fetches and base64-encodes engine, Graphviz, worker and icons together. Graphviz execution is conditional, but its fetch and encoding are not. Native-layout Gantt/Sequence/WBS previews need not wait on Graphviz preparation. Split asset promises by requirement and initialize Graphviz only when a graph-layout diagram needs it. This targets a concrete 1.45 MB raw asset plus encoding/copying; end-to-end savings still need measurement.

`vite.config.ts` precaches every emitted asset, and `pwa.ts` registers the service worker immediately. Code-only startup can therefore download renderer assets in the background despite the renderer being unloaded. Coordinate priorities: load the editor/current preview first, then finish offline assets. Preserve the product's offline readiness guarantee and handle an interrupted download explicitly. Lazy-loading UI alone will not reduce the full-install byte total while every chunk remains precached.

### 6. Update project indexes incrementally

The existing improvements correctly hash each member once per indexing invocation and count links in a single pass. However, `use-single-file-project.ts:273` starts a full `resolveIndex` after the 200 ms source-change debounce, and `project-index.ts:100` rebuilds declarations/hashes for all available members. The lightweight immediate index also scans elements/links per member. Per-parser last-source caches do not retain all 200 members.

Use a project-owned cache keyed by member identity, kind and source revision, retaining unchanged declaration sets and hashes. Re-resolve changed locators and affected links, and update lightweight member metadata without clearing useful unchanged declaration information. Invalidate on member deletion/replacement, project replacement, encryption lifecycle changes and identity mapping. Retain cancellation and stale-generation guards.

The current 200-member first-preview times are 2.19/6.24 s, with rapid typing frame medians 42.4/83 ms in Chromium/WebKit. These demonstrate remaining latency, but this audit does not isolate the incremental index's prospective contribution. Add per-stage spans before estimating savings. Avoid promising the historical opening-time reduction again: lazy unencrypted member-history restoration is already delivered.

### 7. Small follow-ups and areas to profile later

`App.tsx:479` unconditionally parses source through the Gantt adapter, including non-Gantt documents. Four settings parsers also run inline for inspectors even when closed (`:5798`, `:5821`, `:5851`, `:5888`). Gate them by active kind/visibility and memoize by source. The four settings parsers together cost approximately 0.61 ms for 1,000 Gantt tasks or 2.36 ms for 1,000 classes in the retained microbenchmark, much less than Gantt diagnostic work. Treat these as inexpensive cleanup rather than the principal fix. Sequence/Class/WBS parsers already cache their last source; the revised microbenchmark distinguishes cache hits from changed-source parses.

After that, split frequently changing editor/cursor state from the large app shell and introduce memoized boundaries with stable props where profiles justify them. Moving functions to another file or adding `memo` while passing new callbacks/objects every render will not establish an effective boundary.

Long-session worker/cache memory, encrypted project opening, baseline/forecast overlays, resource-heavy schedules, collaborative editing and external-file polling deserve dedicated workloads. External-file polling currently reads/hashes native file bytes every five seconds while visible, but unchanged digests already avoid decoding. Do not replace that with an unverified timestamp-only shortcut. No production backend throughput or real-device mobile performance was measured in this audit.

## Validation and reproduction

The build and selected browser workload assertions passed. The full unit/E2E release suite was not run because application behavior was not changed. Future implementations should run focused correctness checks first, then required release validation.

From the repository root:

```powershell
npm run build
node benchmarks/responsiveness.mjs
node docs/audits/2026-10-13-performance-analysis/preview-audit.mjs chromium webkit
node docs/audits/2026-10-13-performance-analysis/analysis-costs.mjs
node docs/audits/2026-10-13-performance-analysis/diagnostics-profile.mjs
```

For the large workloads, start production preview on port 4175 in another terminal, then:

```powershell
$env:LARGE_DOCUMENT_RUNS='1'
$env:LARGE_DOCUMENT_FILTER='^(gantt-200|document-200)$'
$env:LARGE_DOCUMENT_TYPING='1'
$env:LARGE_DOCUMENT_OUTPUT='docs/audits/2026-10-13-performance-analysis/large'
node benchmarks/large-documents.mjs chromium webkit
node docs/audits/2026-10-13-performance-analysis/summarize.mjs
```

Use a new output directory when preserving prior observations. Evidence: [summary](summary.json), [five-run responsiveness log](responsiveness.txt), [accepted preview data](preview-results.json), [large workload data](large/results.json), [component timings](analysis-costs.json), [raw diagnostic CPU profile](diagnostics.cpuprofile). The raw CPU profile's generated bundle can be recreated by `analysis-costs.mjs`.

For the first implementation, I recommend shared Gantt analysis and preview geometry reuse as separate, measured changes. Follow with recovery persistence and startup splitting; keep the larger SVG and project-index changes independently reviewable. No dependency upgrade or renderer-limit change is needed to begin.
