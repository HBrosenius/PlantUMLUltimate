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

Possible renames without a stable identity are labelled **Probable** and cannot be selected.
Ambiguous edits, unsupported syntax, and changes to other diagram types are labelled
**Unclassified source change**. They remain visible in the source comparison and are not
eligible for partial semantic acceptance. The UI never infers that an alias change is a rename.

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
