# Audit status — 2026-09-07

This document reconciles the historical 2026-09-02 audit with repository baseline
`795e39c`. The original audit files remain unchanged. A finding is marked **verified in
deployment** only when the relevant deployment completed successfully; a merged source
change alone is marked **fixed in source**.

## Release evidence

- Hardening changes were merged in pull request
  [#5](https://github.com/HBrosenius/PlantUMLUltimate/pull/5), with follow-up browser
  stability fixes in [#6](https://github.com/HBrosenius/PlantUMLUltimate/pull/6) and
  [#7](https://github.com/HBrosenius/PlantUMLUltimate/pull/7).
- Main CI run
  [34137652951](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/34137652951)
  completed successfully with all 15 jobs passing.
- GitHub Pages run
  [34114814749](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/34114814749),
  Jira Worker run
  [34114814760](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/34114814760),
  and collaboration Worker run
  [34136070154](https://github.com/HBrosenius/PlantUMLUltimate/actions/runs/34136070154)
  completed successfully.
- The Worker deployment runs validate before deploying, but they do not yet perform a
  post-deployment authenticated smoke test. Deployment success therefore does not by
  itself prove every live credential and persistence path.

## Local release-candidate verification

Run on 2026-09-07 from `codex/release-baseline`:

| Check                            | Result                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run validate`               | Passed: lint, formatting, 417 unit tests, 7 collaboration Worker tests, 6 integration Worker tests, all workspace typechecks, the web production build, and both Worker dry-run builds.                                                    |
| `npm run test:e2e`               | The first serial run passed 320 tests, skipped 21 browser-specific tests, and exposed four failures. Investigation found a renderer queue defect plus nondeterministic CodeMirror test input and synthetic Firefox unload-event reporting. |
| Focused regression run           | Passed 18/18 checks: the three affected journeys repeated three times in both Chromium and Firefox after the fixes.                                                                                                                        |
| `npm run test:e2e:pwa`           | Passed 6/6 in Chromium and WebKit.                                                                                                                                                                                                         |
| `npm run test:e2e:collaboration` | Passed the real local Durable Object capability test in Chromium.                                                                                                                                                                          |

The complete cross-browser suite still needs a post-fix run. The pull-request CI matrix
may satisfy that gate when it runs against this branch; until then the local full-suite
item remains open.

## Primary findings

| ID                                                         | Current status             | Evidence                                                                                                                                                                                                                                                                                     | Remaining work and regression coverage                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 — collaboration credentials in WebSocket URLs           | **Fixed in source**        | `apps/web/src/collaboration.ts` clears the query and sends capabilities through `Sec-WebSocket-Protocol`; the Worker reads those protocols. The security browser test asserts that credential names are absent from the URL. Sampling was reduced from 100% to 10%.                          | Inspect live request/log fields after a controlled connection without recording actual capability values. Add this to the production verification runbook.                                                                                                                                                                             |
| S2 — unauthenticated room creation and legacy-room claim   | **Fixed in source**        | The Worker requires valid owner, editor, and viewer capabilities before first persistence and refuses a connection without a resolved role. Participant IDs are server-assigned. Worker tests cover missing and incomplete creation credentials.                                             | Add retention and revoked-room cleanup under S8; cleanup must retain a revocation tombstone or otherwise prevent old credentials from recreating a revoked room.                                                                                                                                                                       |
| S3 — custom collaboration server persistence/document leak | **Fixed in source**        | Join links no longer persist their endpoint, endpoint mismatches are surfaced in the dialog, production endpoints require HTTPS, and a joining editor cannot seed before synchronization. Client and browser tests cover link parsing and endpoint handling.                                 | Add an explicit browser case proving that joining a non-empty room never sends the unrelated active document. Perform a live staging check against a controlled alternate endpoint.                                                                                                                                                    |
| S4 — same-origin unsandboxed renderer                      | **Still open**             | Source filtering now removes remote include/import/theme directives and SVG sanitization forbids `<style>`, but `use-renderer.ts` still creates an unsandboxed `srcdoc` frame. A timeout reports an error without recreating the frame.                                                      | Prototype `sandbox="allow-scripts"` with an opaque-origin message handshake, recreate the frame after timeouts, test stale responses and offline rendering for all six diagram types, and remove or adopt the unused renderer worker. Confirm possible network-producing syntax with an instrumented frame before adding more filters. |
| S5 — CSP and hosting headers                               | **Still open**             | The meta CSP and referrer policy were tightened, but the renderer bootstrap still requires inline script and GitHub Pages cannot supply the complete header set described by the audit.                                                                                                      | Decide whether to front Pages with a configurable host. Test a static renderer-frame bootstrap, then document or implement `frame-ancestors`, `nosniff`, `Permissions-Policy`, COOP, and HSTS at the actual serving layer.                                                                                                             |
| S6 — revocation silently succeeds while offline            | **Fixed in source**        | Revocation is an awaited HTTP POST containing the owner token in a text body. The Worker persists a revoked flag, deletes document state, broadcasts `room-revoked`, closes peers, and rejects reconnects. Unit and live collaboration tests cover revocation.                               | Add a post-deployment revocation smoke test and cover retention/restart behavior together with S8.                                                                                                                                                                                                                                     |
| S7 — Jira refresh/decrypt failure blocks disconnect        | **Fixed in source**        | Invalid/dead sessions are converted to a 401 and deleted; disconnect is dispatched without requiring token refresh. OAuth denial redirects back to the app. Worker tests cover invalid encrypted sessions, refresh rejection, disconnect, and denial.                                        | Add a browser-level controlled Jira flow and tests for concurrent refresh plus transient upstream failures. Keep disconnect available in every failure state.                                                                                                                                                                          |
| S8 — unbounded Worker usage                                | **Still open**             | Existing document/update/body-size limits and client-side presence coalescing bound individual messages, but neither Worker has request/message rate limits. Collaboration has no connection cap or idle-room alarm; integration cleanup remains request-driven.                             | Implement the bounded service tasks below and measure before redesigning synchronization.                                                                                                                                                                                                                                              |
| G1 — production not gated on cross-browser checks          | **Verified in deployment** | Main CI runs validation and 12 browser shards. Pages runs validation, all three browser projects, PWA, and live collaboration before deployment. Worker and release workflows include their relevant validation gates; actions are commit-pinned. The cited Pages and Worker runs succeeded. | Avoid running the full browser suite twice by making deployment consume a successful CI result or reusable workflow. Preserve a clear distinction between validation-only and deployment skipped for missing secrets.                                                                                                                  |
| G2 — truncated MIT license                                 | **Fixed in source**        | `LICENSE` contains the full MIT liability paragraph.                                                                                                                                                                                                                                         | None.                                                                                                                                                                                                                                                                                                                                  |
| G3 — oversized `App.tsx`                                   | **Still open**             | `apps/web/src/App.tsx` remains over 5,400 lines and owns document, collaboration, Jira, selection, and dialog orchestration.                                                                                                                                                                 | Begin with a behavior-preserving document-lifecycle extraction and focused tests; do not rewrite the app shell wholesale.                                                                                                                                                                                                              |

## Secondary security and reliability findings

| Finding                                              | Status                 | Disposition                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client accepts unsafe participant fields             | **Fixed in source**    | IDs, names, colors, cursors, selections, and roles are normalized before use; server IDs cannot be overwritten by presence updates.                                                                                                                             |
| Token comparison timing                              | **Still open**         | Capability comparisons still use ordinary string equality. Implement a fixed-length constant-time comparison supported by the Workers runtime and add mismatch tests. Lower priority because capabilities are 256-bit random values and remote timing is noisy. |
| Malformed Yjs update partial application             | **Needs reproduction** | Oversize rollback exists, but the exception path does not restore the previous state. Add a focused mutation test before changing the document lifecycle.                                                                                                       |
| Production Worker origins include localhost          | **Still open**         | Both committed production configs include loopback origins. Move local values into a development environment after confirming local live-test deployment commands.                                                                                              |
| Split author/update frames                           | **Still open**         | Author metadata and binary updates remain separate ordered messages. Frame them atomically or bind metadata to an update identifier when the collaboration protocol is revised.                                                                                 |
| Malformed Jira JSON returns server errors            | **Still open**         | Add object/array/string/null request-shape tests and return 400 for invalid client input.                                                                                                                                                                       |
| Jira cookie/session hardening and PKCE               | **Needs reproduction** | Confirm Atlassian PKCE and token-revocation support, then rotate the session identifier on callback and evaluate a `__Host-` cookie.                                                                                                                            |
| Jira response hardening                              | **Still open**         | Add `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; normalize upstream statuses before constructing responses.                                                                                                                                 |
| Service-worker failed navigation caching             | **Still open**         | Test a failed navigation response and cache only successful app-shell responses.                                                                                                                                                                                |
| SVG mutation after sanitization                      | **Needs reproduction** | Existing decorators operate on parsed SVG. Add adversarial tests and sanitize at the final insertion boundary if a mutation path can introduce active content.                                                                                                  |
| Stored preference and legacy workspace normalization | **Still open**         | Validate local-storage enums, handle storage exceptions, and stop preserving unknown legacy keys.                                                                                                                                                               |

## Bounded implementation backlog

### RB-1 — Renderer isolation prototype

- Add a sandboxed renderer frame without same-origin authority.
- Establish a per-frame channel handshake and accept messages only from the active frame.
- Recreate the frame after bootstrap failure or render timeout and reject stale results.
- Verify all six diagram types with local assets while offline.
- Instrument network APIs and add regression tests for any PlantUML syntax that can make a request.

Acceptance: the frame cannot access parent DOM or workspace storage, rendering recovers
after a forced timeout, and supported diagrams render offline in Chromium, Firefox, and
WebKit.

### RB-2 — Collaboration usage and retention limits

- Cap connections per room and message frequency per connection.
- Coalesce server-side presence broadcasts.
- Add an idle-room alarm and a revocation-retention design that prevents credential reuse.
- Measure document encoding, persistence, and reconnect traffic before choosing incremental
  persistence or a sync-protocol migration.

Acceptance: abuse tests receive deterministic close/status responses, ordinary editing is
not throttled, idle data expires, and revoked links remain invalid after restart and cleanup.

### RB-3 — Jira usage and failure boundaries

- Move expired-row cleanup to a scheduled handler.
- Rate-limit anonymous OAuth starts and authenticated API writes.
- Validate every request body shape and add no-store/nosniff responses.
- Serialize or otherwise make rotating refresh-token updates safe under concurrency.

Acceptance: invalid input returns 400, expired authorization returns a recoverable 401,
transient upstream failure does not delete a valid session, disconnect always succeeds, and
cleanup no longer writes on unrelated requests.

### RB-4 — Release verification and recovery runbook

- Record deployed commit/version checks and health probes for Pages and both Workers.
- Document Pages rollback, Worker rollback, client/protocol ordering, and D1 migration
  constraints.
- Add controlled Jira browser coverage and staging-only authenticated smoke checks.
- Verify branch-protection required checks in repository settings.

Acceptance: a maintainer can identify all deployed revisions, distinguish validation from
deployment, smoke-test them without exposing credentials, and follow a tested rollback.

### RB-5 — Document lifecycle extraction

- Move active-document changes, persistence, history, and file-conflict orchestration out of
  `App.tsx` behind a typed hook/module boundary.
- Add focused tests for tab changes, source/history updates, cleanup, and recovery failure.
- Keep each extraction behavior-preserving and independently reviewable.

Acceptance: document lifecycle has a clear owner outside `App.tsx`, listeners do not leak
across tab changes, and existing critical browser journeys remain green.

## Verification still requiring external access

- Inspect Cloudflare request logs using a controlled disposable room and verify that neither
  URLs nor error fields contain capability values. Record only field names and pass/fail.
- Confirm GitHub branch protection and required checks in repository settings.
- Run an authenticated Jira staging smoke test when test-site credentials are available.
- Perform post-deployment collaboration join, reconnect, and revocation checks after the next
  protocol-affecting release.
