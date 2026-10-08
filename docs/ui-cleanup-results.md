# UI cleanup implementation results

Date: 2026-10-08

Implemented from [the implementation plan](ui-cleanup-implementation-plan.md), based on [the original proposal](ui-cleanup-plan.md). The original proposal is unchanged. Deployment remains a separate step.

## Changes delivered

- Separate document and diagram toolbars, direct Save, and plain Code / Split / Diagram controls with shortcut tooltips.
- Direct File → Save / Save as… and consistent saving from the header, menu, keyboard, and Commands. Saving follows the active standalone diagram or its containing document.
- Explicit file write, download, saving, cancellation, failure, and unsaved-change status. Browser recovery has its own details and warnings; persistent storage is requested only by an explicit user action.
- Shared properties layout across diagram types, remembered desktop resizing, narrow-screen focus handling, consistent actions, and protection for staged or invalid drafts. Task fields retain their existing apply-on-blur behavior. Sequence participant fields retain Apply and gain Cancel.
- Collapsible task sections for Basics, Dependencies, Schedule, Appearance, and Resources. Collapsing a section preserves its draft and exposes invalid-value feedback.
- One Issues entry for diagnostics and preserved source, with existing repair/source-navigation actions retained. Preview status distinguishes rendering, current, failed, paused, and an older displayed preview.
- Linked diagrams menu with missing-item counts and connection/sync review. The navigator yields to properties rather than covering them. Tab context menus support keyboard access and moving tabs left/right.
- Fit controls across previews, simpler creation/onboarding copy, optional default preferences, and dismissible first-use hints for each diagram type.
- Updated Help and action labels, shared control dimensions, focus states, warning colors, and wrapping toolbars/footer. Gantt's Workload button is distinct from the adjacent Filter by resource control.

Rendering isolation, source transformations, file formats, undo handlers, and collaboration permissions remain based on the existing implementation. No renderer or backend rewrite is included.

## Properties behavior retained

| Properties                                                           | Apply behavior                                                                                                                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gantt task and dependency                                            | Text applies on blur; selection controls retain their existing immediate updates. Invalid drafts require review before leaving. Task sections keep their mounted fields when collapsed. |
| Milestone, divider, vertical separator, legend, and project settings | Existing form submission applies staged edits. Leaving an edited form requires explicit discard confirmation.                                                                           |
| Sequence participant, message, structure, and settings               | Existing Apply submission remains. Participant Cancel closes the panel with discard confirmation for an edited draft.                                                                   |
| Class/component and Activity objects and settings                    | Existing field blur and selection updates remain. Creation dialogs retain their own submission behavior.                                                                                |
| Use Case elements, packages, notes, relationships, and settings      | Existing blur and selection updates remain.                                                                                                                                             |
| WBS node                                                             | Existing blur and selection updates remain; alias and label changes preserve project link identity.                                                                                     |
| WBS settings and relationship                                        | Existing Apply controls remain; edited fields are guarded even without a form element.                                                                                                  |
| Resource workload                                                    | Capacity changes apply immediately. Rename remains a separate staged form.                                                                                                              |

The shared shell guards close, selection/tab changes, document shortcuts, and application undo/redo when a staged or invalid draft exists. Native undo inside a text field remains available. Successful Apply resets the guard; accepting discard allows the requested action. Closing restores the opener when the panel really closes, including when source updates temporarily refresh its contents.

## Action inventory

| Action                                            | Location                  | Shortcut / alternative                                                             | Availability                                                         |
| ------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Save                                              | Header, File, Commands    | Ctrl/Cmd+S                                                                         | Active diagram/document; duplicate requests are blocked while saving |
| Save as…                                          | File, Commands            | Menu keyboard navigation                                                           | Active diagram/document                                              |
| New / Open                                        | File and creation dialog  | Ctrl/Cmd+N / O                                                                     | Existing document and diagram paths retained                         |
| Export                                            | File → Export             | Menu keyboard navigation                                                           | Existing source, image, PDF, and clipboard conditions retained       |
| Undo / Redo / History                             | Header                    | Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z                                                      | Existing history and permission conditions                           |
| Add                                               | Diagram toolbar           | Existing diagram-specific shortcuts; Commands                                      | Diagram-specific actions; viewer restrictions retained               |
| Outline                                           | Diagram toolbar, Commands | Shift+Ctrl/Cmd+O                                                                   | Active diagram                                                       |
| Diagram settings                                  | Diagram toolbar           | Commands where previously supported                                                | Non-Gantt diagram                                                    |
| Calendar & schedule                               | Diagram toolbar           | Existing settings commands                                                         | Gantt diagram                                                        |
| Workload / Filter by resource / When moving tasks | Diagram toolbar           | Workload opens capacity details; native select keyboard controls filter the canvas | Gantt diagram                                                        |
| Linked diagrams                                   | Diagram toolbar           | Arrow-key menu controls; Diagram connections in Commands                           | WBS or linked Gantt; mutation conditions retained                    |
| Code / Split / Diagram                            | Diagram toolbar           | Ctrl/Cmd+1 / 2 / 3                                                                 | Existing editing-mode preference retained                            |
| Settings / Appearance / Help                      | More                      | Settings and theme commands; `?` for Help                                          | App-wide                                                             |
| Gantt analysis / Jira / Backup / Restore          | File                      | Existing Commands where supported                                                  | Existing diagram/integration conditions                              |
| Issues                                            | Footer, Commands          | Existing editor repair shortcuts                                                   | Active diagram diagnostics and preserved syntax                      |
| Fit / Zoom                                        | Canvas controls           | Existing wheel and keyboard navigation                                             | Rendered diagram                                                     |
| Tab actions / Reorder                             | Tab context menu          | Shift+F10 or ContextMenu key; Move tab left/right                                  | Open tabs; end positions disable unavailable moves                   |

## Verification

Browser tests exercise existing editing, save/reopen, failures, source preservation, isolation, themes, exports, and linked-diagram workflows in addition to new UI coverage.

| Check                        | Result                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository validation        | `npm run validate`: lint, formatting, 2,044 unit tests, 9 collaboration-worker tests, 9 integration-worker tests, workspace type checks, frontend build, and worker build/dry runs.                          |
| Full Chromium suite          | 348 passed, 21 initially failed, 3 skipped. All initial failures passed focused reruns after fixes and selector updates.                                                                                     |
| Full Firefox + WebKit suites | 701 passed, 16 initially failed, 29 skipped. All 16 initial failures passed corrective reruns: 12 after the first corrections and the remaining 4 after the linked-selection and endpoint-readiness fixes.   |
| New UI browser coverage      | 27 passed: nine cases in each browser for toolbar wrapping, staged/invalid drafts, truthful download status, menu keyboard/focus behavior, Issues, resize/Fit, keyboard tab reordering, and enlarged layout. |
| Additional Gantt coverage    | 12 final focused cases passed across the three browsers for capacities, over-allocation, blur application, and close/delete focus restoration. Together with the UI cases, the final rerun passed 39 tests.  |
| Repeated WBS project links   | Three successful workflows per browser, covering label edits, alias rename, context-menu navigation, and saving. Firefox's creation test now waits for initial indexing and submission completion.           |
| Production PWA               | 6 passed in Chromium/WebKit: native launch queue, installed-window behavior, isolated production rendering, and cached offline startup.                                                                      |
| Live collaboration           | 2 passed against a local Worker: editor/viewer permissions and shared-document navigation, management, and offline edits.                                                                                    |

The complete browser runs were followed by targeted verification on the corrected code; this is not a claim that one final full run passed unchanged. Corrective browser runs use the repository's existing CI timeouts with retries disabled. Existing platform-dependent skips remain; production-only PWA cases were exercised separately against a build.

### Layout observations

The original single toolbar had 1,341px of content and clipped at the tested widths. The split toolbars have no horizontal content overflow at 1280, 1024, 768, and 390px in the captured light and dark Gantt layouts. Screenshots were visually reviewed at desktop and phone widths. The capture script is `scripts/capture-ui-cleanup.mjs`; generated screenshots and measurements are local artifacts.

This is a Gantt layout comparison, not a complete before/after usability study. Sequence and WBS behavior are covered by regression tests; their original screenshots and human task timings were not collected. No performance or task-completion percentage is claimed.

### Regressions found and corrected

- Resource capacity controls apply immediately; the new draft guard now tracks form drafts rather than treating those preferences as unapplied changes.
- A temporary properties refresh during Apply restored focus to the code editor. Opener focus now restores after a real panel close, preserving Apply focus during source updates and transitions to a different properties panel.
- The Gantt forecast column squeezed canvas controls on narrow previews. Narrow canvases now stack the control groups while allowing their buttons to wrap normally.
- Doubled UI scaling exposed panel-position measurements in viewport pixels. Panel offsets now account for the app's scale.
- Creating a version and immediately setting a baseline could select the previous version. Baseline selection now waits until creation finishes, with a deterministic regression test.
- WBS label edits could lose project links when stale template locators shared the node's position, especially during index refresh. Identity mapping now prefers resolved declarations and uses the original symbol key while indexing; unit and browser workflows cover label and alias edits.
- Opening a linked WBS node used a fixed 100ms selection delay, and restoring the saved code cursor could overwrite its selection. It now waits for the destination tab, diagram type, and node to be ready, then reveals the selected node's source range instead of the old cursor.
- Resource capacity's HTML step rule rejected 50% and 100%. The field now accepts integer capacities within its existing bounds, so valid immediate changes do not trigger the draft guard.
- Large-source browser checks now read the full CodeMirror document rather than its virtualized visible lines, and normalize Windows line endings before insertion.
- Existing tests were updated for renamed controls and the mutually exclusive navigator/properties layout. Clipboard assertions normalize Windows line endings without changing exported content.

## Remaining release review

- Run a short human usability session on create/save/change appearance/switch views/explain recovery. This cannot be replaced by automated tests.
- Verify native 200% browser zoom and touch ergonomics on representative devices; the automated enlarged-layout test uses CSS zoom as a layout proxy.
- Review the local changes before choosing commit boundaries. A useful split is toolbars/menus/status, properties/layout, then discovery/help and regression coverage.
- Production deployment and deployed-CSP verification remain release steps. Local results do not establish that the deployed app is updated.

Pinned outline and a broad navigation rewrite remain deferred as specified in the implementation plan.
