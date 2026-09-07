# Release verification and recovery

This runbook covers the three production surfaces:

| Surface                 | Production URL                                | Deployment workflow               |
| ----------------------- | --------------------------------------------- | --------------------------------- |
| Static web app          | `https://plantuml.brosenius.se`               | `Deploy to GitHub Pages`          |
| Collaboration Worker    | `https://collaboration.plantuml.brosenius.se` | `Deploy collaboration service`    |
| Jira integration Worker | `https://jira.plantuml.brosenius.se`          | `Deploy Jira integration service` |

Use a maintenance window for changes that alter a client/Worker protocol or a D1 schema.
Never paste collaboration capabilities, Jira cookies, OAuth codes, encryption keys, or
Cloudflare tokens into an issue, command line, workflow input, screenshot, or saved log.

## Release gate

Before merging a release candidate:

1. Confirm `npm run validate`, all 12 browser shards, PWA, and live collaboration are green
   for the exact candidate commit.
2. Review Playwright retries. A green job that passed only on retry still needs a recorded
   flaky-test disposition before release.
3. Confirm the change set identifies whether it affects the web client, collaboration
   protocol, Jira API contract, Worker configuration, or D1 schema.
4. For a tag release, confirm the tag is `v` plus the root `package.json` version and that
   `CHANGELOG.md` describes the release.
5. Confirm repository secrets are present if a Worker is expected to deploy. A green Worker
   job may mean **validated but not deployed**; inspect the named deploy step rather than
   relying only on the job conclusion.

`main` currently has neither classic branch protection nor a repository ruleset (verified
through the GitHub API on 2026-09-07). Until protection is configured, treat pull-request
review and a fully green CI run as a manual release requirement. Recommended protection is:

- require a pull request before merging;
- require the `validate`, 12 browser shard, `pwa`, `collaboration-e2e`, and CodeQL checks;
- require branches to be up to date before merging;
- block force pushes and branch deletion;
- do not permit required-check bypass for routine changes.

Check the setting again before relying on it:

```sh
gh api repos/HBrosenius/PlantUMLUltimate/branches/main/protection
gh api repos/HBrosenius/PlantUMLUltimate/rulesets
```

## Deployment order

Ordinary, backward-compatible changes may deploy through their path-filtered workflows.
For contract changes, make compatibility explicit in the pull request:

1. Prefer an expand/contract rollout: deploy a Worker that accepts both old and new clients,
   deploy Pages, verify adoption, then remove old protocol support in a later release.
2. If compatibility is impossible, announce a maintenance window. Deploy Pages first, then
   the affected Worker immediately. New clients may be unavailable during that interval;
   deploying the Worker first would immediately break every old cached client.
3. Do not allow the collaboration Worker to deploy automatically before a protocol-dependent
   Pages build has completed. The workflows do not currently encode this dependency.
4. Keep Jira API changes backward-compatible across at least one web deployment whenever
   possible. Cached service-worker clients can outlive the Pages deployment.

The installed PWA may continue running cached code. Verification must therefore cover both a
fresh private browsing context and an existing installed/cached client receiving an update.

## Identify what is deployed

GitHub Actions is the source of truth for the deployed Git commit. For each surface, locate
the latest successful workflow run and record its `headSha`, run URL, deployment step, and
completion time:

```sh
gh run list --workflow deploy-pages.yml --status success --limit 5
gh run list --workflow deploy-collaboration.yml --status success --limit 5
gh run list --workflow deploy-integration.yml --status success --limit 5
gh run view RUN_ID --json headSha,url,createdAt,updatedAt,jobs
```

For Workers, verify that the `Deploy ... Worker` step ran successfully. If it was skipped,
the run validated the source but did not change production. For Jira, also verify that the
`Apply D1 migrations` step succeeded before the deploy step.

GitHub Pages uses hashed asset names. As a secondary check, compare the production HTML with
the asset names in a clean build of the recorded commit. Asset hashes are diagnostic evidence,
not a substitute for the workflow's commit identity.

## Post-deployment verification

Record only pass/fail, the workflow URL, commit, browser, and time. Do not record private room
URLs or authenticated response bodies.

### Static web app

1. Open `https://plantuml.brosenius.se` in a fresh private browser context.
2. Confirm the page loads over HTTPS without console or failed-asset errors.
3. Create each of the six diagram types and confirm a local preview appears.
4. For one representative document, perform source edit → visual edit → undo → redo → save or
   download → reopen → export.
5. Enter invalid source and confirm the last successful preview remains visible with an
   actionable error.
6. Reload with an unsaved tab and confirm recovery. Then test the installed-app update path
   with unsaved work.
7. Switch offline and reload the installed/cached app; confirm the shell and local renderer
   start without a network dependency.

A minimal unauthenticated availability probe is:

```sh
curl -fsS https://plantuml.brosenius.se/ > /dev/null
```

### Collaboration Worker

Start with the health endpoint:

```sh
curl -fsS https://collaboration.plantuml.brosenius.se/health
```

Then use a disposable document and room:

1. Create a private room and record no part of its URL.
2. Join once with an editor link and once with a viewer link in separate private contexts.
3. Confirm editor changes synchronize, viewer edits are rejected, and joining does not upload
   an unrelated local document.
4. Take one participant offline, edit, reconnect, and confirm convergence without losing the
   other participant's work.
5. Revoke the room while the owner is online. Confirm both peers disconnect and both old links
   fail to reconnect.
6. In Cloudflare request logs, inspect only request field names and redacted URLs. Confirm no
   capability value or `owner`, `editor`, `viewer`, or `access` query parameter is present.

### Jira integration Worker

Start with the health endpoint:

```sh
curl -fsS https://jira.plantuml.brosenius.se/health
```

In the controlled staging Jira site:

1. Connect, cancel once at the consent screen, and confirm the popup returns a recoverable
   error to the app.
2. Connect successfully and import a bounded query into a disposable Gantt document.
3. Review a proposed update before sending it and confirm success, conflict, and partial-failure
   states are distinguishable.
4. Expire or invalidate the test authorization and confirm the app asks the user to reconnect.
5. Confirm Disconnect remains available and clears the browser session while Atlassian is
   unavailable.

Do not run authenticated Jira smoke checks against user projects or real issue data.

## Rollback decision

Rollback when production has a reproducible data-loss, authorization, collaboration-role,
startup, or protocol-compatibility failure. Prefer a forward fix for a cosmetic defect or a
problem already isolated behind a safe feature path.

Before rollback:

1. Record the failing deployment run, commit, affected surface, first known failure time, and
   a sanitized reproduction.
2. Identify the last known-good commit whose complete release gates passed.
3. Determine whether a D1 migration has run. Code rollback does not reverse data migration.
4. Preserve diagnostics without exporting credentials or user document contents.

## Static app rollback

Use a new revert pull request; do not rewrite `main` or force-push a historical commit.

1. Revert the offending pull request on a `codex/` branch.
2. Run the full release gate against the revert.
3. Merge the revert and watch `Deploy to GitHub Pages` through its `deploy` job.
4. Repeat the static web verification in a fresh context and verify cached clients update.

If the current client is incompatible with a Worker, restore a compatible pair within the
same maintenance window using the ordering described above.

## Collaboration Worker rollback

If no schema or Durable Object class migration changed, either deploy a tested forward fix or
revert the Worker change through `main`. Cloudflare's deployment-version rollback can be used
for an emergency only after identifying the exact previous version in Cloudflare deployment
history. Follow it with a source revert so repository state again matches production.

Do not delete Durable Object storage to roll back code. Existing rooms and revocation markers
are security state. A rollback must preserve viewer enforcement and revoked-link rejection.

After rollback, repeat health, editor/viewer, reconnect, and revocation checks with a new
disposable room.

## Jira Worker and D1 recovery

The deploy workflow intentionally disables cancellation because it applies pending D1
migrations before deploying code. Treat every committed migration as forward-only:

- never edit or renumber an applied migration;
- make schema additions compatible with both the old and new Worker during rollout;
- use a new compensating migration for correction;
- do not drop or rewrite token/session columns until the old Worker can no longer run;
- back up or export only according to the project's data-handling policy, never into CI logs.

If migration succeeded but Worker deployment failed, do not roll the database backward.
Deploy a Worker version compatible with the expanded schema, preferably the fixed candidate or
the prior Worker if the migration was additive and explicitly compatible.

After recovery, repeat health, OAuth denial, connection, invalid-session, and disconnect
checks in staging before using production Jira data.

## Deployment record

For each release, add a short record to the release issue or release notes:

```text
Release/tag:
Candidate commit:
CI run:
Pages run and deployed commit:
Collaboration run and deployed commit (or not changed):
Jira run and deployed commit (or not changed):
D1 migrations applied:
Fresh-browser smoke result:
Installed/cached-client result:
Collaboration smoke result:
Jira staging smoke result:
Known retries or residual risks:
Rollback commit/version:
Verifier and UTC time:
```

The record must say **not run** when a check could not be performed. Do not turn a skipped or
credential-blocked check into a pass.
