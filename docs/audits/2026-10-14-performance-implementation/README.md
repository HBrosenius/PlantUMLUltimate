# Performance implementation — 2026-10-14

Implements the concrete work identified by the [October 13 audit](../2026-10-13-performance-analysis/README.md). The original evidence is preserved separately. Changes are local, based on `861a050`.

| Priority                   | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Gantt analysis      | Weakly owned analysis contexts share calendars, resolved dates and duration/dependency repairs between diagnostics, quick fixes and compatible UI consumers. Contexts distinguish source, time zone and a pinned date snapshot; candidate repairs parse each candidate once and stay separate from baseline models. The main preview receives the owner's resolved dates.                                                                                                                                                           |
| Displayed preview geometry | Sequence, Class/Component and WBS use the model belonging to the displayed SVG. Selection updates run separately; Class relationship endpoints and WBS connection controls reuse measured geometry. Stable WBS decoration maps avoid reannotation for equivalent values. Stale previews retain navigation while editing their old IDs is blocked. WBS now explicitly suppresses the click following a drag instead of relying on SVG replacement to suppress it.                                                                    |
| Gantt SVG matching         | A text index preserves first-unclaimed label matching, including resource suffixes. An immutable augmented interval tree queries candidate shapes by row while preserving SVG order and inclusive edges. Existing shared-row, milestone and date predicates remain in place. The final sanitized DOM fragment is installed directly, eliminating a serialization/reparse conversion while retaining both sanitization boundaries and canonical exports. Latest-only phase timings cover the pipeline without retaining source text. |
| Recovery persistence       | Content changes still write synchronous recovery copies immediately. Navigation uses a small scoped sidecar, coalesced for 150 ms and flushed on page hide or explicit navigation flush. Cursor-only changes do not increment content revisions or trigger full IndexedDB source saves. Older sidecars cannot override newer content recovery, and encrypted/excluded documents are filtered. No-op workspace/tab updates are skipped.                                                                                              |
| Startup                    | Six optional dialogs use module-level lazy imports with local loading boundaries. Renderer assets cache individual requests; native Gantt/Sequence/WBS preparation omits Graphviz. Service-worker registration waits for the initial editor, chooser or preview to become ready, then retains the full offline precache.                                                                                                                                                                                                            |
| Project indexing           | A project-owned cache retains unchanged declaration hashes, source hashes and locator resolutions. Source/kind/member/project identity changes invalidate the relevant entries; locked/missing and deleted members are evicted. The immediate navigator index counts links in one pass and preserves unchanged declarations. Existing cancellation and stale-result guards remain.                                                                                                                                                  |
| Inactive parsing           | Non-Gantt documents use a stable empty Gantt model. Closed settings inspectors use memoized empty settings, without parsing each edited source.                                                                                                                                                                                                                                                                                                                                                                                     |

The audit's exploratory changes—analysis workers, removing SVG sanitization boundaries, deferring CodeMirror, broad application-shell memoization, canvas rendering and arbitrary SVG virtualization—are not required for these fixes and have not been introduced. They need separate profiling or trust-boundary validation.

## Validation

Validation checks passed: lint, formatting, 2,426 unit/worker tests, workspace type checks, production web build and both worker build dry runs. Focused checks additionally cover the final interval-tree, calendar sharing, locator invalidation and navigation changes.

Across 86 distinct passing targeted browser cases, coverage exercises selection, focus, inline rename, Undo/Redo, relationship dragging/reconnection, WBS movement, forecast overlays and crash recovery in Chromium, Firefox and WebKit. All 21 per-document zoom/scroll/tab/reload checks pass. SVG security checks inspect the installed DOM and verify StrictMode replay, namespaces and unsafe-link removal. One existing comprehensive WBS test is skipped in WebKit; its branch-movement case passes there. Production offline checks include opening the lazy-loaded Version history dialog in Chromium after going offline. WebKit's existing production test checks shell and renderer startup rather than offline emulation.

## Measurements

The benchmark processes ran sequentially on the same Windows/Ryzen 3900X desktop as the baseline. These are desktop observations, not field INP, deployed-network transfer sizes or universal speed guarantees. [Machine-readable comparisons](summary.json) retain the original and new observations.

### Gantt analysis

| Tasks | Baseline diagnostics + fixes | Fresh analysis context | Repeated same-model context |
| ----- | ---------------------------: | ---------------------: | --------------------------: |
| 100   |                      4.37 ms |                2.20 ms |                     1.00 ms |
| 500   |                     20.32 ms |                9.99 ms |                     3.78 ms |
| 1,000 |                     40.60 ms |               20.19 ms |                     7.89 ms |

All columns exclude parsing. The added fresh-context measurement uses preconstructed models, so it does not mistake repeated reuse of one model for the cost of an edited source. Thirty observations follow five warmups. The unit regression separately verifies one baseline schedule solve across diagnostics, fixes and a compatible UI read. [Raw component costs](analysis-costs.json), [repeated-model CPU profile](diagnostics.cpuprofile), [fresh-context CPU profile](fresh-snapshots/diagnostics.cpuprofile).

### Preview geometry and recovery writes

In both Chromium and WebKit, all three successive ten-character edits recorded:

| Preview                                | SVG assignments before renderer response, baseline → new | Bounding-box reads, baseline → new |
| -------------------------------------- | -------------------------------------------------------: | ---------------------------------: |
| Sequence, 8 participants / 60 messages |                                                   10 → 0 |                            760 → 0 |
| Class, 15 classes                      |                                                   11 → 0 |                            660 → 0 |
| WBS, 61 nodes                          |                                                    0 → 0 |                            671 → 0 |

All eight accepted preview cases recorded zero page errors. Geometry is rebuilt when a new SVG arrives; it is not omitted. [Raw preview observations](preview-results.json).

For the 490,356-byte, twelve-document workspace, five-run Chromium medians were:

| Interaction         | Workspace storage writes, baseline → new | Storage time, baseline → new |
| ------------------- | ---------------------------------------: | ---------------------------: |
| 20 cursor moves     |                                   42 → 1 |                24.8 → 0.0 ms |
| 10 tab switches     |                                   40 → 1 |                24.7 → 0.1 ms |
| 20 typed characters |                                  50 → 45 |               30.9 → 28.8 ms |

The remaining cursor/tab write is the small navigation sidecar. Content durability is deliberately retained, so typing still produces synchronous source recovery writes. Near-zero timings reflect the clock's observed resolution, not literally free persistence. [Five-run raw log](responsiveness.txt).

### Startup and project indexing

Initial JavaScript is approximately 656.4 KB calculated gzip, versus 678.0 KB in the audit. Six dialog chunks are deferred; shared dependencies still load eagerly. Native renderer preparation omits the 1.45 MB raw Graphviz asset, while the full offline installation still precaches it. These changes do not establish a cold-network startup latency improvement.

The isolated 200-document / 2,200-element / 1,095-link index benchmark measured 60.44 ms for a fresh full index and 17.79 ms for a one-document update with 199 members reused (five observations per reported median). Assertions verify declaration and locator-resolution reuse and resolved links. These are Node component timings, not project-opening times. [Raw index evidence](project-index.json).

### Large workloads and remaining limits

All four large workloads passed editing, navigation and save/reopen checks with zero page errors. Both 200-diagram projects preserved 200 original diagrams, 100 links and 1,000 retained revisions; each rapid typing burst undid in one step. [Final large-workload observations](large-final/results.json). Earlier pre-fragment observations remain in [large/results.json](large/results.json).

The final one-observation Gantt timings were **not faster than the baseline**: initial preview was 3.77 / 9.51 s and subsequent title edit 2.20 / 5.09 s in Chromium / WebKit, versus baseline 2.76 / 8.29 s and 1.83 / 4.78 s. Engine portions also varied. Project opening was 2.92 / 5.76 s, versus 2.19 / 6.24 s; project typing frame medians were 36.6 / 151 ms, versus 42.4 / 83 ms. A separate fresh WebKit project context then recorded 77 ms median and 167 ms maximum, demonstrating why a single typing sample cannot establish either a speedup or a persistent regression. [Repeat evidence](project-repeat/results.json) contains one project context; the harness's edit-run setting does not multiply project contexts.

These mixed observations do not justify an end-to-end rendering or project-opening speedup claim. The reliable gains above are reduced repeated analysis, geometry work, persistence and incremental-index work.

The final 200-task title-edit preview phases were:

| Measured phase                                            | Chromium | WebKit |
| --------------------------------------------------------- | -------: | -----: |
| Incoming sanitization (including canonical serialization) | 148.9 ms | 174 ms |
| Overlay XML parsing                                       |  29.4 ms |  36 ms |
| Overlay construction                                      |  48.6 ms |  60 ms |
| Overlay serialization                                     |   8.7 ms |  18 ms |
| Final decorated-fragment sanitization                     | 197.4 ms | 208 ms |
| DOM fragment installation                                 |  11.4 ms |  33 ms |

These are one observation per browser. The installation timer measures the DOM mutation, not subsequent style/layout, paint or physical display. Measurements retain only the latest value per named phase. The large-workload harness now counts both HTML and fragment installations, avoiding an artificial zero when the insertion API changes. Engine time, debounce, preparation, messaging and layout are outside some or all of these spans. Final sanitization is still a substantial measured preview cost; no sanitizer was removed to reduce it.

Key implementation files: [analysis context](../../../apps/web/src/gantt-analysis-context.ts), [Gantt preview installation](../../../apps/web/src/DiagramPreview.tsx), [phase measurements](../../../apps/web/src/render/preview-performance.ts), [project index cache](../../../apps/web/src/projects/project-index.ts), and [recovery storage](../../../apps/web/src/workspace-storage.ts).

## Reproduction

Build production assets first. Set `PERFORMANCE_AUDIT_OUTPUT` to a new directory before running the original component, preview and diagnostic-profile scripts; their default remains the original audit directory. Run `node benchmarks/responsiveness.mjs` separately and retain its stdout. `PROFILE_FRESH_SNAPSHOTS=1` selects the fresh-model CPU profile.

`node benchmarks/project-index.mjs output.json` measures fresh and incremental index work. `node docs/audits/2026-10-14-performance-implementation/large-audit.mjs chromium webkit` owns a production preview server and runs the four original large workloads. `summarize.mjs` regenerates the compact comparison from the retained evidence and current build assets. The large runner accepts LARGE_DOCUMENT_OUTPUT, LARGE_DOCUMENT_FILTER and LARGE_DOCUMENT_RUNS; project contexts are separate invocations. Run these workloads sequentially; use new output paths when preserving previous observations.
