# WBS diagrams

WBS support follows the same source-first architecture as the other diagram types. PlantUML text is persisted, the official local PlantUML engine produces the SVG, and every visual edit writes a minimal source change into the unified undo history.

## Supported visual syntax

- `@startwbs` and `@endwbs`
- `*` hierarchy markers
- `+` right-branch and `-` left-branch markers
- Node labels, bracketed background colors such as `**[#LightBlue] Design`, text colors such as `<color:#DarkBlue>Design</color>`, and stereotypes
- Node hyperlinks, such as `** [[https://example.com Design]]`
- Node icons, using the OpenIconic/sprite form such as `** <&home> Home` or `** <$custom-sprite> Detail`
- Multiline node labels using the `:` ... `;` form, e.g. `*: Line one\nLine two;`
- Diagram title
- Comments, styling blocks, and unrecognized lines are preserved

The visual editor can add root, child, and sibling nodes; rename and style a node (including a multiline label, entered as a multi-row Label field); set or clear a node's link URL and icon; move a complete subtree by dropping it onto its new parent; reorder before a node with Shift-drag; change its branch side; and delete a complete subtree.

Stereotypes and `<style>` blocks (PlantUML's CSS-like selector mechanism, e.g. `<style> .phase { BackgroundColor red } </style>` applying to every node stereotyped `<<phase>>`) remain source-only — an existing stereotype is preserved by any visual edit, but setting or changing one has no dedicated UI, since it was judged more confusing than useful as an inspector field.

Source editing remains available for the wider PlantUML WBS language, including `<img:url>` embedded images, `<style>` blocks, and stereotypes.

WBS is a production diagram type. The visual editor covers its common structural, annotation, layout, and style workflows; unsupported valid lines remain in the document and continue to render through PlantUML.
