# Avoid repeated Gantt SVG insertion, 2026-10-12

Follow-up to the [navigator profile](../2026-10-12-navigator-edit-performance/README.md). The accumulated commits through `94fb1d7` were pushed to `origin/main` before this local delivery.

## Finding and implementation

The Gantt SVG host memoized its sanitized SVG string, but constructed a new `dangerouslySetInnerHTML` object on every render. React compares the prop object by identity and invokes the native innerHTML setter when it changes. A fresh link-ID set can rerender the host even when the SVG string is identical, causing unnecessary DOM replacement.

The host now memoizes the markup object using the sanitized string. Unchanged SVG retains its DOM nodes across link-metadata rerenders. Changed SVG still passes through the existing final-boundary sanitizer and updates the host. Link-icon layout effects continue to refresh icons when their inputs change. No sanitization call, renderer isolation or security boundary was removed.

## Measurement

The workload audit now counts native innerHTML assignments specifically to `.diagram-svg-host` elements in the main window. It wraps the native setter only in the audit's injected instrumentation and forwards the original value unchanged. Production application code contains no instrumentation. Counts are observations, not timing thresholds.

| 200-diagram document | Baseline, each edit / Undo | Optimized, each edit / Undo |
| -------------------- | -------------------------- | --------------------------- |
| Chromium             | 4 / 4                      | 2 / 2                       |
| WebKit               | 4 / 4                      | 2 / 2                       |

Both observed cycles in each case gave those counts, a 50% reduction in SVG DOM insertions. The optimized 50-diagram cases and Firefox cases also recorded two insertions per operation; no Firefox baseline was collected for this delivery.

This is not a 50% reduction in edit latency. Chromium's first/second edits were 1.36/0.89 seconds at baseline and 1.32/0.91 seconds after the change; WebKit's were 2.61/1.91 and 2.54/1.96 seconds. These modest, mixed timing differences are within the variation of separate generated-fixture runs on one desktop. The reduction in redundant DOM work is the supported outcome. See [baseline](baseline.json) and [final results](final.json).

The baseline production build used unchanged `94fb1d7` application source. The local preview fix was restored immediately after building that baseline. Final measurement used the optimized normal production build after full validation, with no competing unit suite or CPU profiler.

## Verification

Full `npm run validate` passed: lint, formatting, 2,314 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production web build and both worker dry-run builds (2,336 tests total).

The SVG regression test verifies node identity across an unchanged SVG rerender, replacement when markup changes, and removal of scripts and event handlers from changed markup. The existing final-boundary test still checks sanitization and task interaction metadata.

All six production 50/200-diagram workloads passed in Chromium, Firefox and WebKit, including editing, Undo, large link selectors and save/reopen. All original current sources, 250/1,000 revision contents and metadata, and 24/100 original links survived with no page errors. Six focused Chromium/WebKit browser regressions passed for view/keyboard controls, multi-selection operations and WBS/Gantt conversion with linked SVG icons. A separate Chromium multi-task SVG drag regression passed too (seven focused browser tests total).

Reproduce with the normal production build and workload commands in the preceding audits. Native insertion counts appear in `svgDomInsertions` and `undoSvgDomInsertions`. Keep reports before Playwright clears its output directory.

Remote CI evidence covers `94fb1d7`; this SVG change was validated locally during this audit.

## Push verification

All five accumulated commits through `94fb1d7` were pushed to `origin/main`. [CI](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/38215917330) completed successfully with all 18 jobs green, including the browser matrix, validation, PWA, collaboration, Pages build/deploy and deployed smoke checks. [Code analysis](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/38215917012) also completed successfully. Retained status evidence: [CI](pushed-ci.json) and [analysis](pushed-analysis.json). These remote results precede the local SVG markup-object fix.
