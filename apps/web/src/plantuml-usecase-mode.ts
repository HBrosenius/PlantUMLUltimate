import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface UseCaseModeState {}
const KEYWORDS =
  /^(?:actor|usecase|package|rectangle|as|note|left|right|top|bottom|of|skinparam|title|caption|header|footer|legend|newpage|direction|allowmixing)(?![\w])/i;

export const plantUmlUseCaseMode: StreamParser<UseCaseModeState> = {
  name: "plantuml-usecase",
  startState: () => ({}),
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    const prefix = stream.string.slice(0, stream.pos);
    if (stream.peek() === "'" && prefix.trim() === "") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i) || stream.match(/^![a-z]+\b/i)) return "meta";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^#[a-z][\w-]*/i)) return "string";
    if (stream.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (stream.match(/^(?:<\|)?[-.]+(?:left|right|up|down)?[-.]*[|>]?/i)) return "operator";
    if (stream.match(KEYWORDS)) return "keyword";
    if (stream.match(/^\([^)]*\)/) || stream.match(/^:[^:]+:/)) return "labelName";
    if (stream.match(/^[A-Za-z_$][\w.$-]*/)) return "variableName";
    if (stream.match(/^[{}(),:/]/)) return "punctuation";
    stream.next();
    return null;
  },
};

export const plantUmlUseCaseHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.labelName, color: "var(--syntax-anchor)" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syntax-operator)", fontWeight: "650" },
]);
