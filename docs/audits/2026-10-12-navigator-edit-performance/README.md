# Navigator work during editing, 2026-10-12

Follow-up to the [edit and revision-integrity audit](../2026-10-12-project-edit-integrity/README.md). Baseline application: `493ffa8`.

## Finding and implementation

A Chromium main-thread CPU profile of two title edits and two keyboard Undo operations in a 200-diagram project identified repeated scans in the connected-document overview. Each diagram independently filtered all elements and links on every navigator render, then scanned its connections again for review/pending counts and WBS-Gantt connections.

The navigator now builds one memoized summary from element ownership, links, resolutions and WBS-Gantt links. Each connection contributes once to each involved diagram. Searching the member list and unrelated renders reuse that summary. Updates to any of its inputs rebuild it. Displayed counts and endpoint health rules remain the same.

## Profile comparison

| Chromium, two edit/Undo cycles                       | Baseline  | Optimized |
| ---------------------------------------------------- | --------- | --------- |
| Sampled self time attributed to ProjectNavigator.tsx | 263.60 ms | 49.55 ms  |
| Complete profiled phase                              | 4.53 s    | 4.35 s    |

Navigator sampled self time fell about 81% in these observations. This is not an 81% reduction in user-visible latency. End-to-end changes were modest and noisy: the first profiled edit changed from 1.51 to 1.40 seconds, and the second from 0.93 to 0.94 seconds. These are separate generated fixtures with matching structure, not a randomized A/B experiment. Sampling, host load and warm-up affect measurements. Chromium profiling does not establish a WebKit-specific attribution.

Retained evidence: [baseline results](baseline.json), [optimized profiled results](profiled-optimized.json), [baseline profile](baseline-edits.cpuprofile), [optimized profile](optimized-edits.cpuprofile), and source-mapped [baseline](baseline-profile-summary.json) / [optimized](optimized-profile-summary.json) summaries. Raw CPU profiles can be loaded in browser performance tools. The summary groups sampled self time by source; it does not assign all native/program time to JavaScript files or isolate layout cost.

Profiling builds used Vite production output with `--sourcemap`. Baseline source maps were reconstructed from the unchanged navigator in `493ffa8` in a separate output directory, restoring the optimized source afterward. The rebuilt baseline application asset hash matched the profiled URL. Source mapping used a temporary analysis script and the already installed trace-mapping package; no runtime or development dependency was added. Relative source prefixes differ because the baseline maps were reconstructed under the diagnostic directory.

The remaining profile includes substantial React DOM, DOMPurify, SVG parsing and Gantt parsing work. Optimizing those requires further attribution. Sanitization and rendering isolation were not changed.

## Verification and remaining latency

All six unprofiled production workloads passed: 50 and 200 diagrams in Chromium, Firefox and WebKit. They exercised search, navigation, large selectors, link creation/removal, source edits, Undo and save/reopen. All original current sources, 250/1,000 revision contents and metadata, and 24/100 original links survived. No page errors were recorded. See [final results](final.json).

For 200 diagrams, the two unprofiled edit observations were 1.40/0.93 seconds in Chromium, 1.71/1.14 seconds in Firefox and 2.58/1.78 seconds in WebKit. WebKit timer stalls still reached 355-398 ms. This bounded optimization does not resolve the entire editing delay.

Lint, formatting, all 2,313 unit tests, web type checks and the production build passed. The navigator test checks multiple connections per diagram, zero connections, overlapping review/pending conditions and fresh counts after both resolution-only and link-list changes. Its final expanded assertions also passed in a focused rerun.

## Reproduce

Start production preview as described in the preceding audit. Set `LARGE_DOCUMENT_PROFILE=1` and run the `document-200` Chromium workload. Profiling now writes both the existing opening profile and `chromium-document-200-edits.cpuprofile`. Use a source-map build for source attribution. Run without the profiling flag for ordinary browser measurements. Preserve output before Playwright cleans its results directory.

No push or deployment is included.
