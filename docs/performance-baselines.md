# Performance baselines

These baselines keep machine-sensitive timings out of correctness tests while making parser, rendering, and interaction regressions measurable. Run them with:

```sh
npm run bench
npm run bench:browser
```

The benchmark suite covers:

- the representative 61-line, weekend-aware project in `tests/fixtures/weekend-aware-large.puml`;
- generated projects containing 50, 100, 500, and 1,000 tasks;
- a dependency-heavy chain containing 500 tasks;
- parsing, schedule resolution, local fallback rendering, task movement, and task reordering.
- portable-document hybrid history encoding with gzip for 10 KiB × 10 and 100 KiB × 100 revision corpora.
- mixed six-family projects containing 10, 50, and the supported limit of 200 diagrams;
- five retained revisions per mixed-project diagram, registered link endpoints, and cross-diagram links;
- whole-project live indexing, gzip save/reopen, encrypted save, and open/unopened member switching.

## Reference environment

The initial baseline was measured on 2026-09-09 using Node.js 22 on an Apple Silicon development machine, after one warm-up run. Vitest reports mean latency and percentile statistics; use the mean for routine comparison and p99 when investigating intermittent regressions. The checked-in reference means are updated only under the policy below.

| Workload                                      | Initial mean |
| --------------------------------------------- | -----------: |
| Parse representative 61-line fixture          |     0.060 ms |
| Parse 1,000 generated tasks                   |      1.08 ms |
| Render 1,000 tasks with the local fallback    |      1.11 ms |
| Move one task in 1,000 tasks                  |    0.0006 ms |
| Reorder one task in 1,000 tasks               |    0.0075 ms |
| Parse and resolve a 500-task dependency chain |      2.45 ms |
| Encode 10 KiB × 10 portable history + gzip    |      0.34 ms |
| Encode 100 KiB × 100 portable history + gzip  |     12.59 ms |

The first whole-project baseline was measured on 2026-09-13 in the same class of environment. These figures are
navigation and storage baselines, not correctness limits; repeat the run on the same machine before investigating a
change.

| Mixed-project workload                         |   Reference mean |
| ---------------------------------------------- | ---------------: |
| Index 10 diagrams                              |          0.89 ms |
| Save/reopen 10 diagrams                        |   4.33 / 5.77 ms |
| Index 50 diagrams                              |          1.83 ms |
| Save/reopen 50 diagrams                        |   9.90 / 9.28 ms |
| Index 200 diagrams                             |          5.66 ms |
| Save/reopen 200 diagrams                       | 37.41 / 27.99 ms |
| Switch to an already-open member (200 members) |     0.011 ms p75 |
| Open an unopened member (200 members)          |     0.003 ms p75 |
| Encrypt and save 50 diagrams                   |         94.42 ms |

The benchmark also reports the exact UTF-8 JSON size of each in-memory project snapshot and its encoded file size,
and measures `structuredClone` as a repeatable proxy for snapshot allocation pressure. This is intentionally more
portable than asserting `process.memoryUsage()`, whose heap figures depend on garbage-collection timing. Investigate
growth in bytes per diagram or clone latency before using engine-specific heap profiling.

| Project size | JSON memory proxy | Encoded file | Snapshot clone mean |
| ------------ | ----------------: | -----------: | ------------------: |
| 10 diagrams  |            28 KiB |        4 KiB |             0.31 ms |
| 50 diagrams  |           136 KiB |       20 KiB |             2.14 ms |
| 200 diagrams |           542 KiB |       76 KiB |             2.32 ms |

Performance results vary across operating systems, CPU power states, Node.js versions, and concurrent workloads. CI correctness jobs must not fail on raw wall-clock thresholds. Compare results on the same machine and runtime, with other heavy work stopped.

## Regression budgets

Use these relative budgets until enough CI benchmark history exists for platform-specific limits:

| Workload                                      |                                Review threshold |
| --------------------------------------------- | ----------------------------------------------: |
| Parse or local-render representative fixture  | More than 25% slower than its recorded baseline |
| Parse 1,000 generated tasks                   |                            More than 25% slower |
| Move or reorder one task in 1,000 tasks       |                            More than 30% slower |
| Parse and resolve a 500-task dependency chain |                            More than 25% slower |
| Index or save/reopen a mixed project          |                            More than 35% slower |
| Switch or open a project member               |                            More than 50% slower |

A threshold breach is a prompt to reproduce and profile, not an automatic correctness failure. Record at least five runs before accepting or rejecting a performance-sensitive change. Update this document only when the workload or supported runtime changes, or when repeated measurements establish a new intentional baseline.

## Browser-level checks

`npm run bench:browser` builds the production app and records five Chromium runs for startup to the first Gantt preview, loading the representative fixture, and opening its first task inspector. Record the median values here; do not add raw timing assertions to Playwright correctness tests.

| Browser workload               | Initial median | Review threshold |
| ------------------------------ | -------------: | ---------------: |
| Startup to first Gantt preview |         503 ms |       40% slower |
| Render representative fixture  |         399 ms |       40% slower |
| Select task and open inspector |          51 ms |       50% slower |

Browser timings include renderer and automation overhead, so their review thresholds are intentionally wider than CPU-only benchmarks. The Playwright suite separately provides deterministic coverage for startup completion, rendering replacement, large-document loading, drag feedback, keyboard movement, resizing, and reordering. Use a browser trace when a benchmark regresses to separate application work from automation and renderer startup overhead.

## Editing responsiveness (2026-10-13)

Run `npm run bench:responsiveness` for five production Chromium runs. It starts and stops its own preview server on port 4175, including on Windows. Each fresh browser context opens 12 unsaved Gantt documents (490,356 bytes of recovery JSON): one 300-task document, one 100-task document, and ten 1,000-task documents. It measures cursor movement and typing in the 300-task document, switches between the first two tabs ten times, renders the 100-task document, then exercises zoom and scrolling.

Local medians on the same Windows machine, before and after collecting Gantt symbols in one pass and reusing keyword-repair patterns:

| Workload                                           |   Before |    After |      Change |
| -------------------------------------------------- | -------: | -------: | ----------: |
| 20 typed characters, plus comment setup            | 5,143 ms | 2,864 ms |  44% faster |
| 10 tab switches                                    | 1,716 ms | 1,227 ms |  28% faster |
| 20 cursor movements                                |   219 ms |   204 ms |   7% faster |
| First 100-task preview                             | 1,830 ms | 1,807 ms |   1% faster |
| Longest typing task (median of each run's maximum) |   252 ms |   150 ms | 40% shorter |

The CPU profile identified repeated whole-document scans in `ganttSymbolOccurrences`, followed by repeated construction of keyword-repair rules. Task occurrences now retain their previous ordering and alias/resource/separator semantics while scanning declaration lines once. The benchmark emits CPU samples for its first typing run, recovery serialization and storage-write timings for every stage, and post-GC main-frame heap sizes. Main-frame heap use remained around 38 MB before and after; this excludes the renderer worker/iframe's memory and does not establish long-session leak freedom.

Recovery serialization plus synchronous writes accounted for about 49 ms of the original 5.14-second typing workload. Content recovery remains immediate. Typing still produces long tasks, so repeated parsing/diagnostics are the next profiling target. These timings include automation overhead, apply to the stated workloads, and are observational baselines rather than CI timing assertions. The navigation stage now places the pointer inside the viewport for actual horizontal/vertical touchpad gestures; its earlier measurements are excluded from this comparison. The render workload is 100 tasks; these results do not establish rendering performance for 300–1,000 tasks.

### Sharing source analysis (2026-10-13)

A second five-run comparison on the same workload measured sharing the current source analysis between the app, editor error navigation, fix refreshes, and CodeMirror's lint pass. Gantt diagnostics, syntax repairs, and quick fixes reuse parsed models, including the app's model when it is already available. The analysis is lazy, scoped to its owner, keyed by exact source and diagram kind, and retains only the latest snapshot plus one alternate repair model. It does not keep a global document cache or completed edit history.

| Workload                                | Before this change |    After |       Change |
| --------------------------------------- | -----------------: | -------: | -----------: |
| 20 typed characters, plus comment setup |           2,846 ms | 1,070 ms |   62% faster |
| 10 tab switches                         |           1,232 ms |   902 ms |   27% faster |
| Typing long tasks                       |                 22 |        2 |    91% fewer |
| Longest typing task                     |             147 ms |    73 ms |  50% shorter |
| First 100-task preview                  |           1,885 ms | 1,801 ms |    4% faster |
| Zoom and touchpad gestures              |             492 ms |   485 ms |    1% faster |
| 20 cursor movements                     |             192 ms |   237 ms | 45 ms slower |

Cursor navigation produced no long tasks in either run set; it did not show an improvement. Post-GC main-frame heap remained around 38 MB. Recovery performed the same 50 synchronous storage writes during the typing workload, with approximately 43 ms total serialization/write work before and after. Source recovery remains immediate; this change does not debounce source updates or retain stale diagnostics for newly edited text. The remaining typing long tasks justify further profiling, rather than treating this as a guarantee of smooth editing at every document size.

### Split-view rendering and cancellation (2026-10-13)

The responsiveness benchmark now also types a 20-character comment while the 100-task preview is enabled, then waits for the latest preview. Across five production Chromium runs, the Split-view typing median was 764 ms before and 694 ms after the cancellation change, with no long tasks during that stage in either run set. This small timing difference is not attributed to cancellation: ordinary short renders generally finish within its grace period. Main-frame heap remained around 38 MB, and recovery still performed 50 writes during typing. This is a 100-task Split-view workload, not a claim about every diagram size.

The functional bottleneck was an obsolete render occupying the worker while newer source waited behind it, potentially until the 30-second render timeout. Superseded work now gets a 500 ms grace period; if it is still active, its worker is terminated and the latest queued source starts in a replacement worker using the same sandbox frame and already loaded assets. Short renders keep their warm worker. Stale SVG replies are discarded before sanitization or cache insertion. Switching tabs, closing a preview, and returning to a cached Undo preview also retire obsolete work.

Deterministic tests hold a render without returning a result, then verify replacement, tab switching, and closing. Unit tests additionally cover late messages from terminated workers, cancellation during font preparation, retaining warm short renders, and cached Undo. These checks verify queue behavior without relying on machine-speed timing assertions. The 500 ms grace period bounds when cancellation is requested, not when a replacement worker will finish initialization or rendering.
