import type { DiagramKind } from "./model";
import type { DiagramQuickFix } from "./diagram-diagnostics";
import { opensNoteBlock } from "./block-repair-safety";

const common = ["skinparam", "title", "header", "footer", "legend", "caption"];
const keywords: Record<DiagramKind, string[]> = {
  sequence: [], // Sequence also exposes keyword diagnostics through its standalone language API.
  class: ["class", "interface", "enum", "annotation", "abstract", "package", "namespace"],
  component: [
    "component",
    "interface",
    "package",
    "node",
    "database",
    "cloud",
    "folder",
    "frame",
    "rectangle",
    "artifact",
    "storage",
    "queue",
  ],
  usecase: ["actor", "usecase", "rectangle", "package"],
  activity: [
    "start",
    "stop",
    "end",
    "if",
    "else",
    "elseif",
    "endif",
    "while",
    "endwhile",
    "repeat",
    "switch",
    "case",
    "endswitch",
    "fork",
    "split",
    "partition",
    "detach",
    "kill",
    "backward",
    "label",
    "goto",
  ],
  gantt: ["project", "printscale", "ganttscale", "projectscale", "language"],
  wbs: [],
};

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length !== b.length) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    return [...longer].some((_, index) => longer.slice(0, index) + longer.slice(index + 1) === shorter);
  }
  const differences = [...a].flatMap((char, index) => (char === b[index] ? [] : [index]));
  return (
    differences.length === 1 ||
    (differences.length === 2 &&
      differences[1] === differences[0]! + 1 &&
      a[differences[0]!] === b[differences[1]!] &&
      a[differences[1]!] === b[differences[0]!])
  );
}

function validTail(keyword: string, tail: string): boolean {
  if (["start", "stop", "end", "endif", "endwhile", "endswitch", "detach", "kill"].includes(keyword))
    return !tail || /^\(/.test(tail);
  if (["if", "elseif", "while", "switch", "case"].includes(keyword)) return /^\(/.test(tail);
  if (["fork", "split"].includes(keyword)) return !tail || /^(?:again|else)\b/i.test(tail);
  if (keyword === "repeat") return !tail || /^(?:while\b|:)/i.test(tail);
  if (keyword === "abstract") return /^class\b/i.test(tail);
  if (keyword === "project") return /^starts\s+\d{4}-\d{2}-\d{2}\b/i.test(tail);
  if (["printscale", "ganttscale", "projectscale"].includes(keyword))
    return /^(?:daily|weekly|monthly|quarterly|yearly)\b/i.test(tail);
  return Boolean(tail) && !/^(?:[-<>=]|\.[-.])/.test(tail);
}

/** Repair only unique near-matches in statement positions, preserving embedded languages and prose. */
export function keywordRepairs(kind: DiagramKind, source: string): DiagramQuickFix[] {
  const candidates = [...common, ...keywords[kind]];
  const repairs: DiagramQuickFix[] = [];
  let offset = 0;
  let comment = false;
  let freeText: string | undefined;
  let opaqueDepth = 0;
  let pendingOpaque = false;
  let style = false;
  let action = false;
  for (const line of source.split("\n")) {
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
    const match = text.match(/^([a-z]+)(?:\s+(.*))?$/i);
    if (!match) continue;
    const word = match[1]!.toLowerCase();
    if (
      candidates.includes(word) ||
      [
        "note",
        "hnote",
        "rnote",
        "ref",
        "end",
        "hide",
        "show",
        "remove",
        "restore",
        "together",
        "scale",
        "newpage",
        "allowmixing",
        "page",
        "center",
        "url",
        "sprite",
      ].includes(word)
    )
      continue;
    const tail = (match[2] ?? "").replace(/\s+'.*$/, "").trim();
    const possible = candidates.filter((keyword) => oneEdit(word, keyword) && validTail(keyword, tail));
    if (possible.length !== 1) continue;
    const keyword = possible[0] === "project" ? "Project" : possible[0]!;
    const start = from + line.indexOf(match[1]!);
    repairs.push({
      from: start,
      to: start + match[1]!.length,
      replacement: keyword,
      label: `Replace with ${keyword}`,
      message: `Misspelled keyword "${match[1]}"; expected ${keyword}`,
    });
    if (braces > 0 && /^(?:skinparam|class|interface|enum|annotation)$/.test(keyword)) opaqueDepth = braces;
    if (!text.includes("{") && /^(?:skinparam|class|interface|enum|annotation)$/.test(keyword)) pendingOpaque = true;
    if (!tail && /^(?:title|legend|header|footer)$/.test(keyword)) freeText = keyword;
  }
  return repairs;
}
