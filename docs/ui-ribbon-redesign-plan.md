# UI ribbon redesign plan

Status: implemented locally. Command destinations are recorded in [ui-ribbon-command-inventory.md](ui-ribbon-command-inventory.md).

## Goal

Replace the disconnected top menu and lower toolbar with a compact ribbon whose commands change with the selected category. Put document tabs below the ribbon, and keep workspace views distinct from command categories.

The existing **Tasks** control is a Gantt workspace view alongside Code, Split, and Diagram. **Plan** is a category of planning actions. Preserve that distinction. Task and dependency creation must remain available in every Gantt workspace view.

## Current problems

- Document tabs separate two command areas, obscuring their relationship.
- Calendar & schedule, Workload, and linked-diagram actions appear in both Plan and the lower toolbar.
- File actions, editing commands, workspace views, panels, and utilities compete at the same visual level.

## Proposed layout

```text
File   Edit   Insert   Plan   View       Commands   Save   Collaborate
--------------------------------------------------------------------
                   Selected category's commands
--------------------------------------------------------------------
Project plan ×    Architecture ×    +      Code | Split | Diagram | Tasks
--------------------------------------------------------------------
                              Workspace
```

1. Command categories select the ribbon contents.
2. The ribbon presents clearly labelled groups of commands.
3. Document tabs and view controls select the document and its presentation.

Save, Undo/Redo, command search, and Collaborate remain accessible without switching categories. File remains a dropdown for file operations. The sketch is structural; final spacing and persistent utility placement require responsive validation.

## Command destinations

| Area            | Contents                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File            | New/Open, projects and recent work, Save As, starters, version history, document settings, backup/restore, export and copy formats, share link.                                    |
| Edit            | Undo/Redo history and applicable existing editing commands. Preserve selection and permission requirements.                                                                        |
| Insert          | Existing Add actions as labelled controls. Gantt includes Task, Milestone, Divider, and Add dependency. Other diagram types expose their corresponding elements and relationships. |
| Plan            | Calendar & schedule, Workload, Reports, What-if scenario, Jira, and linked Gantt/WBS actions, including sync-issue counts.                                                         |
| View            | Outline, Find in diagram, diagram settings, focus/restore layout, and Presentation & local review.                                                                                 |
| Commands        | Persistent command-palette button and existing shortcut.                                                                                                                           |
| Collaborate     | Persistent button with connection state and participant count.                                                                                                                     |
| Settings / Help | Small persistent utility controls, replacing their placement in More.                                                                                                              |
| Tasks           | Gantt workspace view beside Code, Split, and Diagram.                                                                                                                              |
| More            | Remove as a permanent desktop category. Narrow-screen overflow uses the names of the groups it contains.                                                                           |

Keep diagram settings under View initially to avoid introducing a category for a single control. The complete command inventory must resolve every individual action before migration; this table is the proposed category structure, not an exhaustive inventory.

## Interaction rules

- Commands work across views. Task, milestone, and dependency creation must work in Code, Split, Diagram, and Tasks. Changing views never removes Insert.
- Diagram type determines applicable tools independently of workspace view. Gantt, sequence, WBS, and other diagram types expose their respective insertion commands.
- Dependency creation must not require a visible chart selection. Provide predecessor and successor choices, optionally prefilled from the selection.
- Selecting a ribbon category does not change the workspace view, open Tasks, alter the layout, or dismiss an inspector.
- Selection does not automatically switch ribbon categories. Use existing inspectors for selection properties.
- Switching documents immediately updates command targets; commands must never operate on the previous document.
- Disabled actions explain their prerequisites. Preserve collaboration read-only restrictions, export readiness, and selection requirements.
- Keep Plan in a stable position. Explain its applicability to Gantt/WBS for other diagram types rather than shifting navigation.
- Keep document identity and save status visible, including project membership, dirty markers, save errors, and retry actions.
- Calendar, Workload, and linked-diagram commands have one primary ribbon location. Keyboard shortcuts and command-palette access remain available.

## Sizing and accessibility

- Use a compact ribbon with small labelled command groups rather than large tiles.
- Allow the ribbon to collapse to category names; start expanded.
- At smaller widths, document tabs and workspace-view selection may occupy separate rows.
- Collapse ribbon groups into labelled dropdowns rather than allowing unpredictable wrapping.
- Preserve mobile Task list/WBS list behaviour and the Tasks Table/Chart switch.
- Make category tabs keyboard operable, with clear focus and selected states.
- Give command categories, document navigation, and workspace-view controls distinct accessible labels.
- Restore focus to the invoking control when a dialog or inspector closes.

## Implementation sequence

### 1. Inventory commands

Record every existing menu item, toolbar action, shortcut, disabled condition, badge, and dialog target. Include palette-only and context-menu actions. Assign every action a destination and identify intentional shortcuts or secondary entry points.

### 2. Build the ribbon shell

Extract the header and workspace navigation from App into focused components. Connect existing handlers instead of rewriting editing behaviour. Keep ribbon-category state separate from document and workspace-view state.

### 3. Migrate commands

Move File and persistent actions first, followed by Insert, Plan, Edit, and View. Remove duplicated toolbar controls after their replacements work. Preserve counts, connection indicators, and disabled states.

### 4. Preserve document and view navigation

Move document tabs below the ribbon. Preserve close, reorder, context menus, project labels, and unsaved-state behaviour. Retain Tasks explicitly beside Code, Split, and Diagram for Gantt.

### 5. Close cross-view gaps

Verify task and dependency creation in every Gantt view. Add a selection-independent dependency entry point if the existing flow requires one. Reuse existing editing operations and dialogs where possible.

### 6. Finish responsive and keyboard behaviour

Validate expanded and collapsed ribbons, narrow layouts, overflow, focus restoration, and collaboration permissions. Ensure view switching and category switching remain independent.

### 7. Validate regressions and appearance

Run appropriate existing tests and add behavioural coverage for the new navigation and cross-view command access. Inspect all supported diagram types, light/dark themes, multiple documents, desktop and mobile widths, and main editing workflows.

## Acceptance criteria

- Every existing action has a documented destination.
- Tasks remains directly discoverable as a workspace view.
- Task and dependency creation work in all four Gantt views.
- Command categories and their ribbon are adjacent, above document tabs.
- Calendar, Workload, and linked-diagram commands have one primary location.
- Switching categories preserves the document, view, selection, and open editing state.
- Switching documents reliably retargets commands.
- Save status, collaboration status, shortcuts, and document-tab behaviour continue working.
- Read-only users cannot mutate documents through new ribbon entry points.
- Desktop and mobile layouts have no overlapping or clipped controls.
- Keyboard users can reach categories, commands, document tabs, views, and panels, with predictable focus restoration.

## Implementation starting points

- `apps/web/src/App.tsx`: header, Plan and More actions, document tabs, lower toolbar, workspace-view controls, and existing handlers. Inspected layout starts around line 4194; line numbers may change.
- `apps/web/src/FileMenu.tsx`: file operations and export entry points.
- `apps/web/src/AddMenu.tsx`: diagram-specific insertion actions.
- `apps/web/src/ActionMenu.tsx`: existing grouped action menu behaviour.
- `apps/web/src/DiagramOutlineDialog.tsx`: outline search and docking.
- `apps/web/src/ResourceWorkloadPanel.tsx`: workload panel.

Use the repository context graph to trace affected symbols before implementation. This is a navigation and presentation redesign; retain existing document operations and dialogs unless a verified cross-view gap requires a change.

## Implementation and validation

- `Ribbon.tsx` owns category, collapse, responsive command-group and keyboard state; `WorkspaceNavigation` keeps document and workspace-view navigation separate from commands.
- Existing File, insertion, editing, planning and view handlers remain in use. `AddDependencyDialog.tsx` adds predecessor/successor selection through the existing Gantt operation.
- See [the command inventory](ui-ribbon-command-inventory.md) for primary and intentional secondary destinations, prerequisites, shortcuts and focus behaviour.
- Validation: 2,465 unit tests pass; production build and lint pass. All 24 ribbon/Plan browser checks pass across Chromium, Firefox and WebKit. Targeted Chromium checks cover read-only collaboration, short viewports, Tasks table/chart, mobile lists, presentation, tab reordering, panel ownership and the existing diagram-specific creation workflows.
- Screenshots were inspected for all seven diagram types across desktop/mobile widths and light/dark themes. The local Graft graph was rebuilt after implementation.
