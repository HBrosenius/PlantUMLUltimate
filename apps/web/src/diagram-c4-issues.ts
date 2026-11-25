import { c4Macro, C4_MACROS } from "./c4-source";
import { opensNoteBlock } from "./block-repair-safety";

/**
 * Quote, brace and statement checks for C4 diagrams, used by `diagram-quote-issues.ts`, `diagram-brace-issues.ts`
 * and `diagram-statement-issues.ts`. A C4 diagram is a list of macro calls, so the checks read calls rather than
 * the entity declarations the other kinds have. A missing include, an unclosed boundary and an undeclared alias are
 * reported by `c4-language.ts`; they are not repeated here.
 */

export interface C4Issue {
  from: number;
  to: number;
  message: string;
  replacement?: string;
  label?: string;
}

/**
 * Every procedure and function the bundled C4 library (`render/stdlib/C4/*.puml`) defines, apart from the macros in
 * the catalog. A test checks this list against the library files. A call to one of these is never "unknown".
 */
export const C4_LIBRARY_NAMES: readonly string[] = [
  "AddBoundaryTag",
  "AddComponentTag",
  "AddContainerTag",
  "AddElementTag",
  "AddExternalComponentTag",
  "AddExternalContainerTag",
  "AddExternalPersonTag",
  "AddExternalSystemTag",
  "AddNodeTag",
  "AddPersonTag",
  "AddProperty",
  "AddRelTag",
  "AddSystemTag",
  "BiRel_Back",
  "BoldLine",
  "Boundary_End",
  "C4Version",
  "C4VersionDetails",
  "DashedLine",
  "DottedLine",
  "EightSidedShape",
  "HIDE_PERSON_SPRITE",
  "HIDE_STEREOTYPE",
  "Index",
  "LAYOUT_AS_SKETCH",
  "LEGEND",
  "LastIndex",
  "None",
  "Normal",
  "Small",
  "Lay_D",
  "Lay_Distance",
  "Lay_Down",
  "Lay_L",
  "Lay_Left",
  "Lay_R",
  "Lay_Right",
  "Lay_U",
  "Lay_Up",
  "RelIndex_Back",
  "RelIndex_Back_Neighbor",
  "RelIndex_D",
  "RelIndex_Down",
  "RelIndex_L",
  "RelIndex_Left",
  "RelIndex_Neighbor",
  "RelIndex_R",
  "RelIndex_Right",
  "RelIndex_U",
  "RelIndex_Up",
  "Rel_",
  "RoundedBoxShape",
  "SET_SKETCH_STYLE",
  "SHOW_DYNAMIC_LEGEND",
  "SHOW_ELEMENT_DESCRIPTIONS",
  "SHOW_ELEMENT_TYPE",
  "SHOW_FLOATING_LEGEND",
  "SHOW_FOOT_BOXES",
  "SHOW_INDEX",
  "SHOW_PERSON_OUTLINE",
  "SHOW_PERSON_PORTRAIT",
  "SHOW_PERSON_SPRITE",
  "SetDefaultLegendEntries",
  "SetIndex",
  "SetPropertyHeader",
  "SharpCornerShape",
  "SolidLine",
  "UpdateBoundaryStyle",
  "UpdateContainerBoundaryStyle",
  "UpdateElementStyle",
  "UpdateEnterpriseBoundaryStyle",
  "UpdateLegendTitle",
  "UpdateRelStyle",
  "UpdateSkinparamsAndLegendEntry",
  "UpdateSystemBoundaryStyle",
  "WithoutPropertyHeader",
  "increment",
  "setIndex",
];

const KNOWN = new Set([...C4_MACROS.map((item) => item.name), ...C4_LIBRARY_NAMES].map((name) => name.toLowerCase()));

export interface C4Line {
  /** Offset of the line in the source. */
  from: number;
  /** The line without its line ending. */
  raw: string;
  text: string;
  /** The line with the text of quoted strings blanked out, and without a trailing `'` comment. Same offsets as `raw`. */
  code: string;
  indent: number;
  /** Offset in the line of the quote that opens a string that is never closed. */
  openQuote?: number;
  /** Offsets in the line of every `\"` inside a quoted string. */
  escapedQuotes: number[];
  /** How many quote characters (not counting `\"`) the line has. */
  quotes: number;
}

export interface C4Scan {
  lines: C4Line[];
  /** Procedures, functions and defines the source declares itself. */
  declared: Set<string>;
  /** An `!include` of something other than the C4 library, which could define more macros. */
  otherInclude: boolean;
}

function readLine(raw: string, from: number): C4Line {
  const text = raw.trim();
  let code = "";
  let quoted = false;
  let open = -1;
  let quotes = 0;
  const escapedQuotes: number[] = [];
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]!;
    if (quoted && char === "\\" && raw[index + 1] === '"') {
      escapedQuotes.push(index);
      code += "xx";
      index++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      quotes++;
      if (quoted) open = index;
      code += '"';
      continue;
    }
    if (!quoted && char === "'" && (index === 0 || /\s/.test(raw[index - 1]!))) break;
    code += quoted ? "x" : char;
  }
  return {
    from,
    raw,
    text,
    code,
    indent: raw.match(/^\s*/)![0].length,
    ...(quoted ? { openQuote: open } : {}),
    escapedQuotes,
    quotes,
  };
}

/** The statement lines of a C4 source: not comments, notes, legends, styles, skinparam blocks or procedure bodies. */
export function scanC4(source: string): C4Scan {
  const lines: C4Line[] = [];
  const declared = new Set<string>();
  let otherInclude = false;
  let offset = 0;
  let comment = false;
  let style = false;
  let freeText: RegExp | undefined;
  let body = 0;
  let skinparam = 0;
  for (const raw of source.split("\n")) {
    const from = offset;
    offset += raw.length + 1;
    const line = raw.replace(/\r$/, "");
    const text = line.trim();
    if (comment) {
      if (text.includes("'/")) comment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      comment = !text.includes("'/", 2);
      continue;
    }
    if (!text || text.startsWith("'")) continue;
    if (style) {
      if (/<\/style>/i.test(text)) style = false;
      continue;
    }
    if (/^<style>/i.test(text)) {
      style = !/<\/style>/i.test(text);
      continue;
    }
    if (freeText) {
      if (freeText.test(text)) freeText = undefined;
      continue;
    }
    if (text.startsWith("!")) {
      const definition = /^!\s*(?:unquoted\s+)?(procedure|function)\s+\$?([A-Za-z_]\w*)/i.exec(text);
      const defined = /^!\s*define(long)?\s+\$?([A-Za-z_]\w*)/i.exec(text);
      if (definition) {
        declared.add(definition[2]!.toLowerCase());
        body++;
      } else if (defined) {
        declared.add(defined[2]!.toLowerCase());
        if (defined[1]) body++;
      } else if (/^!\s*end(?:procedure|function|definelong)\b/i.test(text)) body = Math.max(0, body - 1);
      else if (/^!\s*include/i.test(text) && !/<C4\/|C4-PlantUML/i.test(text)) otherInclude = true;
      continue;
    }
    if (body) continue;
    if (/^@(?:start|end)uml\b/i.test(text)) continue;
    if (skinparam) {
      skinparam = Math.max(0, skinparam + (text.match(/\{/g)?.length ?? 0) - (text.match(/\}/g)?.length ?? 0));
      continue;
    }
    if (/^skinparam\b/i.test(text)) {
      skinparam = Math.max(0, (text.match(/\{/g)?.length ?? 0) - (text.match(/\}/g)?.length ?? 0));
      continue;
    }
    if (opensNoteBlock(text)) {
      freeText = /^end\s*note\b/i;
      continue;
    }
    const block = /^(legend|title|header|footer|caption)(?:\s+(?:left|right|center|top|bottom))*\s*$/i.exec(text);
    if (block) {
      freeText = new RegExp(`^end\\s*${block[1]}\\b`, "i");
      continue;
    }
    lines.push(readLine(line, from));
  }
  return { lines, declared, otherInclude };
}

// -- Quotes -----------------------------------------------------------------------------------------------

/** Unbalanced quotes in a macro call, and `\"` inside an argument, which the C4 library can't draw. */
export function c4QuoteIssues(source: string): C4Issue[] {
  const issues: C4Issue[] = [];
  for (const line of scanC4(source).lines) {
    if (!/^\s*[A-Za-z_]\w*\s*\(/.test(line.raw)) continue;
    for (const at of line.escapedQuotes)
      issues.push({
        from: line.from + at,
        to: line.from + at + 2,
        message: "A C4 macro argument can't contain an escaped quote (\\\"): the library can't draw the diagram",
        replacement: "'",
        label: "Use a single quote",
      });
    if (line.openQuote === undefined) continue;
    const closing = line.raw.lastIndexOf(")");
    // One quote on the line, opening an argument, and the call otherwise closed: the closing quote is missing.
    const repairable =
      line.quotes === 1 && closing > line.openQuote && /[(,=]\s*$/.test(line.raw.slice(0, line.openQuote));
    issues.push({
      from: line.from + line.openQuote,
      to: line.from + line.raw.length,
      message: "Quoted argument has an unmatched quote",
      ...(repairable
        ? {
            replacement: `${line.raw.slice(line.openQuote, closing)}"${line.raw.slice(closing)}`,
            label: "Add missing closing quote",
          }
        : {}),
    });
  }
  return issues;
}

// -- Braces -----------------------------------------------------------------------------------------------

interface C4BraceIssue {
  from: number;
  to: number;
  replacement: string;
  label: string;
  message: string;
}

const callName = (line: C4Line) => /^\s*([A-Za-z_]\w*)\s*\(/.exec(line.code)?.[1];
const opensBlock = (line: C4Line) => {
  const name = callName(line);
  return Boolean(name && c4Macro(name)?.block);
};

/**
 * Boundaries and deployment nodes open with `{` on their own line. This finds a doubled `{{`, a second `{` on the
 * next line, and a block that is indented and closed but never opened. Unclosed and unexpected `}` are reported by
 * `c4-language.ts`.
 */
export function c4BraceIssues(source: string): C4BraceIssue[] {
  const { lines } = scanC4(source);
  const issues: C4BraceIssue[] = [];
  for (const [index, line] of lines.entries()) {
    if (!opensBlock(line)) continue;
    const next = lines[index + 1];
    const doubled = /\{\{+\s*$/.exec(line.code);
    if (doubled) {
      const from = line.from + doubled.index;
      issues.push({
        from,
        to: from + doubled[0].trim().length,
        replacement: "{",
        label: "Remove duplicated opening brace",
        message: "Block has duplicated opening braces",
      });
    } else if (/\{\s*$/.test(line.code)) {
      if (next && next.code.trim() === "{")
        issues.push({
          from: next.from,
          to: next.from + next.raw.length + 1,
          replacement: "",
          label: "Remove duplicated opening brace",
          message: "Block has duplicated opening braces",
        });
    } else if (next && next.indent > line.indent && next.code.trim() !== "{") {
      const closing = lines.slice(index + 1).find((item) => item.indent <= line.indent);
      if (closing && closing.indent === line.indent && /^\s*}\s*$/.test(closing.code)) {
        const end = closing.from + closing.raw.length;
        const insertion = line.code.trimEnd().length;
        const original = source.slice(line.from, end);
        issues.push({
          from: line.from,
          to: end,
          replacement: `${original.slice(0, insertion)} {${original.slice(insertion)}`,
          label: "Add missing opening brace",
          message: "Indented block is missing its opening brace",
        });
      }
    }
  }
  return issues;
}

// -- Statements -------------------------------------------------------------------------------------------

/** Splits the text between the parentheses at top-level commas, where `code` has its strings blanked out. */
function splitArguments(raw: string, code: string, open: number, close: number) {
  const parts: Array<{ from: number; to: number; text: string }> = [];
  let depth = 0;
  let start = open + 1;
  for (let index = open + 1; index <= close; index++) {
    const char = code[index];
    if (char === "(") depth++;
    else if (char === ")" && index < close) depth--;
    else if ((char === "," && depth === 0) || index === close) {
      parts.push({ from: start, to: index, text: raw.slice(start, index) });
      start = index + 1;
    }
  }
  return parts.filter((part) => part.text.trim());
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** The one catalog macro a mistyped name is closest to, when it is close enough to be a typo. */
function closestMacro(name: string): string | undefined {
  const scored = C4_MACROS.map((item) => ({
    name: item.name,
    score: distance(name.toLowerCase(), item.name.toLowerCase()),
  }))
    .filter((item) => item.score <= Math.min(2, Math.floor(name.length / 3)))
    .sort((a, b) => a.score - b.score);
  return scored[0] && scored[0].score !== scored[1]?.score ? scored[0].name : undefined;
}

/** Malformed and unknown macro calls: no closing parenthesis, missing arguments, a dotted alias, an unknown name. */
export function c4StatementIssues(source: string): C4Issue[] {
  const { lines, declared, otherInclude } = scanC4(source);
  const issues: C4Issue[] = [];
  for (const line of lines) {
    const start = line.from + line.indent;
    const whole = { from: start, to: line.from + line.raw.trimEnd().length };
    const bare = /^[A-Za-z_]\w*$/.exec(line.text);
    // `SHOW_LEGEND` on its own is not a call.
    if (bare && c4Macro(bare[0]) && c4Macro(bare[0])!.category === "layout") {
      issues.push({
        ...whole,
        message: `${bare[0]} needs parentheses: ${bare[0]}()`,
        replacement: `${line.raw.slice(0, line.indent)}${bare[0]}()`,
        label: "Add parentheses",
      });
      continue;
    }
    const call = /^(\s*)([A-Za-z_]\w*)\(/.exec(line.code);
    if (!call) continue;
    const name = call[2]!;
    const macro = c4Macro(name);
    const open = call[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let index = open; index < line.code.length; index++) {
      if (line.code[index] === "(") depth++;
      else if (line.code[index] === ")" && --depth === 0) {
        close = index;
        break;
      }
    }
    if (!macro) {
      if (!KNOWN.has(name.toLowerCase()) && !declared.has(name.toLowerCase()) && !otherInclude) {
        const suggestion = closestMacro(name);
        issues.push({
          from: start,
          to: start + name.length,
          message: `Unknown macro ${name}. It is not in the C4 library, and this source doesn't define it`,
          ...(suggestion ? { replacement: suggestion, label: `Change to ${suggestion}` } : {}),
        });
      }
      continue;
    }
    if (close < 0) {
      // A string that is never closed is reported as that, not as a missing parenthesis.
      if (line.openQuote !== undefined) continue;
      const end = line.code.replace(/\s*\{?\s*$/, "").length;
      issues.push({
        ...whole,
        message: `${name}( is missing its closing parenthesis`,
        replacement: `${line.raw.slice(0, end)})${line.raw.slice(end)}`.replace(/^\s*/, ""),
        label: "Add closing parenthesis",
      });
      continue;
    }
    const rest = line.code.slice(close + 1);
    if (!/^\s*\{?\s*$/.test(rest)) {
      issues.push({
        from: line.from + close + 1,
        to: line.from + line.raw.trimEnd().length,
        message: `Unexpected text after the closing parenthesis of ${name}(...)`,
      });
      continue;
    }
    const args = splitArguments(line.raw, line.code, open, close);
    const named = new Set<string>();
    let positional = 0;
    for (const part of args) {
      const label = /^\s*\$?([A-Za-z_]\w*)\s*=/.exec(part.text);
      if (label) named.add(label[1]!);
      else if (part.text.trim()) positional += 1;
    }
    const missing = macro.params.filter(
      (param, index) => !param.optional && index >= positional && !named.has(param.name),
    );
    if (missing.length)
      issues.push({
        ...whole,
        message: `${name} is missing ${missing.map((param) => param.name).join(", ")}: ${name}(${macro.params
          .map((param) => (param.optional ? `${param.name}?` : param.name))
          .join(", ")})`,
      });
    // The engine reads a dot in an alias as a path separator, so the diagram doesn't draw.
    const alias = macro.category === "layout" || macro.category === "relationship" ? undefined : args[0];
    const aliasText = alias?.text.trim().replace(/^\$?alias\s*=\s*/, "");
    if (alias && aliasText && /^[\w.$-]+$/.test(aliasText) && aliasText.includes("."))
      issues.push({
        from: line.from + alias.from + alias.text.indexOf(aliasText),
        to: line.from + alias.from + alias.text.indexOf(aliasText) + aliasText.length,
        message: `The alias ${aliasText} can't contain a dot: the diagram engine reads a dot as a separator between a boundary and its contents`,
      });
  }
  return issues;
}
