# C4 editing: the same feature set as the other diagram types — plan

Status: proposed 2026-11-25; decisions in [section 7](#7-decisions-to-confirm) are open. Nothing is implemented. Builds on [B7 includes and C4](includes-c4-plan.md) (I0–I4, merged in #168) and the [sprite spike](sprites-spike.md) (branch `spike/i7-sprites`, not merged).

This plan replaces B7's slices **I5** (C4 semantic review) and **I6** (C4 visual editing). B7 decision 4 said I6 should wait until the C4 kind was in use; that decision is reversed here, because C4 should match the other diagram types.

## 0. Why

C4 renders, and has starters, examples, an outline, help, macro completion and a few diagnostics. But it is the only diagram type that can only be edited as text. Every other type can also be edited without code: on the canvas, from the Insert ribbon, and in the properties panel. A user who switches from a component diagram to a C4 diagram loses most of the editor.

**Goal:** everything a user can do with a use case, class or component diagram, they can do with a C4 diagram. Every edit is a minimal edit of the macro call in the source, like the other types.

## 1. What exists

- **Kind and detection** (`diagram-kind.ts`, `c4-source.ts` `isC4Source`). The kind is set when a diagram is created or opened.
- **Parser** (`apps/web/src/c4-source.ts` `parseC4`): elements (alias, label, technology, description, macro, boundary parent, line) and relationships (from, to, label, technology, macro, line). It also holds the macro table used by completion and help (`c4Macro`).
- **Outline** (`c4-outline.ts`): a tree of people, systems, containers, components, boundaries and nodes, plus relationships. Selecting an item reveals its source line, but nothing is highlighted on the canvas.
- **Preview** (`C4DiagramPreview.tsx`): render, zoom and retry only. You can't select or drag anything.
- **Diagnostics** (`diagram-diagnostics.ts`): a missing C4 include, an unclosed boundary, an undeclared alias.
- **Symbols** (`semantic-symbol-provider.ts` `collectOccurrences`): finds where an alias is used, but has no rename.
- **The pattern to follow:** each other type has a package `packages/diagram-<type>`, with `model.ts`, `parser.ts`, `operations.ts` (source edits) and `symbols.ts`. The app wires each package up with:
  - a controller and actions in `features/<type>/`;
  - dialogs and inspectors;
  - an interactive preview (`UseCaseDiagramPreview.tsx`);
  - entries in the stage dock, command palette, bulk operations and diagnostics.

## 2. What is missing

Compared with use case diagrams, which are about the same size:

| Area                                         | Other types                                                                                                                 | C4 today                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Canvas                                       | Select by click or keyboard, rename on the canvas, drag to create or reconnect a relationship, move into a package, reorder | Picture only                                         |
| Insert ribbon and Add dialogs                | Element, relationship, package or boundary, note                                                                            | A hint to use Ctrl+Space                             |
| Properties panel                             | Element, relationship, package, note and diagram settings                                                                   | None                                                 |
| Stage view                                   | Yes                                                                                                                         | No                                                   |
| Rename and references                        | Rename everywhere, with checks; inline label rename                                                                         | Finds where an alias is used, but has no rename      |
| Bulk operations                              | Copy or change several selected items                                                                                       | None                                                 |
| Diagnostics                                  | Quote, brace and statement checks                                                                                           | Missing include, unclosed boundary, undeclared alias |
| AI edit checks                               | Generated source must keep the diagram's syntax                                                                             | Not checked                                          |
| Semantic review (history, AI edits, Propose) | Class, component, sequence and Gantt group their changes                                                                    | Line diff                                            |
| Smaller places                               | Command palette entries, workspace hint, navigator filter, focus restoration, display names                                 | Missing                                              |

## 3. The source edit model (C1)

A new package `packages/diagram-c4`, shaped like `diagram-usecase`:

- **`parser.ts` and `model.ts`:** `parseC4` and its types move here from `apps/web/src/c4-source.ts`, and the app re-exports them. The macro table stays shared with completion and help. The model gains what editing needs:
  - **For each element and relationship:** the span of each argument, and named arguments (`$tags=`, `$link=`, `$sprite=`).
  - **For boundaries:** their open and close lines.
  - **The diagram's settings:** layout and legend macros (`LAYOUT_TOP_DOWN()`, `LAYOUT_WITH_LEGEND()`, `SHOW_LEGEND()`, `Lay_R(a, b)`) and tag definitions (`AddElementTag`, `AddRelTag`).
- **`operations.ts`:** pure functions that take the source and return the edited source plus the selection:
  - add an element (each macro and its `_Ext` and `Db`/`Queue` variants), inside a boundary or at the top level;
  - add a relationship (`Rel`, `BiRel`, `Rel_U/D/L/R`, `Rel_Back`);
  - add a boundary (`System_Boundary`, `Container_Boundary`, `Enterprise_Boundary`, `Boundary`, `Deployment_Node`);
  - update one argument, keeping the others and their quoting exactly;
  - change an element's macro, for example `Container` to `ContainerDb` or `System` to `System_Ext`;
  - remove an element together with its relationships, or keep them, as the other types do;
  - remove a relationship;
  - move an element into or out of a boundary, and reorder;
  - reverse a relationship or change its direction (`Rel` to `Rel_R`);
  - rename an alias in every reference, including `Lay_*` and relationships;
  - set layout and legend options.
- **`symbols.ts`:** aliases as symbols, for rename, find references and validation (alias syntax, duplicate aliases).
- **Rules:**
  - Every edit touches only the lines it must.
  - Unknown macros, preprocessor lines and comments are left as they are.
  - An edit that can't be made safely, for example inside an `!if` or a procedure, is refused with a message, as the other types do.

## 4. Editing without code (C2)

- **Insert ribbon and Add dialogs:**
  - Add a person, system, container, component, boundary, deployment node, relationship or note.
  - Each dialog offers the fields of its macro (label, technology, description, external, database or queue) and where to put it (top level or a boundary).
  - The Insert ribbon section replaces today's Ctrl+Space hint.
- **Properties panel:**
  - Element: macro type, label, technology, description, tags, link, sprite.
  - Relationship: from, to, label, technology, direction, tags.
  - Boundary: type, label, tags.
  - Diagram settings: layout, legend, tag definitions.
  - Every field is a C1 operation.
- **Canvas:**
  - Selecting a shape selects it in the outline and the properties panel, and the reverse; keyboard selection works too.
  - Rename on the canvas.
  - Drag between two elements to add a relationship, and drag a relationship's end to reconnect it.
  - Drag an element into or out of a boundary.
  - The outline highlights the selected shape.
- **Stage view:** C4 joins the stage dock like the other types.
- **Depends on C0:** canvas selection needs each drawn shape to point back to its alias (section 5).

## 5. The one unknown (C0 spike)

Selecting and dragging on the canvas depend on finding which source element a drawn shape belongs to. The other types use the ids and entity names the engine writes into the SVG (`normalizeRenderedId` in `UseCaseDiagramPreview.tsx`).

C4 elements are drawn by library macros that expand to `rectangle`, `person`, `database`, `queue` and so on, with the alias passed through. The SVG probably keeps the alias as the entity id, but that hasn't been checked. It also hasn't been checked for:

- boundaries, which become packages or rectangles;
- relationships, which become links;
- shapes in a `!procedure`.

The spike renders the five starters and records, for each kind of shape, what identifies it in the SVG. It also checks this with the person sprite turned on, since I7a changes the person shape.

**Outcome:** either "aliases are in the SVG" (C2 follows the use case preview), or a fallback (match by label and position, or add a hidden marker when the library loads). In both cases it also gives the gate for C2.

## 6. Slices

Effort for one developer: **S ≈ days, M ≈ 1–3 weeks, L ≈ 3+ weeks.**

| Slice                        | Delivers                                                                                                                                                                                                       | Effort | Gate                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| **C0. Spike**                | How each C4 shape is identified in the SVG; the fallback if needed.                                                                                                                                            | S      | Every element, boundary and relationship of the five starters maps to its source line.                        |
| **C1. Source edits**         | `packages/diagram-c4`: parser, model, operations and symbols, with unit tests.                                                                                                                                 | M      | Each operation's fixture edits touch only the expected lines; real C4 samples round-trip unchanged.           |
| **C2. Editing without code** | Insert ribbon and dialogs, properties panel, canvas selection and highlighting, rename on the canvas, drag to connect, reconnect and move, Stage view.                                                         | M–L    | A new user builds the Container starter's diagram without typing source; e2e tests run on all three browsers. |
| **C3. Editor parity**        | Rename and find references, inline label rename, bulk operations, quote, brace and statement diagnostics, AI edit checks, command palette, workspace hint, navigator filter, focus restoration, display names. | M      | Every row of the section 2 table is covered; the existing coverage specs include C4.                          |
| **C4. Semantic review**      | Elements and relationships added, removed, renamed, re-pointed or changed, in version history, AI edits and the Propose description (the old I5).                                                              | M      | Known fixture edits give the expected review groups.                                                          |

**Order:**

1. C0, then C1.
2. Then C2 and C3, in parallel if two people or agents are working. They touch different files, apart from the wiring in `App.tsx`.
3. Then C4.
4. I7a (sprites, which brings back the person icon) can land any time. Before C2 is better, so the canvas shows people as they will look.

## 7. Decisions to confirm

1. **A package of its own.** The C4 parser and edits move to `packages/diagram-c4`, like the other types, rather than staying in `apps/web`. _Recommended:_ it keeps the pattern and makes C1 testable on its own.
2. **Which macros are editable.** C2 edits the common macros: Person, System, Container, Component, their `_Ext`, `Db` and `Queue` variants, the boundaries, `Deployment_Node`, and `Rel` with its variants. Other macros, such as dynamic `RelIndex` and C4 sequence, and custom procedures can be selected and opened in the source, but not edited in forms. _Recommended:_ this covers almost every real C4 diagram, and the list can grow later.
3. **Layout hints.** Dragging on the canvas does not write `Lay_*` hints or change relationship directions to move shapes. Layout stays the engine's, as for the other Graphviz-based types. _Recommended:_ yes. Layout hints can be a later, explicit command.
4. **Land I7a before C2.** _Recommended:_ yes, so people show with their icon while the canvas is built.
5. **This replaces B7's I5 and I6**, and reverses B7 decision 4 (C4 visual editing waits). _Recommended:_ yes. `includes-c4-plan.md` gets a pointer here.

## 8. Out of scope

- A C4 model shared across several diagrams, Structurizr DSL, or generating one C4 level from another (connected diagrams may cover this later).
- Editing inside the C4 library itself, or editing custom procedures in forms.
- Automatic layout beyond what the engine does.

## 9. How to know it works

- Each of the five C4 starters can be rebuilt from an empty C4 diagram using only the ribbon, dialogs, canvas and properties panel.
- Real C4 samples from the C4-PlantUML repository open, and every element in them can be selected on the canvas.
- Every edit in the e2e tests changes only the expected lines; undo restores the exact source.
- The coverage specs that loop over diagram types (command coverage, starter examples, outline navigation) include C4 and pass on Chromium, Firefox and WebKit.
