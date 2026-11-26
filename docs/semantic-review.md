# Semantic review

PlantUML Ultimate can review a saved document version against the current working copy from
**File → Version history**. Sequence and Gantt diagrams receive a conservative semantic change list;
the source and rendered comparisons remain available as fallbacks.

Use **Import comparison…** to review a local `.puml` or `.plantuml` file without opening it over the
working document. When no checkpoint exists, the imported file is compared with the current working
copy. The import remains in memory only, is limited to 5 MB, and must contain the same recognized
diagram type as the working document. No editor content changes until confirmed groups are applied.

Use **Import base…** as well to compare two local files explicitly. Applying a selection is disabled
when the imported base differs from the working copy, preventing an unrelated document from being
partially replaced. Patch and report export remain available for these read-only comparisons.

## Supported first slice

The review layer classifies these Sequence changes when their identity is unambiguous:

- participant label changes with an unchanged alias;
- participant property changes with an unchanged label;
- message changes with unchanged endpoints;
- added participant declarations and messages; and
- removed messages.

Adjacent participant and message modifications are confirmed as one compound transaction only when
every participant retains a stable alias or label and every message retains its endpoints. If any
identity is ambiguous, the whole contiguous edit remains unclassified and cannot be partially applied.

Gantt review recognizes task duration, explicit start-date, property, addition, and
stable-alias rename changes. It also recognizes dependency additions, removals, and modifications.
When creating a dependency replaces an explicit task start elsewhere in the source, both regions are
grouped into one atomic dependency transaction if no unrelated change lies between them.

Each contiguous source change is one transaction. Confirmed transactions can be selected
independently and applied to the saved version. Application uses the normal source validation
and undo history, and first records a durable recovery checkpoint.

Use **Show in source** on any semantic group to reveal and highlight its exact base and proposed
lines. **Previous group** and **Next group** navigate between complete transactions, including
probable and unclassified changes that cannot be applied selectively.

Use **Show in diagram** to render both versions and highlight the recognized participant, message,
task, or dependency on the side where it exists. Added and removed objects therefore appear on only
one side. When rendered geometry cannot be matched conservatively, the exact source lines remain
the fallback. Diagram highlighting preserves each pane's zoom and scroll controls.

In **Rendered** view, use the mouse wheel over either diagram to zoom around the pointer. Each pane
keeps an independent zoom level; select its percentage button to reset it to 100%. Middle-button
dragging pans a zoomed diagram.

Possible renames without a stable identity are labelled **Probable** and cannot be selected.
Ambiguous edits, unsupported syntax, and changes to other diagram types are labelled
**Unclassified source change**. They remain visible in the source comparison and are not
eligible for partial semantic acceptance. The UI never infers that an alias change is a rename.

## C4 diagrams

C4 diagrams are compared by alias, not by line. Both sources are read with `parseC4`, and every difference is a change that knows which source lines it touches; each contiguous source change then takes the title of the changes in it.

- **Elements, boundaries and deployment nodes:** added, removed, and changed (label, technology or type, description, macro such as `Container` to `ContainerDb`, tags, link, sprite, moved into or out of a boundary).
- **Renamed aliases** are shown as ``Rename `api` → `orders_api` ``, with the references that followed. An alias counts as renamed only when the pairing is unique and either the macro and label are unchanged and no relationship contradicts it, or every relationship of the old alias reappears unchanged on the new one. Otherwise the review shows a removal and an addition.
- **Relationships** are matched by their two ends (read through the renames), then by label within a pair, never by position. They are reported as added, removed, re-pointed (one end changed, same label, unique candidate), reversed, direction changed (`Rel` to `Rel_R`), macro changed (`Rel` to `BiRel`), or label, technology, description, tags, link or sprite changed.
- **Layout and legend** macros, layout hints (`Lay_R`), tag styles and C4 `!include` lines.

A change that spans several source regions (a rename, a move into a boundary) is shown once per region, as `(part 1)`, `(part 2)`, and is **Probable**: it cannot be selected part by part, only applied with the whole change. The same applies to changes inside `!if`, procedures and loops, since whether they are drawn depends on the preprocessor. Anything else in the changed lines (a title, a skinparam, a directive) is an unclassified source change. When either side has no C4 elements or relationships, the review is the line review.

## Exports

- **Export selected patch** writes a standard whole-file unified patch for the selected groups.
- **Export review report** writes a standalone local HTML summary with the complete proposed
  source patch.

Neither export uploads source or requires an account. The original PlantUML remains
authoritative.

## Reliability boundaries

Large changed regions use a bounded coarse line diff instead of allocating an unbounded
quadratic comparison matrix. If semantic parsing is unavailable or exceeds parser limits, the
review falls back to an unclassified raw-source change. Rendered comparison SVG is sanitized at
the insertion boundary, and a timed-out renderer frame is recreated before later work proceeds.
