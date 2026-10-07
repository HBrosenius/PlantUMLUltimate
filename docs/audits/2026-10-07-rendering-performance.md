# Rendering performance follow-up — 2026-10-07

The security remediation introduced fresh workers and data-URL engine modules. Reusing workers improved performance but did not restore the original speed. Comparing with the pre-security renderer confirmed the regression.

## Main cause and fix

The engine catches exceptions during normal parsing. Multi-megabyte data URLs made script names in exception stacks expensive. Adding short `sourceURL` diagnostic names restores warm engine performance in Chromium and Firefox without changing execution permissions. WebKit does not show the same improvement.

Text measurements now use worker-local OffscreenCanvas on demand when supported, with a bounded per-render measurement cache. Browsers without worker canvas, and documents with web fonts, retain the bounded font-atlas fallback. This avoids eagerly measuring every source string in numerous font combinations on the main thread.

Earlier optimizations remain: successful workers are reused within a document, recycled after 20 renders, and replaced on document switches, failures, retries or timeouts. The sandbox bootstrap is small and fallback font buffers transfer without copying.

The opaque origin, network-blocking CSP, SVG sanitization, source/document ownership checks, startup deadline and CPU-preempting render timeout remain enforced. A blob-URL experiment failed under the opaque-origin sandbox and was reverted; CSP permissions were not broadened.

## Local measurements

A disposable browser profile rendered a one-task Gantt diagram with two successive edits against the development server. Wall times include browser automation and the 150 ms debounce; engine timings come directly from the corresponding canonical SVG response, not a potentially stale preview overlay.

| Metric                  | Before this follow-up | After       |
| ----------------------- | --------------------- | ----------- |
| Chromium cold diagram   | 2.5 s                 | 1.04 s      |
| Chromium edit-to-result | 1.23–1.41 s           | 0.24–0.27 s |
| Chromium warm engine    | 174–238 ms            | 15–16 ms    |
| Firefox cold diagram    | 3.9 s                 | 1.50 s      |
| Firefox edit-to-result  | 2.30–2.45 s           | 0.24–0.28 s |
| Firefox warm engine     | 1,979–2,102 ms        | 26–28 ms    |

The trusted pre-security Chromium renderer measured 13–21 ms for repeated equivalent renders. The current protected renderer therefore matches that warm-engine baseline in this small fixture. These are local samples, not statistical guarantees or large-document measurements.

WebKit remains slow (about 19 seconds cold and 17–19 seconds per edit in the sampled run). Its measurements overlapped later regression checks and are unsuitable for precise speed comparisons. No claim is made that its regression is resolved.

Run `npm run bench:render -- chromium` (or `firefox` / `webkit`) with the development server on port 5173 to repeat. With no browser argument it runs all three sequentially. The benchmark no longer injects artificial font preparation before edits.

## Verification

Warm-render browser checks compare full SVGs with fresh engines after font/style changes and after returning to the original source, for native Gantt and Graphviz Class diagrams. The warm CPU-loop test verifies that worker termination still prevents the editor from freezing. Additional coverage disables worker canvas to exercise font-atlas fallback.

- Chromium and Firefox: all 26 security, remediation and rendering cases passed.
- WebKit: warm/fresh native and Graphviz comparisons, warm CPU-loop termination, and font-atlas fallback passed (3 additional distinct cases).
- TypeScript, ESLint, format checks and the production build passed.

The development server remains available at http://127.0.0.1:5173/. No changes were committed or deployed.
