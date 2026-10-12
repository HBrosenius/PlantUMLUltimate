# Large-document production-browser audit — 2026-10-11

Follow-up: [performance changes](../2026-10-11-gantt-inactive-analysis/README.md) and [completed oversized-preview/navigation acceptance](../2026-10-11-large-document-completion/README.md) now exist. Targeted 50/200-member and oversized 500-task workflows subsequently passed in WebKit as well as Chromium and Firefox. The original measurements and aborted full WebKit run below remain historical evidence.

The main finding is a rendering boundary, not a parser or file-size boundary: the installed `@plantuml/core` 1.2026.6 rejects diagrams wider or taller than 4,096 pixels. Four generated workloads exceeded that boundary. The app retained the previous preview and exposed the error; source, task-table editing and portable save/reopen remained available.

The second finding is interaction latency below that boundary. A valid 200-task schedule took about 3.6 seconds per title edit to display an updated preview in Chromium, including a main-thread task longer than one second. A CPU profile identifies repeated Gantt overlay geometry calculation as one concrete optimization target.

## Scope and method

Application baseline: `b7f73b7`, production Vite build, installed dependencies. No application code or renderer limits changed. Browser automation, fixtures and this report were added. Previous documentation changes in the checkout were preserved.

Machine: Windows 10.0.26300, AMD Ryzen 9 3900X, 24 logical CPUs, approximately 32 GiB RAM, Node 24.14.1. Desktop viewport: 1440 × 1000. The browsers run serially without CPU/network throttling. Timings describe this machine and automation overhead; they are not comparisons against the historical Apple Silicon baselines.

Workloads combine the existing weekend-aware fixture with generated schedules, sequence messages, class relationships, WBS hierarchies, and 50/200-member portable documents. The multi-diagram fixtures have five retained revisions per member, one registered endpoint per member, and 24/100 cross-diagram links respectively. They exercise Gantt, Sequence, Class and WBS, not every diagram family. The 100-class workload intentionally has a long dependency chain and cross-links; its width does not imply that every 100-class model will fail. Layout, fonts and labels determine rendered dimensions.

For each renderable generated single diagram, measured one initial replacement and five distinct title edits through the source editor's keyboard path, waiting for a matching renderer result and current preview. Then searched for a late object through Outline and saved/reopened the native file. Multi-diagram runs explicitly selected the first member after opening, switched to three late members, and saved/reopened. Decoding the saved bytes checked every original member source and link. For oversized diagrams, checked outline search, exact saved source, reopening with a visible render failure, and recovery to a smaller diagram. The 500-task case also expanded all table rows and edited/undid both the first and last tasks.

File System Access pickers/writes use an in-memory handle adapter, while the application's actual open/save, compression, history and codec paths run normally. This does not test OS disk errors, real file permissions or synced-folder conflicts. Fixtures are synthetic except the existing repository example; no private customer document was used. Initial loads and save/reopen are single observations, not five-run medians. Heap figures in raw output include automation instrumentation and are not used to diagnose a memory leak. Long-task observations are used only for Chromium; other engines do not provide equivalent observer coverage.

## Chromium results

Coverage: Chromium and Firefox each completed all 12 workloads: eight rendered successfully and four reached the engine dimension limit. All source-preservation and recovery checks for those oversized cases passed. Both browsers preserved every source and link in the 50/200-member documents.

**WebKit is inconclusive.** Four cases were recorded before the browser closed and the run aborted. Near that failure, Windows reported approximately 1.8 GiB free physical memory and only 372 MiB available committed memory; separate Node lint processes also failed to allocate memory. This does not establish that the application caused the WebKit failures. Rerun WebKit with sufficient system headroom. Timings below are descriptive observations on an uncontrolled desktop, not a controlled benchmark.

| Workload                       |        Initial source to current preview | Median title-edit to current preview (5 edits) | Outline search | Save / reopen |
| ------------------------------ | ---------------------------------------: | ---------------------------------------------: | -------------: | ------------: |
| Existing project fixture       |                                   0.76 s |                                   Not repeated |          21 ms | 0.12 / 1.65 s |
| 50 tasks                       |                                   1.79 s |                                         1.31 s |          27 ms | 0.18 / 2.15 s |
| 200 tasks                      |                                   3.88 s |                                         3.60 s |          42 ms | 0.37 / 3.79 s |
| 12 participants / 100 messages |                                   0.64 s |                                         0.51 s |          18 ms | 0.12 / 1.57 s |
| 15 classes / 19 relationships  |                                   0.66 s |                                         0.45 s |          18 ms | 0.11 / 1.57 s |
| WBS root + 150 nodes           |                                   0.80 s |                                         0.56 s |          17 ms | 0.12 / 1.61 s |
| 50 diagrams / 24 links         | 2.24 s including import/member selection |                                   Not repeated |          34 ms | 0.15 / 0.49 s |
| 200 diagrams / 100 links       | 4.85 s including import/member selection |                                   Not repeated |          48 ms | 0.71 / 2.24 s |

Raw results: [final browser run](final-results.json). CPU investigation: [profile run](project-profile-results.json), [200-task CPU profile](chromium-gantt-200.cpuprofile). Use the final run for workflow outcomes; earlier runs exposed audit assumptions corrected before the final run.

## Confirmed findings and next focus

### 1. Large diagrams cross the engine dimension limit

| Workload                        | Rejected dimensions |
| ------------------------------- | ------------------- |
| 500 tasks                       | 2260 × 9140         |
| 30 participants / 300 messages  | 4680 × 8819         |
| 100 classes / 132 relationships | 23125 × 2973        |
| WBS root + 300 nodes            | 5453 × 606          |

The error is `Diagram too large for browser rendering: … (max 4096)`. The corresponding check exists in the installed `node_modules/@plantuml/core/plantuml.js`; this audit did not change or bypass it. Source validity is independent of this render limit.

**Next focus:** investigate a supported upstream route to larger SVGs before changing the engine adapter. Design an actionable large-diagram state: explain that the source is valid but the preview exceeds its dimension budget, offer source/table/outline navigation, and guide users toward smaller views or diagrams. Preserve the render timeout, isolation and resource bounds. Simply raising the cap is not an established safe fix.

Evidence: [500-task failure](chromium-gantt-500-failure.png), [Sequence failure](chromium-sequence-30-300-failure.png), [Class failure](chromium-class-100-failure.png), [WBS failure](chromium-wbs-300-failure.png). The 500-task table initially mounts 100 rows; expanding to 500 took 1.50 seconds in Chromium. First/last progress edits and one-step Undo passed, and the entire original source survived native save/reopen.

### 2. Valid medium-large Gantt documents block the main thread

The unprofiled 200-task initial load recorded a 1,173 ms main-thread task. A separate CPU-profiled run recorded a 1,432 ms task; profiling changes timings, so those runs are not interchangeable. The worker engine took about 1.4 seconds on the initial profiled render, while the whole update took 4.1 seconds. Worker rendering alone does not explain the whole delay.

The profile maps the minified `ch` function at production bundle line 17580 to `pathBounds` in `apps/web/src/render/canonical-gantt-overlay.ts`; it accounts for approximately 165 ms of sampled self time. Source inspection confirms the task loop repeatedly filters all painted paths and computes their bounds, then recomputes some bounds for matched geometry. Repeated rectangle attribute reads, SVG parsing, React work and browser-native activity also appear. This is a confirmed hotspot, not proof of one exclusive cause.

**Next focus:** cache immutable shape geometry once per SVG and index shapes by row rather than scanning/reparsing every shape for each task. Profile SVG parsing/sanitization and preview insertion separately, retaining sanitization. Reuse this workload to compare before/after on the same machine, with matching output and hit-target correctness tests.

Evidence: [200-task view](chromium-gantt-200.png), [CPU profile](chromium-gantt-200.cpuprofile), `apps/web/src/render/canonical-gantt-overlay.ts` task/shape loop.

### 3. Large-document navigation needs a clearer entry and useful overview

Opening a multi-diagram file loads its navigator but keeps the previously active standalone diagram until a member is selected. Import succeeded in the early runs; waiting for an automatically selected member was an audit mistake. Likewise, reopening the same document can reuse tabs instead of creating a tab with the newly supplied filename. Neither observation was counted as an application failure in the final run.

At 50/200 members the navigator presents long per-diagram lists. Manifest serialization sorts documents by UUID; the displayed overview inherits that order rather than a useful name/workstream order. Full-diagram fitting also makes task labels too small for comfortable reading even before the renderer limit. Outline search remains quick, which is a useful foundation.

**Next focus:** land visibly inside the opened document or make member selection the explicit next step; add searchable/grouped document navigation with stable human-meaningful ordering. Evaluate a readable initial zoom and a separate overview rather than requiring users to read the entire fitted chart. Validate with realistic find/edit/switch tasks, preserving the fast Outline path.

Evidence: [50-task fitted chart](chromium-gantt-50.png), [200-task fitted chart](chromium-gantt-200.png), [50-diagram document](chromium-document-50.png), [200-diagram document](chromium-document-200.png). No new feature was implemented from these recommendations.

## Reproduce

In one terminal:

```powershell
npm run build
npm --workspace @plantuml-studio/web run preview -- --host 127.0.0.1 --port 4175
```

In another terminal at the repository root:

```powershell
node benchmarks/large-documents.mjs chromium firefox webkit
```

Results default to `test-results/large-documents` so reruns preserve this checked-in audit. Optional environment variables: `LARGE_DOCUMENT_ORIGIN`, `LARGE_DOCUMENT_OUTPUT`, `LARGE_DOCUMENT_REPORT`, `LARGE_DOCUMENT_RUNS` (default 5), `LARGE_DOCUMENT_FILTER` (case-name regex), and `LARGE_DOCUMENT_PROFILE=1` (Chromium initial-load CPU profiles). The generator writes reusable sources/native files under its output's `fixtures/`. Browser binaries must already be installed.

The first sandboxed build failed with a filesystem `EPERM`; the permitted build outside that restriction passed. Production preview and browser automation also ran with the required access. No deployment, Jira mutation, collaboration message or external email was performed. The existing fixture has four diagnostics; the generated 50/200-task schedules show valid source. An earlier fresh-browser starter-preview stall was not established as a repeatable large-document defect and remains separate from the findings above.
