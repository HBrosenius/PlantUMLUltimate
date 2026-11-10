# Mindmap diagram support — plan

Status: plan only, nothing implemented. Written 2026-10-30.

Goal: add PlantUML Mindmap (`@startmindmap … @endmindmap`, syntax at
https://plantuml.com/en/mindmap-diagram) as an eighth diagram type, with the
same depth of visual editing that WBS has today.

## 0. What already exists

- `packages/language-plantuml/src/index.ts:3-13` already detects
  `@startmindmap` as `PlantUmlDiagramType` `"mindmap"`. Nothing in the app uses
  that result yet.
- The app's own kind detection does not know mindmaps.
  `apps/web/src/diagram-kind.ts:20-23` returns `undefined` for
  `@startmindmap`. `normalizeDiagramKind` (`diagram-kind.ts:35-47`) then falls
  back to `"gantt"`. Today a pasted mindmap opens as a broken Gantt.
- WBS is the closest model. Its package is small, about 500 lines without
  tests:
  - `packages/diagram-wbs/src/model.ts`: `WbsNode` with `depth`, `side`,
    `marker`, `boxless`, `alias`, `color`, `textColor`, `stereotype`, `link`,
    `icon`, `sourceRange` and `subtreeRange`.
  - `parser.ts`: line-based. It joins multi-line `:…;` labels, recognises the
    `_` boxless marker, reports the `mixed-marker`, `missing-parent`,
    `empty-node` and `missing-start`/`missing-end` diagnostics, and keeps a
    one-entry parse cache.
  - `operations.ts`: insert, update, delete, `moveWbsSubtree` and reorder. It
    contains the recent fixes: CRLF-safe moves and inserts (`eol`, and
    `block.endsWith("\r")`), the `nodeStarts` set that re-marks only real node
    lines inside multi-line labels, and keeping `_` in `updateWbsNode`.
  - `adapter.ts`: the `DiagramAdapter` with the `WbsVisualOperation` union and
    the `replacementEdit` diff.
  - `symbols.ts`: outline and rename occurrences.

## 1. Syntax scope

### 1a. First release: parsed and visually editable

| Construct | Example | Notes |
|---|---|---|
| Start and end | `@startmindmap` / `@endmindmap` | Missing ones are diagnostics with quick fixes, as in WBS. |
| OrgMode markers | `*`, `**`, `***` | Depth is the marker count. A depth-1 node is a root. |
| Arithmetic markers | `+ root`, `++ right`, `-- left` | `+` puts a depth-2 node on the right and `-` on the left. Mixing families within one marker (`+-`) is the existing `mixed-marker` error. |
| `left side` | `left side` on its own line | Every following depth-2 `*` node of the same root goes on the left. Stored as a document-level `sideSwitch` offset for each root, not on the nodes. |
| Colour | `*[#Orange] Label`, `**[#lightgreen]` | Same `[#…]` prefix as WBS. |
| Style class | `** Label <<green>>` | Parsed into the existing `stereotype` field. The UI shows it as "Style class". |
| Boxless | `**_ Label`, `--_ Label` | Same `_` handling as WBS. Must survive update, move and side change. |
| Multi-line label | `**:line one`<br>`line two;` | Same joining rule as WBS. Inner lines that start with `-`, `+`, `*` or `#` are label text, not nodes. |
| Several roots | two `*` lines at depth 1 | Already supported by the WBS stack logic. |
| Title and footer elements | `title`, `caption`, `header … endheader`, `[center] footer`, `legend [pos] … endlegend` | Kept in the source and recognised by the parser. Edited in the Settings inspector (title and caption only in the first release). |
| Direction | `left to right direction` (default), `top to bottom direction`, `right to left direction` | Recognised and edited in the Settings inspector. `bottom to top direction` is not implemented upstream. Flag it with a warning and do not offer it. |
| `<style>` block | `<style> mindmapDiagram { … } </style>` | Kept as an opaque block, as WBS does through `CONTROL`. The parser must skip everything between `<style>` and `</style>`, because selectors such as `.myStyle *` and `:depth(1)` must not be parsed as nodes. **This is a new requirement.** WBS only skips the tag lines today (see risk R2). |
| Creole, icons and `<color:…>` inside labels | `<&flag> Label`, `**bold**` | The label text is kept as written. The existing `icon` and `textColor` extraction is reused. |

### 1b. Recognised but source-only (preserved, not visually editable)

- Markdown header form (`# root`, `## child`) and the indented Markdown and
  GFM list form. They are parsed so that the outline, selection and
  diagnostics work. Visual edits on a node written this way return an
  `unavailableReason` ("Convert to `*` markers to edit visually"), plus a quick
  fix that rewrites the whole document to OrgMode markers. The upstream page
  does not say whether list nesting counts indentation or repeated `*`. Settle
  this in the renderer spike (S0) before writing the parser rule.
- `skinparam` lines. The upstream page does not document skinparam for
  mindmaps. Keep the lines unchanged and do not add a UI for them.
- Width settings (`MaximumWidth`) and all other style properties: source only.
- `<img:…>`, `<U+…>` and HTML-like Creole tags inside labels: kept as text.

### 1c. Not mindmap syntax (reject or warn)

- WBS aliases `(id)` and arrows `a -> b`. Neither appears on the mindmap page.
  The mindmap parser treats arrow lines as `unknown` and reports a warning
  "Arrows are not supported in mindmaps". It never creates aliases.
- `right side`. It is not documented upstream. Treat it as unknown text and
  let the renderer conformance step decide whether to support it later.

## 2. Packages and files

### 2a. Decision: generalise the WBS tree core, then build mindmap on it

Extract the marker-tree parsing and subtree operations from
`packages/diagram-wbs` into a new shared package. Do not copy them into a
mindmap package.

Why:

- About 80% of the code is the same: marker depth, `_`, colour prefix,
  multi-line `:…;`, subtree ranges, CRLF handling and re-marking only real node
  lines. Each of these needed a bug fix recently. A copy would split every
  future fix in two, and a mindmap copy would quietly lose the fixes the next
  time WBS is patched.
- The differences are small and fit in a configuration object: start and end
  tags, whether aliases and arrows exist, the `left side` keyword, Markdown
  `#` markers, and whether direction lines are valid.
- Making `diagram-mindmap` depend directly on `diagram-wbs` was rejected. It
  would leak `wbs-` ids and WBS-only features (arrows, aliases, Gantt links)
  into mindmaps, and every WBS change would become a mindmap change.

### 2b. New package `packages/diagram-tree`

- `package.json`: `@plantuml-studio/diagram-tree`, with the same shape as
  `packages/diagram-wbs/package.json`.
- `src/model.ts`: generic `TreeNode` (the fields `WbsNode` has today minus
  `alias`), `TreeSide`, `TreeNodeInput`, and a `TreeDialect` interface:
  `{ idPrefix, start, end, markers, allowAliases, allowArrows, sideKeyword, skipStyleBlocks, directionKeywords, label }`.
- `src/parse-tree.ts`: the body of `parseWbsUncached` and `nodeDetails`,
  parameterised by `TreeDialect`. It returns nodes, roots, `unknown`,
  `diagnostics` and `controls` (title, caption, direction and `left side`
  ranges).
- `src/tree-operations.ts`: `insertTreeNode`, `updateTreeNode`,
  `deleteTreeNode`, `moveTreeSubtree` and `reorderTreeNode`, taken from
  `operations.ts` with the CRLF, `nodeStarts` and `_` fixes unchanged.
  `insertionPoint` takes the dialect's end tag.
- `src/source-edit.ts`: `replacementEdit`, which is copied in several adapters
  today.
- `src/*.test.ts`: move the dialect-neutral cases here from
  `packages/diagram-wbs/src/{parser,operations}.test.ts`.

### 2c. Changes to `packages/diagram-wbs`

- `parser.ts`, `operations.ts` and `model.ts` become thin wrappers around
  `diagram-tree` with a WBS dialect. Public names stay the same (`parseWbs`,
  `moveWbsSubtree`, `WbsNode` and so on), so `apps/web` does not change in
  this slice.
- Relationship and alias code (`insertWbsRelationship`, `renameWbsNodeAlias`,
  `reconnectWbsRelationship`) stays in `diagram-wbs`.
- Every existing test in `packages/diagram-wbs/src/*.test.ts` must pass
  unchanged. That is the acceptance check for the refactor.

### 2d. New package `packages/diagram-mindmap`

- `src/model.ts`: `MindmapNode` (= `TreeNode`), `MindmapDocument` (nodes,
  roots, `unknown`, `diagnostics`, `direction`, `title`, `caption`,
  `leftSideSwitches`), `MindmapNodeInput` and `MindmapDirection`.
- `src/parser.ts`: `parseMindmap` (with the same one-entry cache) and
  `findMindmapNodeAt`. It adds `left side` handling, `#` markers, Markdown list
  detection, `<style>` block skipping and direction recognition.
- `src/operations.ts`: `insertMindmapNode`, `updateMindmapNode`,
  `deleteMindmapNode`, `moveMindmapSubtree`, `reorderMindmapNode`,
  `setMindmapNodeSide` (see 3b), `setMindmapDirection`, `setMindmapTitle` and
  `convertMindmapToOrgMode`.
- `src/adapter.ts`: `mindmapAdapter: DiagramAdapter<MindmapDocument, MindmapVisualOperation>`
  with `id: "mindmap"`, `detect` using `detectPlantUmlDiagramType(source) === "mindmap"`,
  and `capabilities: { visualSelection: true, visualMove: true, visualResize: false, visualDependencies: false }`.
- `src/symbols.ts`: `collectMindmapSymbolOccurrences` with kind
  `"mindmap-node"`. It has label declarations only, because there are no
  aliases.
- `src/{parser,operations}.test.ts`.
- Add the package to the root workspace and TypeScript project references, as
  `diagram-wbs` is.

### 2e. Changes to `packages/document-format`

- `src/types.ts:50`: add `"mindmap"` to `PortableDiagramKind`.
- `src/validate.ts:20-28`: add `"mindmap"` to `DIAGRAM_KINDS`.
- `src/document-format.test.ts` and `src/project-codec.test.ts`: round-trip a
  mindmap diagram. Check that `wbsGantt` is rejected on a mindmap entry.
- Older app builds will reject a `.pumlu` that contains a mindmap with a
  validation error. Accepted (Q4, decided 2026-10-30): no format version bump.

### 2f. Changes to `apps/web/src`

Kind plumbing (every place that lists kinds):

- `model.ts:4`: add `"mindmap"` to `DiagramKind`. Add `DEFAULT_MINDMAP_SOURCE`
  next to `DEFAULT_WBS_SOURCE` (`model.ts:128`).
- `diagram-kind.ts`: detect `@startmindmap` before the `@startuml` checks, and
  accept `"mindmap"` in `normalizeDiagramKind`.
- `diagram-adapters.ts`: register `mindmap: mindmapAdapter`, and export
  `applicationMindmapAdapter`.
- `workspace-backup.ts:14`: add the kind to `DIAGRAM_KINDS`.
- `workspace-storage.ts`: keep `migrateInvalidWbsDirection` (line 159) for WBS
  only. It removes `left side` and direction lines, which are **valid** in
  mindmaps. Add a test that a stored mindmap keeps them.
- `use-workspace-documents.ts:57,63`: default source, and the name "Mindmap".
- `personal-starters.ts:8,25`: add the kind to `kinds`, and extend the
  "explicit start tag" check so that a mindmap starter is not stored as WBS.
- `source-format.ts:40-41,106-147`: opening and closing tags, and keep the
  depth-marker lines and the `<style>` body unchanged. Today the formatter
  branches on `kind === "wbs"`. Use a shared `isTreeKind(kind)` helper
  instead.
- `generated-source-validation.ts:18,40`: tags and the parser.
- `diagram-syntax-repairs.ts:19-21` and `manual-error-guidance.ts:16,31`: the
  `suffix` ternaries fall through to `"uml"`. Add `"mindmap"`.
- `diagram-diagnostics.ts:37-60`: **both ternary chains fall through to
  `wbsDiagnostics` and `wbsQuickFixes`.** Without a change, mindmaps would get
  WBS errors such as "missing @startwbs". Add explicit `mindmap` branches, and
  change the final fallback to an exhaustive `switch` with a `never` check, so
  that the next new kind cannot fall through silently.
- New `mindmap-language.ts`, modelled on `wbs-language.ts`:
  `mindmapCompletions` (root, child, left and right branch, boxless node,
  multi-line node, `left side`, the three direction lines, `title`,
  `caption`, and a `<style>\nmindmapDiagram {\n}\n</style>` snippet, plus the
  colour-name completion after `#`), `mindmapDiagnostics` and
  `mindmapQuickFixes` (missing start or end, convert Markdown markers, remove
  an unsupported arrow line).
- `semantic-symbol-provider.ts:41-147,588`: add a `mindmap` context and
  occurrences. Inline rename uses `updateMindmapNode` and has no alias path.
- `diagram-outline.ts:28-40,105-115`: add the `"mindmap-node"` type label
  ("Mindmap node") and the selector `data-mindmap-node-id`.
- `diagram-bulk-operations.ts:183,268,349,388,399,435`: multi-select colour,
  style class and delete for mindmap nodes. Change the `@startwbs` envelope
  and the end-tag regex to depend on the kind.
- `use-diagram-multi-selection.ts:118,152,207`: the shift-click subtree
  selection for WBS also applies to mindmaps.
- `starter-examples.ts`: two mindmap starters (a simple one, and one with both
  sides, colours and boxless nodes). Add them to `starter-examples.test.ts`.
- `NewDocumentDialog.tsx:9,70-76,316`: the chooser entry
  `{ kind: "mindmap", title: "Mindmap", description: "Brainstorm ideas around a central topic." }`
  and the empty and starter sources.
- `HelpDialog.tsx:75,161`: a "mindmap" shortcut group. "Add node…" uses the
  same Option+N chord as WBS. It is safe because only one kind is active at a
  time.
- `App.tsx`: the WBS wiring is at lines 42-43, 267-288 (lazy imports), 751
  (controller), 2019-2038, 2831 (actions), 3556 (creation shortcut), 3826,
  4562 and 5404-5474 (preview). Add parallel mindmap wiring next to it. Do not
  add more `diagramKind === "wbs"` branches in `App.tsx`. Put the mindmap
  logic in `features/mindmap/` and mount it through one
  `diagramKind === "mindmap"` block, so the 7,000-line file grows as little as
  possible.

New feature folder `apps/web/src/features/mindmap/`:

- `use-mindmap-controller.ts`: selection, source highlight and settings-open
  state, modelled on `features/wbs/use-wbs-controller.ts` without the
  relationship state.
- `use-mindmap-actions.ts`: add child, add sibling, rename, delete, move,
  change side, colour and direction. This is the WBS action hook without the
  Gantt and relationship actions.
- `MindmapInspectors.tsx`: `MindmapNodeInspector` (label, colour, text colour,
  style class, boxless toggle, side for depth-2 nodes, icon and link) and
  `MindmapSettingsInspector` (direction, title and caption).
- `MindmapDialogs.tsx`: `AddMindmapNodeDialog`.
- `use-mindmap-controller.test.tsx`.

New preview `apps/web/src/MindmapDiagramPreview.tsx`. See section 3d for the
hit-testing approach.

### 2g. WBS-only features that must not apply to mindmaps

- WBS↔Gantt linking: `wbs-gantt.ts`, `wbs-gantt-health.ts`,
  `projects/wbs-gantt-missing.ts`, `projects/ProjectLinksPanel.tsx`,
  `projects/project-index.ts:103`, `linkedWbsDocumentId` and `wbsGanttLinks`
  in `workspace-storage.ts:52-54`, the portable `wbsGantt` link
  (`validate.ts:413-450`), and the "Create Gantt from WBS" flow in
  `projects/use-single-file-project.ts:345`. None of these apply. Add guards
  and tests, so that a mindmap cannot be picked as a linked WBS. The checks at
  `workspace-backup.ts:178-181` already compare `diagramKind === "wbs"`.
  Confirm this in a test.
- The WBS relationship inspector, the connect handles and the
  linked-delete and relink dialogs (`WbsRelationshipInspector`,
  `WbsLinkedDeleteDialog.tsx`, `WbsRelinkDialog.tsx`).
- Schedule and completion overlays in the WBS preview (`nodeSchedule`,
  `nodeCompletion`, `dependencyWarnings`).
- The mobile work list (`MobileWorkList.tsx`, `App.tsx:451,4861`) is
  Gantt/WBS only. Mindmaps keep the normal preview on mobile in the first
  release (see Q3).

### 2h. Probably kind-agnostic: confirm with a test, no code expected

- Export (`diagram-export.ts`, `export-preview.ts`, `ExportDialog.tsx`): works
  on the rendered SVG. Add one export test for a mindmap.
- Collaboration (`collaboration-document.ts`): syncs the source text. Add a
  `collaboration-document.test.ts` case that a mindmap document round-trips
  its `diagramKind`.
- Renderer (`apps/web/src/render`, `@plantuml/core` 1.2026.6): renders any
  `@start…` block. Confirm in S0 that the pinned engine renders all the
  constructs in 1a.

## 3. Visual editing

### 3a. Operations (`MindmapVisualOperation`)

| Operation | Implementation | Notes |
|---|---|---|
| `insert-node` (child or sibling) | `insertTreeNode` | A new depth-2 node takes the side of the reference node. If its insertion point is after the root's `left side` line, it is written with `*` markers and inherits the left side. Otherwise it uses the reference marker family. |
| `update-node` (rename, colour, text colour, style class, icon, link) | `updateTreeNode` | Keeps `_`, the marker family and the multi-line form. A label containing `\n` is written as `:…;`, as WBS does. |
| `toggle-boxless` | Add or remove `_` after the marker | New. Also useful for WBS later. |
| `delete-node` | `deleteTreeNode` (whole subtree) | Mindmaps have no relationships to clean up. |
| `move-subtree` / `reorder-node` | `moveTreeSubtree` | Same CRLF and `nodeStarts` rules. See 3b for the side rules. |
| `set-side` (depth-2 only) | `setMindmapNodeSide` | See 3b. |
| `set-direction`, `set-title`, `set-caption` | Line edits after `@startmindmap` | Add, replace or remove one control line. |
| `convert-to-orgmode` | `convertMindmapToOrgMode` | Quick fix for documents in Markdown form. |

### 3b. Sides

A depth-2 node is on the left when its marker family is `-`, or when it uses
`*` or `+` and comes after that root's `left side` line. Note that only
`left side` is documented upstream, so `+` after `left side` needs checking
in S0.

`setMindmapNodeSide(node, side)`:

1. If the root has no `left side` line, rewrite the node's own marker to the
   `+` or `-` family. This is the existing `updateWbsNode` behaviour. Its
   descendants keep their markers, because the side only affects depth 2.
2. If the root uses `left side`, do not mix the two styles. Move the subtree
   to the end of the target group: before the `left side` line to go right, or
   after it to go left. Use `moveTreeSubtree` with a computed `before`.

Moving a subtree between sides by dragging uses the same rule. The preview's
existing `side` argument (`WbsDiagramPreview.tsx:230-260`) is passed through.

Depth-3 and deeper nodes always follow their depth-2 ancestor. Their markers
are only re-sized for depth, as in WBS.

### 3c. Keyboard navigation

Reuse the WBS preview's keyboard model, and confirm it in
`tests/e2e/editor-wbs.spec.ts` first:

- Up and Down: previous or next sibling.
- Right and Left: into the child, or out to the parent. When the node is on
  the left side, swap them so that the arrow keys follow the picture.
- With `top to bottom direction`, Down goes to the child and Left and Right go
  to siblings.
- Enter renames, Tab adds a child, Shift+Enter adds a sibling, Delete deletes,
  and Escape clears the selection. Check each against the current WBS
  bindings and `HelpDialog.tsx`.

### 3d. Preview hit-testing (rendered node → source)

The WBS preview matches `<text>` elements in the SVG to parsed labels in
document order. It claims each element once and matches multi-line labels as
consecutive runs (`WbsDiagramPreview.tsx:280-300`). It then writes
`data-wbs-node-id` onto the SVG text and adds hit boxes.

For mindmaps:

1. Move the label-matching part of the WBS preview (`findLabelTexts`,
   claiming, and hit-box creation) into a shared hook,
   `apps/web/src/tree-preview/use-tree-node-hit-targets.ts`, parameterised by
   the attribute name (`data-wbs-node-id` or `data-mindmap-node-id`). The WBS
   preview switches to it in the same slice, with no change in behaviour.
2. Mindmaps often have duplicate labels ("Pros" and "Cons" under several
   branches). Matching by document order works only if the SVG lists nodes in
   source order. S0 must check this for both sides and all three directions.
   If the order differs (for example, left-side nodes are emitted after
   right-side ones), match per side and then by vertical or horizontal
   position.
3. Labels with Creole, icons or `<color>` render as text that is different
   from the source. Match against a normalised label: remove Creole markers
   and icon tags and decode `<U+…>`. Unit-test the normaliser against S0 SVG
   fixtures.
4. If S0 shows that `@plantuml/core` emits stable group ids for mindmap
   nodes, use them instead of text matching. This is an open question until
   S0.

`MindmapDiagramPreview.tsx` reuses `useDiagramNavigation`, the zoom and fit
controls, the drop-target overlay and the focus restore
(`WbsDiagramPreview.tsx:61-64,98`). It leaves out relationship hits, connect
handles, dependency warnings and progress badges.

## 4. App integration summary

- **Chooser and starters:** section 2f (`NewDocumentDialog.tsx`,
  `starter-examples.ts`, `personal-starters.ts`).
- **Inspector:** node and settings inspectors in
  `features/mindmap/MindmapInspectors.tsx`, opened through the same panel slot
  as WBS.
- **Diagnostics and quick fixes:** missing start or end, `mixed-marker`,
  `missing-parent`, `empty-node`, an unclosed multi-line label at the end of
  the file, an arrow or alias line ("not supported in mindmaps"),
  `bottom to top direction` ("not implemented by PlantUML"), and Markdown form
  ("convert to `*` markers"). They are wired through
  `diagram-diagnostics.ts`, `diagnostic-groups.ts` and
  `diagram-diagnostic-fixes.ts`. `safe-fix-batch.ts` must treat only the
  start, end and convert fixes as safe.
- **Completion:** `mindmap-language.ts`, plus the adapter's `completions`.
- **Outline:** `diagram-outline.ts` and `semantic-symbol-provider.ts`.
- **Export:** none expected, but test it.
- **Collaboration:** none expected, but test it.
- **Portable save and load:** `document-format` (2e), `workspace-backup.ts`
  and `workspace-storage.ts`.

## 5. Tests

### 5a. Unit tests (Vitest)

`packages/diagram-tree/src/*.test.ts` (moved WBS cases, now shared):

- CRLF: insert, move and delete keep `\r\n` everywhere, with no lone `\n`.
- Multi-line labels: a label that contains lines starting with `-`, `+`, `*`
  and `#` survives a move to another depth unchanged.
- `_` survives update, move, side change and reorder.

`packages/diagram-mindmap/src/parser.test.ts`:

- OrgMode, arithmetic and `#` markers, and several roots.
- `left side`: depth-2 nodes before it are on the right, after it on the
  left. Each root is scoped separately.
- A `<style>` block with `.myStyle *` and `:depth(1)` creates no nodes.
- The three direction lines are parsed. `bottom to top` produces a warning.
- `title`, `caption`, `header…endheader` and `legend…endlegend` are recognised
  and create no nodes.
- `[#color]`, `<<class>>`, `<&icon>` and `<color:…>` inside labels.
- Arrow lines are `unknown` and produce a warning.
- The 100,000-character limit.

`packages/diagram-mindmap/src/operations.test.ts`:

- Every operation in 3a on LF and CRLF sources.
- `setMindmapNodeSide` in both styles (family marker and `left side`).
- Moving a subtree across the `left side` line.
- `convertMindmapToOrgMode` keeps labels, colours and `_`.

`apps/web/src`:

- Extend `diagram-kind.test.ts`, `diagram-adapter.test.ts`,
  `diagram-diagnostics.test.ts`, `source-format.test.ts`,
  `workspace-storage.test.ts` (direction lines are kept for mindmaps),
  `workspace-backup.test.ts`, `starter-examples.test.ts`,
  `semantic-symbol-provider.test.ts`, `diagram-bulk-operations.test.ts`,
  `collaboration-document.test.ts`, `valid-syntax-regressions.test.ts` and
  `generated-source-validation`.
- New `mindmap-language.test.ts`.

### 5b. Conformance against the real renderer

- `scripts/refresh-official-plantuml-examples.py`: add
  `"mindmap": "mindmap-diagram"` to the page map (line 37), and
  `"mindmap"` to the start-tag kinds (line 30). Commit
  `tests/fixtures/official-plantuml/mindmap.json`.
- `apps/web/src/official-plantuml-audit.test.ts`: add a mindmap corpus. Every
  official example must parse with no error diagnostics and no repairs, and
  the `unknown` list is snapshotted. That snapshot is the gap inventory.
- `apps/web/src/official-plantuml-mutations.test.ts` and
  `scripts/audit-plantuml-renderer.mjs`: export mutations from each mindmap
  operation, render them with the pinned `@plantuml/core` 1.2026.6, and record
  the result in `renderer-observations.json`. This proves that every visual
  edit produces source the real engine renders without an error and with the
  same node count.
- Add a hit-testing fixture: commit the SVGs rendered in S0 under
  `tests/fixtures/mindmap-svg/`, and assert that the preview hook maps every
  node, including duplicate labels, left-side nodes and all three directions.

### 5c. End-to-end tests (Playwright, Chromium, Firefox and WebKit)

New `tests/e2e/editor-mindmap.spec.ts`, using `tests/e2e/editor-wbs.spec.ts`
and `editor-helpers.ts` as the template:

- Create a mindmap from the chooser and check that the starter renders.
- Click a node: the inspector opens and the source line is highlighted.
- Add a child and a sibling, rename inline, and delete a subtree.
- Drag a subtree onto another parent, and drag a depth-2 node across to the
  other side. Run both with a document that uses `left side`.
- Change colour and toggle boxless, and check the source and the rendered
  SVG.
- Use keyboard navigation in left-to-right and top-to-bottom direction.
- Use outline navigation to select a node.
- Save to `.pumlu`, reload, and check that the kind and source are the same.
- Run a CRLF document through each edit (paste CRLF source, then edit).

Also extend `portable-document.spec.ts`, `outline-navigation.spec.ts`,
`diagram-multi-select.spec.ts` and `start-experience.spec.ts` with one
mindmap case each.

Run every touched spec locally on all three browsers before pushing. Local
WebKit can differ from CI, so check any WebKit-only failure against a green
commit first. After e2e runs, restore the rewritten `docs/audits` PNGs.

## 6. Delivery

### Slices (one PR each, in order)

- **S0 — renderer spike.** No product code. Render about 25 sources with
  `@plantuml/core` 1.2026.6. Cover every construct in 1a and 1b, both sides,
  all directions, duplicate labels, Creole and the Markdown list form. Record
  the SVG structure (text order, group ids and multi-line text runs) in
  `docs/mindmap-renderer-notes.md`, and commit the fixtures. This answers the
  hit-testing, Markdown-indent and `+`-after-`left side` questions. Small.
- **S1 — extract `packages/diagram-tree`.** Move the WBS core and port
  `diagram-wbs` to it. Move the preview label matching into
  `tree-preview/use-tree-node-hit-targets.ts`. No behaviour change: all WBS
  unit and e2e tests (`editor-wbs`, `wbs-gantt`, `project-wbs-*`,
  `diagram-multi-select`) pass on the three browsers. Medium.
- **S2 — `packages/diagram-mindmap` parser, operations and adapter**, with
  unit tests and the official example corpus and audit (5b). No UI. Medium.
- **S3 — kind plumbing and source-only support.** Change `DiagramKind`,
  detection, normalisation, `document-format`, backup and storage, the
  formatter, the diagnostics dispatch (with the exhaustive switch),
  `mindmap-language.ts`, the chooser entry and starters, the outline and
  symbols, export and collaboration tests. After this slice a mindmap opens,
  renders, validates and saves correctly, edited as text only. This slice can
  ship on its own. Medium.
- **S4 — visual editing.** `MindmapDiagramPreview.tsx`, `features/mindmap/*`,
  the `App.tsx` mount, the inspectors and dialogs, keyboard navigation, the
  mutation renderer audit, `editor-mindmap.spec.ts` on the three browsers, and
  updated help. Large. It can be split into S4a (select, inspect, add, rename
  and delete) and S4b (drag, move, side change and keyboard).
- **S5 — polish.** Multi-select bulk actions, the Markdown-to-OrgMode quick
  fix, the `<style>` snippet, and the training and help pages. Small.

### Risks

- **R1 — the S1 refactor breaks WBS.** WBS has Gantt links and many e2e specs.
  Mitigation: S1 changes no public names, makes no UI change, and must pass
  the full WBS suite on the three browsers before S2 starts.
- **R2 — `<style>` bodies parsed as nodes.** WBS skips only the `<style>` and
  `</style>` lines (`CONTROL` in `packages/diagram-wbs/src/parser.ts:6`). Most
  body lines (`node {`, `.myStyle * {`, `:depth(1) {`) fall into `unknown`,
  which is harmless. But a body line that starts with `*`, `+` or `-` (for
  example a `* { … }` rule) would become a node. This is a latent WBS bug as
  well. Add a test in S1, and fix it in the shared core for both kinds.
- **R3 — ambiguous hit-testing.** Duplicate labels, left-side ordering and
  Creole rendering can map a click to the wrong node. Mitigation: S0 fixtures
  and the per-side matching fallback.
- **R4 — silent fall-through to WBS.** `diagram-diagnostics.ts`,
  `diagram-syntax-repairs.ts`, `manual-error-guidance.ts` and
  `normalizeDiagramKind` (which defaults to Gantt) give a new kind the wrong
  behaviour without a type error. Mitigation: exhaustive switches, and
  `grep -rn '"wbs"' apps/web/src` as a checklist in S3.
- **R5 — forward compatibility of `.pumlu`.** Older builds reject an unknown
  diagram kind, so a project that contains a mindmap cannot be opened by an
  older client or a collaborator on an older build. Accepted by the user on
  2026-10-30.
- **R6 — `App.tsx` size.** Mindmap wiring adds to a 7,000-line file.
  Mitigation: keep the logic in `features/mindmap/`, with one mount point.
- **R7 — Firefox and WebKit SVG text differences.** Text measurement and
  `<text>` splitting can differ between engines. Mitigation: run S4 on all
  three browsers, and compare the mapped node count instead of pixel
  positions.

### Open questions for the user

- **Q1 (decided 2026-10-30).** Extract the shared `packages/diagram-tree`
  package (S1) before mindmap work starts. Do not copy the WBS code.
- **Q2.** Should Markdown-form mindmaps (`#` headers and list form) be source
  only with a conversion quick fix, as proposed, or fully editable while
  keeping their form?
- **Q3.** Should mindmaps join the mobile work list (today Gantt and WBS only)
  in the first release, or later?
- **Q4 (decided).** Older builds may fail to open projects that contain
  mindmaps. No format version bump.
- **Q5.** Should there be a WBS↔Mindmap conversion (same marker syntax, so the
  source almost carries over)? Not in scope here, but cheap after S3.
- **Q6.** In the first release, should the Settings inspector also edit
  `header`, `footer` and `legend`, or only title, caption and direction?
