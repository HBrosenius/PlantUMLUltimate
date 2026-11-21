/** Mindmap sources rendered by scripts/render-mindmap-fixtures.mjs (slice S0 of docs/mindmap-plan.md). */
const wrap = (body) => `@startmindmap\n${body}\n@endmindmap`;

export const sources = {
  "01-basic": wrap("* Root\n** A\n*** A1\n*** A2\n** B\n*** B1"),
  "02-arithmetic": wrap("+ Root\n++ Right1\n+++ R1a\n++ Right2\n-- Left1\n--- L1a\n-- Left2"),
  "03-left-side-star": wrap("* Root\n** R1\n** R2\nleft side\n** L1\n** L2\n*** L2a"),
  "04-left-side-plus": wrap("+ Root\n++ R1\nleft side\n++ AfterLeftPlus\n-- AfterLeftMinus"),
  "05-duplicate-labels": wrap(
    "* Root\n** Branch 1\n*** Pros\n*** Cons\n** Branch 2\n*** Pros\n*** Cons\nleft side\n** Branch 3\n*** Pros\n*** Cons",
  ),
  "06-direction-ltr": wrap("left to right direction\n* Root\n** A\n** B\n*** B1"),
  "07-direction-ttb": wrap("top to bottom direction\n* Root\n** A\n** B\n*** B1"),
  "08-direction-rtl": wrap("right to left direction\n* Root\n** A\n** B\n*** B1"),
  "09-direction-btt": wrap("bottom to top direction\n* Root\n** A\n** B"),
  "10-colors-style-class": wrap(
    "*[#Orange] Root\n**[#lightgreen] Green\n** Classed <<green>>\n*** Plain\n<style>\nmindmapDiagram {\n  .green {\n    BackgroundColor lightgreen\n  }\n}\n</style>",
  ),
  "11-boxless": wrap("* Root\n**_ Boxless right\n***_ Deep boxless\n--_ Boxless left\n-- Boxed left"),
  "12-multiline": wrap(
    "* Root\n**:line one\nline two\n- not a node\n+ not a node either\n* not a node\n# not a node;\n** Next",
  ),
  "13-several-roots": wrap("* Root one\n** A\n* Root two\n** B"),
  "14-title-caption-footer": wrap(
    "title My Title\ncaption My Caption\nheader\nHead text\nendheader\ncenter footer Foot text\nlegend right\nLegend text\nendlegend\n* Root\n** A",
  ),
  "15-style-block-star-rules": wrap(
    "<style>\nmindmapDiagram {\n  node {\n    BackgroundColor white\n  }\n  .myStyle * {\n    LineColor red\n  }\n  :depth(1) {\n    BackgroundColor yellow\n  }\n  * {\n    FontSize 12\n  }\n  - {\n    LineThickness 1\n  }\n}\n</style>\n* Root\n** A <<myStyle>>",
  ),
  "16-creole": wrap(
    '* **Bold root**\n** //italic// and --strike--\n** __underline__ and ""mono""\n** <b>html bold</b> <i>html italic</i>\n** <color:red>red text</color> plain\n** <size:20>big</size>',
  ),
  "17-icons-and-unicode": wrap(
    "* <&flag> Flagged root\n** <&star> Star <U+00E9>\n** Image <img:https://example.invalid/x.png>",
  ),
  "18-markdown-headers": wrap("# Root\n## Child 1\n### Grand 1\n## Child 2"),
  "19-markdown-list-indent-star": wrap("* Root\n * Child 1\n  * Grand 1\n * Child 2"),
  "20-markdown-list-mixed": wrap(
    "* Root\n** Level 2\n  * Indented star under level 2\n    * Deeper indented\n- Dash at col 0",
  ),
  "21-markdown-gfm-dash-list": wrap("* Root\n - Child 1\n   - Grand 1\n - Child 2"),
  "22-skinparam-width": wrap(
    "skinparam backgroundColor lightyellow\n<style>\nmindmapDiagram {\n  node {\n    MaximumWidth 100\n  }\n}\n</style>\n* Root with a very long label that should wrap because of the maximum width\n** Child",
  ),
  "23-arrow-and-alias": wrap("* Root\n** A (a)\n** B (b)\na -> b"),
  "24-right-side-keyword": wrap("* Root\n** R1\nright side\n** R2"),
  "25-mixed-sides": wrap(
    "* Root\n** Star R\n++ Plus R\n-- Minus L\n** Star again\nleft side\n** Star L\n-- Minus after left side\n++ Plus after left side",
  ),
  "26-ttb-both-sides": wrap("top to bottom direction\n* Root\n** R1\n** R2\nleft side\n** L1\n** L2"),
  "27-link-and-stereotype": wrap("* Root\n** [[https://example.invalid Link label]]\n** Stereotyped <<note>>"),
  "28-deep-both-sides": wrap("+ Root\n++ R1\n+++ R1a\n++++ R1a1\n-- L1\n--- L1a\n---- L1a1\n--- L1b"),
  "29-markdown-hash-list-indent4": wrap("# Root\n* Child by star\n  * Grand by two spaces\n    * Great by four spaces"),
  "31-indent-stack": wrap("* Root\n    * Four\n  * Two\n        * Eight\n    * Four again"),
  "32-indent-tabs": wrap("* Root\n\t* Tab one\n\t\t* Tab two"),
  "33-hash-then-indent": wrap("# Root\n## Child\n  * Under child by indent\n    * Deeper"),
  "34-style-star-rule-only": wrap("<style>\nmindmapDiagram {\n  * {\n    FontSize 12\n  }\n}\n</style>\n* Root\n** A"),
  "35-style-dash-rule-only": wrap(
    "<style>\nmindmapDiagram {\n  - {\n    LineThickness 1\n  }\n}\n</style>\n* Root\n** A",
  ),
  "36-style-depth-selector-only": wrap(
    "<style>\nmindmapDiagram {\n  :depth(1) {\n    BackgroundColor yellow\n  }\n}\n</style>\n* Root\n** A",
  ),
  "37-style-dot-star-selector-only": wrap(
    "<style>\nmindmapDiagram {\n  .myStyle * {\n    LineColor red\n  }\n}\n</style>\n* Root\n** A <<myStyle>>",
  ),
  "38-gfm-dash-col0": wrap("# Root\n- Child\n  - Grand"),
  "39-left-side-two-roots": wrap("* R1\n** a\nleft side\n** b\n* R2\n** c\n** d"),
  "40-left-side-multiline": wrap("* Root\n** R\nleft side\n**:multi\nline node;\n** L2"),
  "41-mixed-marker": wrap("* Root\n+- Bad\n** Ok"),
  "42-ttb-duplicates": wrap(
    "top to bottom direction\n* Root\n** B1\n*** Pros\n** B2\n*** Pros\nleft side\n** B3\n*** Pros",
  ),
  "43-rtl-both-sides": wrap("right to left direction\n* Root\n** R1\nleft side\n** L1"),
  "44-multiline-minus": wrap("+ Root\n--:left multi\nline two;\n++ Right"),
  "45-trailing-spaces-and-blank": wrap("* Root\n\n** A  \n\n** B"),
  "46-markdown-star-under-star-marker": wrap("* Root\n** Level 2\n  * Indented"),
  "47-left-then-right-side": wrap("* Root\n** L0\nleft side\n** L1\nright side\n** R1"),
  "48-indent-2-4": wrap("* Root\n  * a\n    * b\n  * c"),
  "49-indent-4-8": wrap("* Root\n    * a\n        * b\n    * c"),
  "50-star2-then-indent": wrap("* Root\n** L2\n  * x\n    * y"),
  "51-star2-indent-then-star2": wrap("* Root\n** L2\n  * x\n** L2b"),
  "52-plus-multiline": wrap("+ Root\n++:r multi\nline;\n++ r2"),
  "53-minus-multiline-star-root": wrap("* Root\n--:l multi\nline;\n-- l2"),
  "54-indent-skips-level": wrap("* Root\n    * Deep at once\n* Second root"),
  "55-rtl-two-level": wrap("right to left direction\n* Root\n** A\n** B"),
  "56-btt-two-level": wrap("bottom to top direction\n* Root\n** A\n** B"),
  "30-crlf": "@startmindmap\r\n* Root\r\n**:a\r\nb;\r\n** C\r\nleft side\r\n** D\r\n@endmindmap",
};
