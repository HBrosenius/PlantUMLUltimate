import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface State {}
export const plantUmlWbsMode: StreamParser<State> = {
  name: "plantuml-wbs",
  startState: () => ({}),
  token(stream: StringStream) {
    if (stream.eatSpace()) return null;
    if (stream.peek() === "'" && stream.string.slice(0, stream.pos).trim() === "") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i) || stream.match(/^![a-z]+\b/i)) return "meta";
    if (stream.match(/^[*+-]+(?=\s)/)) return "operator";
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^#[a-z][\w-]*/i)) return "string";
    if (stream.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (
      stream.match(
        /^(?:title|caption|header|footer|legend|endlegend|skinparam|style|left to right direction|top to bottom direction)\b/i,
      )
    )
      return "keyword";
    if (stream.match(/^\[\[[^\]]+\]\]/)) return "link";
    stream.next();
    return "variableName";
  },
};
export const plantUmlWbsHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syntax-operator)", fontWeight: "700" },
  { tag: tags.link, color: "var(--syntax-keyword)", textDecoration: "underline" },
]);
