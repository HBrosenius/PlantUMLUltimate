import {
  C4_MACROS,
  c4Macro,
  type C4ArgumentSpan,
  type C4CallSite,
  type C4Document,
  type C4Element,
  type C4LayoutHint,
  type C4Relationship,
  type C4Scope,
  type C4Setting,
  type C4TagDefinition,
} from "./model";

const C4_INCLUDE =
  /^\s*!\s*include\w*\s+(?:<C4\/[\w.]+>|"?https:\/\/raw\.githubusercontent\.com\/plantuml-stdlib\/C4-PlantUML\/[^\s"]+"?)\s*$/im;
const ELEMENT_CALL = new RegExp(
  `^\\s*(?:${C4_MACROS.filter(
    (macro) => macro.category !== "layout" && macro.category !== "relationship" && macro.name !== "Node",
  )
    .map((macro) => macro.name)
    .join("|")})\\s*\\(`,
  "im",
);

/** A source is a C4 diagram when it includes the C4 library or calls a C4 element macro. */
export function isC4Source(source: string): boolean {
  return C4_INCLUDE.test(source) || ELEMENT_CALL.test(source);
}

export function includesC4Library(source: string): boolean {
  return C4_INCLUDE.test(source);
}

// -- Reading arguments -------------------------------------------------------------------------------

export interface C4Argument {
  name?: string;
  value: string;
}

const NAMED_ARGUMENT = /^\$([A-Za-z_]\w*)\s*=\s*/;
const BARE_VALUE = /^[\w.$-]*$/;

function argumentSpan(text: string, start: number, end: number, offset: number): C4ArgumentSpan {
  const authored = text.slice(start, end);
  const raw = authored.trim();
  const from = offset + start + (authored.length - authored.trimStart().length);
  const named = NAMED_ARGUMENT.exec(raw);
  const valueOffset = named ? named[0].length : 0;
  const rest = raw.slice(valueOffset);
  const wrapped = rest.length >= 2 && rest.startsWith('"') && rest.endsWith('"');
  const inner = wrapped ? rest.slice(1, -1) : rest;
  const form: C4ArgumentSpan["form"] = wrapped
    ? /(?<!\\)"/.test(inner)
      ? "expression"
      : "quoted"
    : BARE_VALUE.test(rest)
      ? "bare"
      : "expression";
  const valueFrom = from + valueOffset + (wrapped ? 1 : 0);
  return {
    ...(named ? { name: named[1]! } : {}),
    value: inner,
    raw,
    form,
    range: { from, to: from + raw.length },
    valueRange: { from: valueFrom, to: valueFrom + inner.length },
  };
}

/**
 * Splits the text between a macro's parentheses into arguments, keeping quoted commas and nested calls, and says
 * where each one is written (`offset` is where `text` starts in the source).
 */
export function parseC4ArgumentSpans(text: string, offset = 0): C4ArgumentSpan[] {
  const result: C4ArgumentSpan[] = [];
  let start = 0;
  let quote = false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') quote = !quote;
    if (!quote && (character === "(" || character === "[")) depth += 1;
    if (!quote && (character === ")" || character === "]")) depth -= 1;
    if (character === "," && !quote && depth === 0) {
      result.push(argumentSpan(text, start, index, offset));
      start = index + 1;
    }
  }
  if (text.slice(start).trim() || result.length) result.push(argumentSpan(text, start, text.length, offset));
  return result;
}

/** Splits the text between a macro's parentheses into arguments, keeping quoted commas and nested calls. */
export function parseC4Arguments(text: string): C4Argument[] {
  return parseC4ArgumentSpans(text).map((item) => ({ ...(item.name ? { name: item.name } : {}), value: item.value }));
}

// -- Reading call sites ------------------------------------------------------------------------------

/** A line that is a macro call: `Name(arguments)`, then perhaps a `{` and a comment. */
function readCall(line: string) {
  const head = /^(\s*)([A-Za-z_]\w*)\s*\(/.exec(line);
  if (!head) return undefined;
  const open = head[0].length - 1;
  let quote = false;
  let depth = 0;
  let close = -1;
  for (let index = open; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') quote = !quote;
    else if (!quote && character === "(") depth += 1;
    else if (!quote && character === ")") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close < 0) return undefined;
  // After the call: optional whitespace, an optional `{`, optional whitespace, then nothing or a comment.
  let rest = line.slice(close + 1).trimStart();
  const brace = rest.startsWith("{");
  if (brace) rest = rest.slice(1).trimStart();
  if (rest && !rest.startsWith("'")) return undefined;
  return { indent: head[1]!.length, name: head[2]!, open, close, brace };
}

const TAG_DEFINITIONS: Record<string, C4TagDefinition["kind"]> = {
  addelementtag: "element",
  addreltag: "relationship",
  addboundarytag: "boundary",
};
const LAYOUT_HINT = /^Lay_(?:U|D|L|R|Distance)$/i;

/** Follows the preprocessor constructs that make a line unsafe to edit. */
function applyDirective(text: string, scopes: C4Scope[]) {
  const word = /^!\s*(?:unquoted\s+)?([a-z]+)/i.exec(text)?.[1]?.toLowerCase();
  switch (word) {
    case "if":
    case "ifdef":
    case "ifndef":
      scopes.push("if");
      break;
    case "procedure":
    case "definelong":
    case "startsub":
      scopes.push("procedure");
      break;
    case "function":
      scopes.push("function");
      break;
    case "while":
    case "foreach":
      scopes.push("loop");
      break;
    case "endif":
    case "endprocedure":
    case "enddefinelong":
    case "endsub":
    case "endfunction":
    case "endwhile":
    case "endfor":
      scopes.pop();
      break;
    default:
  }
}

interface OpenBlock {
  id?: string;
  element?: C4Element;
}

/** Reads the elements, boundaries and relationships a C4 source declares. Unknown lines are ignored. */
export function parseC4(source: string): C4Document {
  const elements: C4Element[] = [];
  const relationships: C4Relationship[] = [];
  const settings: C4Document["settings"] = { layout: [], legend: [], hints: [], tags: [] };
  const stack: OpenBlock[] = [];
  const scopes: C4Scope[] = [];
  let offset = 0;
  let comment = false;
  source.split("\n").forEach((raw, index) => {
    const from = offset;
    offset += raw.length + 1;
    const line = raw.replace(/\r$/, "");
    const text = line.trim();
    if (comment) {
      if (text.includes("'/")) comment = false;
      return;
    }
    if (text.startsWith("/'")) {
      comment = !text.includes("'/", 2);
      return;
    }
    if (!text || text.startsWith("'")) return;
    const to = from + line.length;
    if (text.startsWith("!")) {
      applyDirective(text, scopes);
      return;
    }
    if (text.startsWith("}")) {
      const closed = stack.pop();
      if (closed?.element) {
        closed.element.closeLine = index + 1;
        closed.element.closeRange = { from, to };
      }
      return;
    }
    const call = readCall(line);
    const macro = call ? c4Macro(call.name) : undefined;
    if (!call || !macro) {
      const tagKind = call ? TAG_DEFINITIONS[call.name.toLowerCase()] : undefined;
      if (call && tagKind) {
        const site = callSite(call.name, call, line, from, to, index, scopes, stack.length);
        settings.tags.push({ ...site, kind: tagKind, tag: site.arguments.find((item) => !item.name)?.value ?? "" });
      } else if (call && LAYOUT_HINT.test(call.name)) {
        const site = callSite(call.name, call, line, from, to, index, scopes, stack.length);
        const positional = site.arguments.filter((item) => !item.name);
        const named = (name: string) => site.arguments.find((item) => item.name === name)?.value;
        const hint: C4LayoutHint = {
          ...site,
          from: named("from") ?? positional[0]?.value ?? "",
          to: named("to") ?? positional[1]?.value ?? "",
        };
        settings.hints.push(hint);
      } else if (opensBlock(text)) stack.push({});
      return;
    }
    const site = callSite(macro.name, call, line, from, to, index, scopes, stack.length);
    const positional = site.arguments.filter((item) => !item.name);
    const value = (name: string) => {
      const named = site.arguments.find((item) => item.name === name);
      if (named) return named.value;
      const position = macro.params.findIndex((item) => item.name === name);
      return position >= 0 ? positional[position]?.value : undefined;
    };
    if (macro.category === "relationship") {
      const sourceAlias = value("from");
      const targetAlias = value("to");
      if (sourceAlias && targetAlias) {
        const technology = value("techn");
        relationships.push({
          ...site,
          from: sourceAlias,
          to: targetAlias,
          label: value("label") ?? "",
          ...(technology ? { technology } : {}),
          index: relationships.length,
        });
      } else if (call.brace) stack.push({});
    } else if (macro.category === "layout") {
      if (/^Lay_/i.test(macro.name)) {
        settings.hints.push({ ...site, from: value("from") ?? "", to: value("to") ?? "" });
      } else {
        const setting: C4Setting = { ...site, kind: /LEGEND/.test(macro.name) ? "legend" : "layout" };
        settings[setting.kind].push(setting);
      }
      if (call.brace) stack.push({});
    } else {
      const id = value("alias");
      if (id) {
        const technology = value("techn") ?? value("type");
        const description = value("descr");
        const parent = [...stack].reverse().find((item) => item.id !== undefined)?.id;
        const element: C4Element = {
          ...site,
          id,
          category: macro.category,
          label: value("label") ?? id,
          ...(technology ? { technology } : {}),
          ...(description ? { description } : {}),
          external: Boolean(macro.external),
          ...(parent ? { parent } : {}),
          index: elements.length,
          blockOpen: call.brace,
        };
        elements.push(element);
        if (call.brace) stack.push({ id, element });
      } else if (call.brace) stack.push({});
    }
  });
  return { elements, relationships, settings, includesLibrary: includesC4Library(source) };
}

function callSite(
  macro: string,
  call: NonNullable<ReturnType<typeof readCall>>,
  line: string,
  from: number,
  to: number,
  index: number,
  scopes: readonly C4Scope[],
  depth: number,
): C4CallSite {
  const scope = scopes.at(-1);
  return {
    macro,
    line: index + 1,
    range: { from, to },
    nameRange: { from: from + call.indent, to: from + call.indent + call.name.length },
    argumentsRange: { from: from + call.open + 1, to: from + call.close },
    arguments: parseC4ArgumentSpans(line.slice(call.open + 1, call.close), from + call.open + 1),
    depth,
    ...(scope ? { scope } : {}),
  };
}

/**
 * Whether a line opens a block: some `{` followed only by whitespace, or by whitespace and a comment. One pass
 * from the end, so long runs of `{` or spaces stay linear.
 */
function opensBlock(text: string): boolean {
  let next = "";
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index]!;
    if (char === "{" && (next === "" || next === "'")) return true;
    if (char !== " " && char !== "	") next = char;
  }
  return false;
}
