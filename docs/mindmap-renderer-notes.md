# Mindmap renderer notes (slice S0)

Status: findings from the renderer spike described in `docs/mindmap-plan.md`
(section 6, S0). No product code changed.

Engine: `@plantuml/core` 1.2026.6, the same bundle the app and
`scripts/audit-plantuml-renderer.mjs` use. The spike loads `plantuml.js` and
`viz-global.js` in headless Chromium (Playwright) and calls `renderToString`.

## How to reproduce

```sh
node scripts/render-mindmap-fixtures.mjs
npx prettier --write tests/fixtures/mindmap-svg/structure.json
```

- Sources live in `scripts/mindmap-fixture-sources.mjs` (56 sources, named
  `NN-topic`, numbered 01 to 56).
- Output goes to `tests/fixtures/mindmap-svg/`: `<name>.puml`, `<name>.svg`
  (only when the engine returned SVG) and `structure.json`, which records for
  every fixture the status, every `<text>` in document order (text, x, y,
  ancestor chain), the groups and the element counts.
- `structure.json` status is `ok` or `engine-error`. An engine error is still
  returned as an SVG (a "PlantUML version ... [From textarea (line N)] ...
  Syntax Error?" page). The error SVGs contain the engine's "N days old"
  text, so regenerating them changes the day count. That is the only
  non-deterministic content.
- Result of the run: 44 fixtures render and 12 are engine errors (listed below).

## SVG structure (the answer for hit-testing)

1. **There are no stable ids.** A mindmap SVG is one flat `<g>` under `<svg>`.
   No element has an `id`, a class or a `data-*` attribute. The only `data-*`
   attribute in the whole corpus is `data-source-line`, which appears on the
   `<g class="title|header|legend|caption|footer">` wrappers, never on nodes.
   Plan item 3d.4 is therefore answered: **text matching is required.**
2. Element vocabulary: `defs`, `g`, `rect`, `text`, `path`, `circle`.
   A node is, in order, an optional `<rect>` (the box), one or more `<text>`
   elements, and a `<path>` for the connector to its parent. Boxless nodes
   (`**_`) have no `<rect>`. So do not use the rect to find nodes. Use `<text>`.
3. Every `<text>` has `xml:space="preserve"` and `style="white-space: pre"`.
   Label text keeps its whitespace: `** A  ` renders as `"A   "`, and a
   stereotype `Classed <<green>>` renders as `"Classed "` (the stereotype is
   removed, the separating space stays). Trim both sides before comparing.
4. **Multi-line labels (`**:a` ... `b;`)** are one `<text>` per line, emitted
   consecutively, 16 px apart in `y` with the same `x`. This matches the run
   matching the WBS preview does today. Creole list markers at the start of an
   inner line change the text: `* x` renders as `x` (bullet drawn as a shape),
   `# x` renders as two texts `1.` and `x`, and `- x` stays `- x`. Inner lines
   that start with `-`, `+`, `*` or `#` are label text and not nodes. The
   engine agrees (fixture 12).
5. **Creole splits one label into several runs.** `//italic// and --strike--`
   gives `italic`, `and`, `strike` as separate consecutive `<text>` elements
   (the style is in `font-style` or `text-decoration`). The match therefore
   has to concatenate consecutive runs until the text equals the normalised
   label. `<color:red>`, `<b>` and `<i>` behave the same way. `<size:20>` gives
   one run.
6. **Icons and special tokens:** `<&flag> Label` renders as `" Label"` (a
   leading space, and the icon is a `<path>`). `<U+00E9>` is decoded to the
   character. `<img:url>` becomes a placeholder text such as
   `[img TBD42102]` with a random number, so it cannot be matched by text.
   Match on the surrounding label only. `[[url Label]]` renders as the bare
   `Label`. No `<a>` element is emitted.
7. **Width wrapping** (`MaximumWidth` in a `<style>` block) emits one `<text>`
   per word, with space-only `<text>` elements between them. A matcher that
   concatenates runs and collapses whitespace handles it.
8. **Diagram furniture** (`title`, `caption`, `header`, `footer`, `legend`)
   comes out as `<text>` elements in the same stream, but each one is wrapped
   in `<g class="title|header|legend|caption|footer">`, nested inside the top
   `<g>`. Node texts are always direct children of the top `<g>` (the text's
   ancestor chain is exactly `["g"]`). Restrict matching to those, and a node
   labelled "Title" cannot collide with the diagram title. The furniture is
   emitted around the nodes (for example header, title, nodes, legend, caption,
   footer).

## Emission order is not source order (plan 3d.2)

Per root, the engine emits:

1. the root;
2. every right-side node, in source order (pre-order, children directly after
   their parent);
3. every left-side node, in source order (pre-order).

Several roots are emitted one after the other, each with its own right and left
group (fixture 39: `R1, a, b, R2, c, d`).

Examples:

| Fixture                                                      | Source order                             | Emitted order                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `02-arithmetic`                                              | R1, R1a, R2, L1, L1a, L2 (as written)    | Root, Right1, R1a, Right2, Left1, L1a, Left2                                                        |
| `25-mixed-sides` (`**`, `++`, `--` mixed around `left side`) | Star R, Plus R, Minus L, Star again, ... | Root, Star R, Plus R, Star again, Plus after left side, then Minus L, Star L, Minus after left side |
| `05-duplicate-labels` (Branch 3 after `left side`)           | B1 Pros Cons, B2 Pros Cons, B3 Pros Cons | same, because Branch 3 is last and on the left                                                      |

So the "match in document order" rule from plan 3d.2 **works only if the
matcher walks the parsed tree in emission order**: for each root, root, then
right-side nodes, then left-side nodes. A plain source-order walk mislabels
every document in which a left-side node comes before a right-side node in the
source (for example `-- Minus L` followed by `** Star again`).
No vertical or horizontal fallback was needed for any fixture, because with this
order every fixture matches uniquely, duplicates (`Pros`, `Cons`) included.

Direction does not change the emission order:

- `top to bottom direction` (fixtures 07, 26, 42): same order. Right-side nodes
  are placed below the root and left-side nodes above it.
- `right to left direction` (08, 43, 55): same order. All children, including
  those after `left side`, are placed to the left of the root. In fixture 43
  `left side` changes nothing about the side. The two groups only stack in the
  same column.
- `bottom to top direction` (09, 56) is **accepted by the engine with no error
  and renders byte-for-byte like `right to left direction`**
  (`55-rtl-two-level.svg` and `56-btt-two-level.svg` are identical). The plan
  said "not implemented upstream"; the engine silently maps it. The
  recommendation stays: warn and do not offer it, because it does not do what
  its name says.

## Sides and markers (plan 3b)

- `+` after `left side` **stays on the right.** Fixture 04: `++ AfterLeftPlus`
  is on the right, `-- AfterLeftMinus` on the left. Fixture 25 agrees:
  `++ Plus after left side` is on the right. The marker family wins over
  `left side`; `left side` only flips `*` nodes. This confirms the plan's rule
  "left when its family is `-`, or when it uses `*` and comes after `left
side`" and corrects the sentence "`*` or `+`". **A `+` node is always on the
  right.**
- `left side` applies to depth-2 `*` nodes only. Deeper nodes follow their
  depth-2 ancestor (fixtures 03, 28).
- **`left side` is not scoped per root.** Fixture 39: after `left side` in the
  first root, the second root's depth-2 `*` children (`c`, `d`) are also on the
  left. The plan (sections 1a and 5a) says "stored for each root" and "each root
  is scoped separately". The engine's rule is a document-wide switch that stays
  on until the end or until `right side`. The parser should model it as a
  document-order switch, not a per-root one.
- **`right side` works.** It is not documented upstream, but the engine accepts
  it and switches back (fixture 47: `** R1` after `right side` is on the right
  and `** L1` stays on the left; fixture 24 shows it is harmless with no earlier
  `left side`). The plan's "treat as unknown text" would drop a construct that
  round-trips. Recommend recognising it as the inverse switch (S2 decision).
- `+- Bad` (mixed marker) is accepted by the engine and rendered as a left-side
  node (fixture 41). The existing `mixed-marker` error is stricter than the
  engine, which is fine.
- **Multi-line labels with arithmetic markers are an engine syntax error.**
  `++:r multi`/`line;` and `--:l multi`/`line;` fail (fixtures 44, 52, 53),
  whether the root uses `+` or `*`. Only the OrgMode form `**:` is valid. A
  multi-line node that needs to be on the left must use `**:` after `left side`
  (fixture 40 renders). Consequences for the operations: `setMindmapNodeSide`
  and `update-node` must not convert a multi-line node to `+`/`-` markers. They
  must keep `*` and use the `left side` form, or refuse. Add this to the plan's
  3b step 1.

## Markdown forms (plan 1b, Q: indentation or repeated `*`)

- **`#` headers** work: `# Root`, `## Child`, `### Grand` (fixture 18).
- **Indented `*` lists work, and the depth comes from relative indentation,
  not from a fixed width.** Nesting is stack-based: a more indented line is a
  child of the previous item, and a dedent must return to an indentation that
  is already on the stack.
  - 1 space per level (fixture 19), 2 spaces (48), 4 spaces (49) and tabs (32)
    all render the same tree.
  - A jump of several spaces is a single level (fixture 54: `    * Deep at
once` under `* Root` is depth 2).
  - Dedenting to an indentation that was never used is a hard error, "Bad
    indentation" (fixture 31: 0, 4, 2).
  - An indented `*` after a `**` node is a child of it (fixture 46, 51), but a
    second indented level after a `**` node fails (fixture 50). Mixing the two
    forms is fragile in the engine, so the parser should not try to be cleverer
    than the engine here.
  - So the answer to "indentation or repeated `*`" is: **indentation (stack
    based), with `*` as the bullet.**
- **`-` lists are not valid.** `" - Child"` and `"  - Grand"` are engine
  syntax errors (fixtures 21, 38). Only `*` is a bullet. A `-` line is the
  arithmetic left-side marker.
- Mixing `#` headers with indented `*` lists is an engine error (fixture 33).
  `# Root` followed by a column-0 `* Child` renders `Child` as a second root
  (fixture 29).

So the plan's Markdown "list form" is: `*` bullets with stack-based
indentation. GFM `-` lists do not exist as mindmap input.

## Other constructs

| Construct                                                        | Result                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Several roots (13, 39)                                           | Rendered as separate trees stacked vertically, each with its own right and left group.          |
| `title`, `caption`, `header`, `footer`, `legend`                 | Render (fixture 14), outside the node set, see "SVG structure" item 8.                          |
| `<style>` with `.myStyle *` (37), `:depth(1)` (36) or `- {` (35) | Render with no extra nodes: the engine does not treat these body lines as nodes.                |
| `<style>` body line `* {` (34, 15)                               | **Engine crash** (`IllegalStateException: STAR[*]`). The engine parses the rule line as a node. |
| `skinparam` and `MaximumWidth` (22)                              | Render. `MaximumWidth` wraps (item 7).                                                          |
| Arrow and alias lines `A (a)`, `a -> b` (23)                     | Engine syntax error. Matches the plan's "unknown + warning".                                    |
| Colours `*[#Orange]`, `**[#lightgreen]` (10)                     | Render. The colour is in the `<rect fill>`, not in any attribute that identifies the node.      |
| Boxless `**_`, `--_` (11)                                        | Render with no `<rect>`.                                                                        |
| CRLF source (30)                                                 | Renders normally, because the app splits lines before calling `renderToString`.                 |
| Blank lines between nodes (45)                                   | Ignored.                                                                                        |

Engine errors (12 fixtures, `status: "engine-error"`): 15 and 34 (the `* {` style
rule), 20, 31, 33 and 50 (indentation and `#` mixing), 21 and 38 (`-` lists), 23
(arrow), 44, 52 and 53 (arithmetic multi-line). These are intentional probes.

## Answers to the plan's open technical questions

1. **Hit-testing: stable ids?** No. Use text matching, restricted to `<text>`
   elements whose only ancestor besides `<svg>` is the top `<g>`. Walk the
   parsed tree in emission order (root, right side pre-order, left side
   pre-order, per root). Concatenate consecutive runs until they equal the
   normalised label. Trim whitespace, strip stereotype, icon and Creole markup,
   decode `<U+…>`, and collapse whitespace for wrapped labels. Multi-line
   labels consume one run per line. No geometric fallback was needed.
2. **Markdown indent:** stack-based relative indentation with `*` bullets;
   `-` lists are invalid.
3. **`+` after `left side`:** stays on the right. `left side` flips only `*`
   nodes, and it is document-wide, not per root. `right side` is a valid inverse.

## Impact on the plan (to apply in S2 and later)

- 1a / 2d / 5a: model `left side` (and `right side`) as a document-order
  switch, not a per-root offset.
- 1c: `right side` is valid. Parse it as the inverse switch.
- 3b: reword to "`*` after `left side`" (a `+` node never moves). Add that a
  multi-line node cannot carry `+`/`-` markers.
- 3d: the hook needs a mindmap emission-order function next to the WBS
  document-order one. The node walk order is a per-dialect option of
  `use-tree-node-hit-targets.ts`.
- 4: `bottom to top direction` warning text can say it is rendered like
  `right to left direction`.
- R2: the `* {` style rule crashes the engine itself. The parser fix is still
  required (it keeps the outline sane), and a diagnostic for a `*` rule inside
  `<style>` would help users.
