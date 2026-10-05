import type { DiagramKind } from "./model";

export interface QuoteIssue {
  from: number;
  to: number;
  message: string;
  replacement?: string;
  label?: string;
}

// Only declaration labels are quoted syntax here; note bodies and free text may contain quotes.
export function quoteIssues(kind: DiagramKind, source: string): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  const declaration =
    kind === "sequence"
      ? /^(\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+)(.*)$/i
      : kind === "class" || kind === "component" || kind === "usecase"
        ? /^(\s*(?:abstract\s+class|class|interface|enum|annotation|entity|component|actor|usecase|package|rectangle|node|database|cloud|folder|frame)\s+)(.*)$/i
        : undefined;
  if (!declaration) return issues;
  let offset = 0;
  let block = false;
  let note = false;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (block) {
      if (trimmed.includes("'/")) block = false;
    } else if (trimmed.startsWith("/'")) {
      block = !trimmed.includes("'/", 2);
    } else if (note) {
      if (/^end\s+note\b/i.test(trimmed)) note = false;
    } else if (/^note\b/i.test(trimmed) && !trimmed.includes(":")) {
      note = true;
    } else if (!trimmed.startsWith("'")) {
      const match = line.match(declaration);
      if (match) {
        const prefix = match[1]!;
        const value = match[2]!;
        const positions: number[] = [];
        for (let index = 0; index < value.length; index++) {
          if (value[index] === "'" && /\s/.test(value[index - 1] ?? "") && positions.length % 2 === 0) break;
          if (value[index] !== '"') continue;
          let slashes = 0;
          for (let previous = index - 1; previous >= 0 && value[previous] === "\\"; previous--) slashes++;
          if (slashes % 2 === 0) positions.push(index);
        }
        if (positions.length % 2 === 1) {
          let repaired: string | undefined;
          let label: string | undefined;
          if (positions.length === 3) {
            // Only collapse an extra quote at a label boundary.
            const [a, b, c] = positions as [number, number, number];
            const duplicate = a === 0 && b === 1 ? a : a === 0 && c === b + 1 ? c : undefined;
            if (
              duplicate !== undefined &&
              /^(?:\s+as\s+\w+)?(?:\s+<<[^>]+>>)?(?:\s+#[\w]+)?\s*\{?\s*(?:'.*)?$/i.test(value.slice(c + 1))
            ) {
              repaired = value.slice(0, duplicate) + value.slice(duplicate + 1);
              label = "Remove duplicated quote";
            }
          } else if (positions.length === 1) {
            const at = positions[0]!;
            if (
              at > 0 &&
              !/\s+as\s+/i.test(value.slice(0, at)) &&
              /^[^"]+"(?:\s+as\s+[\w]+)?\s*(?:\{|#[\w]+)?\s*$/i.test(value)
            ) {
              repaired = '"' + value;
              label = "Add missing opening quote";
            } else if (at === 0) {
              const boundaries = [...value.matchAll(/\s+as\s+[\w]+(?=\s*(?:\{|#[\w]+)?\s*$)/gi)];
              const otherAs = [...value.matchAll(/\s+as\s+/gi)];
              if (boundaries.length === 1 && otherAs.length === 1) {
                const end = boundaries[0]!.index!;
                repaired = value.slice(0, end) + '"' + value.slice(end);
              } else if (otherAs.length === 0 && !/[{}]|\s#[\w]+/.test(value)) {
                repaired = value.trimEnd() + '"' + value.slice(value.trimEnd().length);
              }
              if (repaired) label = "Add missing closing quote";
            }
          }
          issues.push({
            from: offset + prefix.length,
            to: offset + line.length,
            message: "Quoted label has an unmatched quote",
            ...(repaired ? { replacement: repaired } : {}),
            ...(label ? { label } : {}),
          });
        }
      }
    }
    offset += raw.length + 1;
  }
  return issues;
}
