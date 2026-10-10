# Consolidated UI and product implementation plan

Date: 2026-10-09  
Status: implementation started; A1–A28 first slices implemented; validation recorded below.

This is the canonical combined implementation order for the [Claude review](ui-improvement-plan-2026-10-09.md) and the [Codex review](ui-product-improvement-plan-2026-10-09.md). The original documents remain as evidence records. Overlapping findings are combined into one work item below; competing proposals are resolved within that item rather than retained as parallel tasks.

## How to use this plan

Work through the numbered items in order. The phases put potential editing errors and broken interactions first, then clarify existing workflows, then add capabilities. Within a phase, independent items can ship separately. A verification-only issue that cannot be reproduced should be recorded and parked rather than block the rest of the phase. Dependencies identify the work that must precede a particular implementation.

The first delivery should cover items **1–8**, in small PRs. Item 1 starts with reproduction because a wrong inspector selection could modify the wrong object; it is not a confirmed defect. Avoid a broad navigation or component rewrite before resolving the concrete problems.

Evidence is inherited from the two reviews, not newly reproduced during this consolidation:

- **Observed:** reported during at least one live walkthrough. Claude covered Gantt/Sequence and general dialogs; Codex additionally covered WBS and Class settings.
- **Source:** checked in source during the original review.
- **Verify:** intermittent, disputed, or dependent on untested capability coverage. Reproduce before changing behavior.
- **Proposal:** a product extension whose demand and existing coverage need checking.

Both reviews primarily inspected dark-theme development builds. Combined viewport coverage includes 1440 × 900, 375 × 812, and 390 × 844. Authenticated integrations, live collaboration, recovery failures, export fidelity, real mobile keyboards, and several diagram families were not comprehensively tested. Existing line references are starting points, not guaranteed current locations.

Effort is deliberately relative: **XS** localized copy/style; **S** contained interaction; **M** multiple components or state transitions; **L** substantial workflow; **XL** cross-cutting product feature. This replaces the incompatible time estimates in the source plans. Re-estimate after reproducing issues and checking existing implementations.

## Execution plan

This section turns the backlog into reviewable deliveries. Item numbers below refer to the requirements and **Done when** criteria that follow; those criteria remain authoritative. A1–A32's deliveries are implemented. A33's implementation is delivered; its **real-device touch/software-keyboard completion gate remains pending**. See the delivery record below for validation and limitations. Relative effort is a sizing signal, not a calendar commitment; estimate the next delivery after its reproduction/inventory step rather than assigning dates to all 33 items.

### Delivery record — A1, 2026-10-09

**Confirmed and implemented:** Sequence message IDs are positional (`message-${messages.length}`), and the controller previously resolved selection by that ID after every parse. Focused regressions reproduced selection drift after insertion/deletion above the selected message. A source-edit cursor callback also used new offsets against the previous parsed document.

The controller now re-resolves a selected message only when its complete parsed message signature is unique in both revisions. Deleted, changed, or duplicate/ambiguous messages clear selection before inspector handlers can target an inherited index. Clearing persists through undo; retained unique selection follows undo/redo. This is deliberately conservative matching, not a new persisted object identity system. Explicit inspector Apply supplies its known parsed revision so the edited message stays selected. Sequence source-edit cursor notifications still update cursor/collaboration position but defer inspector selection to reconciliation; explicit cursor navigation continues selecting source objects.

**Changed files:** `apps/web/src/features/sequence/use-sequence-controller.ts`, its existing test file, `apps/web/src/features/sequence/use-sequence-actions.ts`, `apps/web/src/CodeEditor.tsx`, `apps/web/src/App.tsx`, and `tests/e2e/editor-sequence.spec.ts`.

**Coverage:** hook regressions cover preceding insertion/deletion/rename, selected-message changes/deletion, duplicates introduced or removed, safe Apply/Delete targets, explicit inspector reselection, and undo/redo reconciliation. A browser regression inserts preceding source through a CodeMirror transaction and applies an inspector edit, asserting both preceding messages survive and the selected message stays open with its updated value.

**Validation:** 187 unit-test files / 2,092 tests pass; the final Sequence Playwright suite passes 41 tests with one existing skip across Chromium, Firefox, and WebKit (including the new regression in all three). Type checking, web build, changed-file ESLint/Prettier, `git diff --check`, both worker suites (9 tests each), and both worker dry-run builds pass. The graph was refreshed with `graft build`. Repository-wide `npm run validate` stops at an unrelated existing unused `emailBody` in `scripts/demo-video/record-task-check-in.mjs:240`; separately running `npm run format:check` reports the pre-existing `.claude/launch.json` changes. Those files are outside this slice and have not been modified by this work.

**Remaining scope:** no general stable-identity migration, participant/structure reconciliation, or draft-preservation redesign is claimed. No visual styling changed. Next implementation slice is A2, panel ownership and guarded dismissal; Phase 1 is not complete.

### Delivery record — A2, 2026-10-09

**Implemented first slice:** Calendar, Workload, Issues, and preserved-source views now use one utility-panel owner in `use-side-panel-state.ts`. Opening a utility panel clears incompatible property/settings, legend, and bulk selections; selecting a property returns ownership to its inspector. Gantt-only utility panels close when changing diagram type. Closing an inactive panel cannot close the current owner, and requesting the already-open panel does not discard its draft.

Pointer/keyboard transitions retain the existing shared inspector guard. Programmatic utility-panel requests now dispatch a cancelable draft-review event through that same guard before changing ownership. Rejected transitions preserve the current panel and its draft. Calendar and Workload support Escape from outside their panel; property inspectors retain existing canvas-gesture Escape precedence. Nested dialogs, menus, and field popovers get first use of Escape.

Focus restoration now belongs to the shared inspector shell instead of a competing app-level canvas fallback; if a rendered opener has been removed, focus falls back safely to the workspace. Issues restores its opener, and closing its repair workspace no longer steals focus back into CodeMirror after restoration. Mouse activation explicitly focuses panel trigger buttons for consistent Safari behavior. Existing resizable shells and stored width remain in use; there is no new tabbed host or navigation redesign.

**Changed files:** `apps/web/src/use-side-panel-state.ts` and its new tests; `apps/web/src/side-panel-events.ts`; `apps/web/src/App.tsx`; `apps/web/src/features/gantt/use-gantt-controller.ts` and its tests; `apps/web/src/InspectorPanel.tsx` and its tests; `apps/web/src/ProjectInspector.tsx`; `apps/web/src/ResourceWorkloadPanel.tsx`; `apps/web/src/ProblemsPanel.tsx`; `apps/web/src/CodeEditor.tsx`; and `tests/e2e/ui-cleanup.spec.ts`.

**Evidence and coverage:** the original outside-panel Escape test failed before implementation because accepted dismissal never called the panel close handler. Ownership tests cover exclusive utility states, inactive closes, rejected requests, same-panel requests, property selection, and diagram-type changes. Browser coverage exercises Workload → Calendar → Workload with canceled/accepted Calendar drafts, canceled/accepted Workload rename dismissal, Workload → Issues → task properties → Issues, and opener restoration. It asserts one visible side panel and a preview wider than 200 pixels in desktop Split view. Existing cleanup coverage checks stored width, invalid task drafts, narrow layouts, keyboard menus, and doubled UI scale. Cross-family testing caught and corrected interference with Use Case drag cancellation.

Inspected screenshots: [Calendar alone](audits/screenshots/2026-10-09-a2/calendar-exclusive.png) and [Workload alone](audits/screenshots/2026-10-09-a2/workload-exclusive.png). These record the resulting panel layout; they are not evidence of completed real-device mobile testing.

**Validation:** 188 unit-test files / 2,098 tests pass; the final focused ownership/guard tests pass (19 tests), and all 33 final ownership/layout/Use Case gesture browser checks pass across Chromium, Firefox, and WebKit. Type checking, web build, changed-file ESLint/Prettier, and `git diff --check` pass; `graft build` refreshed the graph. The broader cross-family browser run passed 50 tests and failed Firefox Class reconnection at `tests/e2e/editor-class.spec.ts:294`. An isolated clean HEAD snapshot (`6174901`) reproduced the identical assertion failure in 2 of 3 repetitions (1 passed), establishing a pre-existing flaky gesture test; it is recorded separately and has not been counted as passing. Repository-wide `npm run validate` still stops at the existing unrelated unused `emailBody` in `scripts/demo-video/record-task-check-in.mjs:240`. The previously recorded `.claude/launch.json` formatting issue remains outside this slice.

**Remaining scope:** optional host tabs and docked Outline coordination remain follow-ups within item 2 if later work demonstrates a need. Responsive workflow redesign remains item 4; Workload action styling remains item 6. Next implementation slice is A3, Issues and rendered-revision accuracy. Phase 1 is not complete.

### Delivery record — A3, 2026-10-09

**Implemented first slice:** preview wording now comes from `render/preview-status.ts`, comparing the displayed SVG's source and document identity to the active revision independently of parser diagnostics. A retained image reads “Showing last valid preview”; an absent image cannot read “Preview current”. Render failure details remain available. Generic manual guidance is collapsed per issue; specific remedies remain beside their diagnostic, including manual closing-position guidance for ambiguous blocks.

Reports errors now offer **Open Issues**. The report is suspended while its draft remains mounted, and its focus handler is unmounted so Escape belongs to Issues. Reopening Reports restores options and wording; changed source still requires the existing explicit report refresh before exporting. Existing draft guards run before the handoff.

**Capability inventory:** diagnostic grouping already requires a local repair to resolve related diagnostics without introducing new ones. No grouping rewrite was needed; added coverage retains independent same-line errors. Existing safe terminator repairs were already exposed through suggestions and exact Undo. Added fixtures cover Sequence group/alt/loop/opt/par/critical/box/partition with their existing supported closing tokens; existing nested-block safety remains unchanged. No broader syntax support is claimed.

**Reproduction and limits:** valid Gantt → calendar with no working days reproduces a retained image after a render failure, followed by recovery through Undo. The reported “Preview current” after an invalid edit was not reproduced in this failure path: the old wording was “Preview failed”. The confirmed gap was that it did not identify the retained image. Parser errors alone still do not imply an older rendered image. Browser assertions compare retained task geometry rather than the entire SVG DOM because calendar interaction overlays legitimately update.

**Changed files:** `apps/web/src/render/preview-status.ts` and tests; `App.tsx`; `ProblemsPanel.tsx` and tests; `manual-error-guidance.ts`; `diagnostic-groups.test.ts`; `diagram-terminator-repairs.test.ts`; `features/reports/ReportsDialog.tsx` and tests; `tests/e2e/ui-cleanup.spec.ts`; and `tests/e2e/reports.spec.ts`.

**Validation:** 189 unit files / 2,112 tests pass. All 33 distinct focused browser cases pass across Chromium/Firefox/WebKit: 18 repair/Undo, 3 retained-preview, and 12 report cases; the 3 report handoff cases also passed again after simplifying focus-handler mounting. Type checking, web build, changed-file ESLint/Prettier, and `git diff --check` pass; `graft build` refreshed the graph. Existing repository-wide lint/format blockers recorded under A2 remain outside scope.

**Next action:** A4 constrained layouts. Phase 1 remains incomplete; no real-device mobile completion is claimed.

### Delivery record — A4, 2026-10-09

**Implemented first slice:** Outline and the shared creation-dialog shell now account for backdrop spacing, dynamic viewport height, and safe areas. Outline keeps its header/search/footer visible while results scroll; its results row can shrink below the former 180-pixel minimum. Creation forms scroll within their shell with sticky headings/actions, single-column phone fields, and an unindented phone hint. The chooser retains its own zero-offset sticky header/actions.

Below 600 pixels, a temporary Code or Diagram pane replaces Split. `use-responsive-view-mode.ts` leaves the persisted desktop preference intact; returning to desktop restores Split, including after editing source on the phone. Source-reveal requests choose Code on narrow screens. View buttons, commands, shortcuts, preview rendering, status, and resize decisions use the effective view; shortcuts retain their original mode numbers.

Commands and collaboration move into the labeled More menu on narrow screens. Document identity, save state, Add, and Outline remain available. Editing help uses a small trigger and a reopenable popover instead of a permanent text row; dismissal persists independently per diagram kind. Sequence gesture text moves into this help, separate from selection text. Secondary message edge/lost actions use a keyboard-accessible menu, while the selection label occupies a single truncated row. The menu and help preserve inspector selection when opened. Bulk selection now gives open menus first use of Escape, retaining normal canvas Escape behavior.

**Reproduction:** a 50-node WBS Outline reached bottom 870 in an 844-pixel viewport before the change; the new test reproduces this overflow and the former phone Split mode. The original creation baseline attempt used the wrong ellipsis in the menu selector, so it did not establish a failing creation assertion; the corrected test verifies bounded geometry, reachable actions, and draft retention after resizing. Sequence menu coverage exposed and fixed an outside-click selection dismissal and capture-phase Escape conflict rather than hiding them in test setup.

**Changed files:** `apps/web/src/styles.css`; `App.tsx`; `WorkspaceHint.tsx`; `SequenceDiagramPreview.tsx`; new `use-responsive-view-mode.ts` and tests; `use-diagram-multi-selection.ts` and tests; new `tests/e2e/constrained-layout.spec.ts`; and `tests/e2e/ui-cleanup.spec.ts`.

**Evidence:** inspected resulting [desktop Outline](audits/screenshots/2026-10-09-a4/outline-1280.png), [390-pixel Outline](audits/screenshots/2026-10-09-a4/outline-390.png), [dark 320-pixel Outline](audits/screenshots/2026-10-09-a4/outline-320.png), and [320 × 420 creation form](audits/screenshots/2026-10-09-a4/creation-320.png). A 375-pixel capture is also retained. Baseline overflow is recorded by the failing geometry assertion, not a retained before screenshot.

**Validation:** 190 unit files / 2,114 tests and all 51 final browser checks pass across Chromium, Firefox, and WebKit. Type checking, web build, changed-file ESLint/Prettier, and `git diff --check` pass; `graft build` refreshed the graph. Browser coverage includes desktop/320/375/390 layouts, 844-pixel Outline height, a 420-pixel short viewport, light/dark appearance, keyboard menus/Escape, final-result scrolling, source/draft preservation, and desktop preference restoration. Existing UI checks include doubled scale and inspector focus/draft protection. Repository-wide lint/format blockers recorded under A2 remain outside scope.

**Remaining scope:** actual iOS/Android software-keyboard and touch testing has not been performed; desktop viewport emulation does not close that completion gate. This slice does not redesign mobile planning workflows. Next implementation action is A5's accessible-name and source-contrast verification. Phase 1 remains incomplete.

### Delivery record — A5, 2026-10-09

**Confirmed and implemented:** Class/Component settings and the Class/Activity property inspectors had bare × close buttons. All twelve now have contextual accessible names, enabling the shared inspector shell's existing Escape-close route. Class, Component, and Activity settings browser checks verify Escape closes the panel and returns focus to Diagram settings.

The default CodeMirror selection background reduced syntax contrast in both themes, especially dark mode. Selection and active-line backgrounds now follow the application theme; focused selections also have a boundary. Light-theme number, color, and comment tokens are slightly darker. Browser checks require every sampled Gantt syntax token to meet 4.5:1 contrast against focused and unfocused selection backgrounds in both themes. Before/after screenshots are retained in `docs/audits/screenshots/2026-10-09-a5/`.

**Verified without redundant changes:** File's New/Open/Export triggers already expose their visible names correctly in Chromium, Firefox, and WebKit. Code/Split/Diagram tooltips already include the action and matching Ctrl/Cmd shortcut after A4.

**Changed files:** `ClassSettingsInspector.tsx`, `ActivitySettingsInspector.tsx`, `ClassEditors.tsx`, `ActivityEditors.tsx`, `styles.css`, and `tests/e2e/accessibility-cleanup.spec.ts`.

**Validation:** 190 unit-test files / 2,114 tests pass; typecheck and production build pass. Changed-file lint, formatting, and whitespace checks pass. 18 A5 browser checks pass across Chromium, Firefox, and WebKit, including focused and unfocused selections. Screenshots were inspected in light and dark themes. Repository-wide lint/format blockers recorded in A4 remain unchanged.

**Limits and follow-up:** this is browser accessible-name verification, not a real screen-reader pilot or exhaustive syntax-palette certification. An exploratory File submenu ArrowRight check opened New but did not focus its first item in Chromium; accessible names and pointer opening pass. Keep that separate keyboard-navigation defect open for a focused follow-up. Next implementation action is A6's local visual corrections.

### Delivery record — A6, 2026-10-09

**Confirmed and implemented:** Workload's general check-in button preceded the panel header, and resource-specific check-ins preceded their resource titles. Both now sit below their relevant headings and share the existing dialog secondary-button styling through a reusable `secondary-action` class. Diagram creation's existing “Open…” action uses the same style. Long resource names and check-in labels wrap inside the panel; empty-state behavior remains assigned to item 15.

Help's fixed shortcut column could collide with long key combinations; the shortcut grid now has shrinkable columns and wrapping keycaps. Its content sections also have explicit minimum-width constraints, fixing inner horizontal overflow found during screenshot inspection. Command categories now sit above their names instead of competing for a fixed 48-pixel column; names wrap and shortcuts move below the name at phone widths.

**Changed files:** `ResourceWorkloadPanel.tsx`, `NewDocumentDialog.tsx`, `CommandPalette.tsx`, `styles.css`, and `tests/e2e/local-visual-corrections.spec.ts`.

**Validation:** 190 unit-test files / 2,114 tests pass; typecheck and production build pass. Six browser journeys pass across Chromium, Firefox, and WebKit. Layout checks cover 1280 × 900, 375 × 844, 320 × 568, and 640 × 450 (the effective layout viewport of a 1280 × 900 desktop at 200% zoom). They check shortcut/category/name separation, Help inner overflow, long resource labels, shared button styling, resource check-in opening, and the Open upload fallback. Changed-file lint, formatting, and whitespace checks pass. Graft refreshed. Inspected screenshots are retained in `docs/audits/screenshots/2026-10-09-a6/`.

**Limits:** zoom coverage uses the equivalent reduced layout viewport, not a native browser zoom gesture. Native operating-system file pickers were not automated; the browser-upload route was checked. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is A7's saving-state and transient-status work.

### Delivery record — A7, 2026-10-09

**Confirmed and implemented:** a newly created, unchanged diagram previously showed “No unsaved changes” without having a file copy. Standalone tabs now retain explicit `fileCopy` provenance in browser recovery: new, confirmed file, or requested download. Opening a file, Save/Save as, and password-protection saves update this from actual operation outcomes; duplicated tabs start as new copies. New unchanged tabs show “Not saved to a file”. File writes, requested downloads, dirty edits, saving, cancellation, and failure retain distinct labels. A cancelled save with edits explicitly retains “Unsaved changes”. No filename inference is used.

The header Save button now uses primary emphasis for a new file copy, dirty work, or a failed save, and neutral styling otherwise. Project dirty state still comes from the existing project coordinator; standalone state uses the existing per-document save coordinator. Save stays available for unchanged files and downloads, while an in-flight save remains disabled. The header now consumes the same current save-state selection as the Save action, including legacy project state.

An explicit success-notification route expires diagram creation, ordinary standalone open/save, and selected copy/export confirmations after five seconds or the next edit/tab change. Errors, restore requirements, settings requiring Save, and saved snapshots with newer unsaved changes use the persistent route. Old timers cannot erase a newer failure; undo cannot revive an expired success. Parser/render failures and source diagnostics take priority over routine status text. Browser recovery and collaboration indicators remain separate from file saving.

**Changed files:** `App.tsx`, `FileSaveStatus.tsx` and its new tests, `use-interaction-message.ts` and its new tests, `use-document-files.ts`, `use-workspace-documents.ts`, `use-persisted-workspace.ts`, `workspace-storage.ts` and its existing tests, `styles.css`, and `tests/e2e/save-status.spec.ts`.

**Validation:** 192 unit-test files / 2,127 tests pass. Final focused regressions pass 115 tests in 12 files. Twelve browser checks pass across Chromium, Firefox, and WebKit, including portable save/reopen with retained history, new/saving/written/changed states, recovery, requested downloads, cancellation, failure/retry visibility, success expiry, and source-problem priority. Typecheck and production build pass; changed-file lint, formatting, and whitespace checks pass. The neutral saved-state screenshot was inspected and retained in `docs/audits/screenshots/2026-10-09-a7/`. Graft refreshed.

**Limits:** older recovery records without provenance keep their existing neutral label rather than guessing whether a file copy exists. Existing project persistence and feature-specific notices were not redesigned; unclassified notices stay persistent to preserve required actions. Native writes and cancellations use browser test doubles; download checks verify the request, not the user's disk. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is A8's menu-opening and workspace-start verification, including the File submenu keyboard-focus finding recorded in A5.

### Delivery record — A8, 2026-10-09

**Reproduced and fixed:** startup previously opened the creation chooser unconditionally after hydration/onboarding, even with recovered documents. Startup now defaults to restoring the workspace. The untouched initial welcome tab still opens the chooser for first use; edited welcome tabs and actual recovered diagrams do not. Settings → Startup offers “Restore last workspace” and “Start with chooser”. Both restore existing work; chooser creation adds a diagram rather than replacing recovered tabs. The preference is persisted with workspace settings, included in backups, and defaults to Restore for older or invalid values. Collaboration invitation links retain their existing startup bypass.

The File submenu keyboard finding recorded in A5 was also reproduced. Its descendant query could match the New/Open trigger against the outer File menu ancestor. The query is now scoped to immediate submenu children, so ArrowRight focuses the first submenu action, ArrowLeft returns to its trigger, and Escape returns to File. No timing workaround was added.

**Verification-only finding parked:** the general ignored-first-click report did not reproduce. Chromium, Firefox, and WebKit each pass button/Escape/backdrop Help dismissal across Code, Split, and Diagram views, followed by single-click opening of File and Add. This is 27 dismissal/view journeys and 54 menu-opening assertions; it is not proof against every dialog or event-order combination. No speculative outside-click rewrite was made.

**Changed files:** `App.tsx`, `FileMenu.tsx`, `SettingsDialog.tsx`, its existing resource-warning test, `use-persisted-workspace.ts`, `workspace-storage.ts` and its existing tests, new `startup-chooser-policy.ts` and tests, and `tests/e2e/startup-menus.spec.ts`.

**Validation:** 193 unit-test files / 2,131 tests pass; typecheck and production build pass. Twenty-one browser checks pass across Chromium, Firefox, and WebKit: 12 A8 checks plus nine A7 save/recovery regressions. Preference tests create a second diagram from the startup chooser, verify the first source survives, switch back to Restore, and verify both tabs and the active source survive another reload. Changed-file lint, formatting, and whitespace checks pass. Graft refreshed.

**Limits:** this slice does not certify all dialogs, encrypted/project restoration, actual mobile input, or timing under arbitrary host load. Retain the earlier delivery limits and the parked first-click finding. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is item 9's document membership and tab identity work; the full Phase 1 release gate still includes the unresolved coverage limits recorded above.

### Delivery record — A9, 2026-10-09

**Implemented:** diagram tabs now show type badges, meaningful provisional or example names, and disambiguated labels and close controls. The header and tooltips distinguish a separate file from a member of the active Document and show its container. Tab actions offer Rename diagram; native Document members use the existing member rename operation, while standalone display names remain separate from filenames and survive browser workspace recovery. Duplicated diagrams inherit meaningful display names.

New diagram and Example previously created separate workspace tabs. Their shared chooser now offers “Add to [document]” and “New separate file”, preselecting the active compatible Document. A standalone active tab defaults to a separate file. Both native Documents and legacy folder projects reuse their existing add operation; example source and default theme are preserved. The chooser accepts an optional diagram name, keeps failures visible, and prevents repeated submission while adding. Viewer sessions cannot add to the shared Document or rename its members through the new controls.

**Validation:** 193 unit-test files / 2,132 tests pass; production build (including TypeScript checking) passes. Fifteen browser checks pass across Chromium, Firefox, and WebKit: distinct identities for three diagrams, rename and recovery, active Document destination and example source, separate-file creation, final-tab closure, portable save/reopen with retained history, and Document save/review/export regressions. Desktop and 390×844 chooser screenshots were inspected. Visual review caught initial type-button focus scrolling past the destination; initial focus now goes to Create in. Changed-file lint, formatting and whitespace checks pass. Evidence: `docs/audits/2026-10-09-a9/`.

**Limits:** standalone display names are browser workspace metadata; reopening the file elsewhere uses its filename. Native Document member names are stored in the Document. Legacy folder destination handling retains existing path validation but was not exercised through a native folder picker. Narrow viewport checks do not certify real mobile keyboard/touch behavior. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is item 10's contextual Plan menu.

### Delivery record — A10, 2026-10-09

**Implemented:** a contextual Plan menu now groups Calendar & schedule, Workload, Reports, What-if scenario, and Jira for Gantt diagrams. WBS exposes its existing create/open/synchronize Gantt action; linked Gantt diagrams expose the existing WBS synchronization and connection actions. Unsupported diagram families do not show Plan. Linked actions are shared with the existing Linked diagrams menu, preserving read-only and missing-item guards. Calendar/Workload toolbar buttons and Commands remain available. Reports was initially retained under More during transition; the follow-up removes that duplicate route, leaving Reports in Plan and Commands. File retains file, history, settings, backup, and export operations; its scenario and Jira entries moved to Plan. Save and Collaborate remain labeled, and Help remains under More.

The existing Gantt analysis/Scenario Lab capability is consistently labeled What-if scenario in Plan, Commands, and its dialog. No new scenario engine or command behavior was introduced. Reports routes share one opening handler. Menu actions restore focus to their trigger before opening tools. Calendar/Workload menu items carry the existing inspector-trigger marker: browser tracing showed the outside-click listener otherwise closing Calendar immediately after opening it in Chromium and WebKit. The fix uses the existing event guard, with no timing workaround. Plan's panel is aligned and constrained to fit the narrow header.

**Validation:** 193 unit-test files / 2,131 tests pass (two old File scenario tests were replaced by one File-scope assertion); production build including TypeScript checking passes. Browser coverage includes six new Plan journeys across Chromium, Firefox, and WebKit, three existing File/Export/Jira dialog journeys, and the existing scenario edit/review/apply journey in Chromium and Firefox. Three additional mocked Jira import/review journeys pass across all three browsers, for 14 passing browser checks total. WebKit retains the existing SVG pointer-coordinate skip for scenario dragging. Desktop and 390×844 Plan screenshots were inspected and saved in `docs/audits/2026-10-09-a10/`. Changed-file lint, formatting, and whitespace checks pass. Graft refreshed.

**Limits:** browser integration checks use mocked Jira responses, not a live account. Narrow viewport checks do not certify actual mobile touch or keyboard input. No wholesale navigation replacement was made; familiar alternate routes remain during transition. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is item 11's direct source access and initial zoom policy.

### Delivery record — A11, 2026-10-09

**Implemented:** Code/Split/Diagram choices are visible in both starting modes; narrow screens retain Code/Diagram with the existing desktop Split restoration policy. Diagram-only startup no longer renders a redundant single-choice control or forces users back to Diagram after they reveal source. Settings describes a starting view rather than a restriction on source access. Applying unchanged starting-view settings preserves the selected view; explicitly changing the starting-view preference still selects its corresponding layout.

New and newly opened diagrams receive one initial fit after their current SVG is ready. The shared policy considers diagram shape, viewport bounds, and the SVG's natural width: compact diagrams can fit both dimensions, while tall diagrams remain readable and scroll vertically. It avoids making oversized diagrams smaller than 75% of natural size, within the existing zoom limits. Visual inspection exposed narrow Sequence SVGs being stretched by the shared width-based CSS; the initial fit now accounts for intrinsic SVG dimensions rather than treating stretched canvas width as natural size. Existing manual Fit remains a separate operation and never changes source.

Zoom and the completed-initial-fit marker persist per tab. Explicit zoom also completes initialization. Source edits, tab switches, view changes, and properties do not trigger another fit. Older recovery records without the marker retain their saved zoom. Initial fitting applies to Gantt, WBS, Sequence, Use Case, Class, Component, and Activity previews; historical version previews retain their existing behavior.

**Changed files:** `App.tsx`, `SettingsDialog.tsx`, `useDiagramNavigation.ts`, all six main preview components, `use-persisted-workspace.ts`, `workspace-storage.ts` and its tests, new `initial-diagram-zoom.ts` and tests, and `tests/e2e/source-zoom.spec.ts`.

**Validation:** 194 unit-test files / 2,136 tests pass; production build including TypeScript checking passes. Twenty-four core browser checks pass across Chromium, Firefox, and WebKit: default source access and recovery, initial fitting in all seven diagram families, a long opened Sequence file, manual per-tab zoom through edits/properties/tab switches/reload, explicit Fit with source preservation, and the existing constrained-layout suite. The long-file check measures readable rendered label height rather than relying on the zoom percentage. Three supplemental checks verify unchanged Settings preserves the selected Split view. A final Chromium capture run passes. Changed-file lint, formatting, and whitespace checks pass. Desktop source-access and long-Sequence screenshots were inspected and saved in `docs/audits/2026-10-09-a11/`. Graft refreshed.

**Limits:** initial fit is a shape-based heuristic, not a user-tested readability guarantee for every theme or diagram. Large diagrams intentionally require scrolling; viewport resizing preserves zoom instead of continuously refitting. Older recovery zoom is respected even if it was previously too small. Mobile coverage uses constrained browser viewports rather than real touch/software-keyboard input. Repository-wide lint/format blockers recorded in A4 remain unchanged. Next implementation action is item 12's Gantt controls and schedule semantics.

### Delivery record — A12, 2026-10-09

**Implemented:** Gantt canvas controls now have labeled navigation, Preview zoom, overlays, and forecast groups. Resource filtering lives beside the canvas with a visible active resource and Clear filter. The existing browser-persisted move default is editable in Settings → Gantt preferences; the effective policy remains visible beside the schedule controls. Cancel preserves the previous preference, and changing the preference leaves source unchanged.

The old View/Day/Week/Month select only changed preview zoom. It is replaced by Timeline scale… opening the existing Calendar & schedule inspector, where Apply changes source. Calendar fields now distinguish Timeline scale and its scale factor from Preview zoom. Task fields use Progress (%) and explain working-day duration, calculated ends, and explicit overrides. Previous/Next task tooltips describe selection and reveal behavior. Existing scheduling and undo handlers are retained.

**Verification decisions:** the Timeline slider has useful keyboard scrolling and remains. Home/End now work explicitly across browser engines; arrows retain native range behavior. The reported stray workspace chevron was not reproduced in the current desktop/phone toolbar; the literal chevron found in source belongs to Sequence message choices, so no unrelated control was removed.

**Validation:** 194 unit files / 2,136 tests pass; production build including TypeScript checking passes. Six new browser checks pass across Chromium, Firefox, and WebKit, covering source-preserving viewport controls, active filtering, keyboard scrolling, preference cancel/persistence, timeline-scale Apply/Undo, working-day end calculation, and progress edits. Fourteen existing focused navigation, explicit-end, movement, responsive-toolbar, and linked-task browser checks pass; one existing WebKit SVG pointer-coordinate case remains skipped. Changed-file ESLint/Prettier and whitespace checks pass. Desktop and 390 × 844 screenshots were inspected and saved in `docs/audits/2026-10-09-a12/`; Graft refreshed.

**Limits:** mobile checks use browser viewports, not real touch or software keyboards. The Timeline slider is retained rather than replaced by a minimap; item 23 owns that evaluation. Existing repository-wide lint/format blockers remain outside scope. Next action is item 13, command-palette coverage.

### Delivery record — A13, 2026-10-09

**Implemented:** inventoried the palette against existing actions for all seven diagram families. Reports and what-if scenario were already covered for Gantt. Added Version history, Document settings, Jira, Fit, Close tab, next/previous tab, Rename symbol at cursor, Go to line, and applicable diagram settings. Fit uses the existing shared navigation operation; Go to line uses CodeMirror's existing panel and reveals source when needed. Tab commands use the existing lifecycle and unsaved guards. Semantic rename uses the current cursor and existing request validation.

Fixed the fallback that exposed Sequence creation commands in Use Case, Class, Component, and Activity. These families now receive their actual creation actions; remaining Sequence creation options are also available. Creation/settings/rename eligibility respects the collaboration viewer flag. Linked WBS/Gantt commands share the Plan menu's handlers and eligibility.

Recent commands retain five IDs in browser storage and resolve them against the current command registry. Unavailable or disabled commands are excluded from recents; current search results remain unique. Keyboard selection still skips disabled commands, and storage errors leave commands usable. See `docs/audits/2026-10-09-a13/command-inventory.md` for the inventory.

**Validation:** 194 unit files / 2,139 tests pass, including recent-ID resolution, disabled commands and keyboard navigation. Six browser checks pass across Chromium, Firefox and WebKit, opening creation dialogs in all seven families and exercising history, document settings, Fit/source preservation, line navigation, rename opening, Reports, tab navigation/closing, and recents across diagram contexts. Production build including TypeScript checking, changed-file lint/formatting and whitespace checks pass. The desktop recent-command capture was inspected and saved in `docs/audits/2026-10-09-a13/`. Graft refreshed.

**Limits:** authenticated Jira/collaboration operations were not exercised; existing handlers and permission flags are reused. Semantic rename eligibility remains limited to the existing provider's supported symbols. Existing repository-wide lint/format blockers remain outside scope. Next action is item 14, inspector simplification and visible commit rules.

### Delivery record — A14, 2026-10-09

**Implemented:** task properties now lead with Name, Schedule and Progress before Dependencies. Empty Appearance/Resources sections start collapsed; populated sections start open unless a remembered browser choice overrides that default. Invalid fields reveal their section and show Check values without overwriting the remembered choice. Calendar now puts project start, scale, working days and exceptions before page annotations.

Sequence message creation leads with From, To and Message. Editable participant comboboxes expose visible picker buttons while retaining custom names, keyboard navigation and picker-first Escape. Lifecycle modifiers, Teoz anchors and edge/found/lost message types remain under Advanced with examples. Desktop and phone layouts keep their existing scrolling/action shell.

The shared properties panel shows Applied, Unapplied changes or Invalid changes near the top, together with its Apply rule. Existing immediate controls, blur-to-apply text fields, staged Apply handlers and discard guards remain in use. Task's redundant static commit hint was removed. Editing help now explicitly describes one click. Browser checks verify single-click inspection and double-click source preservation in all seven diagram families; gestures were not harmonized or rewritten.

**Validation:** 195 unit files / 2,141 tests pass. Twelve new browser cases pass across Chromium, Firefox and WebKit, covering field order, remembered sections, invalid-draft recovery during selection changes, staged calendar edits, editable participant pickers, advanced creation options, desktop/phone layouts and all-family gesture checks. Twenty-three existing browser regressions pass across the three engines, covering blur-to-apply, immediate color picking, structured rows, resources, Sequence tools, linked-project save/reopen and one-press Escape; one existing WebKit case remains skipped. Linked-project test locators were aligned with the current document-qualified tab labels. Production build including TypeScript checking, changed-file lint/formatting and whitespace checks pass. Inspected desktop and 390 × 844 task/Sequence screenshots are saved in `docs/audits/2026-10-09-a14/`; the behavior inventory is in that directory. Graft refreshed.

**Limits:** mobile validation uses constrained browser viewports rather than real touch/software keyboards. Double-click can change selection state; the check guarantees source preservation rather than a new universal selection gesture. WebKit's transparent WBS hit area is tested using real mouse coordinates rather than forcing a DOM click. Existing repository-wide lint/format blockers remain outside scope. Next action is item 15, useful Reports and Workload before resource assignment.

### Delivery record — A15, 2026-10-09

**Implemented:** Reports offers explicit coordinator-summary and delivery-outlook presets, retaining all existing report types. Coordinator summary includes all tasks and unassigned work without assigning fictional people. Workload offers direct coordinator reporting and task assignment when no people are assigned. Empty previews distinguish missing assignments, date/progress/content scope, audience selection and individual exclusions. Plan, candidate, included and unassigned counts explain scope; milestones and unresolved schedules have explicit omission guidance. Report scope remains independent of canvas filters.

Repeated document/diagram names appear once in the breadcrumb. Message wording and individual exclusions start collapsed while scope and preview remain accessible. Choosing a preset resets exclusions explicitly; empty results never switch report types automatically.

**Validation:** 13 focused report/workload unit files / 85 tests pass. Twelve existing report browser cases pass across Chromium, Firefox and WebKit; three new journeys pass across the same engines, covering unassigned summaries, exclusion recovery, direct Workload reporting and 390 × 844 layouts. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Inspected screenshots and behavior notes are in `docs/audits/2026-10-09-a15/`. Graft refreshed.

**Limits:** phone checks use browser viewports, not real mobile keyboards. Presets cannot guarantee content for empty plans or report-specific conditions. Existing repository-wide lint/format blockers remain outside scope. Next action is item 16, scenario instructions and impact labels.

### Delivery record — A16, 2026-10-09

**Implemented:** the initial What-if scenario instructions now match the active mode: Task controls directs users to change values and choose Update scenario, source mode directs source editing, and rendered preview directs task dragging. The impact metric now reads “project duration change.” Its value is the scenario duration minus the current plan duration; zero means no duration change.

**Validation:** 11 scenario unit tests pass, including mode instructions and zero/positive duration-change labels. The existing edit/review/apply browser journey passes in Chromium and Firefox; its existing WebKit SVG pointer-coordinate skip remains. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Graft refreshed.

**Limits:** this is a copy correction; scenario calculations and apply behavior are unchanged. Next action is item 17, a task-first start experience.

### Delivery record — A17, 2026-10-09

**Implemented:** startup leads directly to the diagram chooser rather than a blocking preferences screen. Create, Open and Try an example are immediately discoverable, with top navigation links to creation, named examples and optional learning. Preferences remain available through More → Settings. New browser sessions default to Split view; saved sessions retain their existing view preferences.

Creation distinguishes Blank (minimal source) from Simple starter (explicit editable sample content). WBS uses a small Project/Deliverable outline instead of silently loading Website redesign. Named examples retain their own source and names, with diagram-family thumbnails. Minimal WBS has a required root, and minimal Activity has start/stop markers. Add and editing help provide the route to further content. Selected content also passes through the existing add-to-document path.

An optional collapsible quick tour and What’s new guide are available in the chooser and reopenable through Help. The guide introduces Add/properties, view switching, Outline, Commands and Gantt planning features. The chooser header scrolls away so its pinned navigation does not get covered. Thumbnail labels on filled WBS nodes now use white text.

**Validation:** 195 unit files / 2,144 tests pass. Twelve browser journeys pass across Chromium, Firefox and WebKit, covering direct startup, all seven minimal source choices, Add availability, named examples, optional learning, phone width and WBS-to-Gantt summary editing. Existing example-name and WBS-summary assertions were aligned with document display names and the new minimal starter. Three layout journeys were repeated after the final thumbnail contrast change. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Inspected screenshots are in `docs/audits/2026-10-09-a17/`. Graft refreshed.

**Limits:** minimal UML sources deliberately contain no domain objects; the Add route supplies them. Blank-source checks verify content and Add availability rather than certifying every renderer’s empty-state artwork. Phone checks use a browser viewport; installed-app file launch was updated for the direct chooser but not exercised in this development-server run. Next action is item 18, searchable contextual Help.

### A17 follow-up — Blank Gantt rendering, 2026-10-09

The blank Gantt template used `Project starts today`, accepted by the editor parser but rejected by the PlantUML renderer. Creation now writes an explicit local calendar date and retains zero sample tasks. This applies to both separate diagrams and adding a diagram to a document. The earlier minimal-source check missed renderer compatibility.

**Validation:** the new regression creates a blank Gantt, verifies an actual successful SVG render with zero tasks, adds the first task and verifies the updated render. It passes in Chromium, Firefox and WebKit. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Screenshot: `docs/audits/2026-10-09-a17/blank-gantt.png`. Graft refreshed. Item 19 remains next.

### Delivery record — A18, 2026-10-09

**Implemented:** Help searches titles, prose, examples, UI action names and shortcut labels. Results narrow prose to matching paragraphs and reveal matching optional guidance. The active diagram comes first, with General and Editing groups; All diagrams and All shortcuts & gestures retain access to the complete reference. All seven diagram families have contextual guidance. Search autofocus, empty-result guidance and result counts support keyboard use.

Shortcut labels use the local platform, and search accepts typed Command/Cmd/Ctrl/Control and Option/Alt names, native glyphs, spacing and modifier-order differences. Sequence participant/message creation is documented. Gantt reordering retains Control on every platform, matching the actual handler. Bindings were checked against App, CodeEditor and DiagramPreview; handlers are unchanged.

**Validation:** 196 unit files / 2,148 tests pass; the four new Help cases pass again after paragraph filtering. Six browser journeys pass across Chromium, Firefox and WebKit, covering searches, all seven diagram contexts, the actual Sequence creation shortcut, focus, Escape and phone width. The three existing startup-to-Help tour journeys also pass. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Inspected screenshots and binding/behavior notes are in `docs/audits/2026-10-09-a18/`. Graft refreshed.

**Limits:** phone checks use browser viewports rather than real software keyboards. Help is a reference and does not execute commands. Next action is item 19, practical editor preferences.

### Delivery record — A19, 2026-10-09

**Implemented:** Settings exposes browser preferences for editor font size (10–32px), word wrap, tab size (2/4/8 spaces) and line numbers. Main and scenario source editors reconfigure in place. Apply persists preferences; Cancel discards drafts. New-tab view and zoom defaults are separate from source-affecting diagram settings and the existing browser movement policy. Existing tabs retain explicit view/zoom choices, including through recovery; tabs without saved choices inherit defaults. Fit remains the default zoom. Browser preferences never change diagram source.

**Validation:** 197 unit files / 2,150 tests pass, including corrupt preference fallback, indentation configuration, per-tab defaults, explicit choices and recovery. Three browser journeys pass in Chromium, Firefox and WebKit covering Apply, Cancel, reload, font size, wrapping, line numbers and unchanged source. Production build with TypeScript and changed-file lint/format checks pass. Screenshot: `docs/audits/2026-10-09-a19/preferences.png`. Graft refreshed. Next action is item 20.

### Delivery record — A20, 2026-10-09

**Implemented:** current-diagram and new-diagram theme controls share a curated gallery of six actual PlantUML sample thumbnails, with access to all bundled themes and preservation of custom themes from source. One renderer fills previews serially; a shared page-session cache retains up to 64 successful samples. Gallery input is always a fixed small sample, never the working document. Apply/Cancel retain staged behavior. App appearance, new-diagram defaults and current-diagram styling have distinct sections and scope explanations.

The opt-in “Adapt preview to app theme” browser preference adds a softened light backing and dims displayed diagram colors in dark app appearance, including dark system appearance. It defaults off, preserves source and geometry, and applies no skinparams. Light app appearance is unchanged. Settings explicitly explains that exports keep authored colors. SVG and PNG export handlers both consume untouched renderer output; the browser regression verifies downloaded SVG excludes the preview adjustment.

**Validation:** 198 unit files / 2,152 tests pass; focused gallery tests also pass after cache bounding and cleanup. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Six new browser journeys pass across Chromium, Firefox and WebKit, covering visual comparison, Cancel, source theme application, caching, keyboard selection, phone layout, default scope, dark/light preview, persistence, selection handles and export. An additional Chromium journey renders all six samples for all seven diagram families (intentionally skipped in the other two browsers). The 21 existing settings/theme/preferences journeys pass, for 28 distinct passing browser journeys overall. Older tests were aligned with existing restore-by-default startup, always-visible view controls and desktop-first helper setup for phone settings checks.

**Visual review:** corrected thumbnail cropping and checked complete samples at desktop and phone widths. Dark preview labels and selection handles remain readable against the softened backing. Screenshots and behavior notes: `docs/audits/2026-10-09-a20/`. Graft refreshed. Next action is item 21, opening existing work.

### Delivery record — A21, 2026-10-09

**Implemented:** one Recent files & import… dialog is reused by File → Open and the start chooser. Existing direct file pickers remain available. Recent entries are file references rather than recovered source snapshots: bounded to 12, persisted as metadata plus supported IndexedDB handles, and updated serially. Reopening re-reads the current file with explicit permission checks; denied/moved/unavailable references offer Locate file… recovery. Entries can be removed. Pasted source and recovered tabs do not enter the list.

An explicit import area supports one .puml/.plantuml/.pumlu drop or pasted PlantUML with type detection and diagram-tab/document destination selection. Shared readers and native decoders preserve validation/history behavior; plain imports validate the supported envelope before adding a tab. Outside-area drops do not navigate away or edit source. Pasted work is unsaved, and document imports use filenames as diagram names. Document opening keeps its navigator/member selection and existing unsaved-work guard. Cancellation/validation failure preserves current work; errors scroll into view beside recovery controls.

**Validation:** 201 unit files / 2,159 tests pass, including concurrent recent updates, metadata persistence/limits, permission branches, moved-file recovery and import validation. Twelve new browser journeys pass in Chromium, Firefox and WebKit; three existing portable-document save/open/history regressions also pass. Production build with TypeScript, changed-file lint/format and whitespace checks pass. Phone layout and permission recovery screenshots were inspected. Notes and evidence: `docs/audits/2026-10-09-a21/`.

**Limits:** browser fixtures control native picker and permission responses; real operating-system permission dialogs were not exercised. Plain-source body syntax remains editable through existing diagnostics rather than being rejected wholesale. Graft refreshed. Next action is item 22, exposing existing Gantt operations through Add.

### Delivery record — A22, 2026-10-09

**Implemented and revised after usability review:** Gantt Add contains Task…, Milestone…, Divider…, and Closed day…. Every entry works without first selecting a task. Dependency, resource assignment and task note remain in the existing task inspector and contextual editing flows; their selection-dependent Add entries and focus-routing state were removed.

Closed day opens Calendar & schedule at Add exception, whose existing default is closed. Opening the route alone does not mutate source. Existing calendar validation, mutation, history and undo are reused; no resource or calendar model was added. Direct task-note selection reveals its collapsed section before focusing.

**Validation:** the initial slice passed the full 201-file / 2,159-test unit suite. The revision passes focused menu/task tests, production TypeScript/Vite build, changed-file lint/format checks, and browser journeys across Chromium, Firefox and WebKit covering the same four Add entries with and without selection, availability of task inspector controls, phone layout, and closed-day editing/undo. Updated phone screenshot inspected; evidence: `docs/audits/2026-10-09-a22/`.

**Scope:** Closed day routes to the existing exception form; the user chooses dates and applies calendar changes. Next action is item 23, extending Outline navigation.

### Delivery record — A23, 2026-10-09

**Implemented:** Outline searches displayed labels, types and full parent/group ancestry with multiword matching, an explicit Clear action and type-aware empty states. WBS, package and activity partition ancestry is shown as a path. A shared index powers modal Outline, an optional indented desktop dock, and Find in diagram. The dock reserves workspace space at widths of at least 1,100px and falls back to a modal in smaller windows; phones retain the modal. Docking is a current-session choice.

Find in diagram is available from the toolbar and Ctrl/Cmd+F when focus is in the canvas. Source-editor search keeps its shortcut. Matching rendered elements receive temporary visual accents, and choosing a result selects and scrolls to its canvas target. Dock/Find navigation preserves Diagram view; modal Outline retains its existing source-and-diagram reveal. Escape dismisses the search/modal without dismissing the selected task inspector. Source and authored geometry remain unchanged.

Result rendering starts at 200 rows with Show more, and a 5,000-entry test verifies bounded rendering and targeted search. Occurrence grouping appends in place; line starts are indexed once for declaration lookup. Match markers are removed when search closes and reapplied when the rendered DOM changes.

**Validation:** full unit suite passes 201 files / 2,161 tests; 14 focused Outline/inspector tests pass after the index optimization. Production TypeScript/Vite build and changed-file lint/format checks pass. Browser checks cover ancestry, exact WBS selection, dock resizing, canvas/source Find separation, match cleanup, Escape and phones across Chromium, Firefox and WebKit; existing Outline reveal and constrained-layout regressions are included. Screenshots inspected; evidence: `docs/audits/2026-10-09-a23/`.

**Limits and decision:** a minimap was not added because this slice establishes shared search, hierarchy and native reveal without evidence that a second navigation surface would outperform them. Revisit only with a measured large-diagram case, coordinated with the existing Gantt Timeline slider. The renderer's existing 4,096-pixel size limit is unchanged; a larger WBS fixture hit that limit, so rendered navigation checks use a supported diagram while index tests cover 5,000 entries. Next action is item 24, reusable personal starters.

### First delivery: dependable editing and core interactions

Start with item 1 reproduction, then proceed in backlog order. Keep each row as a separate PR-sized slice; split further if it combines independent state transitions. Confirmed independent fixes may proceed while an unreproduced finding is parked. A parked finding needs its attempted reproduction, environment, and remaining uncertainty recorded; it is not counted as fixed.

| Slice                              | Items          | Concrete scope and implementation approach                                                                                                                                                                                                                                                  | Required evidence before closing                                                                                                                                                                                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — Selection safety              | 1              | Reproduce selected Sequence message drift after insertion, deletion, rename, duplicates, and undo. Trace parser identity through selection and inspector mutations. If confirmed, implement conservative re-resolution and clear ambiguous selection.                                       | Regression that proves inspector Apply/Delete cannot target a different message after surrounding edits; undo/redo and ambiguous identity checks. If unreproduced, record fixtures and browser/build details and park the defect.                   |
| A2 — Panel ownership               | 2, first slice | Establish mutually exclusive right-panel transitions and guarded Escape dismissal using the existing inspector shell. Preserve draft review, width, and opener focus. Defer host tabs and broad extraction until a concrete need emerges.                                                   | Calendar/Workload/properties/Issues transition matrix with clean, staged, and invalid drafts; canceled dismissal retains draft; accepted dismissal restores focus; Split remains usable.                                                            |
| A3 — Issues and rendered revision  | 3              | First reproduce preview freshness and diagnostic duplication. Separate rendered revision from parse validity, correct the Reports Issues action while preserving options, and expose only repairs already proven safe. Split status changes and repair changes if independently reviewable. | Valid → invalid → valid source transitions, retained preview and render completion ordering; exact repair diff and undo; distinct same-line errors remain distinct; report options survive opening Issues.                                          |
| A4 — Constrained layout            | 4              | Constrain dialog bodies and actions, then add temporary narrow-screen single-pane presentation with desktop preference restoration. Compact header/Sequence controls and verify gesture-help persistence.                                                                                   | Before/after desktop and 320/375/390-pixel captures; 844-pixel-height Outline check; zoom, scrolling, focus, resize, and edit preservation. Record real keyboard/touch coverage separately; desktop emulation does not close that part of the gate. |
| A5 — Accessible controls           | 5              | Correct contextual close names and view tooltips; check the reported File submenu names in the affected accessibility tree before altering them. Adjust selected-line contrast in both themes.                                                                                              | Keyboard opener → control → close → opener journey, accessibility-tree names, and selected syntax contrast in light/dark themes. No redundant labels added for an unreproduced claim.                                                               |
| A6 — Local visual corrections      | 6              | Place Workload check-in inside its panel, reuse secondary action styling, and repair Help/command grid wrapping. Keep resource empty-state behavior for item 15.                                                                                                                            | Long labels and platform shortcuts at desktop/narrow widths and increased browser zoom; screenshots showing no collisions.                                                                                                                          |
| A7 — Save and status semantics     | 7              | Model never-written, changed, writing, written, downloaded, canceled, and failed states from coordinator/lifecycle state. Apply Save emphasis and transient success expiry without obscuring persistent errors.                                                                             | State-transition tests including edits during an asynchronous save, download versus file write, canceled/failed writes, reload/recovery, and success/error priority.                                                                                |
| A8 — Menu and startup verification | 8              | Reproduce first-click failures after dialogs/view changes and chooser behavior with recovered documents. Fix demonstrated lifecycle/event causes. Decide whether startup preference is warranted from actual behavior; do not add it automatically.                                         | Repeatable one-click menu journeys and reload cases for empty, existing, and recovered workspaces. Record intentional startup policy and unreproduced findings.                                                                                     |

Item 16 may be a separate small copy PR during this delivery after checking the mode and metric semantics. It is optional for the Phase 1 gate and must not expand into scenario persistence work.

The source graph currently identifies `InspectorPanel` in `apps/web/src/InspectorPanel.tsx:16–215`, `SequenceMessageInspector` in `apps/web/src/SequenceMessageInspector.tsx:49–162`, and `SaveCoordinator` in `apps/web/src/document-format/save-coordinator.ts:12–42` as useful entry points. Existing save coverage includes `apps/web/src/document-format/save-coordinator.test.ts`, `apps/web/src/projects/project-save-coordinator.test.ts`, and `tests/e2e/project-unsaved-guard.spec.ts`. These are leads, not proof of a defect or sufficient coverage. Before implementation, retrieve complete relevant spans and trace callers of shared symbols; trace Sequence selection from its owner rather than assuming the inspector owns identity.

### Subsequent deliveries and dependencies

Finish each phase's release gate before promoting the next phase. Within a batch, work remains sequential by default; the grouping identifies independent review boundaries and does not authorize concurrent edits to shared application state. Dependencies refer to completed relevant behavior, including a documented verification outcome where appropriate.

| Delivery                        | Ordered batches                                                                              | Scope boundary and decision gate                                                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B — Existing workflows          | **9** → **10 and 11** → **12 and 13** → **14 and 15**; **16** independently if still pending | Establish identity before navigation/report breadcrumbs. Item 10 requires 2/9; 11 requires 4; 12 requires 10/11; 13 requires 10; 14 requires 1/2; 15 requires 9/10. Split item 15 into corrective empty states, then presets. Close with the Phase 2 representative-user journeys.                                       |
| C1 — Start and preferences      | **17 and 18** → **19 and 21**; **20** as a separate appearance delivery                      | 17 requires 8/9; 18 requires 13; 19 requires 11/12; 21 requires 9/17. Item 20 first delivers theme thumbnails; preview adaptation requires a separate appearance/export decision.                                                                                                                                        |
| C2 — Navigation and reuse       | **22 and 23** → **24 and 25**; **26** as a separate formatting delivery                      | 22 requires 12; 23 requires 2/4/12; 24 requires 9/17; 25 requires 3/9/20. Search ships before docked Outline/minimap. Local export improvements and external link/embed sharing are distinct slices. Formatting begins with a supported-syntax contract and fixtures before UI work. Close the Phase 3 gate after C1/C2. |
| D1 — Task table pilot           | **27**                                                                                       | Requires 9/14/22. Pilot name/progress/resources before scheduling, dependencies, or bulk paste.                                                                                                                                                                                                                          |
| D2 — Scenario persistence pilot | **28**                                                                                       | Requires 3/16. Audit persistence first, then save/reopen one alternative tied to its base revision before comparisons.                                                                                                                                                                                                   |
| D3 — Connected-work overview    | **29**                                                                                       | Requires 9/23. Audit existing WBS → Gantt identity/synchronization before extending the guided workflow.                                                                                                                                                                                                                 |
| D4 — Direct manipulation        | **30**                                                                                       | Requires 1/14. Complete the capability inventory before selecting one diagram family and one missing gesture.                                                                                                                                                                                                            |
| D5 — Semantic review            | **31**                                                                                       | Requires 3; coordinate identity rules with 29. Start with one diagram family and source fallback before selective multi-file acceptance.                                                                                                                                                                                 |
| D6 — Presentation and review    | **32**                                                                                       | Requires 23/29 and anchor coordination with 31. Local presentation precedes comments; comments precede shared review links and their permission design.                                                                                                                                                                  |
| D7 — Mobile task workflows      | **33**                                                                                       | Requires 4/14/23; assess reuse of 27. Pilot Gantt check-ins/WBS navigation on real devices before broader editing.                                                                                                                                                                                                       |

D1–D7 are a default investigation order, not preapproved full implementations. At each boundary, record the user problem, existing capability audit, smallest pilot, source/identity risks, and evidence needed to expand. Reconcile the three strategy documents cited in Phase 4 before committing to a larger feature.

### Delivery checklist and verification commands

For each slice, record its item IDs, confirmed reproduction or capability inventory, changed files, implementation decision, validation results, unresolved limitations, and next action. Add links to its PR and relevant screenshots when they exist. Do not mark an entire item complete when only its first slice has shipped.

1. Retrieve graph context and inspect complete relevant spans; trace callers before shared-symbol changes. Capture baseline UI evidence for visual defects and a failing regression for confirmed state/mutation defects where practical.
2. Implement the smallest behavior change that meets the item criteria. Keep behavior-preserving extraction separate when practical. Preserve unrelated source and existing draft, history, recovery, and permission behavior.
3. Run focused Vitest coverage with `npx vitest run <affected-test-files>` and affected Playwright journeys with `npm run test:e2e:chromium -- <affected-spec-files>`. Add Firefox/WebKit coverage for menu events, focus, layout, or browser file behavior affected by the slice. Select existing tests by actual behavior during implementation; no new spec names are assumed here.
4. Before merging application changes, run the repository's `npm run validate` gate, plus relevant end-to-end tests (not included in that script). Preserve command exit status and summarize failures from saved logs. For this documentation-only plan, check the changed Markdown formatting and dependency coverage; application test runs are unnecessary.
5. Check the user-visible matrix in the completion gates below, retaining screenshots for unchanged surfaces. Record missing real-device coverage explicitly. Refresh `graft build` after substantial code changes.
6. Evaluate the phase release gate. Advance with documented parked verification findings, but keep confirmed unresolved safety defects or failed required checks open. Re-estimate the next delivery from what was learned.

**Next implementation action:** proceed to item 9's document membership and tab identity work. A1–A8's first slices are implemented; retain their delivery records, parked verification findings, and scope limits above.

### Delivery record — A24, 2026-10-09

**Implemented:** File → Save as starter… captures the current diagram for a local personal library. File → New adds Personal starters alongside existing examples, with explicit JSON import/export and removal. Review shows editable source, authored dates/resources/links and identity behavior before saving or creating. Gantt reuse can remove supported task assignments/links or change the project-start declaration; fixed task dates, calendar exceptions and dates in text remain authored. Styles are preserved over default themes.

Creating from a starter uses existing separate-file/document-member creation with fresh identities. The original diagram and saved starter remain unchanged. Portable JSON contains diagram source and descriptive metadata, excluding workspace identities, file handles, history and integration bindings. Imports validate the entire library before writing; invalid content, cancellation and storage failures preserve existing work.

**Validation:** full unit suite passes 202 files / 2,166 tests; 11 focused tests pass after final validation changes. Production TypeScript/Vite build and changed-file lint/format checks pass. Twelve browser journeys pass across Chromium, Firefox and WebKit, covering reviewed independent copies, authored themes, native document membership, JSON round trips, invalid imports, reload persistence, cancellation, invalid source and phone storage failures. Existing chooser regression also passes across all three browsers. Phone screenshot inspected with storage error visible beside Save; evidence: `docs/audits/2026-10-09-a24/`.

**Limits:** browser-local library, at most 30 entries / 2 MB total and 500 KB per source. A starter captures one diagram, not an entire connected document. Validation uses supported local diagnostics; review does not transmit source to render it. Unsupported resource/link syntax remains visible for manual editing. Next action is item 25, export preview and explicit link/embed sharing.

### Delivery record — A25, 2026-10-09

**Implemented:** File → Export → Preview export… offers SVG, PNG and PDF using the existing download handlers. The complete rendered image is previewed with selected margins, authored background/transparency or white backing, and raster scale. Image/raster dimensions and PDF page dimensions are explicit. Authored fills remain intact; PDF retains the existing rasterized, white-page behavior. Successful exports remember preferences locally. Existing quick exports remain available.

The preview uses the renderer's source/document identity, identifies stale/unavailable output and disables downloading it. It exports the rendered SVG without transient editor selection/overlays. Source is unchanged.

File → Export → Link and embed… separately explains recoverable source encoding, the chosen HTTPS renderer, external rendering and the distinction from collaboration/offline artifacts. Explicit acknowledgement enables local generation of an encoded image URL and Markdown image snippet, with clipboard actions. Generating/reviewing these strings makes no renderer request and loads no external image. Changing source clears previously generated output/consent. Local exports remain the alternative.

**Validation:** full unit suite passes 203 files / 2,170 tests before the final dialog tests; focused export/dialog/menu tests pass after final safeguards. Production TypeScript/Vite build and changed-file lint/format checks pass. Six browser journeys pass across Chromium, Firefox and WebKit, verifying SVG/PNG/PDF downloads, remembered settings, unchanged source, phone layout, explicit consent, unsafe endpoint rejection and no request to the sharing destination. Desktop/phone screenshots inspected; evidence: `docs/audits/2026-10-09-a25/`.

**Limits:** background controls add backing without rewriting authored fills. Raster export retains existing dimension limits; PDF remains rasterized and fitted within A4 bounds. URL sharing uses PlantUML's documented UTF-8 hexadecimal encoding and an 8,000-character limit with local-export fallback; it does not claim to reproduce app-specific overlays or renderer preprocessing. Preferences require browser storage. Next action is item 26, conservative source formatting.

### Delivery record — A26, 2026-10-09

**Implemented:** Format source… is available beside Copy code and through the command palette. A local preview shows changed lines with visible indentation, optional full proposed source, Apply and Cancel. Apply uses the existing validated source-command/history path as a single “Format source” entry; one Undo restores the exact prior source. Read-only diagrams and previews whose source/document identity changed cannot apply.

Formatting normalizes leading whitespace on recognized statements, two-space nested UML brace blocks and sequence control-flow blocks, plus whitespace around envelope markers. Arrow spelling, member/label text, text-bearing trailing whitespace, comments, multiline note/title/header/footer/legend/caption blocks, blank lines and LF/CRLF endings remain authored. WBS body prefixes and label whitespace are preserved exactly. No arrow or semantic normalization is attempted.

**Validation:** full unit suite passes 206 files / 2,200 tests before final recognizer tightening; 30 focused formatter/dialog tests pass after it. Production TypeScript/Vite build and changed-file lint/format checks pass. Twelve browser journeys pass across Chromium, Firefox and WebKit, covering preview/cancel, one-step undo/redo, idempotence, command-palette access, macro refusal and phone layout. Exported SVG text/shape geometry is identical before/after for supported Gantt, Sequence, Class, Component, Use Case and WBS fixtures. Canvas hit-target geometry is intentionally excluded because it follows browser zoom rather than authored rendering. Screenshots inspected; evidence: `docs/audits/2026-10-09-a26/`.

**Follow-up:** valid Gantt task-relative start/end dependencies now pass the recognizer, including supported before/after day/week offsets. Dependency text in the reported multi-predecessor example remains authored. Extra spaces/tabs between a task name and its recognized starts/ends/lasts keyword are normalized to one space, while task-name and note whitespace is preserved. Refusal messages distinguish formatter support limits from invalid PlantUML. Validation: 37 focused tests and cross-browser exported-geometry regression with a task-relative dependency.

**Conservative boundary:** unsupported statements, macros/preprocessor commands other than a simple theme directive, continued lines, multiline quoted declarations, inline/unknown brace syntax, unbalanced blocks and source errors withhold the entire change with an explanation. Activity formatting is deferred. Standalone CR endings and sources over 500,000 characters or 5,000 lines are left unchanged. Preview initially renders at most 200 changed lines with Show more. Next is Phase 4/item 27, spreadsheet-style Gantt editing, subject to the plan's demand review.

### Delivery record — A27, 2026-10-09

**Implemented:** Gantt now offers an optional Tasks view alongside Code, Split and Diagram, also available in the command palette. Desktop places the task table beside the chart with a draggable, keyboard-adjustable divider; narrow screens switch between Table and Chart while retaining the row draft. The ordinary Code/Split preference and divider width remain independent.

The first slice edits task name, progress and resource assignments as a staged row. Apply validates the complete row and commits it as one source-history change; Cancel leaves source unchanged. Table and chart selection stay synchronized, and Details opens the existing full task inspector. Explicit task aliases remain stable during renaming, including aliases matching the previous label; references and linked WBS labels follow existing rename paths.

Drafts survive view and document switches for the current session. Any intervening source change blocks Apply and requires explicit reload or cancellation. Read-only collaboration disables editing. Milestones and reference-only tasks use Details. The table initially renders 100 rows and offers more, automatically revealing selected tasks. Only changed fields are rewritten, preserving scheduling, dependencies, comments and unsupported statements.

**Validation:** full unit suite passes 208 files / 2,225 tests. Final focused unit checks pass 359 tests, and production TypeScript/Vite build and changed-file lint pass. Twenty-four browser checks pass across Chromium, Firefox and WebKit, covering the new table journeys and existing editing-mode settings. Desktop/phone screenshots inspected; evidence: `docs/audits/2026-10-09-a27/`.

**Multi-row follow-up:** multiple tasks can now remain staged before Apply changes. Every changed row is validated, errors appear beside the affected row, and an invalid row blocks the whole batch without discarding drafts. Apply commits the complete batch as one Undo step; Discard changes clears it, while each row also has an individual discard action. Source changes block the entire batch until explicit reload or discard. Linked WBS renames are accumulated before updating the linked source. Normal Enter does not commit the batch; Ctrl/Cmd+Enter applies explicitly. Literal alias references remain stable while old task-label references are renamed, including labels differing from their alias only by case.

Validation: 208 unit files / 2,227 tests pass. Nine browser journeys across Chromium, Firefox and WebKit cover two staged renames/progress changes, invalid second-row blocking, alias/dependency preservation, single undo/redo, stale draft recovery and phone switching. Production build and changed-file lint/format checks pass.

**Direct-edit follow-up, 2026-10-10:** editable task rows now show name, Duration, progress and resource fields immediately; per-task Edit buttons are removed. Focusing a field selects its chart task without creating a draft. Only changed rows join the staged batch, and returning all fields to their original values removes that row from the batch. Duration accepts positive whole numbers and Days/Weeks/Months. Inline duration updates preserve start dependencies. Explicit/relative end constraints and duplicate duration declarations block duration changes with an explanation instead of silently changing schedule semantics. Details remains available for full scheduling and milestones.

Validation: full unit suite passes 208 files / 2,234 tests before two final edge-case tests; final table/helper checks pass 24 tests. Nine browser journeys pass across Chromium, Firefox and WebKit, including direct field editing, duration-unit changes, batch validation, one-step undo/redo, stale drafts and narrow view switching. Production build and changed-file lint/format checks pass; desktop/phone screenshots inspected.

**Limits:** date/dependency editing and bulk paste remain deferred. Drafts and the Tasks view choice are session-local. A changed source is reconciled conservatively by reloading the row rather than merging draft fields automatically. Next is item 28, saved what-if scenarios.

### Delivery record — A28, 2026-10-10

**Audit:** the existing Scenario Lab already compares task dates, milestone movement, critical path and resource conflicts, with source review and normal undo on promotion. Its working alternative was session-local, and its “current” input followed live source rather than retaining an immutable base. No portable scenario schema existed.

**Implemented:** Plan → What-if scenario now saves named alternatives for the active diagram in this browser. Each alternative retains exact base/scenario sources, resource-capacity assumptions, editable assumption notes and an update timestamp. Save updates the open alternative; Save as new scenario preserves it as another named alternative. Open, start from current plan, and confirmed deletion are explicit actions. Unsaved source/metadata changes require discard confirmation before switching or closing; successfully saved alternatives can close without being lost.

Comparisons and previews use the captured base and saved capacities. A changed current source or capacity setting blocks promotion. Reconcile with current plan keeps nonoverlapping changes and requires explicit Current plan / Scenario choices for overlapping line edits. The reconciled source is validated, adopted against the latest base, and shown in a fresh source review. Apply checks the exact reviewed base again and uses the existing source-history path, preserving unrelated current changes with one-step undo. Saving a scenario never changes diagram source.

Saved-scenario controls collapse during preview/review so the patch and existing fixed actions remain usable. Storage failures stay actionable and do not mark a draft as saved. Corrupt libraries are preserved rather than overwritten.

**Validation:** full unit suite passes 209 files / 2,247 tests. Production TypeScript/Vite build and changed-file lint/format checks pass. Eighteen browser checks pass across Chromium, Firefox and WebKit for save/reload/reopen, assumptions, base comparison, stale nonoverlap/conflict reconciliation, updates/deletion, undo/redo, phone storage failures and planning-menu routes. Existing rendered-preview scenario editing passes in Chromium and Firefox; its existing WebKit SVG-drag skip remains. Desktop/phone screenshots inspected; evidence: docs/audits/2026-10-10-a28/.

**Limits:** this first persistence slice is browser-local and scoped to the recovered diagram identity. Alternatives are not embedded in .pumlu files, exported, backed up with the document, or shared with collaborators. Reimported independent copies have a separate identity. The browser library is bounded to 20 alternatives / 2 MB total; each base/scenario source is limited to 500,000 characters and 5,000 lines. Reconciliation is conservative and line-based; overlapping edits require a choice, and invalid results cannot be promoted. Branch ancestry and comparisons between multiple alternatives at once remain deferred. Next action is item 29, guidance through connected documents.

## Phase 1 — Make editing and core interactions dependable

### Delivery record — A29, 2026-10-10

**Implemented:** the document navigator now starts with a connected-document overview showing per-diagram object and WBS–Gantt connection counts, unresolved and pending checks, unavailable members, and guidance to coverage, issue inspection and saved-change review. Inspect opens the existing diagram; Review object connections focuses the existing connections/repair section. Missing WBS–Gantt objects remain visible instead of silently disappearing from the link list, with unavailable endpoint actions disabled.

Repairing an indexed connection previews the old/new target before applying metadata. The existing linked identity and connection IDs are preserved. A redundant unlinked registration of the chosen declaration is removed; an already connected target blocks automatic identity merging. Asynchronous registration is cancelled when its inputs change. A changed project or viewer permission blocks repair application.

Adding a missing WBS/Gantt counterpart prepares the existing conversion result and shows source consequences for both named diagrams before Apply. Cancel changes no source or connection metadata. Apply rechecks project membership, counterpart relationship, exact source snapshots, connection metadata and viewer permission, then uses existing source-history and linking paths. This is a preview for the navigator’s missing-counterpart action; existing full synchronization and initial conversion workflows are retained. Undo remains per diagram. WBS–Gantt health warnings explicitly cover open linked diagrams; no global semantic identity service or automatic merge is introduced.

**Validation:** 210 unit files / 2,249 tests passed; focused navigator/preview checks cover review-before-write, cancellation, duplicate-registration removal and stale-preview blocking. Nine browser checks passed across Chromium, Firefox and WebKit, covering document review, WBS connections and missing-counterpart preview/cancel/apply. Build, changed-file lint/format and whitespace checks passed. Desktop and 390 × 844 preview screenshots inspected in `docs/audits/2026-10-10-a29/`. The initial browser extension needed to close the task inspector after Apply before asserting the navigator; the corrected flow passed all browsers.

### Delivery record — A30, 2026-10-10

**Inventory:** Class, Component, Use Case and Activity already provide semantic move/connect/reorder gestures, with keyboard controls or their existing inspectors/Add actions as alternatives. Gantt has schedule manipulation and the editable task table; Sequence has participant/timeline movement and reconnection; WBS has hierarchy and relationship gestures. The confirmed gap was editing display labels directly from the diagram. See `docs/audits/2026-10-10-a30/README.md` for the family-by-family inventory.

**Implemented:** focus a supported Class/Component entity, Use Case actor/use case or Activity action and press F2, or select an object and choose Rename label in the preview toolbar. Container labels are supported too, including Activity partitions through their existing tray. The inline field selects the current label and offers Enter/Apply, Escape/Cancel and validation feedback. Single-click selection, double-click behavior, existing drag operations, Class member editing and control-condition editing retain their established paths.

Inline changes use the existing semantic rename and validated source-history paths. Explicit aliases remain unchanged; unaliased identity names update semantic references. Apply is one undoable source edit. The shared rename application also retains source-editor rename behavior. Source/tab changes, multi-selection and viewer permissions guard inline application. Repeated rendered labels that cannot be identified uniquely are refused with source-editor guidance. Canvas wheel movement cancels a field before its visual anchor becomes obsolete. Inline fields participate in the existing overlay Escape guard, so the first Escape closes the field without also closing the inspector.

**Validation:** 212 unit files / 2,263 tests passed. Thirty-three browser checks passed across Chromium, Firefox and WebKit, covering four diagram families, keyboard and pointer entry, validation, cancellation, one-step Undo, stale drafts, duplicate-label refusal, Activity partition labels, inspector behavior and unchanged double-click semantics across every family. Build, changed-file lint/format and whitespace checks passed. Desktop and 390 × 844 screenshots were inspected and retained in the audit directory. Browser checks exposed and fixed the inline field’s Escape precedence; a later partition test needed to dismiss the existing editing hint that covered its tray control before clicking.

### Delivery record — A31, 2026-10-10

Gantt semantic review now includes expandable Before / After this group task fields in version history and imported proposed-edit comparisons. Stable aliases confirm renames; ambiguous rename/replacement candidates stay probable. Mixed unsupported blocks remain unclassified with Source fallback. Existing rendered highlights and Sequence/Component review remain available.

Apply validates the combined selection, refuses stale document/source/permission snapshots, and records one undoable source edit. Historical selective restoration explicitly acknowledges replacement of unselected differences. Scope is single-document review; multi-file acceptance and global semantic identity are deferred.

**Validation:** 215 unit files / 2,273 tests passed; production build and changed-file lint/format checks passed. Browser verification and screenshots are recorded in `docs/audits/2026-10-10-a31/README.md`.

### Delivery record — A32, 2026-10-10

More → Presentation & local review opens a read-focused diagram surface with named views, ordered highlight steps, zoom/Fit and connected-diagram navigation. The editing workspace is inert while presentation is open; keyboard shortcuts cannot alter source. Existing open WBS/Gantt connections and native project relationships provide navigation without changing the underlying editor selection. Fit accounts for width and height, including phone layouts.

A collaboration audit found editor/viewer access controls but no shared comment model. This delivery therefore adds personal anchored notes with explicit browser-only audience and persistence. Versioned local metadata is keyed by document history identity and excluded from files, exports and collaboration links. Notes retain original revision context and support resolution/reopening. Unique Gantt aliases survive supported source/label/duration edits; ambiguous, missing and revision-bound stale anchors are explicit. Rendered highlights require a unique label, with source fallback when identification is uncertain. Shared review links remain a separate release.

**Validation:** 217 unit files / 2,283 tests passed. Production build, changed-file lint/format and whitespace checks passed. Nine browser cases passed across Chromium, Firefox and WebKit; Firefox was rerun successfully after one browser-process crash. The collaboration audit, persistence decisions and inspected desktop/phone screenshots are recorded in `docs/audits/2026-10-10-a32/README.md`.

### Delivery record — A33, 2026-10-10

Phone Gantt/WBS workflows now start with a task/hierarchy list, full-screen properties and View on diagram. Gantt check-in stages progress and resource updates together, reuses existing validated source mutations and commits one Undo/Redo step. WBS supports hierarchy search and parent/child navigation. Invalid/stale/viewer drafts are blocked; cancellation preserves source and restores touch/keyboard focus. Existing desktop task-table drafts and table/chart resizing remain available.

The sheet isolates the background, keeps header/footer actions separate from its scrollable body, handles visualViewport changes and safe-area insets, and follows app colors. Source editing and precision diagram gestures remain available through explicit view choices.

**Validation:** 218 unit files / 2,288 tests passed; 22 browser cases passed across Chromium, Firefox and WebKit, including touch emulation, desktop table regressions, dark appearance, keyboard navigation and Chromium browser zoom; three orientation rechecks also passed. The two non-Chromium CDP zoom cases were skipped. Build and changed-file lint/format/whitespace checks passed. See `docs/audits/2026-10-10-a33/README.md` for captures, additional appearance/keyboard/zoom results and the physical-device checklist. **Implementation delivered; mobile completion remains pending native-keyboard/touch testing on real devices.** Emulation is not claimed as physical-device validation.

### 1. Verify and fix Sequence selection after source edits

**Verify · S–M · Source: Claude 1.12**

Claude saw the message inspector switch to a different message after editing source above the selection. Reproduce insertion, deletion, and renaming before the selected message, including duplicate-looking messages. Check whether selection is tracked by a changing line/index rather than stable identity.

If confirmed, re-resolve the original element safely after parsing; clear the inspector when identity is ambiguous. Do not guess a replacement element or label this a simple styling fix.

**Done when:** editing surrounding source never causes a subsequent inspector edit to alter a different message; ambiguous selections close safely and undo restores consistent state.

### 2. Give side panels one owner and predictable dismissal

**Observed → verify current behavior · S first slice, M expansion · Sources: Claude 1.1, 5.1**

Workload and Calendar were reported overlapping in the right column, with Escape failing to close Workload. First make incompatible panels mutually exclusive and route Escape through the active panel's draft/close guard.

Build on the existing resizable inspector shell. Introduce a small shared panel host/state model only as needed to coordinate Calendar, Workload, properties, Issues, and later docked Outline. Preserve remembered width, collapse, and focus restoration. Tabs inside a unified host are an optional follow-up within this item if switching panels remains cumbersome, not a prerequisite rewrite.

**Done when:** panel transitions never overlap, lose staged edits, or leave focus behind a closed panel; the remaining canvas is usable in Split view.

**Starting points:** `App.tsx`, `ResourceWorkloadPanel.tsx`, existing inspector shell and draft guards.

### 3. Make Issues and preview state trustworthy

**Observed + Source; stale-state report needs reproduction · M · Sources: Claude 2.6; Codex Q3**

Group duplicate diagnostics only when they share an actual root cause; sharing a line is insufficient. Collapse generic guidance and keep specific remedies beside each issue. Replace the residual “Open Problems” report error with “Open Issues”, preferably as an action that preserves report options.

Investigate the reported “Preview current” label after an invalid edit. Derive preview freshness from the rendered source revision, separately from parser diagnostics: an error alone does not prove the displayed image is stale. Label a retained older image “Showing last valid preview”.

Expose matching-terminator repairs only for syntax supported by existing safe-repair logic. Do not assume every `group/alt/loop/opt/par/critical/box/partition` ends with the same token or that repair is merely wiring. Ambiguous nested blocks must retain manual guidance.

**Done when:** one malformed block produces understandable diagnostics, a safe repair changes only the intended syntax and is undoable, and preview status accurately identifies the rendered revision.

**Starting points:** `features/reports/ReportsDialog.tsx:502`, `block-repair-safety.ts`, `diagram-terminator-repairs.ts`, preview-status logic.

### 4. Fix constrained layouts before redesigning mobile workflows

**Observed · M · Sources: Claude 1.5, section 3; Codex Q1, Q11**

Codex measured WBS Outline at top 150, height 713, bottom 863 in an 844-pixel viewport. Claude also reported unusable phone-width Split view and cramped creation dialogs. Constrain dialog shells to dynamic viewport height/safe areas, with fixed header/actions and a scrolling body; use full-screen sheets where appropriate.

On narrow screens, temporarily present Code or Diagram instead of two unusably small panes. Preserve the user's desktop Split preference and restore it when space returns. Compact the header into a labeled menu/overflow while retaining document identity, save state, Add, and Outline. Breakpoints should follow measured content needs.

Separate Sequence selection text from gesture hints; move secondary controls into overflow before the toolbar grows to three rows. Show gesture help on demand after first use, with a route to reopen it. Verify dismissals persist per diagram kind. Avoid another permanent toolbar row.

**Done when:** dialog actions and final results remain reachable at 320–390 pixels, software keyboards do not cover required actions, no horizontal page overflow occurs, and resizing loses neither edits nor view preference.

### 5. Correct accessible names, tooltips, and source contrast

**Observed + Source; submenu claim disputed · XS–S · Sources: Claude 1.14–1.16; Codex Q2**

Name the Class/Component settings close button contextually rather than “×”. Check other icon-only controls. View tooltips should include the action as well as the platform shortcut.

Claude reported unnamed New/Open/Export menu items; Codex's live accessibility snapshot included their names. Verify in the affected browser/accessibility tree before adding redundant labels. Keep visible and accessible names aligned.

Improve selected-source-line contrast while retaining readable syntax colors in both themes.

**Done when:** controls announce meaningful names, selected source remains readable, and keyboard close restores focus to its opener.

**Starting points:** `ClassSettingsInspector.tsx`, `FileMenu.tsx`, view controls, `code-editor-setup.ts`.

### 6. Repair small visual defects with existing styles

**Observed · XS–S · Sources: Claude 1.2 styling, 1.3, 1.4, 1.6**

Move Workload's floating “Create task check-in…” action inside its panel and use the standard secondary style. Apply that style to “Open file…” in diagram creation. Fix Help shortcut-column collisions and command-category/name overlap using flexible grids, wrapping, or category headings.

**Done when:** long labels and shortcuts never overlap at desktop, narrow widths, or increased browser zoom; actions look and behave like their existing peers. Workload empty-state behavior is owned by item 15.

### 7. Clarify saving and prioritize persistent status

**Observed · S–M · Sources: Claude 1.7, 1.8; Codex Q7**

Distinguish a newly created document that has never been saved to a file from an unchanged saved document. Retain the existing separation among file writes, downloads, browser recovery, and collaboration; derive wording from save-coordinator state, not the filename.

Emphasize Save when a file save is needed, including a new unsaved document, and use neutral styling when nothing needs saving. Do not disable useful Save as/download routes. Expire routine messages such as “Created diagram” after a short interval or the next edit, while preserving failures and required actions until resolved.

**Done when:** new, changed, saving, written, downloaded, canceled, and failed states are accurate after edits and reloads; transient success messages never conceal errors.

### 8. Verify menu opening and workspace-start lifecycle

**Verify · S–M · Sources: Claude 1.11, 1.13, 4.9**

Reproduce the intermittent ignored first click after closing a dialog or switching views. Inspect event ordering and outside-click handling; avoid timing-based workarounds without evidence.

Separately reproduce the creation chooser reopening after reload with documents present. Distinguish intentional onboarding/start preferences from transient dialog state. Add an explicit “Restore last workspace / Start with chooser” preference only if both workflows are useful; neither option should discard recovered documents.

**Done when:** one click reliably opens a menu, existing documents restore predictably, and the chooser appears only for the intended startup policy.

## Phase 2 — Make the existing product understandable

### 9. Clarify document membership and tab identity

**Observed → verify creation semantics · M · Sources: Claude 2.11; Codex Q6**

Use Document for a saved container, Diagram for an item, and Workspace for browser-local state. Give unsaved tabs type badges and meaningful provisional titles instead of an indistinguishable sequence of `untitled.pumlu` labels. Show actual containing file/container in the tooltip/header and disambiguate accessible close names.

Inspect what New diagram and Example currently create. Where both destinations are supported, offer “Add to [document]” versus “New separate file”, preselecting the active compatible document. Keep display names distinct from filenames and reuse existing rename behavior.

**Done when:** a user with three diagrams can identify their content, containing documents, and save targets before creating or saving another item.

### 10. Consolidate planning navigation without a wholesale menu replacement

**Observed · S–M · Dependencies: 2, 9 · Sources: Claude 2.1; Codex Q5**

Introduce one contextual **Plan** menu for supported Gantt/WBS workflows, placing Calendar, Workload, Reports, What-if scenario, and applicable Jira/link actions together. Keep File focused on opening, saving, history, and export. Give Help a clear route and retain Commands as an explicit search launcher.

Prefer this incremental change over immediately replacing the whole header with File/Edit/View/Plan/Help. Keep the labeled Save action. Preserve “Collaborate” unless the dialog actually supports a broader sharing promise; renaming it “Share” alone could mislead users.

Treat Gantt analysis/Scenario Lab as one existing scenario capability with one user-facing name, not two new features. Reuse handlers and preserve familiar alternate routes during transition.

**Done when:** planning actions are discoverable together, routes execute the same commands, and unrelated diagram types do not show unusable planning actions.

### 11. Expose code directly and establish sensible initial zoom

**Observed · S–M · Dependency: 4 · Sources: Claude 2.12; Codex Q4**

Provide “Show code” or always-discoverable Code/Split/Diagram choices when starting in Diagram-only mode. Remove the redundant single-option Diagram control. Avoid a mandatory Settings visit to access source.

Use a readable fit policy for first render/open, chosen by diagram shape, rather than universally assuming Fit width is suitable for long Sequence diagrams. Remember user zoom per tab and never refit on every edit. Fit and source changes must remain distinct.

**Done when:** default users can reveal source in one obvious action, new diagrams start legibly, and switching tabs or reopening properties does not unexpectedly reset zoom.

**Starting point:** `App.tsx:1664–1670` and existing fit controls.

### 12. Organize Gantt controls and explain schedule semantics

**Observed · S–M · Dependencies: 10–11 · Sources: Claude 2.2, 2.3; Codex Q10**

Group canvas controls into navigation, preview zoom/timeline scale, and overlays. Keep resource filtering beside the canvas as a clear active filter. Move the default task-move policy to Gantt preferences but expose the effective policy near the move interaction; it changes scheduling consequences and should not become invisible.

Label or remove the unexplained chevron after establishing what it does. Use meaningful Previous/Next task help, “Progress (%)”, “Timeline scale”, and “Preview zoom”. Explain working-day durations and calculated versus explicit end dates beside the fields.

Evaluate the Timeline slider's keyboard/navigation value before removing it as redundant. Minimap replacement, if useful, belongs to item 23.

**Done when:** users can predict which controls alter source or scheduling and which only change the viewport, and active filters/policies are apparent.

### 13. Close command-palette coverage gaps

**Verify coverage → Proposal · S–M · Dependency: 10 · Source: Claude 2.10**

Inventory commands against actual capabilities for each diagram type. Check Reports, Version history, Document settings, scenario analysis, Jira, Fit, Close tab, next/previous tab, Rename symbol, and Go to line. Add genuinely missing applicable actions and a small recent-command section.

Do not make Gantt-only commands executable in Sequence merely because they were absent there. Preserve command eligibility and explain disabled actions where useful.

**Done when:** applicable menu actions and palette actions share handlers and permissions; recent commands remain valid when context changes.

### 14. Simplify inspectors and make commit rules visible

**Observed + documented behavior · M · Dependencies: 1–2 · Sources: Claude 2.4, 2.5; Codex Q9, Q13, M7**

Lead Gantt task properties with name and schedule/progress basics. Collapse empty optional Appearance/Resources sections while preserving remembered choices and invalid-draft visibility. Put project start/working days before page annotations in Calendar.

In Sequence creation, prioritize From, To, and Message; give endpoint pickers a visible combobox affordance. Put lifecycle, Teoz anchor, and unusual edge-message options under Advanced with concise examples.

Verify single-click/double-click behavior across diagram types. Initially correct hints to match actual behavior; harmonize gestures only where they do not interfere with selection, dragging, or inline editing.

Keep existing immediate, blur-to-apply, and staged Apply semantics initially. Add consistent applied/unapplied/invalid feedback near the top of each panel. Converting every form to live apply is a separate product decision, not a prerequisite for visual consistency.

**Done when:** common fields are easy to reach, users know when edits commit, invalid drafts remain recoverable, and closing/switching selection cannot silently discard staged changes.

### 15. Make reports and Workload useful before resources are assigned

**Observed + Source · S corrective slice, M presets · Dependencies: 9–10 · Sources: Claude 1.2 empty state, 2.7, 4.10; Codex Q8, M4**

Distinguish no assigned people, no matching dates, and excluded tasks. Offer explicit remedies such as coordinator summary, delivery outlook, showing all tasks, or opening task assignment. A sample assignment action belongs only in a clearly identified example; do not silently assign a fictional person in a real plan.

Fix duplicated report breadcrumbs using item 9's document/diagram identity. Show candidate versus included counts when helpful. Group reports by purpose and add presets; keep scope and preview visible while collapsing wording and exclusions.

Do not silently switch report types or promise a report will always have content. Retain forecast, due-date, milestone, and scenario functions unless a behavior comparison proves redundancy. What-if editing and a read-only critical-path report serve different purposes even when they share calculations.

**Done when:** an unassigned starter offers a useful one-click reporting route, exclusion reasons are understandable, and report output matches the chosen scope independently of canvas filters.

**Starting points:** `features/reports/ReportsDialog.tsx:502–525`, `ResourceWorkloadPanel.tsx`.

### 16. Correct scenario instructions and impact labels

**Observed · XS · Source: Codex Q12**

In Task controls mode, instruct users to change values and choose Update scenario; use source-edit instructions only in source mode. Confirm whether “0 days project duration” means a duration change and label it accordingly.

**Done when:** the initial scenario screen explains its next action and metrics without suggesting that source editing is required.

This independent copy fix can ship with Phase 1 if convenient; it does not depend on the navigation redesign.

## Phase 3 — Improve starting, learning, and everyday editing

### 17. Build one task-first start experience

**Observed → Proposal · M · Dependencies: 8–9 · Sources: Claude 1.9, 1.10, 5.4; Codex M1, M2**

Lead with Create, Open, and Try an example; make preferences secondary. Keep examples discoverable at the top through tabs/anchors or a desktop second column, with readable type thumbnails and optional Planning/Software modeling grouping.

Distinguish Blank, Simple starter, and named examples so choosing WBS does not unexpectedly create a Website redesign project. Use minimal valid source plus a useful Add empty state for blank diagrams.

Add a short optional contextual tour for deep features and a What's new entry. Make it dismissible and reopenable; avoid introducing another blocking onboarding sequence.

**Done when:** a new user reaches their chosen starting diagram without a preferences detour or deleting sample content, and can discover advanced workflows later.

### 18. Make Help searchable and contextual

**Observed → Proposal · S · Dependency: 13 · Source: Claude 2.9**

Filter Help text and shortcuts, group General/Editing/diagram-specific entries, prioritize the active diagram type, and render consistent platform-specific shortcut notation. Keep a route to all shortcuts and gesture help.

**Done when:** users can find an action by its UI name or shortcut and the documented key binding matches the command implementation.

### 19. Add practical editor preferences

**Proposal · S–M · Dependencies: 11–12 · Source: Claude 2.8 preferences**

Add editor font size, word wrap, tab size, and line-number preferences where not already available. Expose defaults for the view/zoom and movement policies implemented in items 11–12. Separate browser preferences from source-affecting diagram settings and apply defaults only to the intended scope.

**Done when:** preferences persist predictably, controls are accessible, and changing a default does not unexpectedly alter existing diagram source or override a tab's explicit choice.

### 20. Preview diagram themes and optionally adapt canvas appearance

**Observed → Proposal · M–L · Sources: Claude 2.8 theme, 5.3; Codex M3**

Replace name-only theme selection with a curated thumbnail gallery plus access to all themes. Keep app appearance, new-diagram defaults, and current-diagram styling distinct. Cache small sample previews rather than repeatedly rendering the working document.

Then assess an opt-in “Adapt preview to app theme” mode for harsh dark-canvas contrasts. Keep this separate from authored source; explicitly explain whether export uses authored appearance or the preview override. Do not silently add dark skinparams to documents.

**Done when:** choices can be compared visually, cancel restores the original, preview/export appearance is predictable, and text/selection/overlays remain readable.

### 21. Improve opening existing work

**Proposal; verify existing coverage · M · Dependencies: 9, 17 · Sources: Claude 4.3–4.5**

Add one Recent files entry point reused by File/Open and the start screen, with permission-aware reopening and a portable fallback when stored file handles are unavailable. Distinguish recent references from recovered workspace content.

Support dropping `.puml`/`.pumlu` files and pasting PlantUML into an explicit import area with type detection. Reuse file parsers, validation, and document-destination handling; never overwrite the active diagram merely because content was dropped or pasted.

**Done when:** all opening routes produce equivalent validated documents, failed/canceled opens preserve current work, and denied file permissions have a clear recovery path.

### 22. Expose Gantt creation operations through Add

**Proposal · S · Dependency: 12 · Source: Claude 4.6**

**Completed, with scope revised after usability review.** Keep Task, Milestone, Divider, and Closed day in Add, usable without a prior task selection. Route Closed day to the existing calendar inspector. Keep dependency, resource assignment, and task note in task-specific inspector/contextual editing flows rather than requiring selection before using Add.

**Done when:** new entries reuse existing mutation/undo behavior and do not create a second resource or calendar model.

### 23. Extend Outline into a large-diagram navigation system

**Source + Proposal · S search slice, M–L navigation · Dependencies: 2, 4, 12 · Sources: Claude 4.7, 4.8 and minimap option in 2.3; Codex Q14, M6**

Include displayed parent/group context in Outline search, with clear-search and filter-aware empty states. Add canvas Find that highlights/reveals matches using the same index. Scope Ctrl/Cmd+F to canvas focus so source editing retains its own search behavior.

Offer an optional docked hierarchical Outline, especially for WBS, while retaining the modal on small screens. Prototype a minimap only for long/large diagrams where it outperforms outline search and native scrolling; coordinate it with the Timeline slider decision in item 12.

**Done when:** searching a parent finds its visible child context, selection reveals the correct element, large diagrams stay responsive, and navigation does not unexpectedly change authored layout.

**Starting point:** `DiagramOutlineDialog.tsx:27–34` and the existing outline entry model.

### 24. Add reusable personal starters

**Proposal · M · Dependencies: 9, 17 · Sources: Claude 5.5; Codex M8**

Extend the existing examples gallery with Save as starter/template, local storage, and explicit import/export. Review existing duplication/template capabilities first. Preview decisions about dates, resources, external links, and document identities rather than blindly copying them.

**Done when:** creating from a starter produces independent valid content, preserves intended styles, and leaves the original unchanged.

### 25. Improve export and add explicit link/embed sharing

**Source + Proposal · M · Dependencies: 3, 9, 20 · Sources: Claude 4.2; Codex M5**

Reuse current export handlers for a preview of format, size, background, and margins, with remembered preferences and a preserved quick-export route. Associate output with the successfully rendered source revision.

Separately offer an encoded PlantUML URL or Markdown image/embed snippet if users need it. Encoding is not encryption; loading a link against an external renderer transmits diagram source and is not a self-contained offline share. Make the renderer destination and disclosure explicit, offer local export as an alternative, and avoid transmitting anything merely to show the sharing UI.

**Done when:** clipping and appearance are predictable, stale output is identified, and users can distinguish a local artifact, public encoded URL, and collaboration link.

### 26. Add conservative source formatting

**Proposal · M–L · Source: Claude 4.1**

Start with safe whitespace/indentation formatting for supported syntax, preserving comments, multiline labels, macros, and unknown constructs. Offer a diff and one-step undo. Arrow “normalization” can change semantics or appearance and should not be included without demonstrated equivalence.

**Done when:** formatting is idempotent, preserves rendered meaning on supported fixtures, and leaves unsupported source untouched or explains why it cannot format it.

## Phase 4 — Build larger capabilities after validating demand

The following is the recommended default order for the app's current planning-heavy workflows. Reassess it with users after Phase 3; investigate one major feature at a time. These extend existing foundations and must be reconciled with [feature strategy](feature-strategy.md), [connected-diagram planning](connected-project-diagrams-plan.md), and [scenario planning](delivery-scenario-lab-plan.md).

### 27. Add spreadsheet-style Gantt editing

**Proposal · L · Dependencies: 9, 14, 22 · Source: Codex L1**

Start with a task table for name, progress, and resource assignment synchronized with canvas selection. Extend to scheduling/dependencies and bulk paste after validating mutation semantics.

**Done when:** invalid cells cannot alter source silently, batch edits have clear undo boundaries, and unrelated/unsupported PlantUML survives each update.

### 28. Save and compare what-if scenarios

**Proposal · L · Dependencies: 3, 16 · Source: Codex L2**

Audit current scenario persistence, then add named alternatives and comparisons of finish dates, milestone movement, workload, and assumptions. First deliver save/reopen of one alternative against its base revision.

**Done when:** stale scenarios require reconciliation and applying changes follows the existing review/undo path without overwriting unrelated current edits.

### 29. Guide users through connected documents

**Proposal · L–XL · Dependencies: 9, 23 · Source: Codex L3**

Build a document overview showing diagrams, link health, and next repair/review actions. Extend the existing WBS → Gantt creation and connection system into a guided workflow rather than rebuild conversion.

**Done when:** users can identify linked objects, preview synchronization consequences, and repair stale links without duplicate identities or unintended cross-document edits.

### 30. Extend inline editing where genuine gaps remain

**Verify coverage → Proposal · L · Dependencies: 1, 14 · Source: Claude 5.2**

Inventory direct manipulation per diagram family before implementation. The claim that Class/Component/Use Case/Activity are mostly inspector-only is too broad: Codex observed Class move/connect affordances. Preserve existing operations and fill actual gaps.

Prioritize inline label rename, supported drag-to-connect, then safe reorder interactions. Define gesture precedence with selection and properties rather than assign double-click conflicting meanings.

**Done when:** each added gesture uses existing validated source mutations, offers a keyboard alternative, and has predictable undo without damaging unsupported syntax.

### 31. Add visual semantic review

**Proposal · L–XL · Dependencies: 3; coordinate identities with 29 · Source: Codex L4**

Extend version history and proposed-edit review with human-readable object changes, diagram highlights, and source fallback. Start with Gantt or Sequence comparisons before selective acceptance across multiple files.

**Done when:** unsupported changes are explicitly unclassified, renames are not misreported as unrelated additions/deletions, and accepted groups remain valid and undoable.

### 32. Add presentation and anchored review

**Proposal · L–XL · Dependencies: 23, 29; anchor design coordinated with 31 · Sources: Claude 5.6; Codex L5**

First deliver local read-focused presentation with named views, step-through highlights, and connected-diagram navigation. Then add anchored comments/review after auditing current collaboration permissions and comment capabilities.

Comments need stable object/revision anchors, explicit stale/deleted-anchor states, persistence/versioning decisions, and a clear audience. Shared review links are a separate release from local presentation.

**Done when:** presentation works without editing chrome, review comments survive supported edits with accurate context, and sharing clearly states audience and permissions.

### 33. Build task-focused mobile editing

**Proposal · L · Dependencies: 4, 14, 23; reuse 27 where suitable · Source: Codex L6**

Go beyond responsive resizing with a list/outline-first experience, a full-screen properties sheet, and View on diagram. Start with Gantt progress/resource updates and WBS navigation rather than detailed source editing or precision dragging.

**Done when:** common review/check-in actions succeed on real touch devices, keyboards and safe areas do not obscure required actions, and mobile edits preserve the same source/undo guarantees as desktop.

## Implementation rules and completion gates

### Refactor alongside the affected feature

Claude 5.7 proposes splitting `App.tsx` and `DiagramPreview.tsx`. Retain this as an implementation rule, not a separate prerequisite project: extract `MenuBar`, `WorkspaceToolbar`, `SidePanelHost`, and `StatusBar` when the associated work needs them. Keep behavior-preserving extractions reviewable and separate from interaction changes where practical. The existing shared inspector and October 8 cleanup remain the foundation; see [cleanup results](ui-cleanup-results.md).

Use Graft before source work and trace callers before changing shared symbols. Refresh the graph after substantial changes. File line counts alone do not establish a need to rewrite a subsystem.

### Validate each phase against user-visible outcomes

| Phase | Release gate                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Reproduced selection/panel bugs resolved; inaccessible or clipped actions corrected; errors, saving, and rendered revisions reported accurately. Unreproduced findings explicitly recorded. |
| 2     | A default user can reveal code, identify document membership/save target, find planning tools, and produce a report without guessing commit or filter behavior.                             |
| 3     | Starting/importing work is predictable; preferences and exports have clear scope; search, templates, and formatting preserve source and identity.                                           |
| 4     | A small pilot demonstrates value for each proposed large feature before expanding scope; existing source, history, and collaboration guarantees remain intact.                              |

For changed UI, verify desktop and narrow layouts, light/dark appearance, browser zoom, keyboard navigation, accessible names, and focus restoration. Use real software-keyboard/touch testing before claiming mobile completion. Capture relevant before/after screenshots.

For editing/state changes, test invalid drafts, staged commits, selection/tab changes, cancellation, undo/redo, and source preservation. Report tests should assert exact task/recipient scope; formatting tests should assert semantic preservation and idempotence. Use focused existing tests and required repository checks; avoid implementation-mirroring tests for simple labels.

Pilot representative journeys with new and returning users: create a blank diagram, reveal code, update a task, find a scenario, report unassigned work, reopen a file, and explain where it is saved. Establish baseline completion and wrong turns before promising percentage improvements.

## Consolidation decisions

- Each source recommendation is assigned once to a numbered item or the refactoring rule. When a source section bundled several independent ideas, its parts are assigned explicitly (for example, report empty states versus button styling).
- Existing Save, Issues, resizable inspectors, draft protection, examples, Fit, linked diagrams, history, and scenario analysis are retained and extended. Their presence is not reclassified as a missing feature.
- Unverified or conflicting observations remain verification work, notably Sequence selection, first-click menus, chooser restoration, submenu accessible names, palette coverage, and direct-manipulation coverage.
- No application implementation or new live UI verification was performed as part of merging these plans. The next action is to reproduce item 1 and implement the independently confirmed Phase 1 fixes.
