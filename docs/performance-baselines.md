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
