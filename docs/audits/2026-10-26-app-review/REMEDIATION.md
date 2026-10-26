# Audit remediation — 26 October 2026

Implemented locally; no deployment or live Jira writes were performed.

## Findings

1. **Owner recovery:** credentials are stored in tab-scoped session storage, keyed by normalized service endpoint and room ID. Reloading the creator tab recovers owner privileges, including revocation. Share links contain only role credentials. Creation fails visibly if session storage is unavailable. The dialog explains that leaving does not revoke links and that closing the tab loses owner recovery. A recovered owner waits for server state before applying local source, preventing duplicated CRDT text after reload.
2. **Large-room synchronization:** clients compute a delta against the received snapshot's state vector. The Worker accepts messages up to the same 1,900,000-byte limit as encoded room state; the candidate state is still validated before persistence. Tests exercise a schema-valid 1.2 MB room and an offline delta after reconnect.
3. **Permanent errors:** revoked/expired, policy-denied, oversized and invalid-state closures stop reconnects and have distinct messages. Opaque handshake failures stop after six retries and report an unavailable service or invalid link without promising synchronization. Local edits remain available. The failure dialog offers saving a local copy when its document is active, and starting a new room.
4. **Jira partial publishing:** results retain confirmed successes, rejected writes, uncertain outcomes and unattempted issues. Transport failures and upstream server errors are uncertain, not proof of a failed write. Later batches stop after failures. The dialog requires a fresh review before retrying, retains issue-level results across close/reopen, and prevents a second publish while the first remains in flight. Reads support cancellation and page/issue progress. Client and upstream requests have deadlines. Closing a publishing dialog does not undo remote requests and does not apply stale source when the operation finishes.
5. **Abuse budgets and expiry:** owner-authenticated connection/creation attempts are limited to 10 per IP per minute; other room requests to 120 per IP per minute, before routing to a room. Each room allows 32 sockets. Each socket allows 600 messages and 10 MB per ten-second window; room traffic is limited to 3,000 messages per ten-second window across attached sockets. Presence changes are coalesced over 100 ms. Rooms expire 24 hours after creation; existing rooms receive a 24-hour migration window. Alarms delete document contents and clear credentials. A minimal revoked-room tombstone remains so old IDs cannot be recreated.
6. **Dependencies:** DOMPurify 3.4.17, Vite 7.3.7, Vitest 4.1.12, Wrangler 4.152.0 and the Cloudflare test plugin 1.4.7 are installed. Patched undici 7.30.1 and Zod 4.6.7 overrides replace pinned vulnerable transitive dependencies. Lockfile regenerated; npm audit reports zero vulnerabilities.

## Usability

- Split sizing uses available workspace width and gives the preview more space while properties are open. A Focus on diagram / Restore split view action is available beside inspector controls.
- Fit and zoom remain visible; forecast, overlays, filters and move policy are grouped in Diagram options.
- Startup presents Create / Open / Examples. Examples are filtered by diagram type; personal starters and learning content are collapsed. The redundant destination selector is hidden without an open document, and initial focus lands on Create.
- Inspectors keep a persistent Auto-save properties or Apply / Cancel properties indicator alongside change status. Existing invalid-draft and accidental-close protections remain.

## Operational limits

These are application controls, not an authentication system. Cloudflare's rate-limit binding is a local edge budget, not a strict global quota; distributed clients and changing IPs can still consume resources. Fixed-window socket budgets reset each window and disconnected sockets no longer contribute to the room aggregate. Expiration removes document payloads but retains small tombstones. Production edge rules, billing alerts and deployed binding behavior were not inspected. Review them before production rollout.

The 24-hour room lifetime is fixed, not extended by activity. Export a local copy before expiry. Owner recovery is scoped to the browser tab session, not an account or cross-device recovery mechanism.

Historical defect probes are retained as `.test.ts.txt` evidence so the normal test suite does not execute assertions of the old broken behavior. Replacement regressions live alongside application tests.

## Validation

- Full unit suite: 245 files, 2,424 tests passed before the final additional recovered-owner regression; the expanded focused client regressions also passed.
- Collaboration Worker: 13 tests passed, including large state, offline delta, throttling and expiration.
- Jira Worker: 14 tests passed, including partial success followed by transport failure.
- Chromium startup/save/security: 9 tests passed.
- Live Chromium collaboration against the local Worker: 2 tests passed, including owner reload/revoke and whole-document offline edits.
- Jira and inspector Chromium checks: 15 tests passed, including close/reopen during an uncertain publish, keyboard edits, invalid drafts, and Apply/Cancel close protection.
- Both Worker dry-run builds passed. Production web build and workspace type checking passed. Lint passed with one unused-disable warning in Wrangler-generated declarations.

References used for the implementation: [Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), and [Worker best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
