import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface GanttModeState {}

const KEYWORDS =
  /^(?:Project|starts|ends|at|lasts|requires|days?|weeks?|months?|is|colou?red|in|completed|happens|pauses|on|links|to|after|before|displays|same|row|as|deleted|start|end)\b/i;

export const plantUmlGanttMode: StreamParser<GanttModeState> = {
  name: "plantuml-gantt",
  startState: () => ({}),
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    const prefix = stream.string.slice(0, stream.pos);

    if (stream.peek() === "'" && prefix.trim() === "") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i)) return "meta";
    if (stream.match(/^\[[^\]]+]/)) return "variableName";
    if (stream.match(/^'s\b/i)) return "operator";
    if (stream.match(/^\d{4}-\d{2}-\d{2}\b/)) return "number";
    if (stream.match(/^\d+%/)) return "number";
    if (stream.match(/^\d+\b/)) return "number";
    if (/\bis\s+colou?red\s+in\s*$/i.test(prefix) && stream.match(/^(?:#[0-9a-f]+|[a-z][\w-]*)/i)) return "string";
    if (stream.match(KEYWORDS)) return "keyword";
    if (stream.match(/^(?:true|false)\b/i)) return "bool";
    // Consume identifiers as a unit so the tokenizer cannot restart in the
    // middle of a name and mistake a suffix such as the "as" in "Elias" for a keyword.
    if (stream.match(/^[\p{L}_][\p{L}\p{N}_-]*/u)) return null;
    if (stream.match(/^[()[\]{},:]/)) return "punctuation";
    stream.next();
    return null;
  },
};

export const plantUmlGanttHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "600" },
  { tag: tags.variableName, color: "var(--syntax-task)" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syntax-operator)" },
]);
