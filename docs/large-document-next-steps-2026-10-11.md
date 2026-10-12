# Large-document next steps — 2026-10-11

Status: the bounded performance, oversized-preview guidance and document-navigation deliveries are implemented. See [completion evidence and scope](audits/2026-10-11-large-document-completion/README.md), [geometry-reuse results](audits/2026-10-11-gantt-geometry-cache/README.md) and [inactive-analysis results](audits/2026-10-11-gantt-inactive-analysis/README.md). The original implementation scope below is retained; optional further profiling, engine upgrades and broader zoom changes are future work.

Further performance delivery (2026-10-12): member-specific history restoration and indexed link presentation reduce the measured 200-diagram opening delay. See [profiling, repeated measurements and preservation checks](audits/2026-10-12-document-open-performance/README.md). Encrypted history setup remains eager and memory-only.

Follow-up: the baseline-drag failure was traced to the test's rounded text-glyph spacing measurement. Corrected median spacing and a final source-date assertion pass in Chromium and Firefox; no scheduling-algorithm workaround was introduced.

## 1. Reduce Gantt preview work

Delivered: geometry reuse plus inactive baseline/decorating fast paths. The original measured 200-task preview took 3.60 seconds per title edit in Chromium, with a 1,173 ms main-thread task. The follow-up observed a 2.45-second median, with desktop timing limits documented in the evidence.

In `apps/web/src/render/canonical-gantt-overlay.ts`, each task filters rectangles, polygons and paths; path/polygon bounds are computed inside those filters and again for selected shapes. Geometry is unchanged during matching, making per-invocation reuse a bounded first optimization.

First delivery:

- Build geometry records once for the original SVG shapes, preserving their document order and existing paint/shape eligibility rules.
- Reuse those bounds during task matching and progress construction. Keep caches local to one overlay invocation so edits cannot reuse stale SVG geometry.
- Preserve shared-row date disambiguation, unique-row renderer-offset handling, font-scaled height limits, milestone selection and weekend-split bars.
- Run the existing canonical-overlay tests and relevant visual-edit browser checks. Add focused coverage only for uncovered behavior introduced by the refactor.
- Compare the unchanged 50/200-task fixtures before and after, using the same production configuration and browser with sufficient system memory.

Acceptance: correct hit targets, progress clipping, dependency anchors and Undo behavior remain intact; geometry parsing is no longer repeated per task; repeated measurements demonstrate lower overlay work without a preview-latency regression. Do not promise a subsecond preview: engine rendering and SVG parsing/insertion also contribute.

Second delivery, only if profiling still justifies it: index cached shapes by vertical range to reduce full-shape scans, retaining original order and exact inclusive row/date predicates. Measure overlay, SVG sanitization/parsing and insertion separately before extending the optimization. Keep timing budgets out of ordinary correctness tests.

## 2. Explain oversized previews and preserve editing

Delivered: dimension explanation, stale-preview guidance and an explicit Continue editing action in the existing preview-details surface. The renderer cap and isolation remain unchanged.

The installed engine rejects a width or height over 4,096 pixels. This is a dimension limit, not a universal task-count limit. Source/table/Outline editing and save/reopen already passed the audit's oversized cases in Chromium and Firefox.

Delivery: identify this renderer failure through a bounded error-classification path; display a clear dimension explanation and guide users to available source, table and Outline workflows. Make it clear when the displayed preview is from an earlier successful render. Check the existing error UI before adding another surface.

Acceptance: a valid oversized source is not described as a syntax error; users can find/edit a task, save the complete source and recover by reducing diagram dimensions. Smaller subsequent renders replace the stale preview. Preserve existing renderer isolation, timeouts and queue bounds.

Separately investigate whether the installed engine has a supported upstream configuration or upgrade path for larger SVGs. Do not patch the bundled cap as part of this UI delivery. Any upstream investigation must verify current primary documentation before recommending a dependency change.

## 3. Improve entry into large multi-diagram documents

Delivered: explicit member-selection guidance, reopening the navigator even for the same document, name/type search, result/empty states and natural name ordering in both member lists. Existing zoom controls were evaluated and retained; a broader camera-policy change is outside this bounded delivery.

The audit observed that opening a document loads its navigator while the previous standalone preview remains active until a member is selected. Large overview lists inherit UUID ordering. Existing search/navigation capabilities should be inspected before choosing new controls.

Delivery: make the newly opened document and its next selection step apparent; provide stable, useful member ordering and extend existing search/grouping where needed. Evaluate readable zoom separately from document navigation, since fitting the entire chart shrinks labels.

Acceptance: in the 50/200-member fixtures, a user can identify the opened document, find a named late member and switch to it without ambiguity. Reopening preserves intended active-member behavior; sources, retained revisions and cross-diagram links survive save/reopen. Preserve current tab-reuse and unsaved-change protections.

## Validation still open

- Targeted WebKit failure/recovery and 50/200-member acceptance now pass. The original full workload matrix was not rerun in its entirety; retain the historical aborted result as inconclusive rather than rewriting it.
- Run focused checks per delivery, then the repository's required release checks before release. The audit was not full release certification.
- Test a consenting user's representative document when available. The generated stress fixtures establish useful boundaries, but do not replace user-workflow evidence.

The scoped implementation order is complete. Further shape indexing, engine upgrades and camera-policy changes require separate measured justification. No release or deployment is part of this plan.
