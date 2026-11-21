import type { StreamParser, StringStream } from "@codemirror/language";

export { plantUmlWbsHighlightStyle as plantUmlMindmapHighlightStyle } from "./plantuml-wbs-mode";

interface State {}

export const plantUmlMindmapMode: StreamParser<State> = {
  name: "plantuml-mindmap",
  startState: () => ({}),
  token(stream: StringStream) {
    if (stream.eatSpace()) return null;
    const lineStart = stream.string.slice(0, stream.pos).trim() === "";
    if (stream.peek() === "'" && lineStart) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i) || stream.match(/^![a-z]+\b/i)) return "meta";
    // Depth markers (`*`, `+`, `-`) and the Markdown form's `#` headers, only at the start of a line.
    if (lineStart && stream.match(/^(?:[*+-]+|#+)(?=[\s:_[])/)) return "operator";
    // The boxless marker after a depth marker or colour.
    if (stream.match(/^_(?=\s|:)/)) return "operator";
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^#[a-z][\w-]*/i)) return "string";
    if (stream.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (
      stream.match(
        /^(?:title|caption|header|footer|legend|endlegend|skinparam|style|left side|right side|(?:left to right|top to bottom|right to left|bottom to top) direction)\b/i,
      )
    )
      return "keyword";
    if (stream.match(/^\[\[[^\]]+\]\]/)) return "link";
    stream.next();
    return "variableName";
  },
};
