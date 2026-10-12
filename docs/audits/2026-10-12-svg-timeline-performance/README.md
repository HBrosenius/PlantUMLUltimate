# Conditional SVG timeline analysis, 2026-10-12

Baseline application: `bd8c03e`. Inspection of the SVG pipeline found that `DiagramPreview` parsed the decorated SVG to collect timeline dates on every preview change. These dates are only read by the baseline comparison report. Without a baseline, or while the progress forecast replaces that report, this parse is unnecessary.

Timeline-date extraction now runs only when a baseline source exists and the progress forecast is disabled. The memo depends on both conditions and the decorated SVG, so selecting/clearing a baseline, changing forecast mode and updating the preview refresh the result. SVG sanitization and renderer isolation are unchanged.

The production browser audit now counts `DOMParser.parseFromString` calls with MIME type `image/svg+xml` in the top page. The wrapper calls the original method with its original arguments. It does not count the renderer iframe/worker, DOMPurify's HTML parser or native innerHTML parsing, and exists only in the benchmark harness.

The baseline 200-diagram workloads recorded four top-page XML parses during each edit in both Chromium and WebKit. See `baseline.json`. These counts cover both updates observed during the edit, not just the final renderer result. Timing comparisons across these separate local runs are subject to host load, warm-up and concurrent validation; parse-count reduction alone does not establish a proportional end-to-end speedup.

All six final 50/200-diagram workloads passed in Chromium, Firefox and WebKit (`final.json`). Each edit recorded two top-page XML parses, a 50% reduction relative to the measured baseline. Every case retained the expected original sources, links, and 250/1,000 original revision contents and metadata through save/reopen. End-to-end timings did not improve in this run: Chromium 200-diagram edits were 1.64/1.08 s versus 1.43/0.92 s baseline; WebKit was 2.68/1.86 s versus 2.51/1.78 s. Firefox 200-diagram edits took 6.72/5.14 s under concurrent host work, without a matching Firefox baseline. This evidence supports removing unnecessary parsing, not a user-visible latency improvement.

The regression test checks that ordinary previews do not perform timeline XML parsing, selecting a baseline enables it, unchanged rerenders reuse it, and clearing/reselecting a baseline updates it. Existing SVG security and unchanged-DOM tests still pass. The existing browser baseline-report tests verify added/removed/moved tasks, the outside-visible-timeline warning and clearing date variance: three passed in Chromium/WebKit and one was skipped by its existing WebKit-specific condition.

Full `npm run validate` passed after correcting the audit instrumentation's browser-global reference: lint, formatting, 2,318 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production build and both worker dry-run builds. `bd8c03e` was pushed before this investigation.

## Reproduce

Build and serve production preview on port 4175. Set `LARGE_DOCUMENT_RUNS=1`, `LARGE_DOCUMENT_FILTER=^document-200$` and a distinct `LARGE_DOCUMENT_OUTPUT` for each build, then run `node benchmarks/large-documents.mjs chromium webkit`. The `svgXmlParses` metric is reported for each edit. Use `^document-(50|200)$` and all three browser names for the broader integrity checks.
