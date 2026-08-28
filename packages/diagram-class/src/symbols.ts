import type { TextRange } from "@plantuml-studio/language-core";
import type { ClassDocument, ClassEntity } from "./model";

export interface ClassSymbolOccurrence {
  kind: "class-entity";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration" | "reference";
  declaration?: "label" | "alias";
}

const tokenValue = (value: string) => value.trim().replace(/^"|"$/g, "");

function nextValueRange(source: string, range: TextRange, value: string, after = range.from): TextRange | undefined {
  const start = Math.max(range.from, after);
  const text = source.slice(start, range.to);
  const quoted = text.indexOf(`"${value}"`);
  const from = quoted >= 0 ? start + quoted + 1 : source.indexOf(value, start);
  if (from < 0 || from + value.length > range.to) return undefined;
  return { from, to: from + value.length };
}

export function collectClassSymbolOccurrences(source: string, document: ClassDocument): ClassSymbolOccurrence[] {
  const occurrences: ClassSymbolOccurrence[] = [];
  const entities = new Map(document.entities.map((item) => [item.id, item]));
  const add = (
    entity: ClassEntity | undefined,
    value: string,
    range: TextRange,
    role: ClassSymbolOccurrence["role"],
    after?: number,
    declaration?: ClassSymbolOccurrence["declaration"],
  ) => {
    if (!entity) return undefined;
    const valueRange = nextValueRange(source, range, value, after);
    if (!valueRange) return undefined;
    occurrences.push({
      kind: "class-entity",
      key: entity.id,
      value,
      range: valueRange,
      role,
      ...(declaration ? { declaration } : {}),
    });
    return valueRange.to;
  };

  for (const entity of document.entities) {
    const after = add(entity, entity.label, entity.openRange, "declaration", undefined, "label");
    if (entity.alias) add(entity, entity.alias, entity.openRange, "declaration", after, "alias");
  }
  for (const relationship of document.relationships) {
    const text = source.slice(relationship.sourceRange.from, relationship.sourceRange.to);
    const match = text.match(
      /^\s*("[^"]+"|[\w.$-]+)(?:\s+"[^"]+")?\s+[^\s]+\s+(?:"[^"]+"\s+)?("[^"]+"|[\w.$-]+)/,
    );
    if (!match?.[1] || !match[2]) continue;
    const fromValue = tokenValue(match[1]);
    const toValue = tokenValue(match[2]);
    const after = add(entities.get(relationship.from), fromValue, relationship.sourceRange, "reference");
    add(entities.get(relationship.to), toValue, relationship.sourceRange, "reference", after);
  }
  for (const note of document.notes) {
    if (!note.targetId || !entities.has(note.targetId)) continue;
    const headerEnd = source.indexOf("\n", note.sourceRange.from);
    const range = { from: note.sourceRange.from, to: headerEnd < 0 ? note.sourceRange.to : headerEnd };
    const text = source.slice(range.from, range.to);
    const match = text.match(/^\s*note\s+(?:left|right|top|bottom)\s+of\s+([^\s#]+)/i);
    if (!match?.[1]) continue;
    add(entities.get(note.targetId), tokenValue(match[1]), range, "reference");
  }

  return occurrences.sort((left, right) => left.range.from - right.range.from);
}
