import type { DiagramKind } from "./model";
import { diagnosticsForDiagram } from "./diagram-diagnostics";
import { validateGeneratedSource } from "./generated-source-validation";

export interface FormatChange {
  line: number;
  before: string;
  after: string;
}
export interface FormatResult {
  source: string;
  changes: FormatChange[];
  reason?: string;
}
/** Normalizes indentation and recognized Gantt task separators; label/text whitespace stays authored. */
export function formatSource(kind: DiagramKind, source: string): FormatResult {
  const unchanged = (reason: string): FormatResult => ({ source, changes: [], reason });
  if (source.length > 500_000) return unchanged("Source is too large for this formatter. Nothing was changed.");
  if (/\r(?!\n)/.test(source)) return unchanged("Standalone CR line endings are not supported. Nothing was changed.");
  if (kind === "activity") return unchanged("Activity formatting is not supported yet. Nothing was changed.");
  const parts = source.split(/(\r\n|\r|\n)/);
  if (parts.length > 10_001) return unchanged("Formatting is limited to 5,000 lines. Nothing was changed.");
  const stack: Array<{ type: string; members?: boolean }> = [];
  let protectedEnd: RegExp | undefined;
  let blockComment = false;
  let opened = false,
    closed = false;
  const changes: FormatChange[] = [];
  const opening = kind === "gantt" ? "@startgantt" : kind === "wbs" ? "@startwbs" : "@startuml";
  const ending = kind === "gantt" ? "@endgantt" : kind === "wbs" ? "@endwbs" : "@enduml";
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]!,
      text = line.trim();
    const fail = (what: string) => unchanged(`${what} on line ${index / 2 + 1}. Nothing was changed.`);
    if (blockComment) {
      if (text.includes("'/")) blockComment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      blockComment = !text.slice(2).includes("'/");
      continue;
    }
    if (!text || text.startsWith("'")) continue;
    if (/^!/.test(text) && !/^!theme [\w-]+$/.test(text)) return fail("Preprocessor syntax is not formatted");
    if (protectedEnd) {
      if (protectedEnd.test(text)) protectedEnd = undefined;
      continue;
    }
    if (/^!theme [\w-]+$/.test(text)) continue;
    // Multiline text is copied byte-for-byte, including its opening/closing lines.
    if (/^(?:note|hnote|rnote)\b/i.test(text)) {
      if (!text.includes(":")) protectedEnd = /^end\s+(?:note|hnote|rnote)$/i;
      continue;
    }
    if (/^(?:title|header|footer|legend|caption)$/i.test(text) || /^legend\s+(?:left|right|center)$/i.test(text)) {
      const name = text.split(/\s/)[0]!;
      protectedEnd = new RegExp(`^end\\s+${name}$`, "i");
      continue;
    }
    if (/^(?:title|header|footer|caption)\s+\S/i.test(text)) continue;
    if (text === opening) {
      if (opened || closed) return fail("Multiple diagram envelopes are not formatted");
      opened = true;
    } else if (text === ending) {
      if (!opened || stack.length) return fail("Unbalanced blocks are not formatted");
      closed = true;
    } else {
      if (!opened || closed) return fail("Content outside the diagram is not formatted");
      if (/\\$/.test(text)) return fail("Continued lines are not formatted");
      // Quotes must close on this line. Multiline strings require manual review.
      const withoutStrings = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      if (withoutStrings.includes('"') && withoutStrings.replaceAll('""', "").includes('"'))
        return fail("Multiline or unbalanced quoted text is not formatted");
      if (/\$[\w]+\s*\(/.test(withoutStrings)) return fail("Macro calls are not formatted");
      const braceDeclaration =
        /^(?:(?:abstract\s+)?class|interface|enum|annotation|entity|package|namespace|rectangle|frame|folder|cloud|node|artifact|component|database|queue|storage)\s+(?:"[^"]+"|[\w.]+)(?:\s+as\s+[\w.]+)?\s*\{\s*$/.test(
          text,
        );
      const sequenceOpen = kind === "sequence" && /^(?:alt|opt|loop|par|break|critical|group|box)\b/.test(text);
      const sequenceBranch = kind === "sequence" && /^(?:else|and)\b/.test(text);
      const sequenceClose = kind === "sequence" && /^(?:end|end box)$/.test(text);
      if (text === "}") {
        if (stack.at(-1)?.type !== "brace") return fail("Unbalanced braces are not formatted");
        stack.pop();
      } else if (sequenceClose) {
        const top = stack.at(-1)?.type;
        if (!top || top === "brace" || (text === "end box") !== (top === "box"))
          return fail("Unbalanced sequence blocks are not formatted");
        stack.pop();
      } else if (sequenceBranch) {
        if (!stack.length || !["alt", "par"].includes(stack.at(-1)!.type)) return fail("Unsupported sequence branch");
      } else if (braceDeclaration) {
        if (
          kind === "gantt" ||
          kind === "wbs" ||
          kind === "sequence" ||
          (withoutStrings.match(/[{}]/g)?.length ?? 0) !== 1
        )
          return fail("Unsupported brace block");
      } else if (sequenceOpen) {
        // Indentation only; control-flow text and arrow spelling stay authored.
      } else if (/[{}]/.test(withoutStrings) && kind !== "gantt") {
        return fail("Inline or unknown brace syntax is not formatted");
      } else if (kind === "wbs" && /^(?:\*+|[+-]+)\s+\S/.test(text)) {
        continue; // WBS prefixes and label whitespace remain exactly authored.
      } else if (
        kind === "gantt" &&
        /^(?:\[[^\]]+\]\s+(?:(?:starts|ends)\s+(?:\d{4}-\d{2}-\d{2}|at\s+\[[^\]]+\][’']s\s+(?:start|end)|(?:\d+\s+(?:days?|weeks?)\s+)?(?:after|before)\s+\[[^\]]+\][’']s\s+(?:start|end))|lasts\s+\d+\s+(?:days?|weeks?))|Project starts\s+\d{4}-\d{2}-\d{2}|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+are\s+(?:closed|open)|today is colored in\s+#[\da-f]{3,8}|printscale\s+(?:daily|weekly|monthly|quarterly|yearly))$/i.test(
          text,
        )
      ) {
        // Known single-line Gantt statements; only their leading whitespace changes.
      } else if (
        /^(?:skinparam\s+[\w]+\s+[^{}]+|(?:left to right|top to bottom) direction|hide\s+[\w ]+|show\s+[\w ]+|autonumber(?:\s+\d+(?:\s+\d+)?)?)$/.test(
          text,
        )
      ) {
        // Simple display directives; multiline skinparam/style blocks are not handled.
      } else if (
        kind !== "gantt" &&
        kind !== "wbs" &&
        /^(?:participant|actor|boundary|control|entity|database|collections|queue|component|interface|usecase|class|abstract class|enum|annotation|rectangle|node|artifact)\s+(?:"[^"]+"|[\w.]+)(?:\s+as\s+[\w.]+)?(?:\s+<<[^>]+>>)?(?:\s+#[\w]+)?$/.test(
          text,
        )
      ) {
        // Single-line declarations.
      } else if (stack.at(-1)?.members && /^[+\-#~]?[\w][^{}]*$/.test(text)) {
        // Class members are single-line text; visibility, types and spacing are preserved.
      } else if (
        kind !== "gantt" &&
        kind !== "wbs" &&
        /^(?:[\w.]+|"[^"]+"|\[[^\]]+\]|\([^)]*\))(?:\s+"[^"]*")?\s+(?:<\||\|>|[<>*o])?[-.]{1,3}(?:<\||\|>|[<>*o])?(?:\s+"[^"]*")?\s+(?:[\w.]+|"[^"]+"|\[[^\]]+\]|\([^)]*\))(?:\s*:\s*.*)?$/.test(
          text,
        )
      ) {
        // Relationships: leading indentation only, never arrow normalization.
      } else return fail("Formatter does not yet support this syntax");
      const depth = stack.length - (sequenceBranch ? 1 : 0);
      let after = "  ".repeat(Math.max(0, depth)) + line.replace(/^[ \t]*/, "");
      if (kind === "gantt") after = after.replace(/^(\[[^\]]+\])[ \t]+(?=(?:starts|ends|lasts)\b)/i, "$1 ");
      if (after !== line) changes.push({ line: index / 2 + 1, before: line, after });
      parts[index] = after;
      if (braceDeclaration)
        stack.push({
          type: "brace",
          members: /^(?:(?:abstract\s+)?class|interface|enum|annotation|entity)\b/.test(text),
        });
      if (sequenceOpen) stack.push({ type: text.split(/\s/)[0]! });
      continue;
    }
    const after = text; // Envelope whitespace carries no label text.
    if (after !== line) changes.push({ line: index / 2 + 1, before: line, after });
    parts[index] = after;
  }
  if (!opened || !closed || protectedEnd || blockComment || stack.length)
    return unchanged("Unclosed diagram or text block. Nothing was changed.");
  if (diagnosticsForDiagram(kind, source).some((d) => d.severity === "error"))
    return unchanged("Resolve source errors before formatting. Nothing was changed.");
  const formatted = parts.join("");
  const validation = validateGeneratedSource(kind, source, formatted);
  if (!validation.valid) return unchanged(`Formatting was withheld: ${validation.message}`);
  return {
    source: formatted,
    changes,
    ...(!changes.length ? { reason: "No supported whitespace changes are needed." } : {}),
  };
}
