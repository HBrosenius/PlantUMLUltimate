import type { TextRange } from "@plantuml-studio/language-core";
import type { ClassDocument, ClassEntity } from "./model";

export interface ClassSymbolOccurrence {
  kind: "class-entity" | "class-package";
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
  const identities = new Map<string, ClassEntity>();
  for (const entity of document.entities) {
    identities.set(entity.id.toLocaleLowerCase(), entity);
    identities.set(entity.label.toLocaleLowerCase(), entity);
    if (entity.alias) identities.set(entity.alias.toLocaleLowerCase(), entity);
  }
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
  const addTypeReferences = (text: string, from: number) => {
    for (const match of text.matchAll(/[A-Za-z_$][\w.$-]*/g)) {
      const value = match[0];
      const entity = identities.get(value.toLocaleLowerCase());
      if (!entity || match.index === undefined) continue;
      occurrences.push({
        kind: "class-entity",
        key: entity.id,
        value,
        range: { from: from + match.index, to: from + match.index + value.length },
        role: "reference",
      });
    }
  };
  const parameterTypeSegments = (parameters: string) => {
    const segments: Array<{ text: string; from: number }> = [];
    let start = 0;
    let genericDepth = 0;
    for (let index = 0; index <= parameters.length; index += 1) {
      const character = parameters[index];
      if (character === "<") genericDepth += 1;
      else if (character === ">") genericDepth = Math.max(0, genericDepth - 1);
      if (index !== parameters.length && (character !== "," || genericDepth > 0)) continue;
      const part = parameters.slice(start, index);
      const colon = part.indexOf(":");
      if (colon >= 0) {
        const rawType = part.slice(colon + 1);
        const leading = rawType.length - rawType.trimStart().length;
        segments.push({ text: rawType.trim(), from: start + colon + 1 + leading });
      }
      start = index + 1;
    }
    return segments;
  };
  for (const owner of document.entities) {
    if (owner.generic) {
      const authored = source.slice(owner.openRange.from, owner.openRange.to);
      const genericFrom = authored.indexOf(owner.generic);
      if (genericFrom >= 0) addTypeReferences(owner.generic, owner.openRange.from + genericFrom);
    }
    for (const member of owner.members) {
      const authored = source.slice(member.sourceRange.from, member.sourceRange.to);
      const memberFrom = authored.indexOf(member.text);
      if (memberFrom < 0) continue;
      const absoluteMemberFrom = member.sourceRange.from + memberFrom;
      if (member.type) {
        const typeFrom = member.text.lastIndexOf(member.type);
        if (typeFrom >= 0) addTypeReferences(member.type, absoluteMemberFrom + typeFrom);
      }
      if (member.parameters !== undefined) {
        const parametersFrom = member.text.indexOf("(") + 1;
        for (const segment of parameterTypeSegments(member.parameters))
          addTypeReferences(segment.text, absoluteMemberFrom + parametersFrom + segment.from);
      }
    }
  }
  for (const item of document.packages) {
    const addPackage = (value: string, after?: number, declaration?: "label" | "alias") => {
      const valueRange = nextValueRange(source, item.openRange, value, after);
      if (!valueRange) return undefined;
      occurrences.push({
        kind: "class-package",
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
    const match = text.match(/^\s*("[^"]+"|[\w.$-]+)(?:\s+"[^"]+")?\s+[^\s]+\s+(?:"[^"]+"\s+)?("[^"]+"|[\w.$-]+)/);
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
