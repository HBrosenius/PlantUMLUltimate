import type { TextRange } from "@plantuml-studio/language-core";
import type { UseCaseDocument, UseCaseElement } from "./model";

export interface UseCaseSymbolOccurrence {
  kind: "actor" | "usecase" | "usecase-package";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration" | "reference";
  declaration?: "label" | "alias";
}

const tokenValue = (value: string) =>
  value
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/^:|:$/g, "")
    .replace(/^\(|\)$/g, "");

function nextValueRange(source: string, range: TextRange, value: string, after = range.from): TextRange | undefined {
  const start = Math.max(range.from, after);
  const text = source.slice(start, range.to);
  const wrapped = [`"${value}"`, `:${value}:`, `(${value})`]
    .map((token) => ({ at: text.indexOf(token), inset: 1 }))
    .filter((candidate) => candidate.at >= 0)
    .sort((left, right) => left.at - right.at)[0];
  const from = wrapped ? start + wrapped.at + wrapped.inset : source.indexOf(value, start);
  if (from < 0 || from + value.length > range.to) return undefined;
  return { from, to: from + value.length };
}

export function collectUseCaseSymbolOccurrences(source: string, document: UseCaseDocument): UseCaseSymbolOccurrence[] {
  const occurrences: UseCaseSymbolOccurrence[] = [];
  const elements = new Map(document.elements.map((item) => [item.id, item]));
  const add = (
    element: UseCaseElement | undefined,
    value: string,
    range: TextRange,
    role: UseCaseSymbolOccurrence["role"],
    after?: number,
    declaration?: UseCaseSymbolOccurrence["declaration"],
  ) => {
    if (!element) return undefined;
    const valueRange = nextValueRange(source, range, value, after);
    if (!valueRange) return undefined;
    occurrences.push({
      kind: element.kind,
      key: element.id,
      value,
      range: valueRange,
      role,
      ...(declaration ? { declaration } : {}),
    });
    return valueRange.to;
  };

  for (const element of document.elements) {
    const after = add(element, element.label, element.sourceRange, "declaration", undefined, "label");
    if (element.alias) add(element, element.alias, element.sourceRange, "declaration", after, "alias");
  }
  for (const item of document.packages) {
    const addPackage = (value: string, after?: number, declaration?: "label" | "alias") => {
      const valueRange = nextValueRange(source, item.openRange, value, after);
      if (!valueRange) return undefined;
      occurrences.push({
        kind: "usecase-package",
        key: item.id,
        value,
        range: valueRange,
        role: "declaration",
        ...(declaration ? { declaration } : {}),
      });
      return valueRange.to;
    };
    const after = addPackage(item.label, undefined, "label");
    if (item.alias) addPackage(item.alias, after, "alias");
  }
  for (const relationship of document.relationships) {
    const text = source.slice(relationship.sourceRange.from, relationship.sourceRange.to);
    const match = text.match(
      /^\s*("[^"]+"|:[^:]+:|\([^)]*\)|[\w.$-]+)\s+([^\s]+)\s+("[^"]+"|:[^:]+:|\([^)]*\)|[\w.$-]+)/,
    );
    if (!match?.[1] || !match[3]) continue;
    const fromValue = tokenValue(match[1]);
    const toValue = tokenValue(match[3]);
    const after = add(elements.get(relationship.from), fromValue, relationship.sourceRange, "reference");
    add(elements.get(relationship.to), toValue, relationship.sourceRange, "reference", after);
  }
  for (const note of document.notes) {
    if (note.targetIds.length !== 1) continue;
    const headerEnd = source.indexOf("\n", note.sourceRange.from);
    const range = { from: note.sourceRange.from, to: headerEnd < 0 ? note.sourceRange.to : headerEnd };
    const text = source.slice(range.from, range.to);
    const match = text.match(/^\s*note\s+(?:left|right|top|bottom)\s+of\s+([^\s#]+)/i);
    if (!match?.[1]) continue;
    add(elements.get(note.targetIds[0]!), tokenValue(match[1]), range, "reference");
  }

  return occurrences.sort((left, right) => left.range.from - right.range.from);
}
