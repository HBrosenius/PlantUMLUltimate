import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";
interface State {}
const KEY =
  /^(?:class|abstract|interface|enum|annotation|package|namespace|folder|frame|node|as|note|left|right|top|bottom|of|skinparam|title|caption|header|footer|hide|show|static)(?![\w])/i;
export const plantUmlClassMode: StreamParser<State> = {
  name: "plantuml-class",
  startState: () => ({}),
  token(s: StringStream) {
    if (s.eatSpace()) return null;
    if (s.peek() === "'" && s.string.slice(0, s.pos).trim() === "") {
      s.skipToEnd();
      return "comment";
    }
    if (s.match(/^@[a-z]+\b/i) || s.match(/^![a-z]+\b/i)) return "meta";
    if (s.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (s.match(/^#[0-9a-f]{3,8}\b/i) || s.match(/^#[a-z][\w-]*/i)) return "string";
    if (s.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (s.match(/^(?:<\|)?[-.*o]+(?:left|right|up|down)?[-.*o]*[|>]?/i)) return "operator";
    if (s.match(KEY)) return "keyword";
    if (s.match(/^[+\-#~][^:(){}]*/)) return "propertyName";
    if (s.match(/^[A-Za-z_$][\w.$-]*/)) return "variableName";
    if (s.match(/^[{}(),:<>]/)) return "punctuation";
    s.next();
    return null;
  },
};
export const plantUmlClassHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.propertyName, color: "var(--syntax-anchor)" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syntax-operator)", fontWeight: "650" },
]);
