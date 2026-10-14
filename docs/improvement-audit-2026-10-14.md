# Improvement audit — performance and UX, 2026-10-14

Baseline: `bb1bf00` (origin/main, 2026-10-14 12:33). Line references are against that commit.

## Scope and method

This is a fresh review, deliberately scoped to what the existing records do **not** already cover. The October 13/14 performance work (shared Gantt analysis contexts, geometry reuse, navigation-sidecar recovery writes, six lazy dialogs, interval-tree SVG matching, incremental project index) and UI items A1–A33 are treated as delivered and are not repeated here.

Evidence came from three sources:

- **Static review of the source** at `bb1bf00` (`apps/web/src`, `packages/*`, `vite.config.ts`), with every cited line re-read before inclusion.
- **The deployed site** (`plantuml.brosenius.se`) in a desktop browser at 1440×900 and 375×812, using the Performance API for startup timings and DOM inspection for layout/zoom facts.
- **The existing production build** in `apps/web/dist` (2026-10-11) for raw/gzip chunk sizes. The deployed site's `index` chunk is the same size class (1,637 KB raw / 425 KB transfer), so the numbers hold for the current build.

A full production build and the Playwright/benchmark suites could not be run in this session (no registry access from the analysis environment, and the local `node_modules` carries darwin-only Rollup/esbuild binaries). Items whose expected gain depends on machine timing say so.

Effort: **S** < half a day, **M** one to three days, **L** a week or more. Impact is user-perceived.

## Executive summary — the ten changes worth doing first

| #   | Finding                                                                                                                                                                         | Impact | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | [B1](#b1-selecting-or-hovering-a-task-re-sanitizes-and-rebuilds-the-whole-svg) Every selection, hover and keyboard move re-runs DOMPurify over the whole SVG and swaps the DOM  | High   | M      |
| 2   | [B2](#b2-the-engine-worker-is-rebooted-after-every-syntax-error-cancel-and-every-20-renders) The engine worker is rebooted after each syntax error, cancel and every 20 renders | High   | S      |
| 3   | [B3](#b3-the-7-mb-engine-is-loaded-from-a-data-url-so-it-is-recompiled-on-every-boot) The engine is loaded via a `data:` URL, so browsers cannot bytecode-cache it              | High   | M      |
| 4   | [A1](#a1-first-paint-at-19-s-on-a-fast-connection) First paint at ~1.9 s on a fast connection; nothing is on screen while 2.4 MB of JS parses                                   | High   | S–M    |
| 5   | [A2](#a2-388-kb-of-plantuml-themes-are-inlined-into-the-main-chunk) 44 PlantUML themes (388 KB raw) are inlined into the main chunk                                             | High   | S      |
| 6   | [C1](#c1-the-analysis-pipeline-runs-synchronously-in-the-keystroke-render) The analysis pipeline runs synchronously in the keystroke render; Gantt is parsed twice              | High   | M      |
| 7   | [C2](#c2-linked-wbsgantt-documents-re-parse-the-partner-gantt-on-every-keystroke) Linked WBS↔Gantt documents re-parse the partner Gantt on every keystroke and cursor move      | High   | S      |
| 8   | [E1](#e1-recent-files--import-is-an-unstyled-browser-default-button) "Recent files & import…" renders as an unstyled browser-default button in the startup chooser              | Med    | S      |
| 9   | [E3](#e3-zoom-percentages-are-relative-to-pane-width-not-natural-size) Zoom readout is relative to pane width, so natural size reads as 25–44 % (E2 withdrawn)                  | Med    | S      |
| 10  | [G1](#g1-notices-are-masked-by-the-validity-text-and-cannot-be-dismissed) Interaction notices are masked by the validity text and cannot be dismissed                           | High   | M      |

## A. Startup and bundle

### A1. First paint at ~1.9 s on a fast connection

**Partly delivered 2026-10-14** (`5f4121b`): themed root background, pre-paint theme mirror, styled restoring state and scheme-aware `theme-color`. The static shell skeleton and the parse-time cuts (A3, A4) remain open.

Measured on the deployed site (Performance API, cold load, dark theme): TTFB 129 ms, all initial JS/CSS transferred by ~620 ms (425 + 127 + 60 + 36 KB JS, 28 KB CSS), `DOMContentLoaded` 662 ms, **first paint / FCP / LCP 1,948 ms**. Roughly 1.3 s is spent parsing and executing 2.4 MB of decoded JS, running `App`'s ~175 hooks once, and awaiting the IndexedDB workspace restore before anything is painted. `html`/`body` have no background (`styles.css` sets it on `.app`), so dark-theme users get a white flash followed by a black one.

Fix (S): give `html` a `light-dark()` background matching the theme and render a static app-shell skeleton (header bar, tab row, split panes) in `index.html` that `App` replaces. Fix (M): the chunk reductions in A2–A4 shorten the parse phase itself.

### A2. 388 KB of PlantUML themes are inlined into the main chunk

**Delivered 2026-10-14** (`f01e587`).

`render/bundled-themes.ts:1-5` uses `import.meta.glob(..., { eager: true, query: "?raw" })`, pulling all 44 theme files into `index-*.js`. The only consumer is `expandBundledTheme` (`render/plantuml-source.ts:34`), which runs only when the source contains `!theme <name>`, and the renderer path is already async (`use-renderer.ts:339`).

Fix (S): `eager: false`, keep a static list of theme names for completion, and `await` the single theme module inside `sourceForPlantUmlRenderer`. Expected ≈ 60–80 KB gzip off the first load and a measurable parse-time cut.

### A3. All six diagram kinds load eagerly

**Delivered 2026-10-14.** The Sequence, Use Case, Class/Component, Activity and WBS previews, forms and inspectors (with `ClassEditors`, `ActivityEditors` and the Open Iconic list) load through `lazyFeature` the first time a document of that kind is shown. The always-mounted `*Dialogs`/`*Inspectors` wrappers are now mounted only while their kind is active and use a new `silent` fallback, since they usually render nothing. Gantt stays eager as the default kind. Initial `index` chunk: 1,206 KB / 348 KB gzip → 950 KB / 288 KB gzip (1,381 KB / 403 KB before A4).

`App.tsx:33-38` statically imports every `*DiagramPreview` (Sequence 62 KB, WBS 39 KB, Class 29 KB, Activity 25 KB, Use Case 24 KB of source), and `App.tsx:46-66, 107-110, 157-160` import every `features/<kind>/{Dialogs,Inspectors}` plus `ClassEditors` (50 KB), `ActivityEditors` (30 KB) and `wbs-openiconic-icons.ts` (47 KB). A Gantt-only session pays for all of it.

Fix (M): one `lazyFeature` per kind wrapping preview + dialogs + inspectors (the controller/action hooks are small and can stay eager). This pairs naturally with the `<Kind>Workspace` seam in J1.

### A4. Reports, Collaboration, Jira client and yjs are eager

**Delivered 2026-10-14.** Reports, Export, Collaboration, Help, Format source and Linked work preview load through `lazyFeature`. The Project inspector stays eager: it opens automatically on new Gantt documents, and loading it late shifted the editor layout under the cursor. yjs now arrives with the first collaboration session: `CollaborationSession` moved to `collaboration-session.ts` (dynamically imported by `startCollaboration`, with a start-attempt guard so a leave cancels a pending start), and the plain shared-document conversions moved to `shared-document.ts` so the single-file project no longer pulls yjs. The Jira network client was already confined to the lazy `JiraDialog` chunk; the hook keeps only the tree-shaken binding helpers. `DiagramOutlineDialog` stays eager because its panel can be docked; `NewDocumentDialog` stays eager because it is the first thing new users see. Initial `index` chunk: 1,381 KB / 403 KB gzip → 1,206 KB / 348 KB gzip.

`App.tsx:18` imports `ReportsDialog` (the `features/reports` tree is ~94 KB of source including chart/HTML/text renderers); `ExportDialog`, `CollaborationDialog`, `HelpDialog`, `NewDocumentDialog`, `DiagramOutlineDialog`, `ProjectInspector`, `ResourceWorkloadPanel`, `FormatSourceDialog` and `LinkedWorkPreviewDialog` are all already rendered behind `open &&` flags, so wrapping them in `lazyFeature` is mechanical (S). `collaboration.ts:1` and `collaboration-document.ts:1` `import * as Y from "yjs"` and are reached from `use-collaboration-lifecycle.ts`, which `App` always imports; `use-jira-integration.ts` pulls `@plantuml-studio/jira-integration` (49 KB) even though `JiraDialog` itself is lazy. Fix (M): have `useCollaborationLifecycle` dynamically import the yjs-backed module only when a room link is present or the dialog opens; move the Jira client behind the lazy dialog.

### A5. Service worker precache fetches the engine twice and re-downloads it on every release

`vite.config.ts:94` precaches every emitted file with `cache.addAll(PRECACHE)`, including the 7 MB engine and 1.4 MB Graphviz. `pwa.ts:93-95` registers 150 ms after the editor is ready, by which time `loadRendererAssets` is already fetching the same URLs for the first preview — so a first visit normally downloads ~8.5 MB twice. Every build changes `CACHE`, and `addAll` refetches everything, including the content-hashed, unchanged engine. One failed file aborts the whole install.

Fix (S): precache only the shell eagerly and let the runtime `fetch` branch (`:105`) cache engine assets on first use; in `install`, copy same-path entries from the previous `plantuml-ultimate-*` cache instead of refetching; only `cache.put` navigation responses when `response.ok && !response.redirected`, since a cached redirect poisons the offline fallback.

### A6. Track chunk composition like the other baselines

`manualChunks` (`vite.config.ts:164-170`) only splits vendors. Adding `rollup-plugin-visualizer` output to `bench:browser` would make A2–A4 regressions visible in the same place the timing baselines live (S).

## B. Rendering pipeline

Pipeline as read: engine (worker, linkedom DOM) → SVG string → iframe → `postMessage` → **DOMPurify #1** + `XMLSerializer` (`use-renderer.ts:270`) → cache → `DOMParser` + overlay + serialize (`canonical-gantt-overlay.ts:220/956`) → parse/serialize again in `legend.ts:68-80` → string `.replace` for selection markers → optional parse/serialize in `schedule-analysis.ts:403/482`, `remote-edit-badge.ts:5/34`, `gantt-forecast-overlay.ts:116-117/275` (which re-runs `sanitizeSvg`) → **DOMPurify #2** (`DiagramPreview.tsx:2036`) → `replaceChildren`. That is two sanitizer passes and three to six XML parse/serialize round trips per preview on the main thread. The October 14 record attributes ~150 ms of a 200-task preview to incoming sanitization alone.

### B1. Selecting or hovering a task re-sanitizes and rebuilds the whole SVG

**Delivered 2026-10-14** (`e59a34a`).

`DiagramPreview.tsx:441-558`: `selectedSvg` injects `data-selected`, `data-jira-status`, `data-project-linked` and remote-edit attributes by string `.replace` over the full SVG (one O(n) scan per task for Jira/linked IDs at 474-486). `MemoizedSvgMarkup` (2036-2046) then runs DOMPurify #2 and `replaceChildren`, after which `alignClosedDayHatching` (570-581) calls `getBBox()` on every `<text>` node. Every click, arrow-key move, hover highlight and Jira status refresh pays this; on a 200-task Gantt that is on the order of 200–300 ms per selection.

Fix (M): keep the installed fragment stable and toggle these attributes/classes directly on live elements in a `useLayoutEffect` (`querySelector('[data-task-id="…"]')`), reserving the string path for structural decorations. Tag weekday labels in the overlay (`data-timeline-header="weekday"`) so `alignClosedDayHatching` measures only those (S).

### B2. The engine worker is rebooted after every syntax error, cancel, and every 20 renders

**Delivered 2026-10-14** (`71691e6`, also covers B4). The 20-render cap is retained pending memory measurements.

`renderer-assets.ts:82-88`: any `result` carrying `error` calls `stop()`, and `canonical.worker.ts:140-142` classifies PlantUML's rendered "Syntax Error?" text as an `error` result. So the common mid-edit state — a transiently invalid line — discards the warm engine; a replacement is started immediately but must re-`importScripts` the 7 MB engine before the next preview can render. A `cancel` (`:104`, sent by `use-renderer.ts:160-167` whenever an edit supersedes a render older than 500 ms) stops the worker **without** pre-starting a replacement, so the next render waits for a cold boot. The `completedRenders >= 20` cap also reboots during ordinary editing.

Fix (S): treat engine-reported syntax errors as normal results and keep the worker; restart only on worker `onerror`, bootstrap failure or timeout; call `start()` right after a cancel so the replacement boots while the user types; raise or remove the 20-render cap once memory is measured to be stable (the worker text-measurement cache is already bounded).

### B3. The 7 MB engine is loaded from a `data:` URL, so it is recompiled on every boot

`renderer-assets.ts:8-16, 111` base64-encode the engine on the main thread and the worker runs `importScripts(data:…)` (`canonical.worker.ts:113-114`). Browsers do not keep a bytecode cache for `data:` or `blob:` scripts, so every boot (per document switch, per cancel/error per B2, per dialog preview instance) re-parses and compiles 7 MB. This is likely a large share of the 3.8 s / 9.5 s first-preview timings in the October 14 record, and it keeps ~12 MB of base64 strings resident for the page lifetime.

**Status (2026-10-14, after implementation review): not feasible as proposed.** The renderer frame is sandboxed with `allow-scripts` only (`use-renderer.ts:212`), so it and its worker run in an opaque origin: `'self'` matches nothing in its CSP, opaque origins have no Cache Storage, blob URLs do not cross origins, and — decisively — the frame is not a service-worker client, so an `importScripts` of the hashed engine URL would bypass the offline precache and break offline startup. Offline rendering works today only because the main thread fetches the engine through the service worker and hands the bytes across as a `data:` URL. A bytecode cache would therefore require dropping the sandbox or adding `allow-same-origin`, which undoes the renderer isolation. The remaining bounded option is to transfer the engine as an `ArrayBuffer` (transferable) and build a `blob:` URL inside the worker, which removes the main-thread base64 step and the 9.5 MB string clone per boot but not the compile; measure before doing it. B2 already removes most unnecessary boots.

### B4. The worker parses the full SVG just to detect "Syntax Error"

`canonical.worker.ts:140-142` runs linkedom's `DOMParser` over the complete result and regexes `textContent`. On multi-MB SVGs this adds ~100 ms per render. Fix (S): regex the raw string (the marker is a literal `Syntax Error?` text node) or use the engine's failure callback; the main thread sanitizes anyway.

### B5. Remaining parse/serialize round trips

`legend.ts:66-81` always parses and serializes when legend entries exist; `canonical-gantt-overlay.ts`, `schedule-analysis.ts` and `gantt-forecast-overlay.ts` each do a full cycle, the last one re-sanitizing. Fix (M): thread one `Document` (or the DOMPurify fragment) through overlay → legend → analysis → forecast and serialize once; or move DOMPurify #1 into the worker (DOMPurify accepts a linkedom `window`) so the main thread has a single sanitization boundary.

### B6. Nothing is shown while the engine boots

`render/local-gantt-renderer.ts` and `renderer.worker.ts` are production-dead (test-only) but can draw a geometric Gantt in under 20 ms. During the 1–10 s first boot `use-renderer.ts` returns nothing. Fix (M): render the local skeleton at reduced opacity and swap it for the first canonical result. Combined with B3 this removes the "blank preview pane" moment that new users see first.

### B7. Drag handlers force layout per pointer event

`DiagramPreview.tsx:792-811` (divider), `1077-1083` (vertical task drag) and `865-893` (connection drag) write `transform` and then call `dividerDropAtY`/`taskIdAtY`/`dependencyAnchorAtPoint` (`2111-2238`), which `querySelectorAll` all task groups and `getBoundingClientRect` each bar/handle — a synchronous layout per event with no rAF coalescing. Fix (S): snapshot row bands and handle rects at drag start (as `timelineColumns` already does at 1011), refresh on scroll only, and coalesce moves with `requestAnimationFrame`.

### B8. Renderer caches are per hook instance

`use-renderer.ts:28, 47`: the 50-entry / 20 MB SVG cache is created per hook, and there are seven call sites (App, baseline, Version History ×2, Delivery Scenario ×2, Presentation, Theme Gallery) → up to ~140 MB with no cross-instance hits. Fix (S): a module-level cache keyed by `(layoutEngine, source)` (drop `documentId` from the key). Related: `canonical.worker.ts:125-126` creates two fresh `nativeTextContext()` objects (new OffscreenCanvas + empty 50k-entry cache) per render although fonts cannot change inside a worker — hoist them to worker lifetime (S).

### B9. Tab switches tear down the iframe and worker

`use-renderer.ts:310` lists `documentId` in the effect deps, and cleanup calls `removeFrame()`; `enabled` flipping with `viewMode === "code"` does the same. Each switch re-pays engine load and worker init. Fix (M): keep the frame/engine alive across documents and recycle only the worker.

## C. Editing responsiveness

Path per keystroke: CodeMirror `updateListener` (`CodeEditor.tsx:457-497`) → `refreshFixes` (synchronous analysis) → `onChange` → `commitSource` → `setWorkspace` → `onCursorChange` → `update("cursor")` → full `App` render → ~40 `useMemo`s keyed on `workspace.source` → persisted-workspace effect → renderer debounce 150 ms.

### C1. The analysis pipeline runs synchronously in the keystroke render

**Delivered 2026-10-14.** The App analysis is keyed on `useDeferredValue`, the editor records quick-fix snapshots lazily and refreshes them in a transition while typing (synchronously after an explicit Apply, so focus can advance), the editor's analysis reuses the App's Gantt parse, and the outline is only built while an outline surface is open. `bench:responsiveness` now also records Event Timing (`slowInputs`, `slowestInputMs`) and accepts `BENCH_CPU_THROTTLE`. Medians of five runs, before → after:

| Stage           | 1× wall      | 4× wall        | 4× long tasks (longest) | 4× slowest input |
| --------------- | ------------ | -------------- | ----------------------- | ---------------- |
| typing-20       | 312 → 152 ms | 1,224 → 583 ms | 8 (91 ms) → 0           | 112 → 80 ms      |
| split-typing-20 | 203 → 152 ms | 788 → 590 ms   | 0 → 0                   | 80 → 64 ms       |
| switch-tabs-10  | 330 → 292 ms | 720 → 625 ms   | 4 (58 ms) → 0           | 64 → 48 ms       |

Per source change, `App` synchronously computes the adapter parse (`App.tsx:512-516`), `diagramAnalysis` (`:1140-1149`, diagnostics + repairs), `resolvedTaskDates` (`:1226`), `resourceOverAllocations`, `legendEntries`, `symbolProvider` (`:836`, whole-document occurrence scan) and `diagramOutlineEntries` (`:1593`); `CodeEditor`'s own `refreshFixes` additionally triggers `parseGantt` inside the analyzer, so a Gantt is parsed twice per keystroke. There is no `useDeferredValue`/`startTransition` anywhere in `apps/web/src`. This is where the remaining ~73–150 ms typing long tasks in the baselines live.

Fix (M): `const analysisSource = useDeferredValue(workspace.source)` and key the derived memos and preview props on it while CodeEditor keeps the live value, so React 19 can paint the keystroke before the analysis. Pass the app's `parsed.value` into the analyzer (or make the editor's `lint` delay the only synchronous analysis) to remove the double parse.

### C2. Linked WBS↔Gantt documents re-parse the partner Gantt on every keystroke

**Delivered 2026-10-14** (`88e4396`).

`use-persisted-workspace.ts:111` spreads a new object for every non-active document on each `setWorkspace`, so `linkedGantt` (`App.tsx:612-614`, an un-memoized `tabs.documents.find`) changes identity on every edit and cursor move. Downstream, `wbsNodeCompletion` (`:623`) and `wbsNodeSchedule` (`:634-657`: `parseGantt` + `resolveTaskDates` + `analyzeCriticalPath`) recompute on every keystroke in a linked WBS. Worse, when a WBS node inspector is open, `App.tsx:5265-5290` calls `parseGantt(linkedGantt.source)` twice **inside JSX** and `parseGantt(item.source)` for every open Gantt tab, on every render.

Fix (S): only spread when `item.viewMode === undefined`; memoize `linkedGantt`/`linkedWbs` by `(documents, activeId)`; replace the JSX IIFEs with one `useMemo` producing `{targetKey, label, ganttTargets}`.

### C3. Cursor movement re-renders the whole App

`CodeEditor.tsx:489-496` → `onCursorChange` → `update("cursor")` → `setWorkspace`: an arrow key runs ~175 hooks and ~2,700 lines of JSX. The navigation sidecar fixed the storage cost but not the render cost. `CodeEditor.tsx:528-531` also does `editor.state.doc.toString() === value` (allocating the full document) on every render. Fix (S–M): keep the cursor in a ref and feed only the status bar/collaboration from it; compare `value` against a `lastEmitted` ref.

### C4. Minor identity churn

`sequenceParticipantNames`/`sequenceMessageAnchors` (`App.tsx:1132-1139`) and `linkedDiagramActions` (`:3718`) are rebuilt each render and defeat memoization in `CommandPalette` (`:5130`). Fix (S).

### C5. Undo history is bounded by count, not bytes

`packages/editor-core/src/history.ts:29, 76-82` keeps 500 entries × (`sourceBefore` + `sourceAfter`) per document; with 500 KB sources this reaches hundreds of MB. Fix (S): cap by bytes or store diffs.

## D. Storage

### D1. Whole-session recovery JSON per content change, written twice

`use-persisted-workspace.ts:46-49` → `workspace-storage.ts:835-839`: every content change synchronously `JSON.stringify`s all open documents (sources, `reportingHistory`, `deliveryScenarios`) and writes it to **two** `localStorage` keys (scoped and legacy unscoped). The October 14 record keeps this deliberately for durability (45 writes / ~29 ms per 20 characters on a 12-document workspace), but the cost scales with open-document count, not with what changed.

Fix (M): per-document recovery records keyed by `documentId` so only the edited document is serialized; write the unscoped legacy copy only on `pagehide`/flush; run `pruneRecoveryJournals` (which `JSON.parse`s every key when >100 exist) once per session instead of on the write path. Durability stays immediate for the active document.

### D2. Version history reads every source to find the latest; three DB opens per version

`use-document-versions.ts:144` and `workspace-storage.ts:610-611` call `loadDocumentVersions` (a `getAll` of up to 30 full sources) just to read `versions[0].id` or a count. `createDocumentVersion` (`509-541`) opens the DB, puts, closes, then `pruneDocumentVersions` opens twice more. Fix (S): `openCursor(…, "prev")` on the existing `historyCreatedAt` index for the latest, `count()` for pruning, and one shared `IDBDatabase` connection for the module.

### D3. `saveWorkspace` clones the session twice and cursors the whole store

`workspace-storage.ts:842-884` puts the session into IndexedDB twice (two structured clones) and runs an `openCursor` over the store on each save. Fix (S): one put, and prune on a timer.

## E. Bugs observed on the deployed site

### E1. "Recent files & import…" is an unstyled browser-default button

`NewDocumentDialog.tsx:128-130` renders the button with no `className` and outside the padded `<header>`, so it paints with the UA default grey background, 2 px outset border and 0 radius, flush against the dialog's left edge (computed: `background rgb(107,107,107)`, `border 2px outset`, `x = dialog.x + 1`). It is the first dialog every new user sees. Fix (S): `className="secondary-action"` and move it next to `Open…`.

### E2. ~~The initial zoom is computed against an unsettled viewport~~ (withdrawn)

**Withdrawn after implementation review.** The 44 % / 25 % readouts on fresh starters are not a layout-timing bug. `.diagram svg { width: 100% }` (`styles.css:1158`) stretches the SVG to the pane, and `initialDiagramZoom` (`initial-diagram-zoom.ts:4-16`) intentionally returns `intrinsic / pane` so a compact diagram is shown at its natural pixel size; "100 %" therefore means "fill the pane", which is why **Fit** produced 100 %. The user-facing problem is only the readout semantics, tracked as E3.

### E3. Zoom percentages are relative to pane width, not natural size

**Delivered 2026-10-14.** Zoom is now stored in natural-size units: `.diagram` sizes to its content and the SVG keeps its intrinsic `width`/`height`, so 100 % is the diagram's natural size and opening an inspector or resizing the pane no longer rescales it. The existing readout and reset buttons became correct as a result; **Fit** is no longer capped at 100 %, so it enlarges compact diagrams to the pane as before; `MIN_DIAGRAM_ZOOM` drops from 0.25 to 0.05 so wide plans can still fit. Sessions move to version 8, which refits each document once; navigation sidecars written before the change keep their cursor and scroll but not their pane-relative zoom (`zoomUnits: "natural"` marks new ones). Supporting fixes: the Gantt overlay no longer adds a percentage `min-width`, and the removed-baseline lane grows the SVG `height` with its `viewBox`. Version History keeps its own width-percentage zoom.

The `.diagram` host is stretched to the pane width and then transformed, so "100 %" means "fill the pane" and a diagram at its natural pixel size reads as 25–44 % (`DiagramPreview.tsx:1256-1257`). Every comparable tool (browsers, Figma, VS Code) uses 100 % = natural size. Fix (S): compute the readout from the applied scale × natural width and make **Fit** a separate state from **100 %**.

### E4. The active tab is not scrolled into view

With the Sequence tab active at 375 px, the tab strip overflowed and the active tab's right edge sat at 433 px (`.document-tabs > button.active` right = 433 on a 375 px viewport). "Next tab" (`App.tsx:3059-3069`) and `newDocument` activate tabs but nothing calls `scrollIntoView`; only focus is set at `:4316`. Fix (S).

### E5. The header wraps to two rows on phones

At 375 px the primary toolbar wraps (`styles.css:252` `flex-wrap`), leaving undo/redo alone on a second row and pushing the editor ~200 px down once the workspace toolbar and the hint banner follow. Fix (M): collapse to Add + overflow menu at ≤ 600 px and move undo/redo into the status bar or overflow.

## F. UI and visual design

### F1. Status colours are hardcoded for light mode and fail contrast in dark mode

`styles.css:58-78, 2413-2423, 3351-3356, 4129, 4980, 2844-2847`: `.connection-offline` uses `#b45309`, `.connected` `#047857`, `.problem-severity.error` `#dc2626`, `.schedule-warning` `#dc2626 !important`; on the dark panel these sit at ~3.2–4.1:1. `.command-list button.selected` is `background: var(--accent); color: white` and in dark mode `--accent` is `#60a5fa`, giving ~2.2:1 for the highlighted palette row. The file has 321 hex literals. Fix (M): add `--success`, `--warning-bg`, `--danger-bg`, `--on-accent` to both theme blocks (lines 25-57, 202-245) and replace the literals.

### F2. Tokens referenced but never defined

`styles.css:2495` `var(--surface)` and `:4829` `var(--border-strong)` have no definition and no fallback, so the declarations are invalid at computed-value time (transparent background / no border). `--muted-text` and `--success` only survive via inline fallbacks. Fix (S).

### F3. Tab names never truncate with an ellipsis

`styles.css:538-547` puts `text-overflow: ellipsis` on `.tab-label`, which is `display: flex` (ellipsis does not apply to flex containers) and keeps `min-width: auto`, so long names overflow the 220 px tab. Fix (S): `min-width: 0` on the label and the overflow rules on an inner span.

### F4. Touch targets in the chrome are far below 44 px

Tab close 17×17 px, tab row fixed at 36 px, toolbar buttons 32 px, split divider 5 px with no enlarged hit area (`styles.css:560-573, 851-855, 274-277`; `App.tsx:4445-4449`). The four `(pointer: coarse)` blocks only enlarge SVG handles. Fix (S): one coarse-pointer block setting `--control-height: 44px`, a 32 px close button and a 24 px transparent `::before` on the divider.

### F5. Typography and radius scale is ad hoc

11 px appears 56 times, 10 px 21 times (on real controls: `styles.css:1677, 6329, 6266, 7576`); radii span 2–12 px with 4/5/6/7 px each used 23–43 times. Fix (M): `--text-xs/--text-sm` and `--radius-sm/md/lg` tokens; no interactive text under 11 px.

### F6. Interaction polish

Only two `:active` rules in the sheet (both SVG), so buttons give no press feedback on touch (S). Reduced motion covers only `.diagram` (`styles.css:2451-2455`); the `remote-edit-*` keyframes and class-drag transitions ignore it (S). No `forced-colors` handling, so the `box-shadow`-based active tab/toolbar states vanish in Windows High Contrast (S). `backdrop-filter: blur(8px)` on sticky inspector footers inside scroll containers (`:5960, 6074`) re-rasterises every scroll frame; an opaque `var(--panel)` is visually equivalent (S).

### F7. One 184 KB, 8,747-line stylesheet with 11 breakpoints

Un-layered, 1,580 rules, 7 `!important`s, `max-width` breakpoints at 480/520/560/600/620/680/700/720/760/850/980 while JS switches at 600 (`use-responsive-view-mode.ts:4`). Z-index uses 21 distinct values including 999/1000/10000; `.modal-backdrop` is z 20 while the status popovers are fixed at z 40, so an open status popover paints over the command palette backdrop (`styles.css:322, 346, 2459`). Fix (L for the split, S for a `--z-*` scale and three canonical breakpoints). No `contain`/`content-visibility` anywhere; the task table, outline results and mobile work list would benefit on 500+ task plans (S).

## G. Accessibility

### G1. Notices are masked by the validity text and cannot be dismissed

`App.tsx:5038-5042` plus `use-interaction-message.ts`: fifty `setInteractionMessage` call sites feed one 12 px span, but `result?.error` and `diagnosticCount` take precedence, so "Render a valid diagram before copying it" (`:2564`) is never shown precisely when the source has problems — the user gets no feedback. Persistent failures have no close button and no severity styling. Fix (M): a small toast region with role per severity, a dismiss button, and priority over the validity text.

### G2. Tab close is an unreachable nested control

`App.tsx:4136-4146`: a `<span role="button">` without `tabIndex` or key handling nested inside the tab `<button>` — keyboard users cannot reach it, and nested interactive content is invalid ARIA. The strip has no `aria-current`; the unsaved state is only an `aria-hidden` dot (`:4129`) plus `title`. Fix (M): sibling close button, `aria-current="page"`, visually-hidden "unsaved" text.

### G3. Live-region noise

`App.tsx:5037-5043` announces "✓ Valid"/"Source has problems" after every render; `FileSaveStatus.tsx:40-42` is a second `role="status"` flipping on every keystroke; `HelpDialog.tsx:253` announces the match count per key; `lazy-feature.tsx:8` is a generic "Loading…" status. Fix (S): keep `aria-live` only for the interaction notice, `aria-live="off"` for validity, debounce the help count, label the loading fallback.

### G4. Keyboard gaps

The split divider gets `tabIndex` only when `taskViewActive` (`App.tsx:4686-4690`), so the code/diagram split cannot be resized from the keyboard (S). There is no `<h1>` outside the error boundary (`App.tsx:3962` uses `<strong>`) and no skip link (S).

## H. Information architecture

### H1. Two stacked toolbars with 12–15 top-level controls

`App.tsx:3961-4091` and `4153-4304`. "Find in diagram" and "Outline" open the same dialog in two modes; Export is three levels deep in File while Collaborate has a top-level slot; Save is only visually weighted once dirty. The preview pane adds up to three more control rows (Navigate / Preview zoom / Timeline scale) plus a hint line before the diagram starts. Fix (M): merge Find/Outline, an always-visible Export/Share, collapse the preview rows into one toolbar with an overflow, and make the hint banner dismiss permanently per diagram kind.

### H2. Render status is buried in a footer `<details>`

`App.tsx:5070-5089`: render timing, the size-limit notice and the error text (duplicated in a `role="alert"` at 5083) sit behind a 12 px summary. Fix (S): surface errors inline in the preview pane with the existing recovery action.

### H3. The startup chooser is long and opens over an already-created diagram

The chooser needs a scroll to reach "Choose a diagram" at 800 px tall, includes an informational line ("Preferences are available later in More → Settings") and sits over a Gantt that is already rendering behind it. Fix (S): put the type cards first, drop the preferences line, and either defer creating the default Gantt or show the chooser as the empty state of the pane.

## I. PWA

- `index.html:12` fixes `theme-color` to `#16191f` while the manifest says `#2563eb`; light-theme users get a dark title bar. Two `media`-qualified `theme-color` tags, updated from `workspace.theme` (S).
- `public/manifest.webmanifest` has no `shortcuts` (New Gantt / New Sequence / Open recent), `screenshots`, `categories`, `display_override` (`["window-controls-overlay","standalone"]`) or `launch_handler`; `index.html:14` uses the deprecated `apple-mobile-web-app-capable` without `mobile-web-app-capable` (S).
- `App.tsx:3901` renders "Restoring workspace…" outside `.app` with no theme (see A1).

## J. Architecture seams in `App.tsx`

`App.tsx` is 6,587 lines (hooks to ~3,901, JSX from ~3,903). The `features/<kind>/use-*-controller/actions` pattern already exists; `App` still owns the wiring. Extractions that each unlock an item above:

1. **WBS↔Gantt linking** (`:611-829, 2149-2375, 3599-3750, 5265-5497, 6015-6144`) → `features/wbs-gantt/use-wbs-gantt-link.ts` + dialogs; fixes C2 by construction.
2. **Document-derived model** (`:512-580, 836-875, 1140-1230, 1593`) → `useActiveDocumentModel(diagramKind, deferredSource)`; this is where C1's `useDeferredValue` lives and gives `DiagramPreview`/`CodeEditor` one stable object instead of ~15 props.
3. **Per-kind workspace** (`<main>` at `:4387-5036` plus `*Dialogs`/`*Inspectors` at `:5506-6236`) → `features/<kind>/<Kind>Workspace.tsx`, lazily loaded (A3).
4. **Command registry + global shortcuts** (`:2893-3218`, `:3300-3418`) → `useAppCommands(ctx)` returning a stable registry for the palette and keydown handler.
5. **Chrome** (header `:3961-4093`, tabs `:4093-4153`, workspace toolbar `:4153-4387`, status bar `:5036-5095`) as memoized components taking small prop objects; today they re-render on every keystroke (C3).

## Suggested delivery order

1. **Quick wins, one slice (S each):** E1, E4, F2, F3, G3, B4, B8, A5, I (E2 withdrawn; E3 is a separate semantics change). All are localized and testable with the existing Playwright suites.
2. **Render path (M):** B2 → B3 (with the CSP review) → B1 → B6. Measure with `bench:render` and the 200-task fixture before and after each.
3. **Typing path (M):** C2 → C1 → C3, using `bench:responsiveness`.
4. **Bundle (S–M):** A2 → A4 → A3, tracked with a chunk visualizer (A6); re-measure A1 on the deployed site after each.
5. **UX (M):** G1, G2, H1, F1, F4, E5.
6. **Structural (L):** the J seams, in the order 2 → 1 → 3, and the stylesheet split (F7).

## Not verified in this session

- Timing gains for B1–B3 and C1 are expectations from reading the code; confirm with the repository's benchmarks on the reference machine.
- Mobile findings were taken from viewport emulation, not a physical device (the A33 real-device gate still applies).
- WebKit-specific behaviour was not re-tested.
