# Rendering performance follow-up — 2026-10-07

## CI follow-up — 2026-10-08

The next complete CI run passed Chromium, Firefox, validation, CodeQL and the
production rendering smoke check, but all four WebKit runners stopped after test
failures. The final summaries were lost when the runners shut down.

The renderer now uses classic workers and trusted `importScripts` assets, with
the engine's fixed module exports adapted inside a private wrapper. The opaque
iframe, data-only script/worker policy, network isolation and execution deadlines
are unchanged. The adapter also avoids allocating unused native stacks for the
TeaVM Java exceptions used during parsing; identity, messages and causes are
preserved. Unit tests validate the installed engine's adapter targets, and an
unsupported engine upgrade fails explicitly.

Warm/fresh parity now runs one engine heap at a time and waits for worker disposal.
It passed all native and Graphviz comparisons in Windows WebKit (about 2.6 minutes).
Chromium and Firefox passed parity, font fallback and security tests.

A second WebKit bottleneck was the engine's verbose `console.log` timing output.
The inspector adds the enormous data URL to every console record, slowing themed
renders and exhausting the automation process's memory. The isolated worker now
suppresses routine log output, preserving warning/error output and structured
render results. Sampled Windows WebKit performance improved from approximately
12 seconds cold / 14 seconds per edit to 2.2 seconds cold / 0.4–0.5 seconds per edit
(37–51 ms engine execution). The sketchy theme rendered in about 600 ms instead
of failing a 100-second wait. Gantt hitbox height limits also scale with the label
font size so taller handwritten bars remain selectable.

Browser tests now wait for a completed preview rather than accepting an older SVG.
The 43 bundled themes run as individual tests with the same interaction assertions,
allowing sharding and per-theme failures. CI logs each failed test immediately so
a later runner shutdown cannot erase the assertion details.

The follow-up CI run exposed an infrastructure failure: timing out Playwright's
APT installation left an `apt-get` child holding the package lock, so the retry
failed immediately. Browser, PWA, collaboration and deployed smoke jobs now use
the official Playwright 1.62.1 Noble image, pinned by digest and matching the lockfile,
with browsers and OS dependencies already installed. Update that image together
with Playwright dependency upgrades.

Fault-injection tests now stub the worker protocol instead of the removed module
loader. All three browsers still verify CPU-bound worker termination and bounded
startup retries. Tooltip checks exposed an editor toolbar overlapping source at
390px; the toolbar now reserves its own wrapping row. The milestone tooltip test
also collapses the critical-path report before hovering its covered diagram target.

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
