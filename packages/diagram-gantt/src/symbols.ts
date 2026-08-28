import type { GanttDocument, GanttTask, TextRange } from "./model";
import { normalizeTaskId } from "./parser";

export interface GanttSymbolOccurrence {
  kind: "task" | "person";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration" | "reference";
}

function unique(items: GanttSymbolOccurrence[]): GanttSymbolOccurrence[] {
  return [
    ...new Map(items.map((item) => [`${item.kind}:${item.key}:${item.range.from}:${item.range.to}`, item])).values(),
  ];
}

function declarationLines(source: string, document: GanttDocument): TextRange[] {
  const ranges = document.tasks.flatMap((task) =>
    task.declarations.map((item) => {
      const from = source.lastIndexOf("\n", Math.max(0, item.range.from - 1)) + 1;
      const end = source.indexOf("\n", item.range.to);
      return { from, to: end < 0 ? source.length : end };
    }),
  );
  return [...new Map(ranges.map((item) => [`${item.from}:${item.to}`, item])).values()];
}

export function taskOccurrences(source: string, document: GanttDocument, task: GanttTask): GanttSymbolOccurrence[] {
  const occurrences: GanttSymbolOccurrence[] = [];
  for (const declaration of declarationLines(source, document)) {
    const text = source.slice(declaration.from, declaration.to);
    for (const match of text.matchAll(/\[([^\]]+)]/g)) {
      if (match.index === undefined || !match[1]) continue;
      const key = normalizeTaskId(match[1]);
      if ((document.symbols.references.get(key) ?? key) !== task.id) continue;
      const from = declaration.from + match.index + 1;
      occurrences.push({
        kind: "task",
        key: task.id,
        value: match[1],
        range: { from, to: from + match[1].length },
        role: from === task.labelRange.from ? "declaration" : "reference",
      });
    }
  }
  for (const separator of document.verticalSeparators) {
    const key = normalizeTaskId(separator.taskLabel);
    if ((document.symbols.references.get(key) ?? key) !== task.id) continue;
    const text = source.slice(separator.sourceRange.from, separator.sourceRange.to);
    const index = text.indexOf(`[${separator.taskLabel}]`);
    if (index < 0) continue;
    const from = separator.sourceRange.from + index + 1;
    occurrences.push({
      kind: "task",
      key: task.id,
      value: separator.taskLabel,
      range: { from, to: from + separator.taskLabel.length },
      role: "reference",
    });
  }
  return unique(occurrences);
}

export function ganttSymbolOccurrences(source: string, document: GanttDocument): GanttSymbolOccurrence[] {
  const occurrences = document.tasks.flatMap((task) => taskOccurrences(source, document, task));
  for (const declaration of declarationLines(source, document)) {
    const text = source.slice(declaration.from, declaration.to);
    for (const block of text.matchAll(/\{([^}\r\n]+)}/g)) {
      if (block.index === undefined || !block[1]) continue;
      const contentOffset = declaration.from + block.index + 1;
      for (const part of block[1].matchAll(/(?:^|,)\s*([^,:}]+?)(?=\s*(?::\s*\d+%)?\s*(?:,|$))/g)) {
        if (part.index === undefined || !part[1]) continue;
        const value = part[1].trim();
        const from = contentOffset + part.index + part[0].indexOf(part[1]);
        occurrences.push({
          kind: "person",
          key: value.toLocaleLowerCase(),
          value,
          range: { from, to: from + value.length },
          role: "reference",
        });
      }
    }
  }
  return unique(occurrences);
}
