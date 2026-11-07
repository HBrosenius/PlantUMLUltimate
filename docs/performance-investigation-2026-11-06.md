# Performance investigation — 2026-11-06

Scope: the `apps/web` editor and the `packages/*` parsers it bundles, measured on `origin/main` at `2cf3e8e1` (includes Stage, #112, and the repaired browser tests, #111). This was an investigation only. No app code was changed.

The main focus is how fast the app feels to the user. Footprint (bundle size, cache, memory) comes second.

## Summary

The editor shell itself is fast. A warm, service-worker-controlled start shows the editor in about 60 ms and the first diagram in about 300 ms. A cold first visit on a fast connection shows a diagram about 0.4 s after **Create diagram**. Long editing sessions showed no memory leak.

What users actually feel comes from **how the local PlantUML engine is started and fed**, not from parsing or React:

- the 7 MB engine is recompiled many times in one session;
- every edit waits a fixed 150 ms before rendering starts;
- on slow mobile networks, the engine download can be aborted by a 10-second timeout.

Stage also adds continuous background work through two `requestAnimationFrame` loops that never stop.

**Top 5 wins**

| #   | Change                                                                                                                                             | Measured problem                                                                                                                                                                                                                                                  | Expected effect                                                                                            | Effort |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Keep one warm renderer** across tabs, view modes and layout engines, and stop recycling the worker after every 20 renders ([U1](#u1), [U2](#u2)) | Each first visit to a tab rebuilt the iframe and worker: 280–380 ms at 1× CPU, 420–590 ms at 4×. The renderer started 8 times in 7 tab switches. Every 21st render costs an extra 100–150 ms.                                                                     | First visit to a tab ≈ one render (80–100 ms). No periodic spike.                                          | S–M    |
| 2   | **Replace the fixed 150 ms render debounce** with an adaptive one, and serve cache hits right away ([U3](#u3))                                     | The 150 ms wait is 85–90% of keystroke→preview time for a 4-task Gantt (≈170 ms total, 10–20 ms of engine work). Switching back to an already-rendered tab still took 183–220 ms.                                                                                 | Small diagrams update in ≈30–40 ms. Cached tabs and Undo appear in under 30 ms.                            | S      |
| 3   | **Don't let a slow network kill the engine download, and start it earlier** ([U4](#u4), [U5](#u5))                                                 | On Regular 3G, the engine fetch was aborted at 10 s. The first diagram appeared 16.2 s after Create, and only because the service-worker cache had filled in the meantime. On Slow 4G it was 7.7 s. Startup also adds 270 ms of main-thread long tasks at 4× CPU. | No failed renderer starts on 3G. The renderer starts while the type chooser is still open.                 | S–M    |
| 4   | **Make Stage event-driven instead of polling every frame** ([U6](#u6))                                                                             | Idle main-thread work: Split 3 ms/s; Stage 25–29 ms/s; Stage with a selection 46–75 ms/s (150-task Gantt). It grows with diagram size and never stops, which costs battery.                                                                                       | Back to about 3 ms/s at idle.                                                                              | S      |
| 5   | **Ship less code and fewer bytes** ([F1](#f1)–[F4](#f4))                                                                                           | Only 22% of the 1 MB main chunk, 15% of `diagram-engines` and 7% of the CSS is used for a first Gantt render. Production serves gzip only, and hashed assets are cached for just 4 hours.                                                                         | About −110 KB gz (≈20%) of startup JS/CSS. About −25% on the engine download (1.45 → 1.06 MB) with Brotli. | M      |

## Environment and method

- **Machine:** Apple M5 Pro, 24 GB, macOS 26.7.2. This is a fast machine, so 4× CPU throttling (CDP `Emulation.setCPUThrottlingRate`) is used as a rough mid-range/mobile proxy. Throttling applies to the page's main thread. It **does not appear to slow the renderer worker** (worker render times did not go up at 4×), so worker-side figures are this machine's speed.
- **Build:** `npm run build` of `origin/main` in a scratch worktree, served with `vite preview` (gzip) on port 5215. React render counts used the dev server on port 5216, because component names are minified in production.
- **Browser:** Playwright Chromium (headless shell 152). Each run used a fresh browser context unless it says otherwise.
- **Networks** (CDP emulation of the page target): Fast 4G (9 Mbps, 60 ms), Slow 4G (1.6 Mbps, 150 ms), Regular 3G (750 kbps, 300 ms). Service-worker traffic is **not** throttled by this emulation. That understates first-visit bandwidth contention (see U4).
- **Instruments:**
  - `PerformanceObserver` for long tasks and event timing (≥16 ms);
  - the app's own `plantuml:preview:*` measures;
  - a capture-phase `message` listener on the renderer channel (worker `ready` and `result` times);
  - CDP `Performance.getMetrics` for idle cost;
  - CDP heap usage and DOM counters after forced GC;
  - Playwright JS/CSS coverage;
  - a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` that counts components with the `PerformedWork` flag per commit;
  - source-map byte attribution of the built chunks.
- **Repo benchmarks:** `npm run bench`, `node benchmarks/responsiveness.mjs` (1× and `BENCH_CPU_THROTTLE=4`). `node benchmarks/browser.mjs` **fails on main**: it waits for a `Close project inspector` button that no longer exists ([benchmarks/browser.mjs:48](../benchmarks/browser.mjs:48)).
- **Harness scripts** (scratch, not committed) are kept in the shared session-notes folder as `perf-harness/` so these runs can be repeated.
- Runs: cold start 3× unthrottled and 1–2× per throttled profile; warm start 3× per CPU setting; keystroke runs are 25 sequential edits; the repo benchmarks ran 5×. All timings are observational, from one machine.

## Measured baselines

### Startup

| Scenario                                          |      FCP | Editor visible | Renderer frame inserted | Worker ready |     First SVG | Notes                                                                                                  |
| ------------------------------------------------- | -------: | -------------: | ----------------------: | -----------: | ------------: | ------------------------------------------------------------------------------------------------------ |
| Cold, 1×, no throttling (median of 3)             |    76 ms |         120 ms |                  257 ms |       419 ms |    **534 ms** | Create → SVG 388 ms. First render inside the worker took 102–107 ms (cold JIT).                        |
| Cold, 4× CPU, Fast 4G                             |   852 ms |       1,052 ms |                2,501 ms |     2,766 ms |  **2,912 ms** | Engine download 1,014 → 2,343 ms. Long tasks of 71, 84 and 112 ms when assets arrive.                  |
| Cold, 4× CPU, Slow 4G                             | 3,372 ms |       3,574 ms |               10,956 ms |    11,218 ms | **11,360 ms** | Engine download 7.27 s (1.41 MB gz). Create → SVG 7.7 s.                                               |
| Cold, 1×, Regular 3G                              | 6,980 ms |       7,031 ms |               22,951 ms |    23,143 ms | **23,248 ms** | First engine fetch aborted at 10 s. The retry was served from the SW cache (SW traffic not throttled). |
| Warm (SW, seeded split session), 1× (median of 3) |    52 ms |          63 ms |                   93 ms |       226 ms |    **306 ms** | All assets come from the SW (`transferSize` 0). Worker init ≈ 135 ms; first render 80 ms.              |
| Warm, 4× CPU (median of 3)                        |    88 ms |         145 ms |                  261 ms |       519 ms |    **619 ms** | One startup long task of 92–115 ms.                                                                    |

At a 390 px phone viewport, creating a Gantt opens the **Task check-in** list, not a preview, so the mobile preview path was not timed separately. The earlier review's slow mobile render (more than 2 s for a 4-task Gantt) matches the cold engine download plus worker start shown above.

### Editing and interaction (warm renderer, Split view)

| Workload                                                                           |                                                           1× |                                                                  4× CPU |
| ---------------------------------------------------------------------------------- | -----------------------------------------------------------: | ----------------------------------------------------------------------: |
| Keystroke → render result, 4-task Gantt (median of 25 edits)                       |                                 **174 ms** (engine 10–29 ms) |                                                                  169 ms |
| Keystroke → render result, 100-task Gantt (median of 25)                           |                                  **263 ms** (engine ≈ 90 ms) |                                                                  261 ms |
| 21st render after load (worker recycled)                                           |                              256 ms / 380 ms (4 / 100 tasks) |                                                            276 / 403 ms |
| Main-thread preview work per 100-task render: sanitize, overlay, sanitize, install |                    3.7 + 0.7 + 1.5 + 0.3 + 9.4 + 0.3 ≈ 16 ms |                             16 + 3.2 + 8 + 1.3 + 34.6 + 1.2 ≈ **64 ms** |
| Tab switch to a never-rendered tab (renderer rebooted)                             |                                                   279–379 ms |                                                              423–594 ms |
| Tab switch back to an already-rendered tab (cache hit)                             |                                                   182–195 ms |                                                              217–248 ms |
| Responsiveness bench, typing 20 characters (300-task doc, 12 tabs)                 | 136 ms, 0 long tasks, 45 `localStorage` writes, 7 ms storage | 554 ms; worst input delay 56–88 ms; 35 ms storage + 20 ms serialization |
| Responsiveness bench, 10 tab switches                                              |                                                       284 ms |                                                                  614 ms |
| Responsiveness bench, first 100-task preview (Code → Split)                        |                                                       850 ms |                                     1,068 ms, 4 long tasks of 78–108 ms |
| Responsiveness bench, cursor ×20 / zoom-scroll ×10                                 |                                                  40 / 207 ms |                                                            145 / 324 ms |

React commits (dev build, 100-task Gantt):

| Interaction                                        | Commits | Component renders | `App` renders |
| -------------------------------------------------- | ------: | ----------------: | ------------: |
| One keystroke, including its render result (Split) |       6 |               130 |             4 |
| One keystroke (Code view)                          |       4 |                76 |             2 |
| 10 cursor moves (no edit)                          |      10 |           210–240 |            10 |
| Drag one task 80 px in 20 pointer moves (Split)    |       8 |               237 |             4 |

`RibbonGroup` re-renders 7 times per commit (42 per keystroke in Split). Every commit also re-renders `FileMenu`, `HistoryMenu`, `AddMenu`, `FileSaveStatus`, `StorageStatus` and `CodeEditor`. Dragging is handled mostly outside React, which is good: 8 commits for 20 pointer moves.

### Stage idle cost (CDP `Performance.getMetrics`, 5-second idle windows, 1×)

| Diagram        |       Split idle |         Stage idle | Stage idle with a selected task |
| -------------- | ---------------: | -----------------: | ------------------------------: |
| 20-task Gantt  | 3 ms/s task time | 25 ms/s (script 5) |             46 ms/s (script 20) |
| 150-task Gantt |           3 ms/s | 29 ms/s (script 6) |         **75 ms/s** (script 46) |

The 4× runs reported lower numbers, which suggests CDP metric or rAF artefacts under throttling. The 1× figures are the reliable ones.

### Footprint

| Item                                                                                         |                Raw |             gzip |     Brotli (q11) |
| -------------------------------------------------------------------------------------------- | -----------------: | ---------------: | ---------------: |
| `plantuml-*.js` (engine, renderer only)                                                      |            7.15 MB |          1.39 MB |          1.06 MB |
| `viz-global-*.js` (Graphviz, only for class, activity and use-case diagrams)                 |            1.45 MB |          0.60 MB |          0.48 MB |
| `canonical.worker-*.js` (linkedom 60 KB, htmlparser2 60 KB, cssom 22 KB, css-select 13 KB …) |             179 KB |            64 KB |            57 KB |
| `index-*.js` (entry)                                                                         |           1,016 KB |           307 KB |           247 KB |
| `editor-vendor` / `react-vendor` / `diagram-engines`                                         | 396 / 192 / 131 KB | 128 / 60 / 37 KB | 110 / 52 / 32 KB |
| `index-*.css` (one file, blocks rendering)                                                   |             169 KB |            30 KB |            25 KB |
| **Startup shell** (entry + 3 preloads + CSS)                                                 |            1.90 MB |      **0.53 MB** |          0.44 MB |
| **SW precache** (97 entries, every chunk and all 45 theme chunks)                            |           11.67 MB |      **2.97 MB** |          2.36 MB |
| Cache Storage after install (`navigator.storage.estimate`)                                   |            13.7 MB |                  |                  |
| `dist/` total (including `training/practice.zip`, 268 KB)                                    |              12 MB |                  |                  |

Startup code coverage (warm, 2-task Gantt in Split): main chunk 22% used (223 of 991 KB), `diagram-engines` 15%, `editor-vendor` 38%, `react-vendor` 35%, CSS **7%** (12 of 165 KB).

Biggest contributors to the main chunk by source bytes: `App.tsx` 135 KB (13%), `DiagramPreview.tsx` 46 KB, DOMPurify 31 KB, `CodeEditor.tsx` 25 KB, `canonical-gantt-overlay.ts` 23 KB, `semantic-review.ts` 22 KB, `workspace-storage.ts` 19 KB, fflate 14 KB, `document-format/validate.ts` 15 KB.

Memory (main frame, after forced GC; 2 tabs of 60 and 40 tasks):

| After                |                  Heap | DOM nodes | Listeners | Renderer iframes | `localStorage` |       IndexedDB |
| -------------------- | --------------------: | --------: | --------: | ---------------: | -------------: | --------------: |
| Load                 |               24.3 MB |     8,794 |       332 |                1 |        11.1 KB |           21 KB |
| 50 / 100 / 150 edits | 27.2 / 27.7 / 28.6 MB |     9,321 |       332 |                1 |        11.6 KB | 98 → 45 → 51 KB |
| 20 more tab switches |               28.8 MB |     6,764 |       332 |                1 |        11.6 KB |           54 KB |

Retired renderer frames are removed and no listener growth was seen. The heap of the renderer iframe and worker cannot be seen from the page and was not measured.

Repo CPU benchmarks (`npm run bench`, this machine) are well inside the [recorded baselines](performance-baselines.md): parse 1,000 tasks 2.0 ms, local fallback render 1,000 tasks 1.07 ms, index 200-diagram project 2.7 ms, save/reopen 200 diagrams 12.1 / 9.0 ms, encrypt and save 50 diagrams 44 ms. **Parsing and project operations are not the bottleneck.**

## Findings — user experience

<a id="u1"></a>

### U1. The renderer reboots on every tab switch, layout-engine change and Code↔preview toggle — high impact

**Evidence**

- `useRenderer`'s boot effect depends on `[enabled, restart, layoutEngine, documentId]` ([use-renderer.ts:311](../apps/web/src/render/use-renderer.ts:311)). Any change disposes the iframe and worker and builds new ones. The new worker gets the 7 MB engine (plus 1.4 MB Graphviz for class, activity and use-case) as fresh `blob:` scripts ([canonical.worker.ts:114-115](../apps/web/src/render/canonical.worker.ts:114)).
- Blob scripts get no V8 code cache, so every boot is a full parse and compile.
- `enabled` is false in Code view and while the new-document dialog is open ([App.tsx:654-659](../apps/web/src/App.tsx:654)).
- In the tab-switch run, 7 switches produced **8 `ready` messages** (8 renderer boots).
- First visit to a tab: 279–379 ms at 1×, 423–594 ms at 4×. A warm render of the same diagram is 80–100 ms. Bench "10 tab switches": 284 ms at 1×, 614 ms at 4×.

**Impact:** "Rendering preview…" after every tab change, every Code→Split toggle and every switch between Gantt/Sequence/WBS (native layout) and class/activity/use-case (Graphviz). On low-end phones each boot also pays the main-thread cost of posting 7–9 MB of script text (see U5).

**Fix**

- Create the renderer once per app session and keep it while the preview is hidden. In Code view, only stop sending render requests.
- Move `documentId` out of the boot effect. It is already part of every request and of the cache key.
- Load Graphviz into the same worker on demand: `importScripts(graphviz)` the first time a Graphviz kind is rendered, not as a reboot trigger.
- Keep the existing cancellation path (terminate a stuck worker) as the only reason to restart.

**Effort:** S–M (one hook plus the frame bootstrap; the existing cancellation and queue tests cover most of it).

<a id="u2"></a>

### U2. The worker is recycled after every 20 renders — medium impact

**Evidence**

- `++completedRenders >= 20` stops the worker ([renderer-frame.ts:37](../apps/web/src/render/renderer-frame.ts:37)). The replacement is booted eagerly, but its first render is JIT-cold.
- In 25-edit runs, render #21 took **256 ms vs ≈174 ms** (4 tasks; engine time 102 vs 10–29 ms) and **380 ms vs ≈263 ms** (100 tasks; engine time 215 vs ≈90 ms).
- The same pattern showed at 4× (276 and 403 ms).

**Impact:** a regular stutter during continuous editing, about every 20 pauses in typing. It costs one full engine compile each time, which on a phone is several hundred ms of a background core plus memory churn.

**Fix:** recycle based on evidence, not count. For example, after N minutes idle, when worker-reported `performance.memory` or the measurement cache passes a threshold, or after an engine exception (already handled). If a count is kept, raise it to 200 or more and recycle while idle (`requestIdleCallback` in the frame after a render with no pending request).

**Effort:** S.

<a id="u3"></a>

### U3. A fixed 150 ms debounce sits in front of every render, including cache hits — high impact for perceived speed

**Evidence**

- The render request is scheduled with `setTimeout(…, 150)` ([use-renderer.ts:353](../apps/web/src/render/use-renderer.ts:353)).
- The cache lookup is inside that timer ([use-renderer.ts:338](../apps/web/src/render/use-renderer.ts:338)). Undo to a cached source and switching back to a rendered tab therefore wait 150 ms for an answer already in memory: tab-back took 182–195 ms at 1×.
- For a 4-task Gantt the engine needed 10–29 ms, but keystroke→result was 165–197 ms. **The debounce is about 85% of the latency.**

**Impact:** the preview feels slow even for tiny diagrams. This matches the reviews' "Rendering preview…" observations.

**Fix**

- Serve cache hits synchronously, before the timer.
- Make the debounce adaptive. Use 0 ms (leading edge) when no render is in flight, and something like `clamp(lastRenderMs × 0.5, 30, 150)` while typing continues.
- Keep the existing 500 ms grace and cancellation for superseded renders.
- Expected keystroke→preview for small diagrams: ≈ 30–50 ms.

**Effort:** S.

<a id="u4"></a>

### U4. A 10-second timeout aborts the engine download on slow networks — high impact on mobile

**Evidence**

- `fetch(url, { signal: AbortSignal.timeout(10_000) })` ([renderer-assets.ts:29](../apps/web/src/render/renderer-assets.ts:29)) applies to the 1.39–1.45 MB gzip engine.
- **Slow 4G:** the download took 7.27 s, close to the limit.
- **Regular 3G:**
  - The first fetch started at 7.0 s and was aborted at 17.0 s. The 100 ms retry then fetched it again.
  - The page got it only because the service worker had meanwhile precached it with unthrottled emulated traffic (`transferSize` 300 B).
  - The first SVG came **16.2 s after Create**.
- On a real 3G link the SW precache competes for the same bandwidth (2.97 MB gz). The retry is likely to time out too, which ends in "The local PlantUML renderer could not start after an automatic retry".
- The startup timeout is `TIMEOUT_MS = 15_000` for the whole boot ([use-renderer.ts:26](../apps/web/src/render/use-renderer.ts:26)).

**Impact:** first-time mobile users on weak connections may never get a preview. Each failed attempt also throws the partial download away.

**Fix**

- Replace the fixed timeout with a stall timeout: abort only if no bytes arrive for 10–15 s. Read `response.body` progressively and show progress ("Downloading renderer 0.6 / 1.4 MB").
- Delay SW precache of the engine until the page's own fetch has finished. Or have the page use the SW-cached copy: `caches.match` first, then reuse the HTTP-cached response.
- Make the boot-level 15 s startup timeout start after the assets arrive, not before.

**Effort:** S–M.

<a id="u5"></a>

### U5. Renderer start does avoidable main-thread work and starts late — medium impact

**Evidence**

- Assets are fetched as text, transformed on the main thread with several full-string passes over 7 MB (`classicEngineScript`, [engine-exceptions.ts:27-30](../apps/web/src/render/engine-exceptions.ts:27); [renderer-assets.ts:31-34](../apps/web/src/render/renderer-assets.ts:31)), and posted to the iframe as strings. A string is structure-cloned; a `Blob` would be passed by reference.
- Cold start at 4× CPU: long tasks of **71, 84 and 112 ms** just as the engine arrives. Warm start at 4×: 92–115 ms.
- The asset strings stay in a module-level `Map` for the whole session ([renderer-assets.ts:6](../apps/web/src/render/renderer-assets.ts:6)).
- The renderer is disabled while the new-document chooser is open and in Code view ([App.tsx:656](../apps/web/src/App.tsx:656)). On a cold first visit, the engine fetch therefore cannot overlap with the time users spend choosing a diagram type. In the cold runs it started only around the time the chooser had rendered (110 ms at 1×, 1.0 s on Fast 4G at 4×, 3.5 s on Slow 4G).

**Fix**

- Do the `classicEngineScript` transform at build time: emit a pre-transformed hashed asset from the Vite plugin.
- Fetch it as `Blob` and post the Blob. The frame already creates its own `blob:` URLs, so it can call `URL.createObjectURL(blob)` without any text decoding on the page.
- Start fetching and booting the worker as soon as the shell is idle (`requestIdleCallback` after the first paint), whether or not the chooser is open and whatever the view mode. Pair this with U1 so it is booted only once.

**Effort:** M.

<a id="u6"></a>

### U6. Stage polls layout every animation frame — medium impact (battery, low-end devices)

**Evidence**

- [StageView.tsx:92-110](../apps/web/src/stage/StageView.tsx:92) runs a permanent rAF loop that reads `clientWidth`/`clientHeight` and calls `getBoundingClientRect()` on the SVG every frame while Stage is open.
- [SelectionDock.tsx:27-29](../apps/web/src/stage/SelectionDock.tsx:27) runs a second loop while a selection exists. It does `querySelectorAll(selector)` plus `querySelectorAll(neighbourSelector)` and a `getBoundingClientRect()` per neighbour every frame (lines 32-60). That makes it O(diagram elements) per frame.
- Measured idle main-thread work: Split 3 ms/s; Stage 25–29 ms/s; Stage plus selection 46 ms/s (20 tasks) and **75 ms/s (150 tasks)**.
- At 120 Hz the loop runs twice as often. On a phone CPU about 4× slower, this is a meaningful share of the main thread and keeps the device from idling.

**Fix**

- Centring: use a `ResizeObserver` on the viewport and the SVG, plus the existing `fit-active-diagram` and zoom events.
- Dock: recompute on `scroll`, `wheel` and pointer-drag events, `ResizeObserver`, and render installs (a mutation or render-result event). Throttle to one rAF per actual change, and cache the neighbour list per render.
- If a fallback poll is kept, stop it once the position has been stable for about 500 ms.

**Effort:** S.

<a id="u7"></a>

### U7. The preview pipeline parses each SVG three times on the main thread — medium impact on large diagrams

**Evidence:** each result is:

1. sanitized with DOMPurify and serialized ([use-renderer.ts:271](../apps/web/src/render/use-renderer.ts:271));
2. re-parsed and re-serialized by the Gantt overlay ([canonical-gantt-overlay.ts:220](../apps/web/src/render/canonical-gantt-overlay.ts:220), [:968](../apps/web/src/render/canonical-gantt-overlay.ts:968));
3. sanitized again into a fragment ([DiagramPreview.tsx:2126](../apps/web/src/DiagramPreview.tsx:2126)).

The schedule-filter path sanitizes a further time ([DiagramPreview.tsx:519](../apps/web/src/DiagramPreview.tsx:519)). For a 100-task Gantt this is ≈16 ms at 1× and **≈64 ms at 4×** (`sanitize-decorated` alone 34.6 ms). It shows as the 78–108 ms long tasks in the 4× `render-100` bench stage.

**Fix:** sanitize once into a `DocumentFragment` (`RETURN_DOM_FRAGMENT`), run the overlay on that DOM, and install it without the string round trip. If defence in depth is wanted after the overlay, DOMPurify can sanitize the fragment in place (`IN_PLACE`), which skips parsing.

**Effort:** M, because the overlay works on strings today. Covered by the canonical-overlay tests.

<a id="u8"></a>

### U8. Whole-app React re-renders on every keystroke and cursor move — low to medium impact

**Evidence**

- One keystroke causes 4–6 commits and 76–130 component renders. One cursor move re-renders `App` and about 21 components.
- `RibbonGroup` renders 42 times per keystroke in Split. The menus (`FileMenu`, `HistoryMenu`, `AddMenu`), `FileSaveStatus` and `StorageStatus` render on every commit.
- The cursor is session state (`update("cursor", …)`, [App.tsx:4424](../apps/web/src/App.tsx:4424)), so it flows through `App` and into the persistence effect.
- `App.tsx` holds 52 `useState`, 48 `useMemo`, 60 `useCallback` and 34 `useEffect`.
- At 1× there were no long tasks while typing. At 4× the worst input delay was 56–88 ms (INP-relevant) across 20 typed characters.

**Fix**

- Wrap `Ribbon`/`RibbonGroup`, the menus and the status components in `memo`, with stable props. Many already get `useCallback` handlers.
- Keep the cursor in a ref or a small external store (`useSyncExternalStore`) read only by the status bar and persistence.
- Longer term: split `App.tsx` state into per-area stores, so a source edit does not re-render the chrome.

**Effort:** S for memoising the chrome; L for splitting state.

<a id="u9"></a>

### U9. Every edit synchronously serializes and stores the entire multi-document session — low impact now, grows with use

**Evidence**

- `saveWorkspaceRecovery(session)` runs in the effect for every content change ([use-persisted-workspace.ts:47](../apps/web/src/use-persisted-workspace.ts:47)). It `JSON.stringify`s every open document into one `localStorage` key ([workspace-storage.ts:835](../apps/web/src/workspace-storage.ts:835)).
- With 12 tabs (490 KB): 45 synchronous writes per 20 typed characters. That is 7 ms of storage time at 1×; at 4×, 35 ms of storage plus 20 ms of serialization.
- `localStorage` is capped at about 5 MB per origin. Large sessions silently fall back to IndexedDB only (that path is handled).

**Fix:** store recovery per document (one key per document id, written only for the document that changed), or coalesce writes to one per animation frame or idle callback with a `pagehide`/`visibilitychange` flush. The design note that "content recovery remains immediate" still holds within one frame.

**Effort:** S–M.

<a id="u10"></a>

### U10. On a tab switch the old preview vanishes instead of staying visible during the re-render — UX polish

**Evidence:** the hook returns `result` only when `result.documentId === documentId` ([use-renderer.ts:365](../apps/web/src/render/use-renderer.ts:365)). After a switch the preview is empty until the new render finishes, which is 280–590 ms today because of U1. Within one document the previous SVG is kept while re-rendering, which is good.

**Fix:** with U1 and U3 most switches become cache hits under 30 ms. For uncached tabs, show a dimmed placeholder sized to the last known SVG size of that document, or the document's last SVG if it is kept (the in-memory cache already holds it until eviction).

**Effort:** S.

<a id="u11"></a>

### U11. The service worker's navigation is network-first with no timeout — not measured

**Evidence:** for `/` and `/index.html`, the SW does `fetch(request)` and falls back to the cache only on rejection ([vite.config.ts:160](../apps/web/vite.config.ts:160)). On a "lie-fi" connection (connected but stalled) an installed PWA waits for the network before showing anything. The warm-start numbers above were measured on a healthy network only.

**Fix:** use a cache-first app shell with a background revalidate (stale-while-revalidate). The app already has an update prompt (`setWaitingWorker`). Alternatively race the network against a timeout of about 2 s, or enable navigation preload.

**Effort:** S.

## Findings — footprint

<a id="f1"></a>

### F1. The main chunk ships features most sessions never open at startup

**Evidence**

- `index-*.js` is 1,016 KB raw / 307 KB gz, and only 22% of it runs for a first Gantt render.
- Statically imported into `App.tsx`: `StageView` (`App.tsx:27`), `ResourceWorkloadPanel` (`:82`), `ProjectNavigator` (`:88`), `MobileWorkList` (`:11`), `NewDocumentDialog` (`:107`), `PersonalStarters` (`:106`).
- Also in the entry: `GanttForecastView` (14 KB), `semantic-review` (22 KB), `semantic-symbol-provider` (11 KB), `schedule-analysis` (11 KB), the folder and embedded project hooks (19 KB), `ProjectLinksPanel` (8 KB), `workspace-backup` (6 KB), `jira-integration/pull` (5 KB), fflate (14 KB, only needed when saving gzip) and `document-format/validate` (15 KB, only needed for open/save).
- Together that is about 200 KB raw / 60 KB gz.

**Fix:** `lazy()` these behind their entry points, the same way the dialogs already are. Load fflate and document-format on first save or open. Keep `NewDocumentDialog` eager only on first visit, or preload it at idle.

**Effort:** M.

<a id="f2"></a>

### F2. All six diagram parsers and the whole stylesheet load up front

**Evidence**

- `diagram-engines` (131 KB, 15% used for a Gantt) is one manual chunk ([vite.config.ts:262](../apps/web/vite.config.ts:262)) and is modulepreloaded.
- The single 169 KB CSS file blocks rendering, and 7% of it is used at startup.

**Fix:** split `manualChunks` per diagram family (`diagram-gantt`, `diagram-sequence`, …) and load them through the adapter registry when a family is first used. Split CSS along the same lines (dialogs, Stage, reports and help into their lazy chunks; Vite does this automatically once the components are lazy).

**Effort:** M.

<a id="f3"></a>

### F3. Production serves gzip only and short cache lifetimes

**Evidence**

- `https://plantuml.brosenius.se` (Cloudflare in front of GitHub Pages) returned `content-encoding: gzip` even with `Accept-Encoding: br`.
- Fingerprinted `/assets/*` files are served with `cache-control: max-age=14400` (4 hours, not `immutable`). HTML has `max-age=600`.
- Brotli would cut the engine from 1.39 to 1.06 MB, Graphviz from 0.60 to 0.48 MB, the startup shell from 0.53 to 0.44 MB, and the SW precache from 2.97 to 2.36 MB.

**Fix**

- Turn on Brotli at Cloudflare (or pre-compress `.br` files and serve them through a rule).
- Add a cache rule giving `/assets/*` `public, max-age=31536000, immutable`. This helps browsers without the SW and makes the SW's own fetches cheaper.

**Effort:** S (configuration only, outside the repo).

<a id="f4"></a>

### F4. The SW precaches everything, about 3 MB gz, on first visit, and duplicates the engine download

**Evidence**

- The precache list holds 97 entries, including all 45 `puml-theme-*` chunks and every lazy dialog: 11.7 MB raw / 2.97 MB gz, 13.7 MB of Cache Storage.
- It is registered 150 ms after the first preview is ready ([pwa.ts:93-95](../apps/web/src/pwa.ts:93)), which is good.
- But the page's own engine fetch went to the network before the SW controlled the page. `install` then fetches the same 1.4–2 MB again, unless the HTTP cache supplies it: possible at `max-age=14400`, not verified in production.

**Fix**

- Precache the core: shell, engine and worker.
- Cache themes and rarely used dialogs at runtime (the existing fetch handler already caches anything requested).
- In `install`, use `cache.addAll` with `{ cache: "force-cache" }` requests so a just-downloaded engine is reused from the HTTP cache.

**Effort:** S.

### F5. Memory and storage growth — no problems found

**Evidence**

- Main-frame heap rose 24.3 → 28.8 MB over 150 edits and 20 tab switches. Listeners stayed at 332, there was one renderer iframe, and the DOM node count fell back after switching.
- Automatic versions are capped at 30 per document (`AUTOMATIC_VERSION_LIMIT`, [workspace-storage.ts:121](../apps/web/src/workspace-storage.ts:121)). IndexedDB stayed between 21 and 98 KB.
- Old SW caches are deleted on activate.
- The render cache is capped at 50 entries / 20 MB (UTF-16 estimate), [use-renderer.ts:29](../apps/web/src/render/use-renderer.ts:29). Its byte total is recomputed over the whole cache on every insert (line 280); harmless at 50 entries.

**Suggested follow-up:** a multi-hour, many-tab soak that also tracks renderer-process memory (the worker is invisible to page heap APIs). Once U2's count-based recycle is removed, give the worker its own memory guard.

### F6. Tooling: `bench:browser` is broken on main

**Evidence:** [benchmarks/browser.mjs:48](../benchmarks/browser.mjs:48) waits for `Close project inspector`, which no longer exists after the usability update, so `npm run bench:browser` times out.

**Fix:** update the selector, and add the keystroke→result and tab-switch measurements from this investigation, so U1–U3 have regression baselines.

**Effort:** S.

## Prioritised roadmap

**Quick wins** (each S, about 1–2 days in all; together they remove most perceived preview latency):

1. U3 — serve render-cache hits synchronously and make the 150 ms debounce adaptive.
2. U2 — remove or relax the 20-render worker recycle; recycle when idle or on a memory signal.
3. U4 — use a stall-based download timeout with progress, so the renderer always starts on slow links.
4. U6 — replace Stage's two rAF loops with `ResizeObserver` and event-driven updates.
5. F3 — enable Brotli and long `immutable` caching for `/assets/*` (Cloudflare configuration).
6. F6 — fix `bench:browser` and add keystroke and tab-switch timings to it.
7. U11 — use a cache-first shell with revalidation in the service worker.

**Next** (S–M, about 1 week):

8. U1 — one long-lived renderer across tabs, views and layout engines; lazy Graphviz in the same worker. _Biggest single UX win after U3._
9. U5 — build-time engine transform, `Blob` hand-off, renderer warm-up at idle (also covers the type chooser and Code view).
10. U9 — per-document or frame-coalesced recovery writes.
11. U10 — keep a sized placeholder or last SVG visible across tab switches.
12. F4 — trim the SW precache to the core; cache themes and dialogs at runtime.
13. U8 (part 1) — memoise the ribbon, menus and status components; move the cursor out of `App` render state.

**Bigger changes** (M–L):

14. U7 — single-parse preview pipeline: sanitize once to a fragment and run the overlay on the DOM.
15. F1 and F2 — lazy feature modules, per-family parser chunks and split CSS.
16. U8 (part 2) — split `App.tsx` state into per-area stores.

## Not measured, or measured only partly

- **Real devices.** No physical phone or tablet was used. CPU throttling did not visibly slow the renderer worker, so worker times on phones will be several times higher than shown. Firefox and WebKit were not profiled (see the repo note that local WebKit differs from CI).
- **Mobile preview path.** At 390 px a new Gantt opens Task check-in; the Diagram view on a phone was not timed separately.
- **Production network.** Real CDN latency, HTTP/2 or HTTP/3 behaviour, and whether the SW precache actually re-downloads the engine (F4) were not measured. SW traffic was not throttled in the network-emulation runs, which understates first-visit contention on slow links (U4).
- **Renderer-process memory** (iframe plus worker heap), long multi-hour sessions, and many browser tabs at once.
- **Graphviz-family keystroke latency** (class, activity, use-case). Only their first-render-after-switch time is included.
- **Very large diagrams.** A generated 300-task Gantt produced no SVG within 60 s in the Stage harness, most likely the 4,096 px engine cap described in [large-document-next-steps-2026-10-11.md](large-document-next-steps-2026-10-11.md). It was not investigated. The 200-member project figures come from the existing benchmarks only.
- **Collaboration** (Yjs, 90 KB lazy chunk), Jira sync, export (PNG/PDF), and Presentation mode.
- **React Profiler timings.** Render counts came from a DevTools-hook shim, not per-component durations.

## Implementation results (perf/roadmap)

Roadmap items 1–13 were implemented on branch `perf/roadmap` (from `origin/main` at `2cf3e8e1`), one commit per item. "Before" numbers were measured on a production build of `origin/main` and "after" numbers on a production build of the branch, on the same machine and with the same harness as the investigation (`vite preview`, Playwright Chromium, fresh context, 1× CPU unless stated). Where the report already gave a baseline, the re-measured value matched it.

### Status by item

| #   | Item                   | Status  | Notes                                                                                                                                                                                                  |
| --- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | U3 adaptive debounce   | Done    | The wait is 75–150 ms, never 0 (see "Behaviour changes"). Cache hits are served before any timer.                                                                                                      |
| 2   | U2 worker recycling    | Done    | Recycle only after 500 renders **and** 20 s idle. Engine failures and cancellation still restart the worker.                                                                                           |
| 3   | U4 stall timeout       | Done    | Fails after 15 s without bytes. Progress is shown in the preview notice. The startup timer now starts after the assets arrive.                                                                         |
| 4   | U6 Stage polling       | Done    | `watchLayout`: ResizeObserver, MutationObserver, scroll, wheel, resize and fit events, plus one trailing call. No fallback polling.                                                                    |
| 5   | F3 Brotli and caching  | Skipped | The site is GitHub Pages behind Cloudflare. No file in this repo can set response headers there (`_headers` is read only by Cloudflare Pages and Netlify). Exact dashboard settings are below.         |
| 6   | F6 `bench:browser`     | Done    | Fixed, plus keystroke, first-visit and cached tab-switch timings and a renderer-boot counter. `BENCH_ORIGIN` measures a running server.                                                                |
| 7   | U11 cache-first shell  | Done    | See the behaviour change below.                                                                                                                                                                        |
| 8   | U1 long-lived renderer | Done    | One iframe and worker per hook for its whole life. Graphviz is added to the running worker on demand.                                                                                                  |
| 9   | U5 earlier, cheaper    | Partial | Idle pre-warm done. Build-time engine transform and `Blob` hand-off not done (see below). Warm start is therefore unchanged, about 310 ms.                                                             |
| 10  | U9 coalesced writes    | Done    | One write per animation frame (timer backup at 100 ms), flushed on `pagehide`, when hidden and on unmount.                                                                                             |
| 11  | U10 last SVG kept      | Done    | A document's newest cached SVG stays visible (with the existing stale styling) while its changed source renders. No sized placeholder for never-rendered tabs.                                         |
| 12  | F4 precache            | Partial | Hashed assets are precached with `cache: "force-cache"`, the shell with `cache: "reload"`. The precache was not trimmed (see below).                                                                   |
| 13  | U8 part 1              | Partial | File, history and insert menus and the save and storage status are memoised behind stable handlers. The ribbon groups still render, and the cursor was **not** moved out of session state (see below). |

### Before and after

| Metric                                                                        | Before                        | After                                     | Item     |
| ----------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- | -------- |
| Keystroke → preview, 4-task Gantt (median of 25)                              | 174 ms                        | 99 ms                                     | U3       |
| Keystroke → preview, 100-task Gantt (median of 25)                            | 259 ms                        | 178 ms                                    | U3       |
| Keystroke → preview, `bench:browser` (median of 45)                           | 178 ms                        | 103 ms                                    | U3, F6   |
| Same, with a 0–30 ms floor (not shipped)                                      | 174 ms                        | 43 ms                                     | U3       |
| Tab switch back to a rendered tab (cache hit)                                 | 173–191 ms                    | 40–51 ms                                  | U3, U1   |
| Render #21 after load (4 / 100 tasks)                                         | 258 / 379 ms                  | 97 / 180 ms (no spike; same as render #2) | U2       |
| Tab switch to a never-rendered tab, 3 distinct tabs (harness)                 | 290–351 ms                    | 139–193 ms                                | U1       |
| First visit, `bench:browser` median (15 samples)                              | 316 ms                        | 175 ms                                    | U1       |
| Renderer boots in 7 tab switches                                              | 8 `ready` messages (bench: 7) | 1 (bench: 0 after the initial boot)       | U1       |
| Code → Split toggle                                                           | 65 ms                         | 29 ms                                     | U1       |
| Frames with no diagram after switching back to a tab whose source changed     | 33–35 of 72                   | 0 of 72                                   | U10      |
| Regular 3G, cold: engine fetch                                                | aborted at 10 s, retried      | one fetch, 7.1 s → 22.9 s, no retry       | U4       |
| Create → first SVG after 2.5 s in the chooser, 1× CPU                         | 305 ms                        | 225 ms                                    | U5       |
| Same, 4× CPU, Fast 4G, 4 s in the chooser                                     | 450 ms                        | 252 ms                                    | U5       |
| Warm start to first SVG                                                       | 318 ms                        | 310 ms                                    | U5 (n/a) |
| Stage idle main-thread time, 20 / 150 tasks                                   | 19 / 20 ms/s                  | 1 / 1 ms/s                                | U6       |
| Stage idle with a selection, 20 / 150 tasks                                   | 39 / 65 ms/s                  | 2 / 2 ms/s                                | U6       |
| Installed app reload while the document request hangs (12 s limit)            | never showed the editor       | editor in 114 ms                          | U11      |
| `localStorage` writes while typing 20 characters (300-task document, 12 tabs) | 45                            | 31                                        | U9       |
| Storage and serialization time for those writes                               | 7.4 + 6.0 ms                  | 5.1 + 4.6 ms                              | U9       |
| Component renders per keystroke (dev build, 100-task Gantt, Split)            | 130                           | 104                                       | U8       |
| Component renders for 10 keystrokes / 10 cursor moves / one drag              | 904 / 240 / 237               | 698 / 190 / 201                           | U8       |
| `RibbonGroup` renders per keystroke                                           | 42                            | 42                                        | U8 (n/a) |
| Cold-visit requests until the service worker has installed (engine requests)  | 109 (2)                       | 107 (1)                                   | F4       |
| Entry chunk, raw / gzip                                                       | 1,015.9 / 307.6 KB            | 1,020.1 / 309.1 KB                        | (code)   |

Notes on the numbers:

- U4 on Regular 3G: the first SVG still appears at about 23.4 s in both builds because the harness's service-worker traffic is not throttled. The baseline only worked because the service worker had cached the engine meanwhile; the new build completes its own download, which is what a real 3G link needs.
- U9 counts `setItem` calls, and each recovery save writes two keys. The remaining writes are navigation saves and unrelated writes.
- U8: the `RibbonGroup` count is unchanged because the groups receive freshly built children from `App` on every render. They are cheap; the saving comes from the menus and status components.
- F4: the second engine request in the baseline was a conditional revalidation with no body in the preview server. The precache bytes are the same (3.0 MB gzip), so the real-world saving depends on the production cache headers (see F3).

### Behaviour changes to know about

- **Debounce floor.** The first version of U3 sent the first edit after a pause immediately (0 ms) and gave 43 ms keystroke latency. With a floor below 45 ms, the Gantt inspector test "edits pauses and links with structured inspector rows" failed in 6 of 10 runs: a preview update landed at about the same moment as the first `input` event of the next field, and React never ran that field's `onChange`, so the typed link label was lost. Adding instrumentation made the failure disappear, so it was **not root-caused**. The old 150 ms wait kept the update outside the test's window, so the same race can exist in the old code at a different offset. Floors of 45, 60, 75 and 100 ms passed 10 of 10 runs. The shipped floor is 75 ms (while typing: half the last render time, 75–150 ms). If this can be reproduced by a person, look at the inspector's field state and the preview's reinstall of the SVG.
- **Second SVG install.** A faster first render exposes that the preview installs the SVG a second time about 140 ms later, when the deferred source analysis catches up. The browser test for member links raced with it, so it now waits for the preview to settle. No app code changed.
- **Browser tests that encoded the old lifecycle were updated, not removed:** `editor-helpers.ts` no longer asserts that no renderer frame exists while the chooser is open (the renderer is now pre-warmed), the code-only view test now asserts the frame is kept and reused, and the render-cancellation and notice tests assert that switching tabs cancels the held render inside the same frame.
- **U11.** An installed app now opens the cached shell immediately and checks for a new service worker in the background. A new version installs with its full precache and is offered through the existing update prompt; before, a reload on a healthy network silently picked up the newest HTML. The shell is fetched past the HTTP cache at install (`cache: "reload"`) so a stale copy cannot become the cached shell.
- **U1.** The renderer (about 7 MB of engine, plus Graphviz after the first Graphviz diagram) now stays loaded for the whole session instead of being freed in Code view. Dialogs that call `useRenderer` still own their own renderer for their own lifetime. A cancelled or failed render still restarts only the worker, and `retry()` still rebuilds the frame. Memory growth of the long-lived worker was not measured; the 500-render idle recycle is the only guard.

### Not done, and why

- **F3.** Apply these in the Cloudflare dashboard for `plantuml.brosenius.se` (nothing in this repo can):
  1. Rules → Transform Rules → Modify Response Header: when the URI path starts with `/assets/`, set `Cache-Control` to `public, max-age=31536000, immutable`. Hashed asset names never change content. Do not apply it to `/`, `/index.html`, `/service-worker.js`, `/manifest.webmanifest`, `/openiconic.js`, `/theme-init.js` or the icons, which are not fingerprinted.
  2. Speed → Optimization → Content Optimization → Brotli: on. If `curl -sI -H 'Accept-Encoding: br' https://plantuml.brosenius.se/assets/<engine>.js` still answers `content-encoding: gzip`, add Rules → Compression Rules for hostname `plantuml.brosenius.se` and file extensions `js`, `css`, `html`, `svg`, `json`, with Brotli first and Gzip second. GitHub Pages sends gzip itself and Cloudflare may pass that through unchanged; this could not be tested from here.
  3. Verify afterwards with `curl -sI` on an asset (expect `cache-control` and `content-encoding: br`) and by reloading the installed app.
- **U5 part 2 (build-time transform, `Blob` hand-off).** It needs a Vite plugin that emits the pre-transformed engine under its own content hash (so a changed transform cannot be served from an old hash), a matching dev-server path, and a changed `renderer-assets` contract. That is the riskiest part of the item. The idle pre-warm covers most of what users feel: the engine is ready before the chooser closes.
- **F4 trimming.** The 45 theme chunks are only about 26 KB gzip in total. Dropping them from the precache saves almost no bytes and would end offline use of themes that were never opened. A two-phase precache that keeps offline use needs a race-free offline test and was left out.
- **U8 cursor.** `onCursorChange` writes to session state, which also drives per-document restore on tab switch and the navigation save on page close. Moving it to a store means writing the outgoing document's cursor before every tab switch and flushing it on `pagehide`; a throttled write could otherwise attribute the cursor to the wrong document. Not safe to rush. The status bar and `App` still re-render on cursor moves.
- **U10 placeholder.** A tab that was never rendered still shows an empty pane until its first render (about 175 ms). A sized placeholder needs the document's last SVG size, which is not stored.

### Tests and checks

- Added unit tests: `render-debounce`, `renderer-frame` (the real frame bootstrap run against a fake worker: lifetime, recycle, cancel, engine failure, Graphviz hand-off), `stall-fetch`, `layout-watch`, `coalesced-writer`, `use-stable-handlers`, `service-worker` (the generated worker run against in-memory Cache Storage), and new cases in `use-renderer.test.tsx` and `use-persisted-workspace.navigation.test.tsx`.
- `npx vitest run apps/web/src packages`: 261 files, 2,604 tests passed.
- `npm run typecheck`, `npm run format:check` and `npm run build`: pass. `npm run lint`: 0 errors and 1 existing warning (an unused directive in `apps/collaboration-worker`).
- Playwright Chromium, whole suite: 562 passed, 3 skipped, 0 failed (16.6 min).
- Playwright Firefox, 16 specs covering rendering, recovery, tabs, Stage and hyperlinks: 89 passed, 3 skipped, 0 failed.
- `npm run test:e2e:pwa` (Chromium and WebKit): 6 passed.
- Playwright WebKit, the same 16 specs as Firefox: 86 passed, 3 skipped, 3 failed (`audit-remediation:148`, `navigation-recovery:32` Sequence, `save-status:87`). All three pass when run alone on the branch. Running three of the spec files in full gave 2 different failures on the branch (`audit-remediation:117`, `navigation-recovery:32` Class) and 2 on `origin/main` (`audit-remediation:117`, `navigation-recovery:32` Use Case), each run taking about 18 minutes. Local WebKit is unreliable for long runs on this machine, and these failures are not attributed to the change.
