# Large-document editing and revision integrity, 2026-10-12

Continued after the [index optimization](../2026-10-12-project-index-performance/README.md), committed as `1e81c2d`. This delivery strengthens the production workload audit and records editing observations.

## Expanded checks

Each 50/200-diagram workload now opens the first Gantt member after navigation/link checks, changes its title, waits for the new preview and current links, then uses the editor's keyboard Undo. It repeats this twice before saving. Save verification checks the exact current source for every original member, so an incomplete Undo fails the workload.

The previous audit checked current sources and link identities and recorded revision counts. It now also finds every original revision by ID and compares its reconstructed source, timestamp, sequence, reason, pinned state and diagram kind against the fixture. Missing content is an explicit failure. Content records may be re-encoded: the comparison checks reconstructed source rather than requiring the same compression representation.

Save/reopen still exercises the real application and codec through in-memory file handles. These are generated stress documents, not private customer files or native filesystem failure tests.

## Results

All six workloads passed in Chromium, Firefox and WebKit. Each preserved all 250 or 1,000 original revisions, including their content and metadata, plus all current sources and 24/100 original links. Across the six cases, this verifies 3,750 original revisions. There were no page errors. Large-selector operations, member switching, search and save/reopen also passed. See [results](results.json).

Observed edit-to-current-preview times for the 200-diagram workload:

| Browser  | First title edit | Second title edit | Engine time, first / second | Undo, first / second |
| -------- | ---------------- | ----------------- | --------------------------- | -------------------- |
| Chromium | 1.46 s           | 0.99 s            | 0.79 / 0.39 s               | 0.79 / 0.78 s        |
| Firefox  | 1.67 s           | 1.17 s            | 0.99 / 0.51 s               | 0.97 / 1.11 s        |
| WebKit   | 2.57 s           | 2.02 s            | 1.11 / 0.58 s               | 1.21 / 1.49 s        |

The first and second edits differ in renderer warm-up. These are observations from two edits per case on one desktop, not statistical performance budgets or an optimization comparison. Timing includes browser interaction, render scheduling, SVG display and readiness checks. `previewAndIndexReadyMs` samples link readiness after the preview check; it is not an isolated index duration. Unsupported long-task observations in Firefox/WebKit can be zero even when timer delays show blocking.

WebKit's 200-diagram edit observations had maximum timer delays of 403-425 ms. Engine execution accounts for only part of the elapsed time. The next justified investigation is a trace of main-thread work during editing, including React updates, indexing and SVG display. These measurements do not identify which of those causes the remaining delay, and do not justify a renderer upgrade or further caching by themselves.

## Reproduce and checks

Use the production build/preview and workload commands from the [opening audit](../2026-10-12-document-open-performance/README.md). The expanded checks run automatically for `document-50` and `document-200`; each performs two edit/Undo cycles independently of the standalone-source edit repetition setting.

The benchmark passed ESLint, Node syntax checking and formatting checks. Application source is unchanged from the validated commit. Keep performance thresholds out of correctness tests and preserve results before Playwright clears its output directory.
