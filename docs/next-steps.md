# PlantUML Ultimate: next steps

Prepared: 2026-09-07. Repository baseline: `795e39c`, version `0.2.0`.

## Recommendation

Make the next release a reliability and usability release. The app already supports six diagram types, local rendering, visual editing, offline use, recovery, collaboration, and Jira integration. The highest-value next step is to make those workflows consistently trustworthy and easy to discover before adding more diagram types or integrations.

This plan is based on the repository, recent commits, implementation files, tests, workflows, and existing audits. It is a planning review, not a fresh security audit or live usability evaluation. Tests were not run for this document; deployed behavior, CI results, service configuration, and user demand still need verification. Suggested effort ranges assume one developer and are planning estimates, not delivery commitments.

## Current position

| Area                    | Evidence and implication                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product breadth         | README and the 0.2.0 changelog describe Gantt, Sequence, Use Case, Class, Activity, WBS, collaboration, Jira, and offline workflows. Improve the existing experience before expanding scope.                                                                                                  |
| Recent hardening        | Collaboration credentials now use WebSocket protocols, revocation awaits HTTP success, Jira disconnect bypasses token refresh, backup history is validated, and SVG sanitization forbids style elements. Verify these protections rather than reimplementing the older audit recommendations. |
| Release checks          | Pages deployment now runs validation, browser tests, PWA tests, and live collaboration tests. CI runs on main as well. The audit's missing Pages browser gate is superseded in source.                                                                                                        |
| Other completed cleanup | The full MIT liability paragraph is present, and inspected workflows pin actions to commits. These are no longer open tasks from the old audits.                                                                                                                                              |
| Remaining complexity    | `apps/web/src/App.tsx` is 5,467 lines. Architecture documentation describes a narrower adapter implementation than the product now exposes. Incremental separation is warranted.                                                                                                              |
| Remaining investigation | Renderer isolation, service abuse limits, recovery edge cases, and Jira failure handling deserve focused verification. Old audit claims must be checked against current code before becoming tickets.                                                                                         |

The two existing audit files are historical inputs: [root audit](../audit-2026-09-02.md) and [docs audit](audit-2026-09-02.md). Keep them intact and track current status separately.

## Phase 1 — Establish a trustworthy release baseline

**Priority: P0. Suggested effort: 3–5 developer days, excluding substantial fixes discovered during verification.**

### 1. Reconcile the audits with the current implementation

- Create an issue checklist mapping each audit finding to current evidence, status, remaining work, and a regression test where appropriate.
- Use explicit statuses: fixed in source, verified in deployment, still open, or needs reproduction. Do not equate a merged fix with production verification.
- Start with collaboration credentials and room creation, custom-server joining, revocation, renderer isolation, Jira authentication, and backup restoration.
- Verify that deployment logs do not expose credentials transported in headers, URLs, or error messages.

**Done when:** every high-impact historical finding has an evidence-backed disposition, and remaining reproducible failures have bounded tickets.

### 2. Verify the critical user journeys

- Run `npm run validate`, `npm run test:e2e`, `npm run test:e2e:pwa`, and `npm run test:e2e:collaboration` on the release candidate.
- Exercise create → source edit → visual edit → undo/redo → save → reopen → export for all six diagram types.
- Verify that invalid source preserves the last successful preview and provides a useful diagnostic.
- Exercise dirty-tab recovery, backup/restore, external-file conflicts, offline startup, and updating the installed app with unsaved work.
- Exercise editor/viewer joining, reconnect after offline edits, revocation, and joining without sending an unrelated local document.
- Record actual failures and flaky tests. Recent Activity-settings and task-drag fixes justify checking readiness conditions rather than adding arbitrary waits.

**Done when:** the required suites pass on the candidate commit, critical journeys have recorded outcomes, and no known data-loss or permission failure remains unresolved.

### 3. Make release and recovery procedures explicit

- Document deployment verification and rollback for the static app and both Workers, including client/protocol compatibility and D1 migration constraints.
- Verify repository branch protection and required checks; these cannot be inferred from workflow files.
- Add an integration release check for the Jira browser flow, using controlled upstream responses and a separate staging smoke test where credentials are available.
- Ensure deployment status clearly distinguishes successful validation from a skipped deployment caused by missing secrets.

**Done when:** a maintainer can identify the deployed version, validate all three services, and follow a tested recovery procedure.

## Phase 2 — Close the remaining reliability gaps

**Priority: P1. Suggested effort: 1–2 weeks; revise after Phase 1.**

### 4. Strengthen the renderer boundary

The current renderer still uses a `srcdoc` iframe without an explicit sandbox. Source filtering blocks include/import directives and remote themes, but filtering is not a replacement for isolation.

- Prototype a sandboxed frame or separate rendering origin while preserving the DOM-dependent engine, local assets, and offline behavior.
- Define an authenticated message handshake and verify stale-response rejection, bounded queues, timeout recovery, and frame recreation.
- Check whether supported PlantUML syntax can initiate network requests despite filtering. Add regression cases for confirmed paths.
- Review the inline bootstrap and CSP together; implement hosting headers only after checking the actual deployment capabilities.

**Done when:** untrusted rendering cannot read workspace storage or the parent DOM, oversized or failed renders recover cleanly, and the six diagram types still render offline in supported browsers. If full isolation is blocked, record the concrete constraint and residual risk in an ADR.

### 5. Bound collaboration and integration service usage

- Confirm existing infrastructure limits, then add missing room-creation, connection, message-size, and message-rate limits.
- Coalesce frequent presence updates and measure full-document synchronization/persistence costs before redesigning the protocol.
- Define idle-room retention and cleanup. Preserve revocation guarantees: deleting room state must not allow old credentials to recreate a revoked room.
- Move integration cleanup off the request path if it remains there; test OAuth denial, expired authorization, invalid encrypted sessions, and transient upstream failures.
- Inspect concurrent refresh behavior and ensure failed or partial Jira writes can be reconciled before retrying.

**Done when:** excessive traffic has bounded resource use, expired sessions lead to a recoverable UI state, disconnect remains available during upstream failures, and revoked links remain invalid across restart and cleanup.

### 6. Make document safety observable to users

- Verify and clarify the distinction between local recovery, a saved file, and a downloaded backup.
- Test storage denial/quota failure, malformed backup structures, version-history restoration, and overlapping external-file edits.
- Ensure a failed restore cannot partially replace the current workspace; show actionable errors and preserve a recovery checkpoint.
- Review service-worker upgrade and offline fallback behavior under unsuccessful network responses.

**Done when:** failures preserve the user's current source and offer a clear next action; recovery succeeds after reload in automated scenarios.

## Phase 3 — Reduce the cost of future changes

**Priority: P1 after the baseline is green. Suggested effort: 1–2 weeks in small pull requests.**

### 7. Extract responsibilities from the app shell

- Start with document lifecycle, collaboration, and Jira orchestration in separate hooks/modules, building on the existing document-history and persistence hooks.
- Give selection and dialog state explicit types and transitions where this reduces invalid combinations.
- Add focused behavioral tests around the extracted boundaries: active-document changes, connection lifecycle, cleanup, and source/history updates.
- Keep each extraction behavior-preserving and independently reviewable. Avoid a whole-app rewrite.

**Done when:** these workflows have clear owners outside `App.tsx`, tab changes do not leak state or listeners, and existing browser journeys remain green. Line count is a signal, not the acceptance criterion.

### 8. Align adapters, packages, and documentation

- Decide whether the shared adapter registry will become the real application entry point. Implement it incrementally or amend the ADR to describe the chosen architecture.
- Define shared capability and source-edit contracts, then migrate one diagram type as a proof before changing all six.
- Add source-preservation cases covering comments, unknown syntax, aliases, and multiline constructs. A visual operation should change only its intended source region.
- Declare direct workspace dependencies, standardize package exports, and resolve the npm/pnpm configuration ambiguity.
- Update architecture, rendering, persistence, and Jira documentation; remove or implement placeholder packages only when there is a concrete reason.

**Done when:** documentation matches application routing, packages declare what they import, and the adapter proof demonstrates predictable source edits and undo behavior.

### 9. Improve test feedback

- Split the large editor browser suite by workflow or diagram family without losing coverage.
- Put deterministic assertions in correctness tests and machine-sensitive timings in benchmarks.
- Add targeted component tests for complex dialogs and accessibility checks for menus, inspectors, and keyboard-only workflows.
- Establish rendering and interaction baselines using representative small and large documents, including the existing benchmark fixture. Choose performance budgets from measured results.

**Done when:** failures identify a clear feature owner, critical checks are stable, and regressions in startup, rendering, or interaction can be measured against a documented baseline.

## Phase 4 — Improve product usability with user evidence

**Priority: P2. Suggested effort: one week of discovery followed by a scoped release.**

### 10. Observe real editing sessions

Recruit 3–5 representative users, including someone new to PlantUML. Ask them to create a diagram, edit it visually, recover a mistake, save/export, and share it. Include a Jira scheduling session if that audience is accessible. Record completion, points of confusion, and interventions without collecting document contents unnecessarily.

Use the findings to select the two largest obstacles. Candidate improvements are:

| Candidate                                | User benefit                                 | Acceptance criterion                                                                                        |
| ---------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Starter examples and contextual guidance | Faster first successful diagram              | A new user can choose a diagram, edit an example, and export it without assistance.                         |
| Consistent selection and inspectors      | Predictable interaction across all six types | Common actions have consistent labels, focus behavior, and keyboard access.                                 |
| Clearer collaboration status             | Confidence during reconnect and sharing      | Users can identify their role, whether edits are synchronized, and whether revocation succeeded.            |
| Clearer Jira synchronization review      | Fewer accidental or confusing updates        | Users can identify exactly which fields will change and distinguish success, conflict, and partial failure. |
| Large-diagram navigation                 | Easier work on real project diagrams         | Users can locate and edit a target without losing their selection or place.                                 |

These are hypotheses to validate, not confirmed missing features. Extend existing controls where possible.

**Done when:** the selected improvements resolve observed problems in a follow-up session and have regression coverage for their core flows.

## Suggested delivery order

| Milestone                            | Scope                                                                                          | Exit gate                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Reliability patch, suggested `0.2.1` | Audit reconciliation, reproduced correctness fixes, release procedures, targeted documentation | Phase 1 passes; confirmed data-loss and permission defects are fixed. |
| Internal simplification              | Renderer/service hardening and incremental app-shell/adapter work                              | Relevant Phase 2–3 acceptance criteria pass; no workflow regression.  |
| Usability release, suggested `0.3.0` | Two evidence-backed workflow improvements                                                      | Observed user tasks succeed and full release checks pass.             |

Version labels are proposals. Do not hold a necessary security or data-loss patch for the larger milestones. No release or deployment is authorized by this planning document.

## First five implementation tasks

1. Reconcile the current audit status and open only the remaining, reproducible issues.
2. Run and record the release-candidate validation and critical-journey results.
3. Prototype renderer isolation and document compatibility constraints.
4. Add missing service limits and revocation/retention regression tests.
5. Extract document lifecycle orchestration from `App.tsx` with focused behavior coverage.

## Defer until these foundations are stable

- Additional diagram types and third-party integrations.
- Accounts, cloud workspace storage, and broader sharing models.
- A major visual redesign or application rewrite.
- AI diagram generation without a validated user workflow and source-review design.

Revisit these after user sessions demonstrate demand and the release baseline is dependable.

## Source references

- [README](../README.md) and [changelog](../CHANGELOG.md)
- [Architecture](architecture.md), [rendering](rendering.md), and [persistence](persistence-and-files.md)
- [App shell](../apps/web/src/App.tsx) and [collaboration client](../apps/web/src/collaboration.ts)
- [Renderer](../apps/web/src/render/use-renderer.ts), [source filtering](../apps/web/src/render/plantuml-source.ts), and [SVG sanitization](../apps/web/src/render/sanitize-svg.ts)
- [Backup validation](../apps/web/src/workspace-backup.ts)
- [Collaboration Worker](../apps/collaboration-worker/src/index.ts) and [integration Worker](../apps/integration-worker/src/index.ts)
- [CI](../.github/workflows/ci.yml), [Pages deployment](../.github/workflows/deploy-pages.yml), and [integration deployment](../.github/workflows/deploy-integration.yml)
