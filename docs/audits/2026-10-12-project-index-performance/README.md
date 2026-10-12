# Project index work, 2026-10-12

Follow-up to the [paged selector delivery](../2026-10-12-link-selector-performance/README.md), committed as `e4f266e`.

## Finding and change

The index computed a whole-diagram SHA-256 hash for every element in that diagram. It also scanned the complete element and link lists separately for each diagram's connection count. Both costs recur when a document's index refreshes.

The index now builds connection counts in one pass and shares one hash promise per diagram within an indexing invocation. Counts still include connections for unavailable diagrams. Declaration parsing, manifest validation, identity resolution and cancellation checks remain intact. Hashes are not cached across invocations or projects; changed sources are hashed again. No format limits or security checks changed.

## Measurement

`node benchmarks/project-index.mjs [output.json]` builds the actual index for Node and generates 200 distinct WBS sources, 2,200 elements and 1,095 cross-diagram links. It warms the index once, then records five full indexing runs. Each run checks member count, resolved elements and total per-diagram connection counts. The retained original baseline predates the added count assertion; it checked member count and every resolution.

| Variant                   | Five-run median |
| ------------------------- | --------------- |
| Unchanged `e4f266e` index | 90.65 ms        |
| Optimized index           | 55.20 ms        |

This is approximately 39% less index time in this Node workload. A [repeat](repeat.json), including the connection-count assertion, measured a 56.19 ms median. It is a component benchmark, not an end-to-end browser opening result. Separate runs use generated UUIDs and the same fixture structure on the same desktop. Host load, browser crypto and real source distributions can affect the gain. See [baseline](baseline.json) and [optimized](optimized.json).

## Verification

Lint, all 2,312 unit tests, web TypeScript compilation and the production web build passed. Added coverage checks multiple endpoints in one diagram, unavailable diagrams with connections and a diagram with no connections. Existing index and project tests cover degraded inputs, cancellation, linked declaration types and identity behavior.

All six production 50/200-diagram workload checks passed across Chromium, Firefox and WebKit, covering navigation, search, large link selectors, link creation/removal and save/reopen. All original sources, 250/1,000 revisions and 24/100 links survived, with no page errors. The [browser report](browsers.json) is retained separately; browser timings are observations rather than acceptance thresholds.

No dependency upgrade, push or deployment is part of this delivery.
