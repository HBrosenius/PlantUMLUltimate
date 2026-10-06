import type { DiagramKind } from "./model";
import type { DiagramQuickFix } from "./diagram-diagnostics";
import { opensNoteBlock } from "./block-repair-safety";

type StatementIssue = Omit<DiagramQuickFix, "replacement"> & { replacement?: string };
const endpoint = String.raw`(?:"(?:\\.|[^"\\])+"|\[[^\]]+\]|\([^()]+\)|:[^:]+:|[\p{L}_$][\p{L}\p{N}_.$]*)`;

/** Check statement operands only outside member bodies, embedded languages and prose. */
export function statementIssues(kind: DiagramKind, source: string): StatementIssue[] {
  const issues: StatementIssue[] = [];
  const declared = new Set<string>();
  let offset = 0;
  let comment = false;
  let quoted = false;
  let freeText: string | undefined;
  let opaqueDepth = 0;
  let pendingOpaque = false;
  let style = false;
  let action = false;
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    const from = offset;
    offset += line.length + 1;
    if (comment) {
      if (text.includes("'/")) comment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      comment = !text.includes("'/", 2);
      continue;
    }
    if (text.startsWith("'")) continue;
    if (style) {
      if (/<\/style>/i.test(text)) style = false;
      continue;
    }
    if (/<style>/i.test(text)) {
      style = !/<\/style>/i.test(text);
      continue;
    }
    if (freeText) {
      if (new RegExp(`^${freeText === "title" ? "endtitle" : `end ${freeText}`}\\s*(?:'.*)?$`, "i").test(text))
        freeText = undefined;
      continue;
    }
    if (action) {
      if (/[;|<>}]\s*(?:'.*)?$/.test(text)) action = false;
      continue;
    }
    if (kind === "activity" && /^:/.test(text)) {
      action = !/[;|<>}]\s*(?:'.*)?$/.test(text);
      continue;
    }
    const quoteCount = text.match(/(?<!\\)"/g)?.length ?? 0;
    if (quoted) {
      if (quoteCount % 2) quoted = false;
      continue;
    }
    if (quoteCount % 2) {
      quoted = true;
      continue;
    }
    const syntax = text.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/\s+'.*$/, "");
    const braces = (syntax.match(/\{/g)?.length ?? 0) - (syntax.match(/\}/g)?.length ?? 0);
    if (pendingOpaque && text) {
      pendingOpaque = false;
      if (text.startsWith("{")) {
        opaqueDepth = Math.max(0, braces);
        continue;
      }
    }
    if (opaqueDepth) {
      opaqueDepth = Math.max(0, opaqueDepth + braces);
      continue;
    }
    if (opensNoteBlock(text)) {
      freeText = "note";
      continue;
    }
    if (/^ref\s+(?:#[\w]+\s+)?over\b(?!.*:)/i.test(text)) {
      freeText = "ref";
      continue;
    }
    if (/^(?:title|legend|header|footer)\s*$/i.test(text)) {
      freeText = text.toLowerCase();
      continue;
    }
    if (
      /^(?:skinparam|json|map|(?:abstract\s+)?class|interface|enum|annotation|entity|object)\b/i.test(text) &&
      braces > 0
    ) {
      opaqueDepth = braces;
      continue;
    }
    if (
      /^(?:skinparam|json|map|(?:abstract\s+)?class|interface|enum|annotation|entity|object)\b/i.test(text) &&
      !text.includes("{")
    )
      pendingOpaque = true;
    const statement = text.replace(/\s+'.*$/, "");
    const add = (message: string, replacement?: string) =>
      issues.push({
        from: from + line.indexOf(text),
        to: from + line.indexOf(text) + text.length,
        message,
        ...(replacement === undefined ? {} : { replacement, label: "Add arrow shaft" }),
      });
    const declaration = statement.match(
      /^(?:abstract\s+)?(class|interface|enum|annotation|entity|object|component|actor|usecase|participant|boundary|control|database|collections|queue)\s+([\p{L}_$][\p{L}\p{N}_.$]*)/u,
    );
    if (declaration) declared.add(declaration[2]!);
    const next = lines
      .slice(index + 1)
      .find((value) => value.trim() && !value.trim().startsWith("'"))
      ?.trim();
    if (/^skinparam(?:\s+\w+)?$/i.test(statement) && !next?.startsWith("{")) {
      add("Incomplete skinparam directive; specify a property and value, or a parameter block");
      continue;
    }
    const bareDeclaration =
      kind === "class"
        ? /^(?:abstract\s+)?(?:class|interface|enum|annotation|entity|object)$/i
        : kind === "component"
          ? /^(?:component|interface|node|database|artifact|cloud|folder|frame|rectangle)$/i
          : kind === "usecase"
            ? /^(?:actor|usecase)$/i
            : kind === "sequence"
              ? /^(?:participant|actor|boundary|control|entity|database|collections|queue)$/i
              : /(?!)/;
    if (bareDeclaration.test(statement)) {
      add("Incomplete declaration; specify a name");
      continue;
    }
    if (
      kind === "gantt" &&
      (/^Project\s+starts\s*$/i.test(statement) || /^today\s+is\s+colou?red\s+in\s*$/i.test(statement))
    ) {
      add(/^Project/i.test(statement) ? "Project starts requires a date" : "Today highlight requires a color");
      continue;
    }
    if (kind === "activity" && /^(?:(?:if|elseif)\s*(?:then(?:\s*\([^)]*\))?)?|while|switch)\s*$/i.test(statement)) {
      add("Incomplete control statement; specify a condition in parentheses");
      continue;
    }
    if (declaration || !["class", "component", "usecase", "sequence"].includes(kind)) continue;
    const angle = statement.match(new RegExp(`^(${endpoint})(\\s*)([<>])(\\s*)(${endpoint})(\\s*(?::.*)?)$`, "u"));
    if (angle) {
      const arrow = angle[3] === ">" ? "->" : "<-";
      add("Relationship arrow requires a shaft", `${angle[1]}${angle[2]}${arrow}${angle[4]}${angle[5]}${angle[6]}`);
      continue;
    }
    if (kind === "class" && /^[-+#~]\s*[\p{L}_]/u.test(statement)) continue;
    // Sequence supports unnamed endpoints for incoming and outgoing messages.
    if (kind !== "sequence") {
      const arrow = String.raw`(?:[<|*o]+)?[-.=]+(?:\[[^\]]*\])?[-.=]*[>|*o]*`;
      if (new RegExp(`^(?:${endpoint}\\s*${arrow}|${arrow}\\s+${endpoint})\\s*$`, "u").test(statement)) {
        add("Incomplete relationship; specify both endpoints");
        continue;
      }
    }
    const pair = statement.match(new RegExp(`^(${endpoint})\\s+(${endpoint})(?:\\s*:.*)?$`, "u"));
    if (pair && declared.has(pair[1]!) && declared.has(pair[2]!))
      add("Missing relationship operator between declared endpoints");
  }
  return issues;
}
