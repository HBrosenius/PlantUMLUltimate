import { HighlightStyle, type StreamParser, type StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface SequenceModeState {}

const KEYWORDS = /^(?:participant|actor|boundary|control|entity|database|collections|queue|as|order|activate|deactivate|destroy|create|return|alt|else|opt|loop|par|break|critical|group|end|ref|over|note|hnote|rnote|left|right|of|across|box|autonumber|stop|resume|inc|autoactivate|hide|show|footbox|unlinked|newpage|title|header|footer|legend|skinparam|teoz|pragma)(?![\w])/i;

export const plantUmlSequenceMode: StreamParser<SequenceModeState> = {
  name: "plantuml-sequence",
  startState: () => ({}),
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    const prefix = stream.string.slice(0, stream.pos);
    if (stream.peek() === "'" && prefix.trim() === "") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^@[a-z]+\b/i) || stream.match(/^!pragma\b/i)) return "meta";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^#[0-9a-f]{3,8}\b/i) || stream.match(/^#[a-z][\w-]*/i)) return "string";
    if (stream.match(/^<<(?:[^>]|>(?!>))*>>/)) return "typeName";
    if (stream.match(/^\{[^}]+}/)) return "labelName";
    if (stream.match(/^(?:o)?<?[-.=\\/]+(?:\[[^\]]+])?[-.=\\/>]*[>x]?/)) return "operator";
    if (stream.match(/^\+\+|^--|^\*\*|^!!/)) return "modifier";
    if (prefix.includes(":") && stream.match(/^[^\s]+/)) return "string";
    if (stream.match(/^\d+(?:\.\d+)?\b/)) return "number";
    if (stream.match(KEYWORDS)) return "keyword";
    if (stream.match(/^(?:true|false|on|off)\b/i)) return "bool";
    if (stream.match(/^[A-Za-z_$][\w.$-]*/)) return "variableName";
    if (stream.match(/^[()[\]{},:|?]/)) return "punctuation";
    stream.next();
    return null;
  },
};

export const plantUmlSequenceHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-directive)", fontWeight: "700" },
  { tag: tags.variableName, color: "var(--syntax-task)", fontWeight: "500" },
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "650" },
  { tag: tags.typeName, color: "var(--syntax-type)", fontStyle: "italic" },
  { tag: tags.labelName, color: "var(--syntax-anchor)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.string, color: "var(--syntax-color)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.operator, tags.modifier], color: "var(--syntax-operator)", fontWeight: "650" },
  { tag: tags.bool, color: "var(--syntax-number)" },
]);
