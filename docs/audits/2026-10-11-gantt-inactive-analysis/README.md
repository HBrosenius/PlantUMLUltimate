# Skip inactive Gantt analysis — 2026-10-11

Follow-up: the baseline-drag failure below was traced to text-glyph rounding in the browser test's day-width measurement. Median column spacing and an explicit final source-date assertion corrected the test; it now passes in Chromium and Firefox. See [completion evidence](../2026-10-11-large-document-completion/README.md). The original diagnostic record below is retained for traceability.

Continued the [geometry-cache delivery](../2026-10-11-gantt-geometry-cache/README.md) with two bounded changes:

- Extract rendered current-task geometry for baseline comparison only when resolved baseline dates exist. Without baseline dates, variance classifies current tasks as added without consulting that geometry.
- Return the existing SVG from schedule decoration when there are no critical markers and no changed/removed tasks. This avoids a parse/serialize pass with no intended SVG edits.

Renderer and preview sanitization are unchanged. Baseline comparison and critical-path decoration remain active when needed. No row index or renderer-limit change was introduced.

## Evidence and results

A CPU-profile investigation of the cached implementation showed DOMPurify attribute processing and repeated native `parseFromString` calls among the remaining sampled work. Source inspection then identified the two inactive paths above. The temporary investigation profile was not retained when Playwright cleared its output directory; no precise attribution percentage is claimed from that profile.

Production Chromium, unchanged 200-task fixture, five title edits:

| Measurement                       | Geometry cache only | With inactive analysis skipped |
| --------------------------------- | ------------------: | -----------------------------: |
| Median edit to current preview    |             3.052 s |                        2.447 s |
| Initial source to current preview |             3.492 s |                        3.158 s |
| Longest initial main-thread task  |            1,128 ms |                       1,132 ms |

[Raw results](results.json) record successful current-preview updates, Outline search, exact-source native save/reopen and no page errors. Compared with the original audit's 3.599-second edit median, the current observation is about 32% lower. These are separate desktop runs, not a controlled interleaved A/B experiment; the percentages cannot be attributed solely to the code changes. The remaining long task means responsiveness is still incomplete.

## Correctness validation and open failure

- Four focused unit files / 68 tests passed, including three new decoration tests for inactive output preservation, critical markers and changed baseline bars.
- ESLint, Prettier and production TypeScript/Vite build passed. An initial build caught a missing required `derived` field in the new test's date fixture; it was corrected before the passing build.
- Chromium added/removed/moved/out-of-range baseline reporting and dependency-baseline comparison passed.
- The drag-back baseline test failed: after dragging forward three days and backward three days, the summary retained one changed task. It failed again in isolation, with both new parsing shortcuts disabled, and with the original overlay from Git HEAD. This reproduces before both performance deliveries in this environment; its underlying cause is unresolved. [Original-overlay failure evidence](baseline-drag-failure.md).

The failed browser check is not waived or called passing. The targeted browser suite is not fully green and this is not release certification. The diagnostic edits were restored; the final source includes both performance deliveries. The local production preview was stopped.

Next: investigate the baseline-drag failure independently, then continue oversized-preview guidance from the [current plan](../../large-document-next-steps-2026-10-11.md). Further Gantt work should measure sanitization/parsing and DOM insertion before expanding shape indexing.
