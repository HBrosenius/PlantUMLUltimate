# Code review — 2026-09-30

Scope: web app shell, persistence and file format, collaboration and integration Workers,
Jira integration, diagram packages, and the Gantt forecast work (including uncommitted
changes at the time of review). Findings marked **confirmed** were reproduced with a
throwaway test or verified directly in code; **plausible** findings follow from the code
but were not reproduced end to end. None of these items appear in the earlier audits
([audit-status-2026-09-07](audit-status-2026-09-07.md),
[app-reassessment-2026-09-13](app-reassessment-2026-09-13.md)).

Baseline at review time: lint passed and 790 unit tests passed. Typecheck and format check
failed because of in-progress Gantt forecast work (`DeliveryScenarioDialog` did not pass the
new required `resourceCapacities` prop; `GanttForecastView.tsx` needed Prettier).

Status legend: `[ ]` open, `[x]` fixed in source (see notes).

## P0 — Data loss and crashes

- [x] **Quota errors in localStorage break saving and can blank the app** (confirmed).
      `saveWorkspaceRecovery` (`apps/web/src/workspace-storage.ts`) writes the full workspace
      to localStorage without a try/catch; it runs in an effect on every session change
      (`use-persisted-workspace.ts`), including caret moves, and there is no error boundary.
      `saveWorkspace` calls it outside its `try`, so a quota error also skips the IndexedDB
      write, and `loadWorkspace` prefers the stale localStorage copy on reload.
      _Fixed: recovery writes are guarded and clear the stale copy on failure, so loading falls back to IndexedDB; all preference writes go through `savePreference`; `AppErrorBoundary` offers reload and a workspace backup download._
- [x] **Project recovery record freezes on quota errors and is preferred on restore**
      (confirmed). `saveActiveProject` writes localStorage before IndexedDB; the caller
      swallows the error and `loadActiveProject` returns the old localStorage record first.
      `use-folder-project.ts` wraps `void promise` in a try/catch that cannot catch.
      _Fixed: the stale localStorage record is cleared when its write fails; the folder-project rejection is now caught._
- [x] **IndexedDB aborts hang forever** (confirmed). Transaction wrappers in
      `workspace-storage.ts` handle `oncomplete`/`onerror` but not `onabort`; a commit-time
      quota failure only fires `abort`, so `saveDocument` awaits forever with no error.
      `updateDocumentVersion` resolves before commit.
      _Fixed: every transaction rejects on `abort`; `updateDocumentVersion` resolves after commit._
- [x] **Pinned versions accumulate until saving fails** (confirmed). Every restore creates a
      pinned "before-restore" version that pruning never removes; past the protected limit,
      `planRetention` throws `protected-history-overflow` on every save.
      _Fixed: only the newest 10 automatic restore points stay protected (`BEFORE_RESTORE_PIN_LIMIT`); manual pins are unchanged._
- [x] **Single-file project save has no external-change check** (confirmed in code).
      Single documents (`rawDigest`) and folder projects (`observedFileHash`) check; embedded
      project saves do not, so the last writer silently wins.
      _Fixed: the file digest is recorded on open and save and re-checked inside the save queue; a changed file stops the save and suggests Save As (`tests/e2e/project-external-change.spec.ts`). An unreadable file is still rewritten._
- [x] **Folder save journal replayed blindly** (plausible). `recover()` rewrites members
      from the journal without staleness checks, reverting later external edits.
      _Fixed: save journals (version 2) record each file's prior digest; recovery completes only files still in their pre-save or saved state and otherwise stops with `ProjectRecoveryConflictError`, leaving files and journal untouched. Version 1 journals replay as before._
- [x] **Jira apply replaces the document from a stale snapshot** (confirmed).
      `JiraDialog.tsx` builds the result from `review.baseSource` and commits it without
      checking the current source still matches; concurrent edits are reverted.
      _Fixed: apply refuses when the chart changed since the review, including during publishing._
- [x] **Collaboration: malformed Yjs update is partially applied** (confirmed).
      `apps/collaboration-worker/src/index.ts`: `Y.applyUpdate` can throw after merging;
      the catch only closes the socket, bypassing the 5 MB size check and able to wedge the
      room.
      _Fixed: updates are applied to a candidate document that replaces the room state only after the size check and persistence succeed._
- [x] **Collaboration: documents between 2 and 5 MB may never persist** (plausible).
      Durable Object SQLite rows are limited to 2 MB but `MAX_DOCUMENT_BYTES` is 5 MB.
      _Fixed: `MAX_DOCUMENT_BYTES` is now 1.9 MB, below the Durable Object row limit._

## P1 — Correctness

### Diagram detection and parsing

- [x] **Diagram kind misdetection** (confirmed). `apps/web/src/diagram-kind.ts` tests the
      activity regex first, and it matches bare `else`, `end`, `partition`; sequence
      diagrams with `alt/else/end` or `group … end` open as Activity. Component is checked
      before Use Case, so `rectangle Shop {` in a use-case diagram opens as Component.
      _Fixed in `diagram-kind.ts`._
- [x] **CRLF sources lose content** (confirmed). Class, use-case, activity and sequence
      parsers split on `\n`, and `(.*)$` regexes do not match `\r`.
      _Fixed: parsers ignore trailing `\r` while keeping original offsets._
- [x] **Rename writes unquoted endpoints** (confirmed). Class and use-case rename rewrite
      relationship/note lines with bare names: renaming `A` to `My Class` drops the
      relationship; `(Login)` loses its parentheses. Undeclared class endpoints lose case.
      _Fixed for class and use-case: rename replaces only the endpoint tokens, keeping `(…)`/`:…:` forms and quoting names that need it; note targets accept quoted names._
- [x] **Names containing `"` are written as `\"`** (confirmed), which neither the parsers
      nor PlantUML read back (class, use-case, sequence, activity `quote` helpers).
      _Fixed: quotes inside quoted names are written as `&#34;` (verified to render as `"` in the local PlantUML engine) and decoded by the parsers; backslashes are no longer doubled on each edit._
- [x] **Use-case `:Actor: --> (UseCase)` lines parsed as declarations** (confirmed);
      relationships disappear.
      _Fixed: shorthand relationship lines parse as relationships and their endpoints count as implicitly declared. Implicit endpoints are now `implicit` elements that can be selected; editing, moving or reordering one first adds a declaration before the line that uses it._
- [x] **Non-ASCII identifiers not parsed** (confirmed). `[\w.$-]` is ASCII-only
      (`Åsa -> Bob : hej` yields no message).
      _Fixed: sequence and class regexes and bare-name checks use Unicode letter/number classes._
- [x] **Sequence `participant A as "…"` alias form** breaks rename and delete (confirmed).
      _Fixed: the code-first form is read as label "…" with alias A, so rename and delete update messages._
- [x] **Block comments `/' … '/` not skipped** (confirmed) in class and sequence parsers.
      _Fixed: class and sequence parsers blank out block comments (offsets preserved) and skip `'` lines in class bodies._
- [x] **Deleting a class leaves orphan `note on link`** that reattaches to an unrelated
      relationship (confirmed).
      _Fixed: link notes of removed relationships are deleted too._
- [x] **Updating a multiline sequence note eats blank lines above it** (confirmed).
      _Fixed: note and ref patterns start at `^[ \t]*`._
- [x] **WBS labels mis-split**: `#123` becomes a colour, `(draft)` an alias (confirmed).
      _Fixed: a trailing `#colour` is only a colour after a `:…;` label; a spaced `(text)` is an alias only when an arrow uses it._
- [x] **Multiple `@startuml` blocks** are merged; inserts go to the first block
      (plausible).
      _Fixed: class and sequence parsers read only the first diagram (where edits land); class reports a `multiple-diagrams` warning._

### Gantt forecast

- [x] **Apply forecast on a task with a fixed end date is undone by the next forecast**
      (confirmed). `gantt-apply-forecast.ts` only saves the remaining-work override in the
      `lasts` branch.
      _Fixed: end-date branches keep the remaining-work override for started tasks._
- [x] **Resource-conflict check reports false "new" conflicts** for start/end-dated tasks
      (confirmed). Planned workload uses `taskElapsedDays`, undefined without `lasts`;
      completed tasks are excluded from the plan side.
      _Fixed: the resource panel now counts start/end-dated tasks over their working days, matching the forecast comparison; completed tasks are excluded from both comparison sides._
- [x] **One-day unfinished task treated as a milestone** (confirmed).
      `gantt-progress-forecast.ts` uses `start === end && !duration` instead of
      `task.milestone`.
      _Fixed: uses `task.milestone`._
- [x] **Pauses ignored in the automatic remaining-work fallback** (plausible).
      _Fixed._
- [x] **`today` in source vs forecast status date use different time zones** (plausible).
      _Fixed: with a forecast enabled, plans resolve `today` in the forecast time zone (App, DiagramPreview, apply-forecast)._
- [x] **Resource workload loop has no step cap** (plausible): an all-closed calendar
      freezes the tab (`ResourceWorkloadPanel.tsx`).
      _Fixed: capped at 10,000 steps._

### Jira and Workers

- [x] **"Keep local" undone on next pull** (confirmed): baselines rebuilt from local values
      for never-published fields (`completion`).
      _Fixed: after publishing, baselines take the local value only for fields actually published (`createPublishedJiraBaselines`); other fields keep the Jira value, so unpublished local choices stay local changes._
- [x] **Pull replaces all resources with the assignee** without a conflict prompt
      (confirmed).
      _Fixed: pull only replaces resources that look Jira-managed (none, or one person at 100%); several resources or custom allocations are kept._
- [x] **Any 4xx on token refresh deletes the session**, including 429 (confirmed).
      _Fixed: only `invalid_grant`/`unauthorized_client` rejections end the session; rate limits and transient failures return a retryable 503._
- [x] **Untrusted Jira text reaches PlantUML**: `safeLabel` only strips newlines and
      brackets; the source filter misses `!includesub` and `%load_json` (filter gap
      confirmed; network impact plausible).
      _Fixed: every include/import variant, `!theme … from` and file/env builtins are blocked; Jira summaries and assignees are neutralized by `jiraTaskLabel` (also used by reconcile)._
- [x] **Room revocation reads an unbounded body** (plausible, low).
      _Fixed: bodies over 4 KB get 413._
- [x] **Jira update allowlist permits nulling any `customfield_*`** (confirmed, low).
      _Fixed: only `summary`, `duedate` and the named date custom field `startFieldId` are accepted._

### Editor shell

- [x] **Undo records every keystroke**; 500 full-source entries (confirmed).
      _Fixed: consecutive keystroke-sized source edits within 1 s merge into one undo step (pastes stay separate). Also fixed a pre-existing bug found while testing: Cmd/Ctrl+Z in the code editor did nothing because CodeMirror's own history competed with the app history; the editor now uses `codeEditorSetup` without CodeMirror history, and Ctrl+Y redoes._
- [x] **Global shortcuts ignore dialogs and text fields** (Cmd+Z/W/S behind modals)
      (confirmed).
      _Fixed: with a dialog open, document shortcuts are ignored (browser save/open/close defaults still blocked); Escape keeps its existing behaviour of also dismissing inspectors, which `editor-gantt.spec.ts` expects; text fields keep native undo (`tests/e2e/editor-shortcuts.spec.ts`, all three browsers)._
- [x] **Legend auto-sync adds undo entries** and marks freshly opened files dirty
      (confirmed).
      _Fixed: the legend update is folded into the edit that caused it (`SourceHistory.amendLast`); opened or undone sources are left alone, and viewers are skipped._
- [x] **All parsers run on every keystroke** regardless of diagram kind (confirmed).
      _Fixed: only the active diagram kind is parsed; WBS dependency warnings use a 300 ms debounced source, only while a linked WBS is active (`useDeferredValue` was tried and broke class-diagram selection)._
- [x] **Linked WBS/Gantt sync bypasses undo** and restarts on caret moves (confirmed).
      _Fixed: linked updates are recorded in the target document's history (`recordSourceChange`); automatic alias updates fold into the causing edit; timers no longer restart on caret moves._
- [x] **Drags without `pointercancel`** can stick (confirmed missing listeners).
      _Fixed for all preview drags: separator, divider and connection drags use `trackWindowPointerDrag`; task resize uses it too, and task move/reorder aborts on `pointercancel` or unmount without selecting or moving._
- [x] **Onboarding theme preview commits undo entries** (confirmed).
      _Fixed._
- [x] **Command palette a11y**: no `aria-activedescendant`, no scroll into view, arrows
      land on disabled items (confirmed).
      _Fixed: combobox pattern with `aria-activedescendant`, scroll into view, disabled commands skipped._
- [x] **Reorderable rows keyed by index** in Class and Sequence inspectors (confirmed).
      _Fixed: stable UI-only keys and focus follows the moved row; also fixed a branch colour change dropping `originalIndex`._
- [x] **Gantt task details only on hover**, not focus (confirmed).
      _Fixed: shown on focus too; stray timers cleared on unmount._

## Minor

- [x] Empty password silently produces an unencrypted file (`document-format/src/encode.ts`).
      _Fixed: document and project encoders reject an empty password._
- [x] `resourceCapacities`/`remainingDays` keys not filtered for `__proto__` (no exploit found).
      _Fixed: `__proto__` keys are rejected on validation._
- [x] History retention re-encodes sources per candidate (≈885 ms for 300 × 22 KB versions),
      on the main thread. _Fixed: selection keeps running totals (about 9× faster locally),
      verified against the previous algorithm on randomized histories._
- [x] Plaintext version may be written during the enable-encryption window (plausible).
      _Fixed: new versions are routed to memory before persisted plaintext is read and deleted
      in one transaction._
- [x] Symbol rename could not find names containing `"`. _Fixed: symbol finders match the
      `&#34;` form, and class renames write it._

## Feature and improvement ideas

1. **Storage safety net** (partly done: the status bar warns when workspace or project
   recovery data cannot be saved or storage is over 90% full, and clicking it requests
   persistent storage): show usage (`navigator.storage.estimate()`), request persistent
   storage, warn on failed writes, crash screen with restore/download backup. Keep a
   revision marker in localStorage and data in IndexedDB.
2. **Grouped typing undo and a clickable history list.** _Done: typing merges into one undo
   step, and the ▾ "Recent changes" menu next to undo/redo jumps several steps back or forward._
3. **Shared PlantUML tokenizer and quoting helper** in `language-plantuml` (CRLF, block
   comments, preprocessor, block ranges, Unicode, quoting); diagram-kind override in the UI.
4. **Rebase-style apply** for Jira and forecasts; re-forecast preview before applying.
5. **Multi-select, bulk edit, copy/paste** in visual editors. _Done for Gantt: Shift or Ctrl/⌘-click
   selects several tasks; the selected-tasks inspector shifts dates and sets colour, completion
   and resource; Ctrl/⌘+C, V and D copy, paste and duplicate. Other diagram kinds remain._
6. **Starter examples** per diagram type in the New dialog. _Done: 10 examples covering all
   seven diagram kinds._
7. **More export**: copy image to clipboard, PDF, Markdown/Confluence embed snippet. _Done in
   File › Export and the command palette._
8. **Sequence keyboard editing on par with Gantt**; task details on focus.
9. **Forecast**: status-date slider, finish-date trend, resolve conflicts in place, show
   estimate provenance with "reset to automatic".
10. **Pinned-version management** in history: meter, bulk unpin, expiring
    before-restore pins, plain-language overflow message.
