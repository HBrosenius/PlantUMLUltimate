import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { c4Macro } from "./c4-source";

interface State {
  comment: boolean;
}

export const plantUmlC4Mode: StreamParser<State> = {
  name: "plantuml-c4",
  startState: () => ({ comment: false }),
  token(s: StringStream, state) {
    if (state.comment) {
      if (s.match(/^.*?'\//)) state.comment = false;
      else s.skipToEnd();
      return "comment";
    }
    if (s.eatSpace()) return null;
    if (s.match(/^\/'/)) {
      state.comment = true;
      if (s.match(/^.*?'\//)) state.comment = false;
      else s.skipToEnd();
      return "comment";
    }
    if (s.peek() === "'") {
      s.skipToEnd();
      return "comment";
    }
    if (s.match(/^@[a-z]+\b/i) || s.match(/^![a-z_]+\b/i)) return "meta";
    if (s.match(/^<C4\/[\w.]+>/)) return "string";
    if (s.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (s.match(/^\$[A-Za-z_]\w*(?=\s*=)/)) return "propertyName";
    const word = s.match(/^[A-Za-z_]\w*/);
    if (word) {
      const name = Array.isArray(word) ? word[0] : "";
      if (c4Macro(name) || /^(?:LAYOUT_\w+|SHOW_\w+|HIDE_\w+|Update\w+Style|Add\w+Tag)$/.test(name)) return "keyword";
      if (/^(?:title|skinparam|legend|endlegend|header|footer|caption|note|left|right|of)$/i.test(name))
        return "typeName";
      return "variableName";
    }
    if (s.match(/^[{}(),=]/)) return "punctuation";
    s.next();
    return null;
  },
};

export const plantUmlC4HighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.propertyName, color: "var(--syntax-anchor)" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
]);
