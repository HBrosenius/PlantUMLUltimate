# A30 — Inline editing coverage

The inventory confirmed that direct manipulation already exists across the diagram families. The implemented gap is direct label editing for Class, Component, Use Case and Activity. Existing conversion, connection and reorder operations remain in place.

| Family    | Existing manipulation                                                               | Label editing delivered in A30                                        |
| --------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Gantt     | Task schedule move/resize, dependency connections, batch task table                 | Existing table and properties retained                                |
| Sequence  | Participant/timeline reorder, message creation/reconnection, structure movement     | Existing inspector and semantic rename retained                       |
| Use Case  | Connect/reconnect, container moves, reorder; C/Enter and Alt+arrows                 | Actor, use-case and container labels                                  |
| Class     | Move handles, connection anchors/reconnection, container moves and keyboard reorder | Entity and container labels; member editing retained in the inspector |
| Component | Body drag to move/connect, anchors, containers and keyboard operations              | Component and container labels                                        |
| Activity  | Flow reorder, transition handles, note attachment and Alt+arrows                    | Action labels and partition labels via the container tray             |
| WBS       | Hierarchy movement, relationship creation/reconnection                              | Existing inspector and semantic rename retained                       |

## Interaction rules

Focus a supported object and press F2, or select it and choose Rename label in the preview toolbar. The field opens beside the label or its container-tray control. Enter/Apply submits through the existing semantic rename and source-history paths; Escape, Cancel or an outside pointer cancels. Escape leaves the inspector open. Canvas wheel movement cancels the field so it cannot remain attached to an obsolete screen position. Single click and double click retain their existing behavior.

Explicit aliases remain unchanged when editing labels. Unaliased names update semantic references. Duplicate rendered labels are refused when the target cannot be identified uniquely; source-level rename remains available. Notes, relationship text, Class members and Activity control conditions retain their existing editing controls. Source changes, tab changes, multi-selection and viewer permissions prevent a stale inline draft from being applied.

The inspected desktop and 390 × 844 screenshots show the field, validation area and Cancel/Apply controls within the viewport. No additional connect/reorder implementation was needed after inventory.

## Validation

- 212 unit files / 2,263 tests passed, including label-vs-alias selection, semantic references, container/actor labels, duplicate-label refusal, validation, stale drafts and cancellation.
- 33 browser checks passed across Chromium, Firefox and WebKit for inline edits and existing inspector behavior.
- Production build, changed-file ESLint/Prettier and whitespace checks passed; Graft index refreshed.

The tests exposed an Escape ordering issue, now fixed by registering the inline editor with the shared overlay guard. An initial Activity selector addressed an SVG text node instead of its focusable hit target; the keyboard test now uses the focusable target. A partition-tray check dismisses the existing editing hint before clicking its covered control.
