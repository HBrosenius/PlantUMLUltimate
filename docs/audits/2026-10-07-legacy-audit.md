> HISTORICAL: This report describes the old 681557f checkout and its preserved audit fixes. The active checkout has been updated to 7f25b1f; see the root SECURITY_STABILITY_AUDIT.md for current status.

# PlantUML Studio — security and stability audit

Date: 2026-10-07

Reviewed commit: `681557f1b3d5e07c55e0a5d95b5e89a69ebff789` plus the current working tree.

Scope: browser application, Gantt parsing and transformations, rendering bridge, file operations, workspace persistence/backups, dependency lockfile, and existing automated checks.

## Remediation update — 2026-10-07

The working tree now contains fixes for the 13 findings below, plus the additional SVG, file-picker, PNG, database-lifecycle, and crash-recovery hardening. The original audit is retained below as historical evidence; its line references and dependency counts describe the pre-fix code.

| Finding | Implemented change                                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01     | Validate finite integers and real dates; bound source size, task counts, calendar scans, scheduling/workload cells, timelines, history, render cache, and PNG dimensions. Reject unsafe input before engine execution.                  |
| F02     | Capture the saving document and source; update only that document, retain dirty state for subsequent edits, prevent overlapping writes, and ignore completions after workspace restoration. Abort failed native writes where supported. |
| F03     | Strictly validate backup schema, unique IDs, settings, capacities, document sizes, and active-document ownership before restoration. Safely normalize legacy recovery data.                                                             |
| F04     | Preserve the latest queued render and match responses to the active in-flight request; ignore obsolete/duplicate replies.                                                                                                               |
| F05     | Guard storage access; report the actual persistence backend or a persistent recovery warning; add a recoverable application error boundary.                                                                                             |
| F06     | Timestamp IndexedDB and local journals and recover the newer snapshot; serialize writes to each recovery record.                                                                                                                        |
| F07     | Give each page lifetime an independent recovery record, resume its own previous record on reload, and retain a shared latest snapshot for new windows. Prune older database records after 100 retained sessions.                        |
| F08     | Track source/document ownership on every SVG; remove stale interaction overlays and disable SVG/PNG export until the active source has a successful matching render.                                                                    |
| F09     | Use the project calendar, reopened dates, and task pauses when calculating resource workloads and warnings.                                                                                                                             |
| F10     | Persist and back up per-document resource capacities, migrate legacy settings, and restore defaults for older backups without capacities.                                                                                               |
| F11     | Run the official engine in a fresh terminable worker; enforce startup/render deadlines, bootstrap retry, manual restart, and recovery after a CPU-bound render is terminated.                                                           |
| F12     | Upgrade Vitest and vulnerable transitive dependencies; regenerate the npm lockfile. The updated test runner requires Node 22.12+, 24, or a later supported release.                                                                     |
| F13     | Wait for bounded recovery initialization before exposing editable controls.                                                                                                                                                             |

Renderer hardening now runs the official engine in a dedicated worker with a virtual SVG DOM and bounded, cooperatively measured font atlas. An opaque-origin iframe, restrictive CSP, and SVG sanitization isolate it from application data and external resources. Each render gets a fresh worker; deadlines and disposal terminate synchronous engine work. Production HTML includes a compatible CSP. Executable preprocessor directives, external includes/data-loading functions, and image directives are refused during local rendering. Source stays editable when rendering is refused. File-picker cancellation/read failures and native write failures are handled explicitly; hidden/pagehide events attempt a synchronous recovery journal.

### Remaining limits

The worker migration provides actual CPU preemption, verified with an intentional infinite engine loop. Complex diagrams can still encounter engine failures or the 30-second render deadline, particularly outside Chromium; correction and retry remain available. The virtual DOM uses rounded and approximated font metrics, so small layout differences are possible. Workers have no application-enforced heap quota, and this is not exhaustive engine fuzzing or a guarantee that every diagram renders in every browser.

No deployed application was supplied, so production HTTP headers and hosting configuration remain unverified. The build's CSP is tested locally; server-level protections such as `frame-ancestors` require deployment headers. Browser/process crashes can still lose uncommitted edits; recovery is not a substitute for file saves or backups. Resuming an independent window record on reload requires session storage; if that identity is blocked or cleared, startup falls back to the latest shared snapshot. Conservative input limits and disabled preprocessor/external-resource features are intentional compatibility changes.

### Remediation validation

| Check                                                         | Result                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ESLint and workspace TypeScript checks                        | Passed                                                                                                                          |
| Unit tests                                                    | 151 passed across 21 files                                                                                                      |
| Complete Chromium browser suite                               | 45 passed, including the 13 new security regressions                                                                            |
| Firefox and WebKit security suites                            | 26 passed: all 13 regressions in each browser                                                                                   |
| Production build and CSP smoke tests                          | Build passed; real SVG rendered without browser errors in Chromium, Firefox, and WebKit                                         |
| Full and production-only npm audits                           | Zero known advisories in both scans                                                                                             |
| Formatting of all changed/new files and Git whitespace checks | Passed                                                                                                                          |
| Repository-wide formatting                                    | Blocked by existing style issues in 70 untouched files; consequently the combined `npm run validate` command is not fully green |

The security regressions cover save races, per-window recovery, denied storage, malformed backups, queued/obsolete renderer replies, actual termination of an infinite CPU loop, SVG sanitization, PNG allocation bounds, delayed hydration, capacity backup restoration, and stalled renderer startup. The existing Chromium suite also exercises editing, large/dense Gantt fixtures, dependencies, calendars, undo/redo, and renderer unloading/reloading. Full Firefox/WebKit editor suites are not claimed as passing; complex-engine/browser compatibility remains a limitation described above.

The production build still reports the large main JavaScript chunk warning (about 803 kB before compression). The new renderer worker is about 178 kB, with engine and Graphviz assets loaded separately. Bundle size remains a performance consideration rather than a resolved security finding. Tests establish the covered behavior; they do not establish the absence of all vulnerabilities.

Performance follow-up: prepare the next clean worker after completion, reuse canvas/SVG measurement lookup contexts separately, and cache bounded browser font measurements. A local Chromium probe measured approximately 2.0 seconds from an edit to its preview, versus 2.7 seconds before this follow-up; these are illustrative local measurements, not a cross-browser performance guarantee. The existing tab context menu was verified by right-clicking a document filename in the in-app browser.

Follow-up validation passed lint, workspace type checks, all 151 unit tests, the production build, and formatting for the changed renderer files. Nine focused browser checks passed across Chromium, Firefox, and WebKit, covering real rendering under isolation, queued request handling, and termination of a CPU-bound engine.

## Original audit — before remediation

### Executive summary

The highest-priority problems are **untrusted input freezing/crashing the editor, saves incorrectly clearing unsaved changes, and insufficient backup validation**. These can cause loss of work or make a recovered workspace unusable.

This review identifies **13 findings: 3 high, 9 medium, and 1 low**, using application-specific impact rather than dependency scanner severity. Eight focused unit probes and three browser probes were run; their results are described below. Some additional findings are established by code review and have not been reproduced end to end.

No application-level remote code execution, credential theft, or exploitable XSS was demonstrated. The app is a static, local-first browser application; there is no application backend or authentication service in the reviewed source. A malicious document or backup still crosses a meaningful trust boundary when a user opens it.

The npm scan reported five affected development-tooling packages, including two classified critical by npm. The production-only scan reported zero known advisories. Neither result establishes that the entire application is secure.

## Findings at a glance

| ID  | Severity | Finding                                                             | Evidence                                            |
| --- | -------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| F01 | High     | Unbounded numeric/date input can hang or crash the editor           | Isolated runtime reproductions                      |
| F02 | High     | Async saves clear newer edits or update the wrong tab               | Browser reproduction; tab-switch path reviewed      |
| F03 | High     | Malformed backups can crash the UI or couple unrelated documents    | Runtime validation probes; downstream code reviewed |
| F04 | Medium   | Renderer completion discards the next queued request                | Deterministic hook reproduction                     |
| F05 | Medium   | Storage denial/quota failures are not handled consistently          | Startup failure reproduced in Chromium              |
| F06 | Medium   | Recovery prefers stale IndexedDB over newer fallback data           | fake-indexeddb reproduction                         |
| F07 | Medium   | Multiple browser windows overwrite each other's recovery data       | Code review                                         |
| F08 | Medium   | Preview/export can use a different document's last render           | Code review                                         |
| F09 | Medium   | Resource workload calculations ignore closed calendar days          | Runtime reproduction                                |
| F10 | Low      | Workspace backups omit resource capacity settings                   | Code review                                         |
| F11 | Medium   | Startup hangs and render failures lack effective restart boundaries | Code review                                         |
| F12 | Medium   | Known advisories remain in development dependencies                 | Live npm audit and upstream advisory review         |
| F13 | Medium   | Delayed hydration can replace edits made during startup             | Code review                                         |

## Detailed findings

### F01 — Unbounded numeric/date input can hang or crash the editor

**Security impact:** client-side denial of service from an opened/pasted document or restored backup. Accidental extreme input has the same effect.

**Locations:** [packages/diagram-gantt/src/parser.ts:263](C:/Users/henri/IdeaProjects/PlantUMLUltimate/packages/diagram-gantt/src/parser.ts:263), [apps/web/src/gantt-schedule.ts:49](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/gantt-schedule.ts:49), [apps/web/src/gantt-calendar.ts:56](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/gantt-calendar.ts:56), [apps/web/src/ResourceWorkloadPanel.tsx:47](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/ResourceWorkloadPanel.tsx:47), [apps/web/src/App.tsx:124](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:124).

The parser accepts arbitrary-length decimal durations using `Number(...)`. A duration consisting of 400 nines becomes `Infinity`. Scheduling then enters `while (remaining > 0)`, subtracting one from infinity indefinitely. These calculations run synchronously during React rendering, including code-only view; the renderer's timeout cannot protect them.

**Reproduced:** a parsed task with 400 nines as its day count had an infinite duration. Calling the real schedule resolver inside a Node VM with a 100 ms deadline was interrupted by the deadline. The non-decreasing infinite loop is also directly visible in the implementation.

Separately, this small source caused a `RangeError` in the date resolver:

```plantuml
@startgantt
Project starts 2026-09-01
[A] starts D+9999999999999999999999
[A] lasts 1 day
@endgantt
```

`shiftDate` checks the initial date but not whether adding the offset invalidates it before calling `toISOString()`. No React error boundary protects the application. Very large finite durations/date ranges also produce excessive work or allocations; all-weekdays-closed schedules have no explicit unschedulable-calendar guard. File imports have no size limit, and history/cache limits count entries rather than retained bytes.

**Fix:** require finite safe integers and reasonable limits for durations/offsets; validate dates after arithmetic; detect calendars with no reachable working day; cap imported bytes, expanded days, and total workload cells. Return diagnostics rather than throwing. Run expensive computations in a terminable worker with time/memory budgets. Add an error boundary and a recovery path that lets users discard a problematic restored document.

**Regression checks:** infinite/huge duration, huge relative offset, impossible dates, all days closed, enormous ranges, and oversized input must fail promptly without losing editor access.

### F02 — Async saves clear newer edits or update the wrong tab

**Locations:** [apps/web/src/App.tsx:586](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:586), [apps/web/src/App.tsx:599](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:599), [apps/web/src/use-persisted-workspace.ts:36](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-persisted-workspace.ts:36).

Save captures the source before awaiting file I/O. When it completes, it unconditionally calls `setWorkspace(... dirty: false)`. That setter targets whichever document is active at completion, not necessarily the one originally saved.

**Reproduced in Chromium:** a delayed writable file handle saved a one-day task. Before closing the writer, the editor was changed to two days. After save completion, IndexedDB contained the two-day source with `dirty: false`, while the file writer had received the one-day source. The unsaved-change warning is consequently disabled for unsaved content.

**Additional code-confirmed scenario:** start saving A, switch to B before completion, and the completion updates B's filename and dirty state. Save As associates the handle with the captured A ID while the UI update targets B, creating inconsistent metadata.

**Fix:** save by immutable document ID and captured source/revision. On completion, update only that document, and clear dirty only if its current content still matches the saved content. Serialize overlapping saves per document and handle closing/restoring a document while its save is pending.

### F03 — Backup validation accepts data that can crash or corrupt the workspace

**Locations:** [apps/web/src/workspace-backup.ts:29](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-backup.ts:29), [apps/web/src/workspace-storage.ts:78](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:78), [apps/web/src/use-persisted-workspace.ts:44](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-persisted-workspace.ts:44), [apps/web/src/App.tsx:1191](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:1191).

The backup parser validates the outer envelope, then applies permissive normalization. It does not enforce unique document IDs, string filenames, valid settings enums, finite cursor values, or a meaningful session schema.

**Reproduced:**

- A document with `fileName: { "bad": true }` survives validation. The tab label passes that object to React as a child, which cannot render it.
- Two documents with the same ID are accepted. The workspace setter edits every matching document, so an edit to one can overwrite both sources.
- `session: { "documents": [] }` becomes the default welcome document. The intended empty-backup rejection is unreachable because normalization has already substituted defaults.

A trusted-looking backup can therefore replace the workspace with unusable or misleading content. Invalid legacy-session values are also spread into defaults with little validation.

**Fix:** strictly validate imported backups before mutating state. Reject duplicates, malformed fields, empty document lists, unsupported versions, and excessive document/source sizes. Keep forgiving migration separate from untrusted import validation. Preserve the old workspace until validation succeeds.

**Minimal malformed envelope:**

```json
{
  "kind": "plantuml-studio-workspace",
  "version": 1,
  "session": {
    "documents": [{ "id": "a", "source": "@startgantt\n@endgantt", "fileName": { "bad": true } }],
    "activeDocumentId": "a"
  }
}
```

### F04 — Completed renders discard the next queued source

**Location:** [apps/web/src/render/use-renderer.ts:133](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:133).

The result handler sets `pending.current = undefined` before calling `sendPending()`. If A is rendering and B is queued, receiving A deletes B. Since A's request ID is stale, it also does not update the visible result/status. B is never submitted unless another edit/retry occurs.

**Reproduced:** a mocked-hook test used the real hook, fake timers, and a synthetic iframe bridge. A was sent, B was queued, A completed, and only A had been sent even after advancing another 16 seconds.

**Fix:** clear only the in-flight request on completion; preserve and dispatch the pending request. Track in-flight IDs so late replies cannot release a different request's busy state.

### F05 — Storage failures can prevent startup or silently break recovery

**Locations:** [apps/web/src/App.tsx:80](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:80), [apps/web/src/App.tsx:398](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:398), [apps/web/src/use-resource-capacities.ts:17](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-resource-capacities.ts:17), [apps/web/src/use-persisted-workspace.ts:31](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-persisted-workspace.ts:31), [apps/web/src/workspace-storage.ts:207](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:207).

The schedule preference reads localStorage without a guard during initial render. Schedule/capacity writes also run without guards. Workspace persistence catches IndexedDB errors, but its localStorage fallback can throw, and the debounced caller discards the resulting rejected promise.

**Reproduced in Chromium:** making `Storage.getItem` throw `SecurityError` produced an uncaught startup error and no editor. The quota/fallback path is code-reviewed rather than browser-reproduced.

The status bar displays “IndexedDB” once hydration finishes regardless of the actual backend or later persistence failure (`App.tsx:1331`).

**Fix:** centralize guarded storage access; fall back to an explicitly reported in-memory mode; catch async persistence failures and surface a persistent “recovery unavailable” state. Validate loaded capacity/preferences objects as well as catching JSON parse errors.

### F06 — New fallback recovery data is ignored when IndexedDB returns

**Locations:** [apps/web/src/workspace-storage.ts:184](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:184), [apps/web/src/workspace-storage.ts:197](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:197).

When IndexedDB fails during a save, the newer session is stored in localStorage. If IndexedDB becomes available on the next load, any old value there wins immediately; the newer fallback is not inspected.

**Reproduced:** saved an old session in fake-indexeddb, simulated an IndexedDB failure, saved new work through the localStorage fallback, restored IndexedDB, and loaded the old source.

**Fix:** store monotonic revisions/timestamps consistently in both backends, choose the newest valid snapshot, reconcile successful fallback writes, and clear obsolete fallback data only after a committed newer save. Provide a recovery choice if conflicting versions cannot be ordered safely.

### F07 — Multiple app windows silently overwrite shared recovery state

**Locations:** [apps/web/src/workspace-storage.ts:61](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:61), [apps/web/src/workspace-storage.ts:201](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:201), [apps/web/src/use-persisted-workspace.ts:29](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-persisted-workspace.ts:29).

Every browser tab/window writes the entire workspace to the same database/store/key. There is no writer ownership, revision conflict check, or cross-window synchronization.

**Code-review scenario:** open the app in two windows, edit different documents, then reload the first after the second saves. The shared snapshot belongs to the last writer. Because cursor/view changes also persist, merely interacting with an older window can overwrite newer recovery data.

**Fix:** use per-window recovery sessions or explicit single-writer ownership with conflict detection. If sharing one workspace is intended, synchronize through a versioned protocol/BroadcastChannel and preserve conflicting copies. A full merge is not necessary to avoid silent loss.

### F08 — Preview and export are not bound to the active document's source

**Locations:** [apps/web/src/render/use-renderer.ts:62](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:62), [apps/web/src/render/use-renderer.ts:148](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:148), [apps/web/src/App.tsx:648](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:648), [apps/web/src/DiagramPreview.tsx:96](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/DiagramPreview.tsx:96).

The renderer retains its previous SVG across source and document changes, including after errors. Export checks only that an SVG exists and names the download using the current document. The preview constructs interaction overlays from current tasks over the retained SVG.

**Code-review scenario:** render A, switch to B, and export while B is rendering or after B fails. A's diagram can be downloaded under B's filename. This can disclose the wrong project when the export is shared. Preserving a last-good render for the same document is documented, but crossing document boundaries is particularly misleading.

**Fix:** associate every result with document ID and source revision/hash. Keep per-document last-good results, disable or explicitly label stale exports, and allow visual editing only against matching source/geometry. Invalidate requests immediately on source change rather than only after debounce.

### F09 — Resource workload ignores closed weekdays and date exceptions

**Locations:** [apps/web/src/ResourceWorkloadPanel.tsx:33](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/ResourceWorkloadPanel.tsx:33), [apps/web/src/gantt-schedule.ts:49](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/gantt-schedule.ts:49).

The schedule resolver uses the calendar, but workload calculation advances through calendar days and only skips task pauses. It never receives the closed/opened day rules. Capacity warnings and workload summaries can disagree with the diagram.

**Reproduced:** a two-day task assigned to Alice starting Friday 2026-09-04, with Saturday/Sunday closed, resolved to Monday 2026-09-07. Its workload was allocated to Friday and Saturday, omitting Monday.

**Fix:** share one calendar-aware working-day iterator between scheduling and workload calculations. Cover weekends, date exceptions, pauses, and partial allocations in tests.

### F10 — Workspace backups do not preserve resource capacities

**Locations:** [apps/web/src/use-resource-capacities.ts:4](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-resource-capacities.ts:4), [apps/web/src/workspace-backup.ts:10](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-backup.ts:10), [apps/web/src/App.tsx:618](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:618).

Resource capacities are stored under a separate localStorage key. Backups serialize only the workspace session, whose schema excludes capacities. Restoring onto another browser loses those settings; restoring over matching document IDs can reuse unrelated local capacities.

**Fix:** include document capacities in a versioned backup schema and restore them atomically. Define whether duplicate tabs copy capacities, and remove orphaned capacity entries when appropriate.

### F11 — Renderer startup and execution do not have effective restart boundaries

**Locations:** [apps/web/src/render/use-renderer.ts:29](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:29), [apps/web/src/render/use-renderer.ts:86](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:86), [apps/web/src/render/use-renderer.ts:159](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:159), [apps/web/src/render/use-renderer.ts:237](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:237).

The 15-second timeout starts only after a render is sent. There is no deadline for the iframe to become ready. A stalled module/bootstrap can leave the app rendering indefinitely. Explicit bootstrap errors trigger one rebuild, but after repeated failure the visible Retry action only changes a token; it does not rerun the iframe lifecycle effect, whose dependency is just `enabled`.

A render timeout also leaves the same engine alive and releases its busy flag. It does not cancel the timed-out computation. A same-origin iframe is not a dependable CPU isolation boundary: synchronous engine work can block the parent event loop and delay its timeout.

**Fix:** add a startup deadline and an explicit lifecycle restart token. Recreate the renderer on unrecoverable failure, preserve the latest pending source, and track the active request. Prefer a terminable worker or suitably isolated renderer architecture for untrusted expensive input. The existing worker file is not the execution path used by this hook.

### F12 — Known advisories affect development dependencies

**Locations:** [package-lock.json:2017](C:/Users/henri/IdeaProjects/PlantUMLUltimate/package-lock.json:2017), [package-lock.json:2188](C:/Users/henri/IdeaProjects/PlantUMLUltimate/package-lock.json:2188), [package-lock.json:3387](C:/Users/henri/IdeaProjects/PlantUMLUltimate/package-lock.json:3387), [package-lock.json:3461](C:/Users/henri/IdeaProjects/PlantUMLUltimate/package-lock.json:3461), [package-lock.json:3709](C:/Users/henri/IdeaProjects/PlantUMLUltimate/package-lock.json:3709).

Live `npm audit --json` reported **5 affected package entries: 1 moderate, 2 high, 2 critical**. These are package counts, not five independent remotely exploitable app vulnerabilities.

| Installed package                      | Reported issue                                               | Context                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `@vitest/mocker@3.2.7`, `vitest@3.2.7` | Redirect-mock arbitrary file read                            | Relevant registration/server exposure is required; the app does not configure the standalone mocker plugin.       |
| `tinypool@1.1.1`                       | Prototype-pollution gadgets leading to worker code execution | Requires an upstream pollution primitive and relevant worker options; no such exploit chain was established here. |
| `brace-expansion@5.0.9`                | Expansion/recursion denial of service                        | Development dependency through ESLint/minimatch.                                                                  |
| `source-map-js@1.2.1`                  | Indexed source-map denial of service                         | Development dependency through Vite/PostCSS.                                                                      |

The production-only scan (`npm audit --omit=dev --json`) returned zero advisories. npm classifies the Tinypool/Vitest chain as critical, while the reviewed Tinypool maintainer pages label their advisories high. This report retains the scanner counts but assesses repository remediation priority as medium because these are development dependencies with additional exploit prerequisites.

**Fix:** upgrade the test/tooling dependency graph and regenerate the lockfile, then rerun all checks and audit. npm suggested a major Vitest upgrade; assess compatibility rather than applying `audit fix --force` blindly. Verify Tinypool resolves to a version addressing both advisories (the second lists 2.1.2). Keep development servers local and CI inputs/dependencies controlled.

**References:** [Vitest maintainer advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [Tinypool worker-options advisory](https://github.com/tinylibs/tinypool/security/advisories/GHSA-5gmw-xhrv-c9v3), [Tinypool run-options advisory](https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr). The npm results also linked [brace-expansion quadratic expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [nested groups](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), and [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

### F13 — Delayed workspace hydration can overwrite new user input

**Locations:** [apps/web/src/use-persisted-workspace.ts:17](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-persisted-workspace.ts:17), [apps/web/src/App.tsx:1331](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:1331).

The app initially renders an editable default workspace while IndexedDB loads. Once loading completes, `setSession(saved)` replaces the entire session unconditionally. There is no check for user edits or new tabs created in the meantime.

**Code-review scenario:** delay the IndexedDB read, type into the editor or create a tab, then allow hydration to complete. The saved snapshot replaces that new work. This is more likely on slow or troubled storage; it was not reproduced with a delayed real browser database in this audit.

**Fix:** gate edits until hydration finishes, or track mutations during hydration and reconcile them rather than replacing the session. Offer an in-memory workspace if storage initialization exceeds a bounded deadline.

## Additional hardening and reliability observations

These are separate from the 13 ranked findings and should not be mistaken for demonstrated exploits.

- **SVG trust boundary:** [apps/web/src/DiagramPreview.tsx:767](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/DiagramPreview.tsx:767) inserts engine output with `dangerouslySetInnerHTML`; the overlay parses/serializes but does not sanitize it. The renderer iframe has no sandbox. Add an SVG-aware element/attribute/URL allowlist and regression payloads, plus a compatible deployment CSP. A Chromium probe using a `javascript:` link in a Gantt title produced no SVG anchor; **XSS was not demonstrated**. Raw HTML insertion alone does not establish an exploitable path through this engine.
- **Deployment/privacy verification remains necessary:** production response headers, remote image/include behavior, and engine-level network restrictions were not verified. The application's own bridge does not call an external rendering service, but that is narrower than proving arbitrary PlantUML input can never cause network access. Do not claim SSRF or data exfiltration without establishing a supported request path.
- **Debounced recovery has a loss window:** the 350 ms persistence timer has no pagehide/visibility flush. Abrupt process termination can lose the latest edits. Dirty-tab unload warnings help with ordinary navigation but cannot guarantee crash recovery. Consider a bounded journal and explicit persistence status.
- **IndexedDB lifecycle handling:** `openDatabase` has no blocked-open deadline; connections are not closed in finally blocks; write promises do not explicitly handle transaction aborts. These deserve fault-injection coverage.
- **Fallback file-picker cancellation:** upload promises in [apps/web/src/file-service.ts:27](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/file-service.ts:27) and [apps/web/src/file-service.ts:65](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/file-service.ts:65) listen only for change, not cancel. Cancelling can leave the async operation pending. Add cancellation handling and distinguish read failures from cancellation.
- **PNG allocation limits:** [apps/web/src/file-service.ts:137](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/file-service.ts:137) allocates a canvas based on SVG dimensions times scale without an area cap. Reject excessive dimensions and report export failure before allocating.
- **Windows test portability:** the clipboard test at [tests/e2e/editor.spec.ts:80](C:/Users/henri/IdeaProjects/PlantUMLUltimate/tests/e2e/editor.spec.ts:80) expects LF exactly, but Chromium on this Windows host returned CRLF. Normalize line endings for text-equivalence assertions unless exact byte preservation is an explicit product requirement.

## Validation performed

| Check                             | Result                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Existing unit suite, `npm test`   | 134 tests passed across 19 files                                                         |
| TypeScript, `npm run typecheck`   | Passed                                                                                   |
| ESLint, `npm run lint`            | Passed before temporary probe files were added                                           |
| Production build, `npm run build` | Passed; large-chunk warning (main JS approximately 751 kB, engine approximately 7.15 MB) |
| Existing Chromium suite           | 31 passed, 1 failed: clipboard LF/CRLF comparison                                        |
| Focused unit probes               | 8 passed, confirming F01, F03, F04, F06, and F09 behaviors                               |
| Focused Chromium probes           | 3 passed: save race, storage-denied startup, and negative SVG-link probe                 |
| Full dependency audit             | Five affected development package entries                                                |
| Production dependency audit       | Zero reported advisories                                                                 |

Initial sandboxed unit/build attempts failed on filesystem `EPERM realpath` restrictions, and the initial dependency scan failed DNS resolution. Re-running those checks with approved access succeeded; those initial failures are not application bugs.

Temporary audit tests were removed after execution. The report preserves their inputs, observed outcomes, and remediation targets. No application code or dependencies were changed; the pre-existing modification to `package.json` was preserved.

**Limitations:** Firefox/WebKit were not run during this audit; no production deployment was supplied; no exhaustive third-party engine audit, fuzzing campaign, or historical secret scan was performed. Static findings are labeled accordingly. Passing existing tests does not cover the newly identified failure paths.

## Suggested remediation order

1. Fix F01–F03 first: reject dangerous input, make saves revision/document-aware, and strictly validate backups.
2. Fix renderer request ownership and lifecycle (F04, F08, F11).
3. Make persistence observable and conflict-safe (F05–F07, F13).
4. Correct workload/backup consistency (F09–F10), update development dependencies (F12), and turn the reproduction scenarios into regression tests.
5. Add SVG/deployment hardening and rerun the full cross-browser suite.
