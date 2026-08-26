import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface State {}
const KEYWORDS =
  /^(?:start|stop|end|detach|kill|if|then|elseif|else|endif|switch|case|endswitch|fork|again|split|repeat|while|endwhile|break|partition|note|left|right|top|bottom|end\s+note|skinparam|title|caption)(?![\w])/i;

export const plantUmlActivityMode: StreamParser<State> = {
  name: "plantuml-activity",
  startState: () => ({}),
  token(stream: StringStream) {
    if (stream.eatSpace()) return null;
    if (stream.peek() === "'" && stream.string.slice(0, stream.pos).trim() === "") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i) || stream.match(/^![a-z]+\b/i)) return "meta";
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^#[a-z][\w-]*/i)) return "string";
    if (stream.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (stream.match(/^[-.]+(?:\[[^\]]+\])?[-.>]+/)) return "operator";
    if (stream.match(KEYWORDS)) return "keyword";
    if (stream.match(/^:[^;]*/)) return "variableName";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^[()[\]{};]/)) return "punctuation";
    stream.next();
    return null;
  },
};

export const plantUmlActivityHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syntax-operator)", fontWeight: "650" },
]);
