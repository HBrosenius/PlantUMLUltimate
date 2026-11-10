# Refactoring PlantUML Ultimate for smaller coding models

Prepared: 2026-09-08. This is an implementation guide; no application refactoring was performed while preparing it.

## Objective

Make a normal feature change understandable from one short feature guide, a public interface, two or three implementation files, and the relevant tests. Reduce the amount of unrelated source a coding model must read and the number of unrelated behaviours it can accidentally change.

The aim is **smaller working context through clear ownership**, not merely shorter files. Moving 1,000 lines into a hook that accepts every application setter would preserve the original problem. Runtime performance is a separate concern: file splitting alone does not reduce rendering work or bundle size.

Keep behaviour, source formats, storage formats, public package exports, CSS selectors, and existing accessibility interactions unchanged during extraction. Schedule behavioural improvements as separate tasks.

## What the repository currently needs

Measured during this review; use symbol names to relocate code as line numbers change.

| File                                      | Lines | Responsibility to separate                                                                                |
| ----------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------- |
| `apps/web/src/App.tsx`                    | 5,483 | Document mutation, file lifecycle, collaboration, all diagram actions, menus, focus, and page composition |
| `apps/web/src/styles.css`                 | 4,374 | Global tokens/layout mixed with feature styles                                                            |
| `tests/e2e/editor.spec.ts`                | 4,181 | Many unrelated workflows and shared browser helpers                                                       |
| `apps/web/src/DiagramPreview.tsx`         | 1,509 | Gantt rendering presentation and interactions                                                             |
| `apps/web/src/SequenceDiagramPreview.tsx` | 1,295 | Sequence preview and interactions                                                                         |
| `apps/web/src/ClassEditors.tsx`           | 1,173 | Multiple forms and member editing                                                                         |
| `packages/diagram-sequence/src/index.ts`  | 1,168 | Types, parsing, references, formatting, and source operations                                             |
| `apps/web/src/ActivityEditors.tsx`        |   908 | Multiple Activity forms                                                                                   |
| `apps/web/src/VersionHistoryDialog.tsx`   |   816 | History, imported comparisons, semantic review, rendering, and export                                     |

There are useful existing boundaries: `usePersistedWorkspace`, `useDocumentHistory`, `useResourceCapacities`, the renderer directory, and framework-independent diagram packages. Extend those instead of introducing a state library or replacing the architecture.

Recent semantic-review features already exist in `semantic-review.ts` and `VersionHistoryDialog.tsx`. Preserve them and their import/apply safeguards; do not use older roadmap documents as an inventory of current functionality.

## Desired structure

These are proposed destinations, not paths that already exist. Migrate files only as their owning task needs them.

```text
apps/web/src/
  App.tsx                         # Composition and wiring only
  app/
    AppLayout.tsx
    AppToolbar.tsx
    use-app-commands.ts
    use-app-shortcuts.ts
    use-workspace-focus.ts
  features/
    documents/
      README.md
      types.ts
      use-source-commands.ts
      use-document-tabs.ts
      use-file-documents.ts
      use-external-files.ts
      use-workspace-backup.ts
    history/
      README.md
      use-version-history.ts
      VersionHistoryDialog.tsx
      VersionList.tsx
      RenderedVersion.tsx
    review/
      README.md
      semantic-review.ts
      use-review-import.ts
      ReviewComparison.tsx
    collaboration/
      README.md
      collaboration.ts
      use-collaboration-session.ts
      use-collaboration-checkpoints.ts
      CollaborationDialog.tsx
    jira/
      README.md
      jira-client.ts
      use-jira-connection.ts
      use-jira-sync-review.ts
      JiraDialog.tsx
    symbols/
      README.md
      use-symbol-navigation.ts
      semantic-symbol-provider.ts
    diagrams/
      wbs/
      usecase/
      class/
      activity/
      sequence/
      gantt/
        README.md
        use-gantt-actions.ts
        GanttInspectors.tsx
        GanttDialogs.tsx
        preview/
  render/                         # Keep the existing engine boundary
  styles/
    tokens.css
    base.css
    layout.css
  styles.css                      # Ordered imports during migration

tests/e2e/
  helpers/editor.ts
  documents.spec.ts
  history-review.spec.ts
  gantt.spec.ts
  sequence.spec.ts
  class.spec.ts
  activity.spec.ts
  usecase.spec.ts
  wbs.spec.ts
  # Retain existing Jira, PWA, security and live-collaboration suites.
```

Within each diagram directory, use separate actions, inspectors, dialogs, and preview modules only when they have a real responsibility. Do not create empty directories or dozens of one-function wrappers in advance.

### Dependency direction

```text
App composition -> feature controllers and feature UI
feature UI -> its feature's public types/actions
feature controllers -> existing infrastructure and domain packages
domain packages -> language/editor contracts, never React or web features
```

Features must not import `App.tsx`. Sibling features communicate through narrow typed callbacks wired by the shell. Avoid runtime barrel imports within a feature: import the leaf file directly. A public entry point may expose a small supported surface to the shell without re-exporting every internal file.

Do not make a universal `useAppState`, giant context provider, event bus, or generic diagram controller to avoid passing a few explicit props. Share an abstraction only after two implementations demonstrate the same semantics.

## State ownership and invariants

| State/behaviour                                  | Owner                            | Boundary rule                                                                                       |
| ------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Persisted session, documents, active ID          | Existing `usePersistedWorkspace` | Keep one authoritative session; do not mirror source into feature state.                            |
| Undo/redo histories                              | Existing `useDocumentHistory`    | Preserve per-document histories and grouping. Durable versions are different from undo.             |
| Local validated source commit                    | New document command hook        | Preserve permission checks, validation, history recording, dirty state, and focus request ordering. |
| File handles and synchronized snapshots          | File-document controller         | Key by document ID; preserve handles across tab switches and release entries on close.              |
| External change polling/conflicts                | External-file controller         | Use file-controller operations; no second snapshot map.                                             |
| Collaboration socket, timers, pending checkpoint | Collaboration controllers        | One session owner; remote changes retain their existing path and attribution.                       |
| Current diagram selection/dialogs                | Corresponding diagram controller | Preserve current tab reset/retention policy before redesigning it.                                  |
| Derived parsed models                            | Existing derivation initially    | No persisted duplicate model; changing parse frequency is a later performance task.                 |
| Semantic review proposal/import state            | Review controller                | Applying a proposal must still verify the current working source.                                   |
| Toolbar/shortcuts                                | App composition                  | Route to actions; never implement domain mutations here.                                            |

The existing `commitSource(source, description, validate = true): boolean` is a crucial seam. It rejects viewer edits, validates generated source, records undo, marks dirty state, and captures inspector focus. First preserve its exact contract and call order. Do not change callers to a new transaction framework in the extraction task.

Source-editor typing, remote updates, restores, undo, and visual operations may deliberately use different paths. Inventory these before extraction; forcing all of them through validated visual commits could reject incomplete typing, echo remote updates, or duplicate history.

Async work must retain the identity of the document it started against. Test switching tabs or closing the originating document while save, import, or collaboration work is pending. Do not silently redirect a result to the newly active tab.

## Working rules for a smaller model

1. Complete one task card per coding session. Do not ask it to implement this entire plan at once.
2. Read the feature README, named symbols, adjacent types, and the selected test. Expand context only for a concrete unresolved dependency.
3. Before editing, list the extracted code's free variables and classify each as an input, feature-owned state, side effect, or action callback.
4. Move leaf UI or pure functions before stateful orchestration. During transition, keep state in its old owner and pass typed props. Move ownership in a later task.
5. Prefer 2–5 production files and one responsibility per task. Split a task if it requires understanding several feature lifecycles. Mechanical moves can touch more import sites without changing their logic.
6. Preserve signatures with temporary re-exports if that keeps a move reviewable. Give every shim a cleanup task; new code imports the destination.
7. Never change a parser algorithm, storage schema, user-facing behaviour, or dependency version merely to make extraction easier.
8. When an existing defect is discovered, record it separately. Do not quietly fix success/error behaviour during a move, even when a caller appears to ignore a failed commit.
9. Report exact checks and outcomes. A test not run is not a passing test. Preserve unrelated working-tree changes.

Suggested context budget: feature guide under 100 lines, contract under about 150 lines, and roughly 1,000–1,500 implementation lines per ordinary task. These are working targets, not hard limits. A useful module may exceed 400 lines; cohesive code is better than artificial fragmentation.

## Ordered implementation task cards

Each numbered task is a checkpoint. Where a card lists substeps, dispatch each substep separately. Keep `App.tsx` edits sequential to avoid overlapping changes.

### R00 — Capture the baseline and make the task index

**Read:** this plan, `package.json`, `playwright.config.ts`, existing architecture/ADRs, and repository instructions if present.

**Do:** record the starting commit and working-tree status; run baseline checks below; create `docs/refactor-progress.md` with task ID, status, commit, changed files, checks, and unresolved concerns. Create a concise `docs/code-map.md` mapping common user changes to current files and tests. Record baseline test collection before splitting suites.

**Done:** baseline failures are distinguished from refactor regressions, and the next task has an explicit read/edit list. Do not fix unrelated failures in this task.

### R01 — Extract browser-test helpers, then split one suite at a time

**Read:** helpers `fillSource`, `setSource`, `openAddDialog`, `pointInText` in `tests/e2e/editor.spec.ts`, plus its hooks and fixtures.

**Edit first:** that spec and `tests/e2e/helpers/editor.ts`. Move helpers without changing retry/readiness behaviour.

**Then:** separate WBS tests, followed by each other diagram family, then documents/history/review and shared navigation tests. Each move is its own task. Preserve test names, fixtures, browser skips, setup, and assertions. Leave cross-family tests in a shared workflow suite.

**Verify:** compare collected tests by project and title, allowing only expected file-location changes; run each moved suite. Check CI scripts for explicit filenames before removing the old file.

**Done:** no test disappears or duplicates, and a WBS-only change has a discoverable WBS suite.

### R02 — Extract small leaf components from large form files

**Read:** `ClassEditors.tsx`, `ActivityEditors.tsx`, their imports and existing editor tests.

**Do separately:** move one exported form/component per task to its feature directory; retain its props and JSX; keep shared form helpers local to that feature. Preserve the old file as explicit compatibility re-exports until import migration is complete.

**Verify:** typecheck, targeted lint, existing form/domain tests, and the corresponding browser workflow when JSX ownership changes.

**Done:** editing one form does not require reading all Class or Activity forms. Do not move state from `App.tsx` yet.

### R03 — Extract inspector focus management

**Locate:** `captureInspectorFocus`, `InspectorFocusSnapshot`, `pendingInspectorFocus`, and the `useLayoutEffect` that restores focus after source changes in `App.tsx`.

**Edit:** `App.tsx` and `app/use-workspace-focus.ts`. Expose capture-before-commit and restore behaviour; pass the existing workspace element reference. Keep unrelated diagram focus/navigation in place initially.

**Verify:** existing test “keeps inspector focus, zoom, and split position after applying a source edit,” including its current browser-specific conditions.

**Done:** focus timing, selection ranges, and fallback focus are unchanged. Do not replace a layout effect with a normal effect.

### R04 — Extract source commands without changing their semantics

**Depends on:** R03.

**Locate:** `commitSource`, `commitGeneratedSource`, `undo`, `redo`, `update`, and all direct source-writing paths in `App.tsx`; read `use-document-history.ts` and `generated-source-validation.ts`.

**Subtask A:** extract only `commitSource` and its wrapper to `features/documents/use-source-commands.ts`, with explicit typed dependencies. Keep undo/redo and other paths where they are.

**Subtask B:** move undo/redo once the commit extraction passes. Keep generic view-setting updates separate from source commands.

**Verify:** invalid visual edits do not enter undo history; viewer edits are rejected; typing and visual changes still participate in the intended history; focus survives; undo in one tab does not affect another.

**Done:** feature actions can call the same small commit contract without knowing persistence or history internals. If a unit-test seam is needed, extract only deterministic decision logic; do not add a test framework simply to render a hook.

### R05 — Use WBS as the first complete feature extraction

**Depends on:** R01 and R04.

**Read:** `App.tsx` WBS symbols (`addWbsNode` through `applyWbsSettings`, selected WBS state and its reset effects), `WbsDiagramPreview.tsx`, WBS forms, and the WBS package's public types.

**Subtask A:** move WBS dialog/inspector JSX to `WbsDialogs.tsx` and `WbsInspectors.tsx` with explicit props; leave state and callbacks in the shell.

**Subtask B:** move WBS action callbacks to `use-wbs-actions.ts`; accept source, parsed WBS model, selected IDs, commit callback, and narrowly named UI callbacks. Do not accept the entire app state.

**Subtask C:** move WBS selection/dialog state and reset rules to a controller only after A/B pass. Keep existing parsing in the shell until a later measured change.

**Verify:** node creation, subtree movement/deletion, relationship creation/reconnect, keyboard selection, settings, undo, and tab switching. Keep confirmations and messages unchanged.

**Done:** a routine WBS action change requires the WBS guide, action file, domain operation, and test—not the complete shell.

### R06 — Repeat the proven feature boundary

**Depends on:** R05. Separate tasks in this order: Use Case → Class → Activity → Sequence → Gantt.

For each family repeat leaf JSX → actions → owned state. Write its README before moving to the next family. Use its current callback signatures rather than forcing WBS's structure onto it.

For Sequence, preserve timeline/fragment ordering and reconnect semantics. For Gantt, split further into task/milestone actions, dependency/divider actions, calendar/settings actions, and schedule/resource orchestration. Locate `stageScheduleChange`, `applyTaskInspector`, `applyMilestoneInspector`, and `findResourceConflicts`; do not move all Gantt behaviour into one large hook.

**Verify:** that family's existing browser suite plus source-preservation/domain tests, and cross-family tab/undo tests after every ownership move.

**Done:** each diagram has local entry points. The shell wires capabilities without containing diagram-specific source transformation calls.

### R07 — Separate durable history from semantic review UI

**Read:** `VersionHistoryDialog.tsx`, `semantic-review.ts`, `version-diff.ts`, history storage interfaces, and imported comparison browser tests.

**Subtasks:** (A) extract `RenderedVersion` and SVG highlighting while preserving sanitization; (B) extract the version list; (C) extract imported comparison state/file reading into `use-review-import`; (D) extract review controls into `ReviewComparison`; (E) move `recordDocumentVersion`, `openVersionHistory`, version edit/delete/restore orchestration from `App.tsx` to `use-version-history`.

**Verify:** current-source guard on applying review changes, two imported files versus working copy, adjacent change groups, size limits, baseline display, version lineage after Save As, and restore checkpoints.

**Done:** changing review UI does not require learning file saving or collaboration checkpoint scheduling. History exposes a small record/load/restore interface to those features.

### R08 — Separate file lifecycle and tab lifecycle

**Depends on:** R04 and R07.

**Locate:** `addOpenedDocument`, `openDocument`, `saveDocument`, `saveDocumentAs`, file-handle/snapshot maps, `checkExternalFiles`, conflict actions, `activateTab`, `closeTab`, `duplicateTab`, and `closeOtherTabs`.

**Subtasks:** (A) file open/save controller; (B) external-change/conflict controller using the first controller's maps and methods; (C) backup/restore controller; (D) tab actions with explicit cleanup callbacks.

Maintain one owner per map. Reuse existing `file-service.ts`, `external-file-merge.ts`, and `workspace-backup.ts` implementations. Do not migrate storage schemas or change serialized backup output.

**Verify:** dirty prompts, final-tab behavior, Save As version lineage, external merge, backup round-trip, and pending save with a tab switch. Preserve cancellation handling and checkpoint order.

**Done:** document IDs, not whichever tab is active at completion, govern asynchronous results according to existing behaviour. If this exposes a pre-existing race, record and address it in a separate corrective task with a regression test.

### R09 — Extract collaboration orchestration in two layers

**Depends on:** R07 and R08.

**Locate:** `scheduleCollaborationVersion`, `flushCollaborationVersion`, `startCollaboration`, `leaveCollaboration`, `rotateCollaborationRoom`, related refs/effects, and remote-edit flash state.

**Subtask A:** checkpoint debounce/flush lifecycle into `use-collaboration-checkpoints.ts` with an injected history-recording callback.

**Subtask B:** session creation/join/reconnect/leave/rotation into `use-collaboration-session.ts`, keeping `collaboration.ts` as the transport layer. Extract remote flash separately if needed.

**Verify:** live two-editor synchronization, viewer restrictions, awaited revocation, reconnect, tab close cleanup, checkpoint attribution, unmount timer cleanup, and no duplicate socket after rerender. Preserve custom endpoint and credential validation.

**Done:** the shell sees status, participants, permissions, and named commands; it does not manage sockets or timers. Do not redesign the protocol or remote-history semantics here.

### R10 — Extract Jira connection and review responsibilities

**Read:** `JiraDialog.tsx`, `jira-client.ts`, `jira-schedule-edits.ts`, `packages/jira-integration`, and `tests/e2e/jira.spec.ts`.

**Subtasks:** connection/loading state; import controls; synchronization review/apply controls; then shell wiring. Keep upstream API calls in the client and domain schedule transformations in existing modules/packages.

**Verify:** connection errors, import, refresh, reviewed writes, cancellation, and task synchronization markers.

**Done:** one screen change does not require the entire dialog and app shell. No changes to OAuth or Worker routes are needed for this UI extraction.

### R11 — Extract shared navigation and shell composition last

**Depends on:** diagram, document, and collaboration action contracts being stable.

**Subtasks:** symbol navigation/rename; command-palette construction; keyboard listener; toolbar; page layout. Locate `requestSymbolRename`, `navigateOccurrence`, `commands`, and the shortcut effect.

Use named action groups such as document actions and active-diagram actions. Keep labels, shortcut availability, focus restoration, listener cleanup, and disabled states unchanged. Layout accepts UI slots rather than every individual inspector setter.

**Verify:** command palette, keyboard-only workflows, rename/reference navigation, view switching, pan/zoom, and split resizing.

**Done:** `App.tsx` primarily composes features. Aim for roughly 300–600 readable lines eventually; if it remains larger, identify the remaining responsibility instead of hiding props in an opaque object.

### R12 — Break down preview implementation without changing geometry

**Depends on:** relevant diagram controller extraction; one preview at a time.

**Read:** the preview's props, DOM/SVG construction, pointer/keyboard effects, and relevant render/geometry tests.

**Subtasks:** pure geometry helpers → selection overlay component → pointer interaction hook → keyboard interaction hook. Keep a single owner for gesture state and SVG references. Split only at boundaries verified in the actual file.

**Verify:** zoomed/scrolled pointer coordinates, drag cancellation, geometry readiness, overlay alignment after render, keyboard actions, and cleanup of listeners/observers. Run Chromium, Firefox, and WebKit for gesture changes.

**Done:** adjusting one gesture does not require reading all SVG processing. Preserve sanitization and last-successful-render behavior. Do not rewrite geometry algorithms or add memoization speculatively.

### R13 — Split the Sequence domain package behind the same exports

**Read:** `packages/diagram-sequence/src/index.ts` and its tests.

**Subtasks:** model types → parsing → occurrences/rename → participant/message operations → structure operations. Use `model.ts`, `parser.ts`, `references.ts`, and an `operations/` directory as appropriate.

Keep `index.ts` as explicit public re-exports. Internal modules import leaf modules, not `index.ts`. Preserve signatures, emitted text, operation order, and source ranges.

**Verify:** existing Sequence package tests and typecheck, then Sequence browser workflows. Add fixtures only for an uncovered boundary at risk, not tests that mirror every moved function.

**Done:** callers do not change and domain modules remain React-free. Apply the same pattern to large Gantt files only when needed, as separate work.

### R14 — Split CSS while preserving the cascade

**Read:** `styles.css`, its import in `main.tsx`, and selectors used by the affected feature/tests.

**Do:** first move contiguous blocks into ordered CSS files imported by `styles.css`. Keep every rule's relative order, selector, specificity, media query, and variable scope unchanged. A block may temporarily have a neutral numbered filename to preserve order.

Only reorganize into feature-owned style files in a later task after checking dependencies between blocks. Do not also adopt CSS modules, rename classes, or introduce lazy CSS loading.

**Verify:** production build plus visual checks of light/dark themes, narrow/wide layouts, menus, dialogs, inspectors, and previews. Use existing visual tooling if present; otherwise record manual comparisons honestly.

**Done:** style ownership is discoverable with no cascade changes. Browser tests alone are not proof of visual equivalence.

### R15 — Finish documentation, boundaries, and transitional cleanup

Update architecture/code map to the actual result. Remove compatibility re-exports after searching for consumers. Use targeted ESLint import restrictions compatible with the installed tooling to prevent feature-to-shell and web-to-domain reverse dependencies; introduce each rule after violations have been migrated.

Do not add arbitrary global line-count failures. Document a review trigger for modules that accumulate unrelated responsibilities. Keep Workers as separate bounded projects; their current size is lower priority than the web shell and should not expand this refactor's scope.

**Done:** all feature guides have working test commands, the app builds without shims, and a small-model trial successfully implements a local change using the documented context packet.

## Verification commands and scope

Use the repository's Node 22+ environment. The following commands already exist or use installed tooling. Proposed filenames are usable only after their task creates them.

```sh
# Baseline and major ownership milestones
npm run validate

# Quick checks after a small web extraction
npm --workspace @plantuml-studio/web run typecheck
npx eslint apps/web/src/App.tsx apps/web/src/features/wbs-example.ts
# Replace the illustrative second path with the actual changed file(s).
npx prettier --check <changed-files>

# Existing focused tests: examples
npx vitest run apps/web/src/generated-source-validation.test.ts
npx vitest run packages/diagram-sequence/src/index.test.ts

# Before test splitting, select an existing test by title
npx playwright test tests/e2e/editor.spec.ts --project=chromium -g 'creates and visually edits a WBS diagram'

# Once the WBS test file exists
npx playwright test tests/e2e/wbs.spec.ts --project=chromium

# Confirm browser test inventory before/after splitting
npx playwright test --list

# At completed milestones / release candidate
npm run test:e2e
npm run test:e2e:collaboration
npm run test:e2e:pwa
```

The ESLint and formatting lines are templates, not commands to run with nonexistent paths. Record exact substituted commands in each task handoff. Prefer the cheapest relevant checks per extraction, full validation at an ownership milestone, and the full browser/service/offline gates for the completed refactor. Do not run all suites after every mechanical move unless failures justify it.

No tests were run to produce this plan. This review inspected source, configuration, and test names; it does not establish a green baseline.

## Feature README template

```markdown
# Feature name

Purpose: one sentence.
Entry points: the 2–4 files most changes start in.
Owns: state and side effects owned here.
Inputs/outputs: public props, actions, and important return semantics.
Invariants: source/history/permission/focus rules that must remain true.
Dependencies: permitted packages and injected services.
Common tasks: “change X -> read Y -> run Z”.
Tests: exact focused commands and important browser cases.
Do not change here: neighbouring responsibilities.
```

Keep this factual and brief. Do not copy the implementation into prose. Prefer maintainable task guidance over another large architectural essay the model must load.

## Copy-paste prompt for an implementation session

```text
Implement task R__ from docs/refactoring-for-small-models.md only.

First inspect repository instructions and git status, then read the task card,
the owning feature README if present, and the named symbols/tests. Use targeted
searches rather than loading the entire repository. Confirm prerequisite task
status from docs/refactor-progress.md against actual files.

Before editing, list the current dependencies and ownership of the code being
extracted. Choose a narrow typed boundary that preserves behaviour. If the card
has substeps, implement only substep __ in this session.

Allowed production files: [explicit list].
Allowed tests/docs: [explicit list].
Preserve unrelated changes, public signatures, source/storage formats, messages,
focus timing, permission checks, and cleanup. Do not add dependencies, redesign
state, fix unrelated defects, or implement the next task.

Run [exact focused commands]. If a meaningful dependency requires more files,
state why and keep the expansion within this responsibility; if it requires a
second feature redesign, leave a specific follow-up instead.

Update the progress record with changed files, verification results, remaining
risks, and the next task's minimal read list. Finish with a concise summary of
what moved and whether behaviour changed. Do not deploy or commit unless asked.
```

## Completion criteria

- A representative WBS edit, review-dialog edit, and file-save fix can each be understood through one feature guide and a small set of modules.
- `App.tsx` no longer owns diagram source transformations, file polling, or collaboration timers.
- Each stateful resource has one clear owner and preserves tab/cleanup semantics.
- Domain packages retain their public APIs and framework independence.
- Test collection is preserved, relevant checks pass, and any baseline failures remain explicitly documented.
- No persisted source/session/backup format changes are required.
- Trial a small-model task before declaring success: record files and lines it needed to read, files touched, checks passed, and unrelated changes introduced. Compare with an equivalent pre-refactor task; improve the boundary if it still needs the whole shell.

**Start with R00, then R01.** The highest-value first milestone is R05: a complete WBS feature boundary that proves the extraction pattern before repeating it across the application.
