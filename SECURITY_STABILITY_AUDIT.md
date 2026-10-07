# Security and stability audit — 2026-10-07

> **Remediation update:** fixes for all 14 findings have been applied locally on the latest fetched revision. See the [remediation and earlier-fix comparison](docs/audits/2026-10-07-remediation.md) for changes, verification and remaining limits. The findings and original test results below describe the application **before these fixes**.

## Revision and scope

Audited PlantUML Ultimate **0.2.0**, commit **`7f25b1f648ea9f2770ef7d0f237950a70df854ac`** (`Stabilize external file and Gantt browser tests`). `git fetch origin` succeeded at the start of this audit; `HEAD...origin/main` reported **0 ahead / 0 behind**. This report concerns that latest fetched revision, not the older checkout previously audited.

Reviewed browser rendering, input/output boundaries, saving and recovery, backup/native document handling, collaboration Worker and Durable Object, integration Worker, and dependencies. Tests ran locally, with isolated browser profiles and local workerd. Production Cloudflare settings, live Jira accounts, and production services were not tested. No application fixes or deployments were made. The pre-existing package setting and preserved legacy work remain intact.

**14 findings: 3 high, 10 medium, 1 low.** Severity reflects application exposure and data-loss risk, not CVSS. No critical vulnerability, authentication bypass, or successful exfiltration was demonstrated. Reproduced defects and code-review conclusions are distinguished below.

| ID  | Severity | Finding                                                                | Evidence                 |
| --- | -------- | ---------------------------------------------------------------------- | ------------------------ |
| A01 | High     | Malformed collaboration state is persisted and crashes client readers  | Local Worker + model     |
| A02 | High     | Save completion after switching tabs marks the wrong document saved    | Browser                  |
| A03 | High     | Calendar/date input can cause excessive synchronous work or exceptions | Bounded core probes      |
| A04 | Medium   | Export downloads another document's SVG under the active filename      | Browser                  |
| A05 | Medium   | Independent windows overwrite the same recovery workspace              | Browser + core           |
| A06 | Medium   | Recovery prefers stale database data over a newer fallback             | Fault injection          |
| A07 | Medium   | Denied localStorage prevents editor startup                            | Browser                  |
| A08 | Medium   | Error-screen backup is incompatible with backup restore                | Core + producer review   |
| A09 | Medium   | Backup validation permits shared history IDs and unbounded content     | Core                     |
| A10 | Medium   | IndexedDB can leave recovery pending without a deadline                | Fault injection + review |
| A11 | Medium   | Renderer startup lacks a deadline and effective CPU isolation          | Code review              |
| A12 | Medium   | Bare carriage returns bypass resource-directive filtering              | Browser module probe     |
| A13 | Medium   | Development dependencies contain two high-severity advisories          | npm audit                |
| A14 | Low      | Validation depends on locale and checkout formatting                   | Unit/format checks       |

## A01 — Persisted malformed collaboration state

**Location:** [Worker update handling](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/collaboration-worker/src/index.ts:307), [shared-document reader](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/collaboration-document.ts:97).

The server applies incoming Yjs data to a candidate document and checks encoded size, but does not validate application-level map/value types before persisting and broadcasting it. The client assumes diagram entries are `Y.Map` values containing `Y.Text`, and element/link records have string IDs.

**Reproduction:** Send a valid Yjs update with document metadata and `document-diagrams["bad"] = "not-a-map"`. A local workerd test confirmed that the server broadcasts this value and resends it to a later connection. A separate model test confirmed that reading `snapshot` throws a “not a function” exception.

**Impact:** A participant with write access can poison shared state, causing readers to fail even after reconnecting. This is an availability/integrity issue inside an authorized room, not demonstrated cross-room access. A complete multi-browser UI crash was not exercised; persistence and client-reader failure were independently reproduced.

**Fix:** Validate the merged candidate's schema, field types, collection sizes, and source limits before committing. Guard client readers and show a recoverable error. Retain a last-known-good snapshot and test semantic corruption as well as malformed binary updates.

## A02 — Save completion updates the wrong tab

**Location:** [document saving](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/use-document-files.ts:278), especially `setWorkspace` at lines 308 and 373; format/protection changes at line 390.

Save operations capture the original document, but completion also updates the currently active workspace. Switching tabs while a write is pending makes those identities diverge.

**Reproduction:** Delay Save As for A, switch to B, then finish A's write. B becomes `dirty: false` and gets A's saved filename despite B's content not being written. A remains dirty in the reproduced state. The browser evidence records both final document states.

**Impact:** Unsaved-work indicators become false, allowing users to close or replace work believing it was saved. Related format/protection code also clears dirty state after asynchronous work without an equivalent final revision check; that path was reviewed but not separately reproduced.

**Fix:** Complete saves against the captured document ID and revision. Update the active workspace only if it still represents that document. Coordinate overlapping operations and preserve dirty state when the saved revision differs from the current revision.

## A03 — Unbounded calendar work and invalid dates/numbers

**Location:** [calendar helpers](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/gantt-calendar.ts:46), [relative dates](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/gantt-schedule.ts:50), [Gantt parser](C:/Users/henri/IdeaProjects/PlantUMLUltimate/packages/diagram-gantt/src/parser.ts:381).

Calendar helpers scan or expand dates synchronously without an overall work budget. `shiftDate` validates the initial Date but does not check arithmetic overflow before `toISOString()`. Duration parsing lacks a finite safe maximum.

**Reproductions:**

- `D+999999999999999999` throws `RangeError: Invalid time value`.
- Resolving a one-day task with all seven weekdays closed exceeds a 100 ms VM execution deadline. The probe interrupts safely; it does not claim to have observed an infinite run.
- `2026-02-31` silently normalizes to `2026-03-03`.
- A 400-digit duration is accepted as `Infinity`.

**Impact:** Imported/shared input can produce incorrect calculations, UI stalls, or exceptions. An error boundary cannot recover responsiveness while synchronous work is running. Some newer scheduling helpers already have 10,000-step limits; these do not cover all calendar helpers identified here.

**Fix:** Require finite safe integers and practical limits, round-trip validate dates, reject impossible calendars, and cap aggregate work. Represent large date ranges compactly and move expensive calculations to cancellable worker execution where practical.

## A04 — Export contains the previous document

**Location:** [SVG export](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:2090), [export availability](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:3058), [renderer](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:161).

The last SVG is retained while rendering is disabled or fails. Export checks only whether an SVG exists and names it using the active workspace filename.

**Reproduction:** Render A in split view, switch to code view, select B, export SVG. The downloaded `b.svg` contains A's text, not B's.

**Impact:** Incorrect deliverables and possible accidental disclosure when sharing an export believed to belong to another document. Actual downloaded content was checked.

**Fix:** Bind results to document ID and source revision/hash. Export only a matching result, or render the captured target specifically for export.

## A05 — Windows overwrite each other's recovery

**Location:** [persistence keys](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:99), [saving](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:617).

All windows use the same recovery key and IndexedDB `current` record, without separate session identities or conflict resolution.

**Reproduction:** Open two pages on the same origin, edit B, reload A. A restores B's source. A core test confirms last-writer-wins behavior.

**Impact:** Unsaved recovery state from one window can disappear when another saves its session.

**Fix:** Keep recovery per window/workspace, or coordinate explicit shared ownership and conflicts. Offer recoverable sessions instead of silently replacing them.

## A06 — A newer fallback loses to an old database snapshot

**Location:** [restore order](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:557), [fallback save](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:617).

If the primary recovery-key write and IndexedDB write fail but the legacy localStorage fallback succeeds, a later healthy database read wins over that newer fallback. Restore does not compare snapshot revisions.

**Reproduction:** Save OLD to IndexedDB; inject recovery-key quota and database failures; successfully save NEW to the fallback; restore database access. Loading returns OLD.

**Impact:** Successful fallback saving can still restore older work after restart.

**Fix:** Store ordering metadata, compare all valid candidates, and retire stale copies only after a newer durable write succeeds.

## A07 — Storage denial prevents startup

**Location:** [direct initialization read](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/App.tsx:792).

Accessing localStorage itself can throw in restricted environments. A direct initialization read is not guarded.

**Reproduction:** Make the localStorage getter throw `SecurityError` in a disposable browser. The app shows “Something went wrong” and no editor, even though the test did not disable IndexedDB.

**Fix:** Centralize guarded storage reads with defaults. Allow an in-memory session and show persistence status when storage is unavailable.

## A08 — Emergency backup cannot be restored

**Location:** [error-screen download](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/AppErrorBoundary.tsx:10), [backup parser](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-backup.ts:82).

The error screen serializes a raw `WorkspaceSession`; the importer requires an envelope containing `kind`, `version`, and `session`.

**Reproduction:** Feed the same raw-session serialization to `parseWorkspaceBackup`; it rejects it as unsupported.

**Impact:** The emergency file retains manually salvageable data, but normal backup restore cannot use it.

**Fix:** Reuse the shared backup serializer and test emergency-export/import round trips, including encrypted-document exclusions.

## A09 — Backup validation gaps

**Location:** [validation](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-backup.ts:82), [restore mapping](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-backup.ts:212).

Distinct documents can share a history ID; restore maps that shared value to one new history ID. The parser also lacks a practical aggregate content budget.

**Reproductions:** Two documents with different document IDs but the same history ID are accepted and restored with the same new history ID. A six-million-character source is accepted in a backup. No intentional browser out-of-memory test was performed.

**Impact:** Histories can become associated with multiple documents. Large backups can impose excessive parsing, serialization, and storage costs. This concerns workspace backups; native document codecs already include size/decompression protections.

**Fix:** Require unique history ownership, validate version references, and cap raw bytes, documents, versions, sources, and total content before restore.

## A10 — IndexedDB recovery can remain pending

**Location:** [database opening](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:335), [workspace reading](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/workspace-storage.ts:557).

Open handles success/error but not blocked upgrades or a deadline. Connections also need version-change handling to avoid obstructing subsequent upgrades. Recovery waits for the database before reaching its fallback.

**Evidence:** With an injected open request that never fires callbacks and no primary recovery snapshot, loading remained pending throughout a 150 ms probe. Source inspection confirms there is no later deadline; the short probe alone does not establish real-browser stall duration.

**Fix:** Handle `onblocked`, close connections on `versionchange`, settle transaction-abort paths, and use a bounded wait followed by fallback/in-memory recovery with visible status.

## A11 — Renderer lifecycle and CPU isolation gaps

**Location:** [startup](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:180), [render timeout](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:103).

**Code-review finding:** The 15-second timeout starts after dispatch to a ready renderer. Asset import and initial readiness have no equivalent deadline. Failure of the outer dynamic import is outside the iframe's bootstrap-error handler. The same-origin iframe also does not provide reliable CPU isolation: a timer cannot preempt synchronous work blocking its event loop.

**Impact:** Loading failures or expensive renderer work can leave rendering pending or the editor unresponsive despite the existing timeout/retry logic.

**Limit:** A browser attempt to simulate stalled bootstrap did not reach the expected iframe and was inconclusive. No production bootstrap hang or renderer CPU exploit was demonstrated. This finding rests on lifecycle code and the execution model.

**Fix:** Cover startup, readiness, dispatch, and completion with explicit deadlines/errors. Retry should recreate failed initialization. Use terminable worker execution or another effective isolation boundary for expensive rendering.

## A12 — Resource filter disagrees with renderer line splitting

**Location:** [source filter](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/plantuml-source.ts:16), [renderer splitting](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/render/use-renderer.ts:51).

The filter splits LF/CRLF, but the engine also splits bare CR. A directive following CR can evade the start-of-line filter and become a separate engine instruction later.

**Reproduction:** `@startuml\r!includeurl https://example.invalid/audit.puml\r@enduml` preserves the directive through the browser-loaded filter. The LF equivalent removes it.

**Impact:** A documented restriction is bypassable. Actual external fetching, file access, CSP bypass, and exfiltration were not demonstrated; those depend on engine capabilities and deployment restrictions. This is not a confirmed SSRF finding.

**Fix:** Normalize supported line endings before validation and use identical tokenization for validation/execution. Enforce resource restrictions inside the engine boundary and test CR, LF, and CRLF.

## A13 — Vulnerable development dependencies

Fresh `npm audit --json` reports **5 high-severity affected package entries**, representing **2 underlying advisories**. Production-only `npm audit --omit=dev --json` reports **0 vulnerabilities**.

- `sharp <0.35.5`: upstream librsvg memory vulnerability with serious consequences under specified Linux/runtime conditions; 0.35.5 is patched. [Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `source-map-js >=1.0.0 <1.2.2`: indexed source-map offsets can cause event-loop denial of service. [Source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The remaining affected entries are Wrangler, Miniflare, and the Cloudflare test plugin dependency chain, not three additional independent vulnerabilities. No tooling exploit was performed; this does not establish vulnerability of the deployed browser bundle.

**Fix:** Update compatible tooling/lockfile dependencies to patched versions and rerun build/Worker checks. Review proposed changes: npm currently suggests unsuitable downgrades for parts of the chain; do not blindly apply `npm audit fix --force`.

## A14 — Validation is locale/checkout dependent

**Location:** [forecast assertion](C:/Users/henri/IdeaProjects/PlantUMLUltimate/apps/web/src/GanttForecastView.test.tsx:151), [format checker](C:/Users/henri/IdeaProjects/PlantUMLUltimate/scripts/check-format.mjs:5).

Supported Node 24.15.0 produces **2,022 passing / 1 failing** unit tests. The assertion expects English `Sep 24`/`Sep 29`; this environment formats them as `24 sep.`/`29 sep.`. This is test portability, not evidence of incorrect forecast calculation.

Formatting also fails on **637 tracked files** in this Windows checkout. Inspected files use CRLF while Prettier retains its default LF policy; line endings contribute. The audit did not prove that line endings explain every reported file and did not reformat the application.

**Fix:** Make test locale explicit or assert locale-independent meaning. Establish consistent checkout/formatting settings and verify them on Windows and CI.

## Validation results and limits

| Check                                      | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| Latest revision                            | Fetch succeeded; HEAD equals fetched origin/main    |
| Frontend/package unit suite, Node 24.15.0  | 2,022 passed, 1 locale-dependent failure; 171 files |
| Existing collaboration Worker tests        | 8 passed in local workerd                           |
| Existing integration Worker tests          | 9 passed in local workerd                           |
| Additional collaboration schema probe      | 1 passed, demonstrating A01                         |
| Security E2E: Chromium, Firefox, WebKit    | 12 passed                                           |
| Isolated Chromium audit probes             | 5 reproduced: A02, A04, A05, A07, A12               |
| Core probes with fake IndexedDB/bounded VM | 11 reproduced assertions                            |
| Workspace TypeScript checks                | Passed                                              |
| Production web build                       | Passed                                              |
| ESLint                                     | Passed                                              |
| Formatting                                 | Failed; 637 tracked files                           |
| Production dependency audit                | 0 reported vulnerabilities                          |
| Full dependency audit                      | 5 high affected entries / 2 advisories              |

Default Node 24.14.1 is below jsdom 30's supported Node 24 minimum. Unit/Worker tests used temporary **Node 24.15.0**, without changing the global installation. Build/type/lint checks used the installed toolchain.

Passing security E2E coverage includes SVG sanitization, declared CSP, viewer read-only behavior, and native/Graphviz rendering with the deployed CSP header applied locally. Backend tests exercise important authentication, origin, role, malformed-update, OAuth/session, and integration paths. Passing checks support those tested paths, not a claim that all security properties are verified.

The full functional E2E suite, live production deployment, real Jira exchange, large-scale load/fuzz testing, PWA update lifecycle, and exhaustive cryptographic review were not performed. No universal render-speed conclusion is drawn from the build: it emits a roughly 1.55 MB main JS chunk and separate 7.15 MB PlantUML / 1.45 MB Graphviz assets. These are optimization leads, not measured latency regressions.

## Reproduction artifacts

These probes assert observed defects, not desired behavior. Do not add them unchanged as regression tests expecting defects to remain.

- [Core probes](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/probes/2026-10-07-core.mjs) and [results](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/probes/2026-10-07-core-results.json): run `node docs/audits/probes/2026-10-07-core.mjs` from the repository root.
- [Browser probes](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/probes/2026-10-07-browser.mjs) and [results](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/probes/2026-10-07-browser-results.json): with the local app on port 5173, run `node docs/audits/probes/2026-10-07-browser.mjs`. Disposable contexts block external network access.
- [Worker probe source](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/probes/2026-10-07-collaboration-schema.test.txt): temporarily copy to `apps/collaboration-worker/test/audit-schema.test.ts` and run that file with the Worker's existing Vitest configuration on supported Node. The temporary test was removed after preserving this source.

Prioritize A01–A03, then export identity and recovery correctness (A04–A10). Address the filter mismatch promptly while verifying actual engine resource capabilities. The [legacy audit](C:/Users/henri/IdeaProjects/PlantUMLUltimate/docs/audits/2026-10-07-legacy-audit.md) remains historical; its findings are not automatically open against this revision.
