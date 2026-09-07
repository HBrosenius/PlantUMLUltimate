# Semantic review

PlantUML Ultimate can review a saved document version against the current working copy from
**File → Version history**. Sequence diagrams receive a conservative semantic change list;
the source and rendered comparisons remain available as fallbacks.

## Supported first slice

The review layer classifies these Sequence changes when their identity is unambiguous:

- participant label changes with an unchanged alias;
- participant property changes with an unchanged label;
- message changes with unchanged endpoints;
- added participant declarations and messages; and
- removed messages.

Each contiguous source change is one transaction. Confirmed transactions can be selected
independently and applied to the saved version. Application uses the normal source validation
and undo history, and first records a durable recovery checkpoint.

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
