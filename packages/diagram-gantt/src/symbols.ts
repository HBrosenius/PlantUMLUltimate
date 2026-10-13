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

function collectTaskOccurrences(
  source: string,
  document: GanttDocument,
  tasks: readonly GanttTask[],
  declarations: readonly TextRange[],
): GanttSymbolOccurrence[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const occurrences = new Map<string, GanttSymbolOccurrence[]>();
  const add = (item: GanttSymbolOccurrence) => {
    const entries = occurrences.get(item.key);
    if (entries) entries.push(item);
    else occurrences.set(item.key, [item]);
  };
  for (const declaration of declarations) {
    const text = source.slice(declaration.from, declaration.to);
    for (const match of text.matchAll(/\[([^\]]+)]/g)) {
      if (match.index === undefined || !match[1]) continue;
      const key = normalizeTaskId(match[1]);
      const task = byId.get(document.symbols.references.get(key) ?? key);
      if (!task) continue;
      const from = declaration.from + match.index + 1;
      add({
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
    const task = byId.get(document.symbols.references.get(key) ?? key);
    if (!task) continue;
    const text = source.slice(separator.sourceRange.from, separator.sourceRange.to);
    const index = text.indexOf(`[${separator.taskLabel}]`);
    if (index < 0) continue;
    const from = separator.sourceRange.from + index + 1;
    add({
      kind: "task",
      key: task.id,
      value: separator.taskLabel,
      range: { from, to: from + separator.taskLabel.length },
      role: "reference",
    });
  }
  // Keep task order and each task's source order, as callers previously received.
  return tasks.flatMap((task) => occurrences.get(task.id) ?? []);
}

export function taskOccurrences(source: string, document: GanttDocument, task: GanttTask): GanttSymbolOccurrence[] {
  return unique(collectTaskOccurrences(source, document, [task], declarationLines(source, document)));
}

export function ganttSymbolOccurrences(source: string, document: GanttDocument): GanttSymbolOccurrence[] {
  const declarations = declarationLines(source, document);
  const occurrences = collectTaskOccurrences(source, document, document.tasks, declarations);
  for (const declaration of declarations) {
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
