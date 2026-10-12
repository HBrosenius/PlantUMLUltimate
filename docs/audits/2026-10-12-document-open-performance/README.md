# Document opening performance - 2026-10-12

Profiled and improved the 200-diagram production opening workflow. Follow-up to [large-document delivery](../../large-document-next-steps-2026-10-11.md).

## Finding and implementation

The navigator appeared in roughly 1 - 2 seconds in WebKit, but opening the selected member waited behind history restoration for the whole project. A temporarily instrumented intermediate trial measured 21.7 seconds in history restoration, versus about 0.35 seconds per declaration-index pass. Batching all history writes did not materially remove the opening delay. [Phase observations](phase-observations.json) are transcribed from the captured tool output: the original diagnostic and early baseline reports were cleared by the subsequent Playwright run. These observations are not final-build performance results. Temporary application instrumentation and the batched-write experiment were removed.

Unencrypted projects now import browser history for existing member tabs and members when opened. Unopened members retain every version and content record in the decoded portable project; saving does not require importing their histories into browser storage. Member imports are reused on reopening. Linked Gantt/WBS opening awaits both required histories, and snapshot/recovery paths wait for started imports. Generation guards prevent delayed imports from activating members of a replaced project.

Encrypted projects still eagerly establish memory-only history for every member and remove persisted history. This delivery does not claim an encrypted-project speed improvement. Portable decoding still validates all source/history hashes before opening; integrity checks and format limits were not relaxed.

The Chromium profile also identified repeated full-list scans in the links panel. Labels/states now use a memoized lookup, declaration registration uses document/kind/hash identity keys, and registration hashes each member source once per invocation. Identity rules and stale-project guards remain intact.

## Measurements

Same desktop and production workload generator; separate runs, not a randomized or byte-identical A/B experiment. Generated IDs and compressed bytes vary between runs. Opening time includes file opening, selecting the first member and waiting for its current preview. The benchmark records navigator availability and editor availability separately.

| WebKit, 200 diagrams         | Time                      |
| ---------------------------- | ------------------------- |
| Final unchanged baseline     | 34.33 s                   |
| Three optimized observations | 17.88 s, 17.79 s, 17.46 s |
| Optimized median             | 17.79 s                   |

The observed optimized median is approximately 48% below the final baseline. Host load and browser variation affect the numbers; this does not isolate either optimization's contribution. Earlier baseline observations were 32.90 and 34.06 seconds, but their raw reports are no longer retained. The [retained baseline](baseline.json) used the corrected benchmark and unchanged application from `50499b7`. [Final results](final.json), [repeat](repeat.json), [first optimized observation](optimized-first.json) and [summary](measurements.json) preserve the accepted measurement data.

Final 200-diagram first-preview observations: Chromium 3.28 seconds, Firefox 5.08 seconds and WebKit 17.79 seconds. WebKit still has multi-second timer delays: responsiveness is improved, not solved. Further DOM/layout and large link-selector profiling is a justified next investigation. No new picker UI or renderer change is included.

## Acceptance and benchmark corrections

All six final workloads passed: 50 and 200 diagrams in Chromium, Firefox and WebKit. Each exercised named late-member search/open, empty search, clear search, member switching and save/reopen. All original sources, 250/1,000 retained revisions and 24/100 links survived. The repeated WebKit 200-diagram workload passed too. No page errors were recorded in accepted runs.

An early Firefox attempt typed into search before member activation finished; editor autofocus received that text. Waiting only for - Preview current - had accepted the previous diagram's status. Search opening now waits for the selected member's render. Subsequent switching checks verify active tab, visible SVG content and current-preview status, allowing cache hits that emit no new renderer message. A temporary editor-timing check compared full source against DOM text without line breaks; it was corrected to a stable visible marker. These were benchmark failures, not accepted preservation results.

Eight focused browser regressions passed in Chromium and WebKit: portable history, closed-member metadata/unsaved guards, existing-project WBS/Gantt creation, and links between three WBS diagrams. Unit coverage verifies registration identity, fresh labels, unopened history retention, baseline restoration, encrypted isolation, reuse on reopening, linked-member readiness and stale activation prevention. Full `npm run validate` passed: lint, formatting, 2,309 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production web build and both worker dry-run builds. Newly added audit files and the new panel test also passed an explicit Prettier check.

The first two full-suite attempts timed out in the unchanged large-row task-table test; all other 2,308 unit tests passed, and its five tests passed in isolation. The count assertions now query mounted rows directly, with a scoped accessible textbox/value and selected-state assertion for the final row. This avoids a global visibility/name traversal across hundreds of controls without increasing the timeout or changing the component. The subsequent full unit suite passed (224 files / 2,309 tests).

## Reproduce

Build and start production preview in a separate terminal:

```powershell
npm run build
npm --workspace @plantuml-studio/web run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

Run the workload check:

```powershell
$env:LARGE_DOCUMENT_FILTER='^document-(50|200)$'
$env:LARGE_DOCUMENT_OUTPUT='test-results/document-open-check'
node benchmarks/large-documents.mjs chromium firefox webkit
```

Repeat with fresh output directories. Optional `LARGE_DOCUMENT_PROFILE=1` captures a Chromium CPU profile. Inspect `ok`, `fileOpen`, `initial` and `persistence` in each result; the audit records failures in JSON rather than making every expected renderer rejection a process failure. Keep timing thresholds out of ordinary correctness tests. Preserve reports before running Playwright tests, which clean their output directory.

Fixtures are generated stress documents. In-memory file handles exercise actual codec/open/save paths; native OS permissions, disk failures, mobile devices and private customer documents are outside this acceptance. No dependency upgrade or deployment is included.
