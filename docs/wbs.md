# WBS diagrams

WBS support follows the same source-first architecture as the other diagram types. PlantUML text is persisted, the official local PlantUML engine produces the SVG, and every visual edit writes a minimal source change into the unified undo history.

## Supported visual syntax

- `@startwbs` and `@endwbs`
- `*` hierarchy markers
- `+` right-branch and `-` left-branch markers
- Node labels, bracketed background colors such as `**[#LightBlue] Design`, text colors such as `<color:#DarkBlue>Design</color>`, and stereotypes
- Diagram title
- Comments, styling blocks, and unrecognized lines are preserved

The visual editor can add root, child, and sibling nodes; rename and style a node; move a complete subtree by dropping it onto its new parent; reorder before a node with Shift-drag; change its branch side; and delete a complete subtree. Source editing remains available for the wider PlantUML WBS language, including links, icons, multiline shapes, and advanced style selectors.

WBS is marked Beta while the visual syntax matrix is expanded. Unsupported valid lines remain in the document and continue to render through PlantUML.
