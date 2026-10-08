# UI cleanup implementation plan

Date: 2026-10-08

Based on [UI cleanup plan](ui-cleanup-plan.md) and the current web application. This document proposes implementation work; it does not change application behavior. Browser observations and usability measurements remain to be collected.

## Approach

Deliver small, independently reviewable changes. Keep the existing source model, rendering isolation, file formats, collaboration permissions, and editing handlers. Extract presentation from `apps/web/src/App.tsx` only where a change needs a reusable component; avoid a prerequisite rewrite of this large component.

Use **Document** for the saved container, **Diagram** for an item, and **Workspace** for browser-local preferences/state. These are UI terms, not a request to rename storage schemas or internal project types.

## Implementation sequence

Each row is a proposed PR or small group of commits. Effort is relative: S is localized, M spans several components, L requires interaction and lifecycle work. These are planning estimates, not delivery dates.

| Step | Scope and code locations                                                                                                                                                                                                                                  | Depends on | Effort | Completion criteria                                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Capture baseline and action inventory. Inspect `App.tsx`, `FileMenu.tsx`, `AddMenu.tsx`, `SettingsDialog.tsx`, and existing browser tests.                                                                                                                | —          | S      | Screenshots and reproducible workflows cover Gantt, Sequence, WBS links, long tab names, both themes, narrow layouts, save/recovery failures, and viewer permissions. Record where each action lives, its shortcut, and its enabled conditions.     |
| 2    | Simplify File menu and unify save dispatch in `FileMenu.tsx` and `App.tsx`. Rename visible Gantt settings to Calendar & schedule; use Diagram settings consistently.                                                                                      | 1          | M      | Save and Save as are direct menu items. Menu, shortcut, palette, and future header Save use the same document-aware dispatch. Existing import/export formats remain accessible.                                                                     |
| 3    | Separate global and diagram toolbars in `App.tsx` and `styles.css`, extracting small presentation components as useful. Add direct Save; use Code / Split / Diagram segmented controls; move Add, Outline, and diagram settings to the workspace toolbar. | 2          | M      | No clipping at 1280 and 1024 pixels. Global controls stay stable across diagram types. Gantt filter and schedule behavior controls sit beside the canvas. Secondary actions have a labeled overflow menu and remain discoverable in Commands.       |
| 4    | Make save and recovery status explicit using `StorageStatus.tsx`, `projects/ProjectNavigator.tsx`, `projects/use-single-file-project.ts`, and existing save coordinators. Simplify the footer.                                                            | 2–3        | M      | File state and browser recovery are visibly distinct. Save failures persist with a next action; newer edits remain dirty after an older save finishes. Technical storage details move into a details view without hiding actionable warnings.       |
| 5    | Introduce shared properties-panel layout and limited design tokens in `styles.css`; prototype with `TaskInspector.tsx`, `SequenceParticipantInspector.tsx`, and their feature wrappers.                                                                   | 3          | L      | One predictable header, scrolling form, usable close/action area, and explicit apply behavior. Desktop width can be resized and remembered; narrow drawer restores focus. Invalid and staged drafts are not silently lost.                          |
| 6    | Apply proven panel patterns to remaining inspector components and `ProjectInspector.tsx`; complete control-state and typography consistency.                                                                                                              | 5          | M–L    | All diagram types retain their editing capabilities, validation, undo boundaries, and permission restrictions. Focus, hover, disabled, selected, error, and loading states follow shared tokens.                                                    |
| 7    | Improve tabs, navigator, linked-diagram actions, and canvas controls in `App.tsx`, `projects/ProjectNavigator.tsx`, and preview components.                                                                                                               | 3, 5       | M      | Document identity, active diagram, type, and dirty state are unambiguous. Linked diagrams menu has counts and actionable sync issues. Fit/zoom/selection controls are consistent where supported. Keyboard/menu alternatives cover drag operations. |
| 8    | Consolidate issue presentation and rendering feedback, reusing existing diagnostics and source navigation handlers.                                                                                                                                       | 4, 6       | M      | Issues distinguish errors, warnings, and preserved unsupported syntax. Go to source and available fixes are direct actions. Rendering, failed rendering, and an older displayed preview have distinct states.                                       |
| 9    | Simplify onboarding and chooser copy in `SettingsDialog.tsx`, `NewDocumentDialog.tsx`, and starter-example flows.                                                                                                                                         | 2–3        | S–M    | Create, Open, and Try example lead the flow; preferences are optional. Existing previews/examples remain. First-use hints are dismissible and do not reappear during normal work.                                                                   |
| 10   | Run the complete verification matrix and compare usability/performance with the baseline. Update help and action labels.                                                                                                                                  | 4, 6–9     | M      | Required checks pass; core tasks work with keyboard, touch-sized controls, both themes, narrow layouts, and 200% zoom. Any regression is fixed before rollout.                                                                                      |

Steps 4 and 5 can proceed independently once their prerequisites are complete. Avoid bundling all ten steps into one change.

## Decisions and implementation details

### File actions and toolbar

- Reuse existing handlers and enabled conditions, including collaboration viewer restrictions. A visible Save control must follow the same path as the existing File menu and keyboard shortcut.
- Audit the command palette's `file.save` and Save as handlers: current menu/shortcut routing distinguishes single-file documents, while palette handlers call standalone save functions directly. Verify intended behavior before consolidating dispatch.
- Keep current Diagram and Document open paths until one Open dialog demonstrably accepts all supported inputs. Consolidation must preserve standalone files, portable documents, legacy imports, and current folder/archive workflows.
- Move application theme selection into the existing Settings appearance controls and retain palette access. Keep diagram appearance separate.
- Replace numbered view labels with plain labels and shortcut tooltips. Update tests that intentionally assert the old accessible names.
- Preserve document-tab, editor, and diagram context menus. Menu changes must preserve outside-click dismissal, Escape, keyboard movement, and trigger focus restoration; verify submenu keyboard navigation explicitly.

### Honest status

- Build file status from the actual save operation and captured revision. Reuse the revision checks in `document-format/save-coordinator.ts` and existing project save coordinators.
- Distinguish a confirmed native file write from a browser download being initiated. Do not display Saved to file solely because a download was requested.
- Reuse recovery states already exposed by `use-single-file-project.ts`: current, updating, failed, and disabled for encrypted documents. Browser recovery must never clear file dirty state.
- Keep quota, memory-only storage, recovery failure, and save failure actionable. Place engine names, timings, and detailed quota information behind a details control.
- Preserve the current user-gesture requirement for requesting persistent browser storage. Opening or rendering a status component must not trigger a permission prompt.
- Show line/column only when code is visible. Keep collaboration synchronization separate from file saving.

### Inspector contract

Before changing forms, document each inspector's apply behavior. `TaskInspector.tsx` currently applies many fields on blur; retain this behavior in the first layout change and describe it clearly. Use Apply/Cancel only for forms that stage edits, unless a separate behavior change is explicitly designed and tested.

The prototype must handle switching selection, changing diagrams, collapsing a section, closing the panel, and undo while a field is edited. Define what happens to invalid drafts and staged edits in each case. Do not reset drafts accidentally through new component keys or remounts. Preserve schedule-impact review and calculated-date explanations.

Use Basics, Schedule, Dependencies, Resources, and Appearance for Gantt task sections. Keep essential fields open, and surface validation errors even when their section is collapsed. Share the panel shell first; do not force distinct diagram forms into a single field schema.

For narrow screens, prefer a dismissible drawer with deliberate focus management. Allow the secondary navigator to collapse before the editor and canvas become unusable. Defer a pinned outline until the baseline/prototype confirms its value.

### Visual and rendering guardrails

- Extend existing tokens incrementally for spacing, typography, heights, radii, and semantic colors. Start with touched controls, then standardize remaining surfaces in step 6.
- Preserve the recently fixed editor action row: it reserves layout space and wraps. Do not restore an absolute toolbar that covers source text on narrow screens.
- Scope UI styles so exported SVG appearance and diagram themes stay unchanged.
- Preserve the isolated renderer, CSP assumptions, worker behavior, and bounded retry/timeouts. UI cleanup must not add renderer reloads, source transformations, or synchronous work on each keystroke.
- Use render result document/source identity to identify an older preview; the presence of an SVG alone does not prove it matches the current document.
- Verify selected state beyond color, readable canvas contrast, focus visibility, and usable pointer targets in the browser.

## Verification by slice

Run focused existing tests for each behavioral change; use screenshots/manual review for visual judgments. Add tests for new meaningful state transitions rather than mirroring markup. Update exact labels deliberately without removing action coverage or extending timeouts to conceal regressions.

| Area                                    | Existing suites to extend or run                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Menus, shortcuts, mode labels           | `editor.spec.ts`, `editor-shortcuts.spec.ts`, `settings-editing-mode.spec.ts`                                                    |
| Save, reopen, failure, concurrent edits | `portable-document.spec.ts`, `project-save-failures.spec.ts`, `project-unsaved-guard.spec.ts`, `project-external-change.spec.ts` |
| Inspectors and undo                     | Diagram-specific editor suites, Gantt conflict/forecast suites, multi-select suites                                              |
| Linked diagrams and navigator           | `project-wbs-links.spec.ts`, `project-wbs-gantt-existing.spec.ts`, `wbs-gantt.spec.ts`, `project-review.spec.ts`                 |
| Issues and preserved syntax             | `diagram-syntax-fixes.spec.ts`, `audit-remediation.spec.ts`                                                                      |
| Onboarding and export                   | `starter-examples.spec.ts`, `export-options.spec.ts`                                                                             |
| Security, speed, themes                 | `security.spec.ts`, `renderer-performance.spec.ts`, `theme-interaction-diagnostic.spec.ts`                                       |
| Collaboration and release               | Separate collaboration-live, PWA, and deployed-rendering suites                                                                  |

Before release, run `npm run validate` and the required Chromium, Firefox, and WebKit CI suites. Verify viewer read-only behavior, reconnect, save cancellation/failure, encrypted recovery restrictions, and previous-preview rendering errors.

Manual matrix: 1280, 1024, 768, and 390 pixel layouts; light/dark/system themes; long names and dense diagrams; keyboard-only navigation; 200% zoom. Exercise create/save/reopen/add diagram, Gantt dependencies and task movement, Sequence editing, WBS synchronization, and unsupported source preservation.

Record baseline and final task completion observations and rendering responsiveness on the same fixtures/browser. Set improvement targets after collecting the baseline; avoid inventing a speed or usability percentage.

## Recommended first delivery

Start with steps 1–3: action inventory, consistent save dispatch, direct Save, clearer settings names, and the global/workspace toolbar split. Follow with honest save/recovery presentation. These changes address the highest-priority confusion while leaving inspector lifecycle work in a separately reviewable prototype.

The original proposal remains the scope reference. No file-format migration, renderer rewrite, backend change, or broad architecture refactor is required for this plan.
