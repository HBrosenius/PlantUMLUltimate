# C4 SVG ids: spike C0 result

Status: done 2026-11-25. Spike for slice C0 of the [C4 editing plan](c4-editing-plan.md) (section 5, decision 2). Branch `spike/c4-svg-ids`.

**Verdict: the aliases are in the SVG, for every element, boundary and node.** Relationships carry both endpoint aliases (through entity ids) and a stable source-order number. No fallback is needed. C2 can follow the use case preview, with three details to handle (below): link order, reversed `Rel_U`/`Rel_L`, and shapes that come from a custom procedure.

## How this was measured

- The five starters from `apps/web/src/c4-starters.ts` and ten more samples (the macro families, nested boundaries, relationships of every direction, and the edge cases) were rendered through the app itself: a Playwright run on the dev server, new C4 tab, source typed into the editor, SVG read from `.c4-preview svg` after "Preview current". That is the real pipeline: include expansion in `render/includes.ts`, `@plantuml/core` in the render worker, Graphviz layout, no Java and no server.
- The result is the SVG the preview shows. The same SVG was checked after `sanitizeSvg` (DOMPurify): the attributes survive.
- Real captures are saved in `tests/fixtures/c4-svg/` (`*.svg` with the source `*.puml` next to each) and used by the unit tests.

## What the engine writes

```xml
<g data-source-line="2481" id="ent0003" data-qualified-name="shop.web" class="entity"> <rect/> <text/>... </g>
<g data-source-line="1698" id="ent0002" data-qualified-name="shop"     class="cluster"> <rect/> <text/>... </g>
<g data-link-type="dependency" data-source-line="1809" id="lnk7"
   data-entity-1="ent0001" data-entity-2="ent0003" class="link"> <path/> <polygon/> <text/>... </g>
<g data-source-line="2518" class="title"> ... </g>      <g data-source-line="1583" class="legend"> ... </g>
```

- There are no comments, no `<title>`, no `<a>` and no other `data-*` attributes.
- `data-qualified-name` is the PlantUML qualified name. The C4 library passes the macro's alias through (`rectangle ... as $alias`), so the **last segment is the source alias** and the earlier segments are the aliases of the enclosing boundaries and nodes, outermost first (`ent.sb.cb.k1`).
- `data-source-line` is a line of the _expanded_ source, and for library shapes it is the line of the macro body (every `Container` is 2481, every `Rel` 1809). It tells the macro, not the instance, and not a line of the user's file. It must not be used for the mapping.
- Entity ids (`ent0001`...) are numbered in creation order, links (`lnk5`...) continue the same counter.

## Shape kinds

| Shape                                                                            | How it is identified                                                                                                                  | Alias in the SVG?                           | Reliable?                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Element: `Person`, `System`, `Container`, `Component` (all rect)                 | `g.entity`, `data-qualified-name`                                                                                                     | Yes, last path segment                      | Yes                                         |
| `_Ext` variants (`Person_Ext`, `System_Ext`, ...)                                | Same. Only the stereotype text and fill differ («external_system»)                                                                    | Yes                                         | Yes                                         |
| `Db` and `Queue` variants (`SystemDb`, `ContainerQueue`, `ComponentDb_Ext`, ...) | Same `g.entity`. Shapes are two `path`s instead of a `rect`                                                                           | Yes                                         | Yes                                         |
| `System_Boundary`, `Container_Boundary`, `Enterprise_Boundary`, `Boundary`       | `g.cluster`, `data-qualified-name`. A rect and the title text sit in the group; its children are siblings of the group, not inside it | Yes                                         | Yes                                         |
| `Deployment_Node` (also nested)                                                  | `g.cluster`, same as boundaries. The text shows «node»                                                                                | Yes                                         | Yes                                         |
| Parent chain of any element or boundary                                          | The leading segments of `data-qualified-name`                                                                                         | Yes                                         | Yes, to any depth tried (3)                 |
| Relationship: `Rel`, `BiRel`, `Rel_Back`, `Rel_U/D/L/R`                          | `g.link` with `data-entity-1` and `data-entity-2` (entity ids; look up the entity group to get the alias)                             | Yes, both endpoints, through the entity ids | Yes, with the two caveats below             |
| Relationship label and technology                                                | `text` elements inside the link group, one per word; the technology is appended as `[T]`; `\n` becomes separate lines                 | Not needed: the group is the relationship   | Yes for the group; do not match on the text |
| Two relationships between the same pair                                          | Distinct `g.link` groups with ids `lnkN`. N grows in source order, so the Nth link of the pair is the Nth `Rel` of the pair           | n/a                                         | Yes                                         |
| Hidden layout links (the extra `Lay_*` link a `Rel_U` or `Rel_L` adds)           | Not in the SVG (inferred: the ids `lnk9`, `lnk12` are skipped)                                                                        | n/a                                         | Yes, nothing to filter                      |
| Title                                                                            | `g.title`, no id                                                                                                                      | n/a                                         | Yes (not editable on the canvas)            |
| Legend (`SHOW_LEGEND()`, `LAYOUT_WITH_LEGEND()`)                                 | `g.legend`, no id                                                                                                                     | n/a                                         | Yes                                         |
| Person sprite (when on, see below)                                               | An extra `<image>` child inside the same `g.entity`                                                                                   | Yes                                         | Yes                                         |
| Element declared by a custom `!procedure`                                        | Same `g.entity` with the alias that was passed in                                                                                     | Yes                                         | Yes in the SVG, but `parseC4` cannot see it |

### The two relationship caveats

1. **Document order is not source order.** In the Dynamic starter the SVG lists the links as `lnk5, lnk6, lnk8, lnk7`: the 4th call comes before the 3rd. Sort by the number in the id to get the source order.
2. **`Rel_U` and `Rel_L` (and `BiRel_U/L`, `Rel_Up/Left`) are stored reversed.** `Rel_U(b, c)` is drawn as entity-1 `c`, entity-2 `b`; `Rel_D`, `Rel_R`, `Rel_Back` and `BiRel` keep the call order. Match endpoints as an unordered pair, then pick the Nth match of the pair in source order. The arrowheads still point the right way, so nothing visible changes. C2's "reverse a relationship" and "change direction" operations must use the source macro, never the drawn order.

## Edge cases

| Case                                                                                                      | Result                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aliases `my_Svc_2`, `A1b`, `CamelCase`, `x9`                                                              | Kept exactly, case included. The entity ids are `ent000N`, so the alias is only in `data-qualified-name`.                                                                                                                                                                                        |
| Element two boundaries deep (and three: `Enterprise_Boundary` > `System_Boundary` > `Container_Boundary`) | `ent.sb.cb.k1`. A node inside a node: `n1.n2.c1`.                                                                                                                                                                                                                                                |
| Element declared in a custom `!procedure` (`Svc(procA, "...")`)                                           | Drawn with `data-qualified-name="procA"`, relationships to it resolve. `parseC4` ignores the call, so C2 can select it and show it, but has no source line to edit. This matches decision 2 (custom procedures are selectable, not editable).                                                    |
| Labels with `\n`                                                                                          | Fine. Each line is its own `text`; the group and alias are unaffected. Matching on label text would break here (the words are separate `text` nodes and the lines are concatenated).                                                                                                             |
| Labels with `'` quotes                                                                                    | Fine.                                                                                                                                                                                                                                                                                            |
| Labels with `\"` (escaped double quote) inside a macro call                                               | **The diagram does not render at all.** The library's unquoted procedures fail with "unquoted function/procedure cannot use expression", and the whole picture is the engine's error picture. This is not an id problem, but C1/C2 must never write `\"` into a label (reject it, or offer `'`). |
| `!theme cerulean`                                                                                         | Rendered; ids, classes and attributes are the same.                                                                                                                                                                                                                                              |
| Legend with tags (`AddElementTag`, `$tags`, `SHOW_LEGEND()`)                                              | A `g.legend` group without ids; the tagged element keeps its id.                                                                                                                                                                                                                                 |
| Sanitiser (DOMPurify, as used by export and snapshot)                                                     | `id`, `class` and every `data-*` attribute survive. Unit-tested on every fixture.                                                                                                                                                                                                                |

## The person sprite, before and after

- **On main** the default person sprite is off: the person is a plain `<rect>` plus text, like every other element.
- **With `921c0e7` cherry-picked** (applied with `--no-commit`, rendered, then reset; it is not in the commits of this branch): the same `g.entity` with the same `id` and `data-qualified-name`, one extra `<image>` child (`href` is a data URI), and the rect is taller (134.69 instead of 83). The `<g ...>` tags of all fifteen samples were compared before and after: they are identical. Only the geometry and the added `<image>` differ.
- **Consequence:** the sprite does not affect the mapping. A click that lands on the `<image>` resolves through `closest("g.entity")`. The unit test uses a capture with the sprite on (the data URI shortened to a few bytes).

## Chosen approach for C2: direct ids

Use the SVG's own markup, as the use case preview does. No hidden marker, no matching by label or position, no change to the library text. The function is `apps/web/src/c4-rendered-ids.ts`:

- `c4RenderedTarget(node)` returns `{ kind: "element" | "boundary", alias, path }`, `{ kind: "relationship", from, to, index, pairIndex }`, or `title` / `legend`, for any node inside a shape.
- `c4RenderedShapes(root)` lists all shapes of a rendered diagram, for building hit areas.
- `c4SourceRelationship(target, relationships)` finds the `parseC4` relationship of a drawn link (unordered pair, then the `pairIndex`-th in source order).

Why not the fallbacks:

- **Matching by label and position** breaks on duplicate labels, on `\n` labels, and when a label is edited. It would also duplicate the layout knowledge that the engine already gives for free.
- **A hidden marker** (`$link` or a stereotype) would change the rendered or exported diagram unless it is stripped again, and the include loader must then rewrite the library. The alias is already there.

The function lives in `apps/web` for now because it reads the DOM. In C1 the parser moves to `packages/diagram-c4`; this file can stay in the app next to the preview (it depends on the preview's markup, like `normalizeRenderedId`) and only change its import of `C4Relationship`.

## Open risks

- **Engine upgrade.** The ids are an engine behaviour (`@plantuml/core` 1.2026.6 here, which writes `data-qualified-name` and `data-entity-1/2`), not a documented API. The fixtures in `tests/fixtures/c4-svg/` are a regression guard, and the e2e test renders for real; an engine bump that changes the markup fails them. Re-capture the fixtures after each bump (the spec used for the capture is described in "How to refresh").
- **Aliases that contain a dot.** The path is split on `.`. C4 aliases are normal identifiers, so this does not occur in practice, and `parseC4` also treats the alias as one token, but a dotted alias would be misread. C1 should reject dots in alias syntax (it already validates alias syntax, section 3).
- **Link order relies on the `lnkN` counter.** It follows the order in which the engine reads the macro calls. It held for every sample (Dynamic included). It would differ for a relationship declared inside a procedure or an `!include`d file, since `parseC4` does not see those either. In that case the pair match can be off by one. Mitigation: C2 should check that the number of drawn links equals `parseC4(source).relationships.length` and otherwise only offer selection, not edits.
- **`Lay_*`, `Rel_Neighbor`, `RelIndex`/C4 Dynamic variants and `Rel` to the same element (self link)** were not exercised individually. The Dynamic starter (which uses `Rel` inside a Dynamic include) works. Add these to the fixtures when C2 reaches them.
- **Elements and relationships in `!if` branches, loops and `!include`d files** exist in the SVG, but `parseC4` does not know them. The plan already says edits there are refused (section 3).
- **Sizes.** Resolving a link scans all links and entities. That is fine for the diagrams tried (up to 18 elements); for a big diagram C2 should build the lookup once per render instead of per click (`c4RenderedShapes`).

## Gate for C2

C2 may start from this result when these hold. They are all already true in this branch except the last, which is a C2 task:

1. Every element, boundary and relationship of the five starters maps to its `parseC4` source item (unit test, fixtures from the real renderer; the Container starter also has an e2e test).
2. The mapping is unchanged with the person sprite on (checked above; add a Container-starter run with the sprite to the e2e suite when I7a lands).
3. The e2e test clicks a real shape and gets its alias (Chromium, Firefox, WebKit).
4. **C2 must:** build the lookup once per render, sort links by `lnkN`, match relationship endpoints as an unordered pair, refuse relationship edits when the drawn-link count differs from `parseC4`'s, and treat shapes whose alias is not in `parseC4` (procedures, `!if`) as select-only.

## How to refresh the fixtures

The captures were made with a throw-away Playwright spec that opens a new C4 tab on the dev server, types each sample into the editor, waits for "Preview current" and writes `.c4-preview svg` `outerHTML` to a file next to its source. The spec is not kept; the samples are the `.puml` files beside each fixture. A future refresh can use the same approach with the new engine.

## Changes that the plan needs

- **C1:** reject `\"` in labels (the library cannot render it) and dots in aliases; the model should expose, per relationship, its index among the document's relationships, since the pair match uses it.
- **C2:** the canvas layer follows the use case preview, reading `c4RenderedShapes` once per render. Relationship selection must go through `c4SourceRelationship`. No fallback work item is needed.
- **C0 row:** done. Gate met.
