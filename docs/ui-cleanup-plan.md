# UI cleanup plan

Date: 2026-10-08

## Goal and review scope

Make PlantUML Ultimate easier to understand, quicker to operate, and visually calmer while preserving its diagram editing capabilities and source-first model.

This is a proposal only. The review covers the current React components, styles, and repository documentation. It is not a rendered-browser audit or a usability study: crowding, contrast, and interaction concerns should be verified in the browser before implementation. Priorities and effort are estimates, not measured user outcomes.

The strongest opportunity is to establish a clear hierarchy: document actions at the top, diagram actions beside the canvas, selected-object properties in one predictable panel, and secondary information available on demand.

## What to keep

- Code, split, and diagram views, with PlantUML remaining the source of truth.
- Diagram-specific Add menus and editing tools.
- Existing command palette, searchable outline, undo/redo, and history.
- Diagram previews and starter examples in the creation dialog.
- Light, dark, and system themes.
- Existing local recovery, diagnostics, keyboard support, and collaboration permission handling.

These are useful foundations. Improve their presentation and discoverability instead of replacing them.

## Prioritized recommendations

### 1. Give the toolbar a clear hierarchy

**Priority: P1 · Effort: medium · Benefit: less searching and more space for the diagram**

**Evidence:** `apps/web/src/App.tsx` places File, Add, Outline, diagram settings, collaboration, Help, view modes, history, and theme selection in the header. Gantt adds resource and schedule selectors; linked WBS/Gantt adds long action labels. `styles.css` gives the main toolbar a 42px grid row and makes file tools non-shrinking.

**Proposal:**

- Keep global actions together: File, a directly accessible Save, undo/redo, Commands, and Collaborate.
- Put `Code | Split | Diagram` in a consistent segmented control with a strong selected state. Show shortcuts in tooltips instead of putting numbered prefixes in every label.
- Move Add, Outline, and Diagram settings into a compact workspace toolbar. Add should be the visually strongest creation action.
- Put Gantt resource filtering and task-movement behavior beside the Gantt canvas. Rename the ambiguous `Schedule` control to `When moving tasks`, with concise explanatory help.
- Move theme selection to Appearance in Settings, retaining command-palette access.
- Move long WBS/Gantt synchronization actions into a `Linked diagrams` menu with a count badge. Keep actionable sync problems visible nearby.
- Put Help and less frequent actions in a labeled overflow menu on smaller screens. Every moved action must remain discoverable through menus and the command palette.

**Acceptance:** At 1280px and 1024px widths, common actions remain visible without clipping. Switching diagram types does not move global controls to unexpected positions.

### 2. Simplify file actions and clarify the naming model

**Priority: P1 · Effort: medium · Benefit: fewer decisions before opening or saving work**

**Evidence:** `FileMenu.tsx` nests New, Open, and Save; mixes file operations with Jira, Delivery Scenario Lab, workspace recovery, and settings. The UI also uses Document, Diagram, and Project in different contexts. The Gantt `Project` button opens `Project & calendar`.

**Proposal:**

- Use **Document** for the saved container, **Diagram** for an item within it, and **Workspace** for browser-local open work and preferences.
- Label Gantt settings `Calendar & schedule` rather than `Project`, making their scope explicit. Use `Diagram settings` consistently across diagram types.
- Make Save and Save as direct File menu items. Keep export formats in one Export submenu.
- Prefer one `Open…` entry that accepts supported files if existing import behavior can be preserved. Explain legacy-source import after selection rather than making users understand the storage model first.
- Explain creation choices with one-line descriptions: `New diagram — create a diagram` and `New document — organize multiple diagrams in one file`.
- Group Jira under Integrations and Scenario Lab under Gantt analysis. Keep backup and restore together under clearly labeled Workspace actions.

**Acceptance:** Someone unfamiliar with `.pumlu` can create, save, reopen, and add another diagram without needing a file-format explanation. Existing supported formats and shortcuts remain available.

### 3. Make save and recovery status understandable

**Priority: P1 · Effort: medium · Benefit: confidence that work is protected**

**Evidence:** `StorageStatus.tsx` can display `IndexedDB`, `Local recovery`, or `Memory only`. The document navigator separately displays saved/unsaved state and recovery information. The footer also contains validity, render timing, cursor position, network state, and collaboration status.

**Proposal:**

- Show file state near the document name: `Unsaved changes`, `Saving…`, or `Saved to file`, based on the actual save result.
- Describe browser recovery separately: `Recovery copy up to date`, `Recovery unavailable`, or `Recovery disabled`. Never imply that a browser recovery copy is a saved file.
- Put storage engine names, quotas, and render timing in a details popover. Retain prominent storage failure and memory-only warnings.
- Keep the normal footer quiet: problem count, useful contextual information, and recovery state. Show line/column when code is visible; surface offline status when relevant.
- Distinguish local edits, file saving, and collaboration synchronization. One generic `Saved` indicator must not imply all three succeeded.

**Acceptance:** Users can tell whether they have a current file copy and a recovery copy. Failure states remain visible until resolved, with an appropriate next action.

### 4. Make inspectors predictable and easier to scan

**Priority: P1 · Effort: medium–large · Benefit: faster object editing**

**Evidence:** `TaskInspector.tsx` applies text changes on blur and some selectors immediately. `ProjectInspector.tsx` uses an Apply submission. Desktop workspace sizing reserves fixed widths for inspectors and the document navigator; narrow-screen rules let inspectors overlay the workspace.

**Proposal:**

- Use one consistent right-hand properties panel for the selected object or diagram settings, with the selected item's name and type in its header.
- Group task fields into Basics, Schedule, Dependencies, Resources, and Appearance. Keep the most common fields open; make secondary sections collapsible without hiding validation errors.
- State the editing contract: `Changes apply automatically` for immediate editing, or visible Apply/Cancel controls for staged edits. Preserve review steps for changes that can affect other tasks.
- Mark derived dates as calculated and explain how to override them next to the field.
- Keep close controls and staged-action footers visible while long forms scroll.
- Prototype a resizable desktop panel with remembered width. On narrow screens, use a deliberate drawer with clear dismissal and focus restoration.
- Avoid simultaneously reserving so much width for navigation, code, and properties that the diagram becomes unusable; collapse secondary navigation first.

**Acceptance:** Changing fields, switching selections, and closing a panel have predictable results. Invalid or unapplied input is not silently lost. Undo still matches meaningful edits.

### 5. Establish a restrained visual system

**Priority: P2 · Effort: medium · Benefit: a more cohesive and readable interface**

**Evidence:** `styles.css` already has theme variables, but individual surfaces define many small font sizes, radii, colors, and spacing values. Tab close controls are styled at 17 × 17px. Toolbar actions include text glyphs such as `⌘`, `↶`, and `↷`.

**Proposal:**

- Extend the current tokens with a small spacing scale, typography scale, control heights, corner radii, and semantic colors.
- Start with 13–14px control text, 14px form labels, and comfortable line spacing. Reserve very small text for secondary metadata, not essential instructions.
- Use neutral canvas and panel surfaces, subtle borders, and one accent color. Reserve strong color for primary actions, selection, and meaningful status.
- Standardize hover, selected, disabled, focus, warning, and error states. Give selection more than a color change.
- Use consistent icons for familiar actions, with accessible names and tooltips. Keep text on ambiguous commands; replace the bare `⌘` with a recognizable Commands entry.
- Increase close-button hit areas without requiring oversized visible icons. Offer comfortable touch targets and check actual spacing between controls.
- Review the diagram canvas in both themes so application styling does not reduce diagram readability or alter exported diagram appearance.

**Acceptance:** Shared controls look and behave alike across dialogs and inspectors. Check actual contrast, focus visibility, and readability in both themes and at 200% browser zoom before calling this complete.

### 6. Clarify navigation and direct diagram interaction

**Priority: P2 · Effort: medium · Benefit: less hunting and fewer accidental actions**

**Evidence:** Navigation is split between document tabs, `ProjectNavigator.tsx`, and the modal `DiagramOutlineDialog.tsx`. The navigator also contains connection, review, and recovery information.

**Proposal:**

- Keep document identity separate from the active diagram name. Make tab names, diagram type, dirty state, and selection distinguishable.
- Give the document navigator a simple default view of diagrams; place connections and change review in secondary sections.
- Retain the fast outline dialog. Consider a pinned outline only after testing whether repeated modal opening disrupts navigation.
- Audit zoom, fit, selection styling, and canvas controls across all diagram types and align their placement and labels.
- Use brief contextual hints for editing, connecting, and dragging objects. Show hints when useful and allow dismissal.
- Pair drag interactions with menu or keyboard alternatives. Keep selected items identifiable when their inspector opens.

**Acceptance:** Users can identify their document, switch diagrams, find an element, and edit it without losing their place. Common canvas controls behave consistently across types.

### 7. Shorten the path to the first useful diagram

**Priority: P2 · Effort: small–medium · Benefit: a better first session**

**Evidence:** `SettingsDialog.tsx` has a preferences-first onboarding mode; `NewDocumentDialog.tsx` then offers diagram types and examples with another prominent welcome header.

**Proposal:**

- Lead with Create, Open, or Try an example. Offer starting preferences as optional choices with sensible defaults.
- Preserve the visual diagram chooser, but reduce repeated branding and introductory copy after first use.
- Explain diagram types by outcome: `Gantt — plan dates and dependencies`, `Sequence — show messages between participants`, and similar short descriptions.
- Use the existing `Diagram only` and `Diagram + code` labels consistently. Make switching views easy to discover without implying a skill level.
- After creation, provide one relevant next action, such as `Add your first task` or `Add a participant`.

**Acceptance:** A first-time user reaches an editable example or new diagram without configuring appearance first; returning users can create another diagram quickly.

### 8. Make problems actionable without overwhelming the workspace

**Priority: P2 · Effort: medium · Benefit: easier recovery from mistakes**

**Evidence:** `App.tsx` exposes separate problem and preserved-line counts and opens `ProblemsPanel.tsx` or `UnsupportedSyntaxPanel.tsx`. A general footer message also carries interaction feedback and rendering errors.

**Proposal:**

- Provide one Issues entry with clear categories for errors, warnings, and source preserved without visual editing support.
- Explain preserved source as informational when it is not an error: `Some syntax can only be edited in Code view`.
- Lead each issue with what happened and a next action: Go to source, Review fix, or Learn more.
- Keep critical failures persistent; use brief feedback for successful routine actions. Preserve full technical details on demand.
- Clearly distinguish rendering in progress, rendering failure, and an older preview that no longer matches the current source.

**Acceptance:** Users can reach the affected source and understand whether the issue prevents rendering, limits visual editing, or is only advisory. Ordinary feedback cannot conceal a blocking failure.

## Proposed desktop layout

Conceptual arrangement; exact sizes need a browser prototype.

```text
App / document     File  Save  Undo Redo       Commands  Collaborate  More
Diagram tabs                                            + New diagram
---------------------------------------------------------------------
Optional navigator | Add  Outline  Diagram settings   Code Split Diagram
                   |-------------------------------------------------
Diagrams           | Source (in split view) | Diagram       | Properties
                   |                       |               | Selection
Connections        |                       | Fit / Zoom    | Fields
---------------------------------------------------------------------
Issues / feedback                         File state / Recovery state
```

The navigator and properties panel should not both be permanent requirements. Keep document identity and save state in one consistent location in the final design, even if the prototype explores header versus footer placement.

## Implementation sequence for a future change

| Phase                             | Work                                                                                                                                                          | Exit condition                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Establish a baseline           | Capture current Gantt, Sequence, and WBS workflows; include a linked document, long tab names, both themes, and narrow widths. Record steps for common tasks. | Confirm which code-based concerns reproduce visually and behaviorally.              |
| 2. Fix hierarchy and language     | Recommendations 1–3: toolbar, menus, terminology, and save/recovery status.                                                                                   | Common actions are easy to find; users can accurately explain save state.           |
| 3. Align properties and styling   | Recommendation 4 plus shared visual tokens from 5; prototype with a Gantt task and a Sequence participant before extending.                                   | Editing behavior is predictable and controls remain usable at smaller sizes.        |
| 4. Improve discovery and feedback | Recommendations 6–8 and remaining diagram types.                                                                                                              | First-use, navigation, and error recovery work across the application.              |
| 5. Validate and refine            | Run task-based usability checks and focused regression coverage.                                                                                              | No loss of keyboard access, file behavior, editing capability, or recovery clarity. |

Implement in small increments. Avoid combining the cleanup with a renderer rewrite, file-format migration, or broad architecture refactor.

## Validation checklist

- Exercise create → edit → save → reopen for standalone and multi-diagram documents.
- Edit a Gantt dependency, inspect a calculated date, move a task with dependents, and undo the change.
- Add and edit a Sequence participant/message; find an item using the outline and command palette.
- Navigate a linked WBS/Gantt document and discover synchronization actions.
- Verify collaboration viewer permissions and reconnect feedback remain clear.
- Check storage failure, unsaved file changes, unsupported syntax, and rendering failure states.
- Check desktop, tablet, and phone widths; test long names and dense diagrams, both themes, keyboard-only use, and 200% browser zoom.
- Keep menu arrow-key behavior, dialog focus containment/restoration, accessible names, and visible focus intact. Use existing tests as the regression baseline and add focused coverage for changed behavior.
- In a small usability check, ask users to create a diagram, save it, change an object's appearance, switch views, and explain whether their work is saved. Compare time, wrong turns, and requests for help with the baseline. Set quantitative targets after measuring the current experience.

## Recommended starting point

Start with toolbar hierarchy, direct Save access, consistent settings names, and plain-language recovery status. These address the clearest code-backed sources of complexity and create a stable foundation for visual polish.
