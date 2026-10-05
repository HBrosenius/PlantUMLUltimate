import type { DiagramKind } from "./model";

interface BraceIssue {
  from: number;
  to: number;
  replacement: string;
  label: string;
  message: string;
}

export function braceIssues(kind: DiagramKind, source: string): BraceIssue[] {
  if (kind !== "class" && kind !== "component" && kind !== "usecase") return [];
  const lines: Array<{ text: string; code: string; from: number; indent: number }> = [];
  let offset = 0;
  let block = false;
  let note = false;
  for (const raw of source.split("\n")) {
    const text = raw.replace(/\r$/, "");
    const trimmed = text.trim();
    let code = "";
    if (block) {
      if (trimmed.includes("'/")) block = false;
    } else if (trimmed.startsWith("/'")) block = !trimmed.includes("'/", 2);
    else if (note) {
      if (/^end\s+note\b/i.test(trimmed)) note = false;
    } else if (/^note\b/i.test(trimmed) && !trimmed.includes(":")) note = true;
    else {
      let quoted = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i]!;
        if (char === '"' && text[i - 1] !== "\\") quoted = !quoted;
        if (!quoted && char === "'") break;
        code += quoted || char === '"' ? "x" : char;
      }
    }
    lines.push({ text, code, from: offset, indent: text.match(/^\s*/)?.[0].length ?? 0 });
    offset += raw.length + 1;
  }
  const declaration =
    kind === "usecase"
      ? /^\s*(?:package|rectangle)\s+\S/i
      : /^\s*(?:abstract\s+class|class|interface|enum|annotation|entity|component|package|rectangle|node|database|cloud|folder|frame)\s+\S/i;
  // Use the original declaration for quoted names, but only count structural braces outside quotes.
  const isDeclaration = (line: (typeof lines)[number]) => declaration.test(line.text) && line.code.trim().length > 0;
  const issues: BraceIssue[] = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.code.trim() === "{" && i > 0 && isDeclaration(lines[i - 1]!) && /\{\s*$/.test(lines[i - 1]!.code)) {
      const to = i + 1 < lines.length ? lines[i + 1]!.from : line.from + line.text.length;
      issues.push({
        from: line.from,
        to,
        replacement: "",
        label: "Remove duplicated opening brace",
        message: "Block has duplicated opening braces",
      });
      continue;
    }
    const opening = isDeclaration(line) ? /\{\{+\s*$/.exec(line.code) : null;
    if (opening) {
      const from = line.from + opening.index;
      const count = opening[0].trim().length;
      issues.push({
        from,
        to: from + count,
        replacement: "{",
        label: "Remove duplicated opening brace",
        message: "Block has duplicated opening braces",
      });
      depth++;
      continue;
    }
    if (isDeclaration(line) && !/[{}]/.test(line.code)) {
      const next = lines.slice(i + 1).find((item) => item.code.trim());
      if (next && next.indent > line.indent && next.code.trim() !== "{") {
        let closing = -1;
        for (let j = i + 1; j < lines.length; j++) {
          const item = lines[j]!;
          if (!item.code.trim()) continue;
          if (item.indent === line.indent && /^\s*}\s*$/.test(item.code)) {
            closing = j;
            break;
          }
          if (item.indent <= line.indent) break;
        }
        if (closing >= 0) {
          // Indentation and the existing closer identify a unique member/group block.
          const end = lines[closing]!;
          const to = end.from + end.text.length;
          const insertion = line.code.trimEnd().length;
          const original = source.slice(line.from, to);
          issues.push({
            from: line.from,
            to,
            replacement: original.slice(0, insertion) + " {" + original.slice(insertion),
            label: "Add missing opening brace",
            message: "Indented block is missing its opening brace",
          });
          // Account for this inferred block so its closing brace is not treated as a duplicate.
          depth++;
        }
      }
    }
    const closes = /^\s*(}+)(\s*)$/.exec(line.code);
    if (closes) {
      const count = closes[1]!.length;
      if (depth > 0 && count > depth && count > 1) {
        const keep = Math.max(0, depth);
        const from = line.from + line.code.indexOf("}");
        issues.push({
          from,
          to: from + count,
          replacement: "}".repeat(keep),
          label: "Remove duplicated closing brace",
          message: "Block has excess closing braces",
        });
      }
      depth = Math.max(0, depth - count);
    } else if (isDeclaration(line) && /\{\s*$/.test(line.code)) depth++;
    if (/^\s*@(?:start|end)uml\b/i.test(line.code)) depth = 0;
  }
  return issues;
}
