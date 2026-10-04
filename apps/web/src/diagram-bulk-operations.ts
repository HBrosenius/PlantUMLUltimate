import {
  parseClassDiagram,
  collectClassSymbolOccurrences,
  updateClassRelationship,
} from "@plantuml-studio/diagram-class";
import {
  parseUseCase,
  collectUseCaseSymbolOccurrences,
  updateUseCaseRelationship,
  updateUseCaseElement,
  insertUseCaseElement,
} from "@plantuml-studio/diagram-usecase";
import { parseActivity, updateActivityAction, updateActivityArrow } from "@plantuml-studio/diagram-activity";
import {
  parseWbs,
  collectWbsSymbolOccurrences,
  updateWbsNode,
  updateWbsRelationshipColor,
} from "@plantuml-studio/diagram-wbs";
import {
  parseSequence,
  sequenceParticipantOccurrences,
  updateSequenceMessage,
} from "@plantuml-studio/diagram-sequence";
import type { DiagramKind } from "./model";

export type BulkDiagramKind = Exclude<DiagramKind, "gantt">;
type Range = { from: number; to: number };
export interface DiagramBulkItem {
  key: string;
  id: string;
  attribute: string;
  label: string;
  range: Range;
  copyRange: Range;
  color: boolean;
  stereotype: boolean;
  changeColor?: (color: string) => string;
}
const key = (attribute: string, id: string) => `${attribute}:${id}`;
const endLine = (source: string, range: Range): Range => ({
  ...range,
  to: range.to + (source[range.to] === "\n" ? 1 : 0),
});

/** Catalog of semantic hit targets; ranges come from the same parsers as the editors. */
export function diagramBulkItems(kind: BulkDiagramKind, source: string): DiagramBulkItem[] {
  const items: DiagramBulkItem[] = [];
  const add = (
    attribute: string,
    item: { id: string; sourceRange: Range; label?: string; text?: string },
    color = true,
    stereotype = false,
    copyRange = item.sourceRange,
    changeColor?: (color: string) => string,
    range = item.sourceRange,
  ) => {
    items.push({
      key: key(attribute, item.id),
      id: item.id,
      attribute,
      label: item.label ?? item.text ?? item.id,
      range,
      copyRange,
      color,
      stereotype,
      ...(changeColor ? { changeColor } : {}),
    });
  };
  if (kind === "class" || kind === "component") {
    const doc = parseClassDiagram(source);
    doc.entities.forEach((item) =>
      add("data-class-object-id", item, true, true, item.sourceRange, undefined, item.openRange),
    );
    doc.packages.forEach((item) =>
      add("data-class-object-id", item, true, false, item.sourceRange, undefined, item.openRange),
    );
    doc.relationships.forEach((item) =>
      add("data-class-object-id", item, true, false, item.sourceRange, (color) =>
        updateClassRelationship(source, doc, item, { ...item, color }),
      ),
    );
    doc.notes.forEach((item) => add("data-class-object-id", item));
  } else if (kind === "usecase") {
    const doc = parseUseCase(source);
    doc.elements.forEach((item) => add("data-usecase-object-id", item, true, true));
    doc.packages.forEach((item) =>
      add("data-usecase-object-id", item, true, true, item.sourceRange, undefined, item.openRange),
    );
    doc.relationships.forEach((item) =>
      add("data-usecase-object-id", item, true, false, item.sourceRange, (color) =>
        updateUseCaseRelationship(source, doc, item, { ...item, color }),
      ),
    );
    doc.notes.forEach((item) => add("data-usecase-object-id", item));
  } else if (kind === "sequence") {
    const doc = parseSequence(source);
    doc.participants.forEach((item) => add("data-sequence-participant-id", item, true, true));
    doc.messages.forEach((item) =>
      add("data-sequence-message-id", item, true, false, item.sourceRange, (color) => {
        let styled = false;
        const arrow = item.arrow.replace(/\[([^\]]*)\]/g, (_match, values: string) => {
          const modifiers = values.split(",").filter((value) => !value.trim().startsWith("#"));
          if (color && !styled) modifiers.push(color);
          styled = true;
          return modifiers.length ? `[${modifiers.join(",")}]` : "";
        });
        const at = arrow.indexOf("-");
        return updateSequenceMessage(source, item, {
          ...item,
          arrow: color && !styled && at >= 0 ? `${arrow.slice(0, at + 1)}[${color}]${arrow.slice(at + 1)}` : arrow,
        });
      }),
    );
    [
      ...doc.fragments,
      ...doc.notes,
      ...doc.activations,
      ...doc.timelineItems,
      ...doc.references,
      ...doc.boxes,
      ...doc.autonumbers,
      ...doc.creations,
      ...doc.durations,
    ].forEach((item) => add("data-sequence-structure-id", item, "color" in item || "text" in item, false));
  } else if (kind === "activity") {
    const doc = parseActivity(source);
    doc.nodes.forEach((item) =>
      add("data-activity-object-id", item, item.kind === "action", item.kind === "action", item.sourceRange, (color) =>
        updateActivityAction(source, item, { ...item, color }),
      ),
    );
    doc.partitions.forEach((item) =>
      add("data-activity-object-id", item, true, false, item.sourceRange, undefined, item.openRange),
    );
    doc.notes.forEach((item) => add("data-activity-object-id", item));
    doc.arrows.forEach((item) =>
      add("data-activity-object-id", item, true, false, item.sourceRange, (color) =>
        updateActivityArrow(source, item, { ...item, color }),
      ),
    );
    const ends: Record<string, string> = {
      if: "endif",
      switch: "endswitch",
      fork: "end-fork",
      split: "end-split",
      repeat: "repeat-while",
      while: "endwhile",
    };
    doc.controls.forEach((item, index) => {
      let depth = 0;
      let range = item.sourceRange;
      if (ends[item.kind]) {
        for (const next of doc.controls.slice(index + 1)) {
          if (next.kind === item.kind) depth++;
          if (next.kind === ends[item.kind]) {
            if (depth) depth--;
            else {
              range = { from: range.from, to: next.sourceRange.to };
              break;
            }
          }
        }
      }
      add("data-activity-object-id", item, false, false, range);
    });
    for (const control of doc.controls) {
      if (ends[control.kind]) continue;
      const item = items.find((item) => item.id === control.id)!;
      const enclosing = items
        .filter(
          (candidate) =>
            candidate.copyRange.from <= item.range.from &&
            candidate.copyRange.to >= item.range.to &&
            candidate.copyRange.to > candidate.range.to,
        )
        .sort((a, b) => a.copyRange.to - a.copyRange.from - (b.copyRange.to - b.copyRange.from))[0];
      if (enclosing) item.copyRange = enclosing.copyRange;
    }
  } else {
    const doc = parseWbs(source);
    doc.nodes.forEach((item) =>
      add("data-wbs-node-id", item, true, true, item.subtreeRange, (color) =>
        updateWbsNode(source, item, {
          label: item.label,
          color,
          ...(item.textColor ? { textColor: item.textColor } : {}),
          ...(item.stereotype ? { stereotype: item.stereotype } : {}),
          ...(item.link ? { link: item.link } : {}),
          ...(item.icon ? { icon: item.icon } : {}),
        }),
      ),
    );
    doc.relationships.forEach((item) =>
      add("data-wbs-relationship-id", item, true, false, item.sourceRange, (color) =>
        updateWbsRelationshipColor(source, item, color),
      ),
    );
  }
  return items;
}

function replaceRanges(source: string, edits: Array<Range & { text: string }>): string {
  return [...new Map(edits.map((edit) => [`${edit.from}:${edit.to}`, edit])).values()]
    .sort((a, b) => b.from - a.from)
    .reduce((text, edit) => text.slice(0, edit.from) + edit.text + text.slice(edit.to), source);
}
function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges.sort((a, b) => a.from - b.from || b.to - a.to)) {
    const last = merged.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** Replace only authored style tokens outside strings and labels, preserving bodies/comments. */
function styleLine(text: string, value: string, mode: "color" | "stereotype") {
  const lineEnd = text.indexOf("\n");
  const first = lineEnd < 0 ? text : text.slice(0, lineEnd);
  const suffix = lineEnd < 0 ? "" : text.slice(lineEnd);
  const masked = first.replace(/"(?:[^"\\]|\\.)*"/g, (token) => " ".repeat(token.length));
  const boundary = /\s*\{|\s+order\s+-?\d+|\s+:\s|\s+'/.exec(masked);
  const at = boundary?.index ?? first.length;
  const tokens = /"(?:[^"\\]|\\.)*"|<<[^>]*>>|#[\w;:.-]+/g;
  const before = first
    .slice(0, at)
    .replace(tokens, (token) => {
      if (token.startsWith('"')) return token;
      if (mode === "stereotype" && token.startsWith("<<")) return "";
      if (mode === "color" && token.startsWith("#")) return "";
      return token;
    })
    .trimEnd();
  const after = first.slice(at);
  const token = value ? (mode === "color" ? value : `<<${value}>>`) : "";
  return `${before}${token ? ` ${token}` : ""}${after}${suffix}`;
}
export function changeDiagramItems(
  kind: BulkDiagramKind,
  source: string,
  keys: readonly string[],
  mode: "color" | "stereotype",
  raw: string,
): { source: string; applied: number; skipped: number } {
  const value = raw.trim();
  if (mode === "color" && value && !/^#?[a-zA-Z0-9_]+(?:[;-][a-zA-Z0-9_]+)*$/.test(value))
    throw new Error("Enter a color name or hex color.");
  if (mode === "stereotype" && /[<>\r\n]/.test(value))
    throw new Error("Enter a stereotype without brackets or line breaks.");
  const color = value && !value.startsWith("#") ? `#${value}` : value;
  const selected = diagramBulkItems(kind, source).filter((item) => keys.includes(item.key) && item[mode]);
  if (kind === "usecase") {
    let materialized = source;
    for (const selectedItem of selected) {
      const doc = parseUseCase(materialized);
      const element = doc.elements.find((element) => element.id === selectedItem.id);
      if (element?.implicit)
        materialized = updateUseCaseElement(materialized, doc, element, {
          ...element,
          [mode]: mode === "color" ? color : value,
        });
    }
    if (materialized !== source) return changeDiagramItems(kind, materialized, keys, mode, raw);
  }
  const edits = selected.map((item) => {
    if (mode === "stereotype" && (kind === "wbs" || kind === "activity")) {
      const next =
        kind === "wbs"
          ? (() => {
              const node = parseWbs(source).nodes.find((node) => node.id === item.id)!;
              const { side: _side, ...input } = node;
              return updateWbsNode(source, node, { ...input, stereotype: value });
            })()
          : (() => {
              const node = parseActivity(source).nodes.find((node) => node.id === item.id)!;
              return updateActivityAction(source, node, { ...node, stereotype: value });
            })();
      return { ...item.range, text: next.slice(item.range.from, next.length - (source.length - item.range.to)) };
    }
    if (mode === "color" && item.changeColor) {
      const next = item.changeColor(color);
      // Operations used here only change this item's own statement.
      return { ...item.range, text: next.slice(item.range.from, next.length - (source.length - item.range.to)) };
    }
    return {
      ...item.range,
      text: styleLine(source.slice(item.range.from, item.range.to), mode === "color" ? color : value, mode),
    };
  });
  return { source: replaceRanges(source, edits), applied: selected.length, skipped: keys.length - selected.length };
}

export interface DiagramClipboard {
  kind: BulkDiagramKind;
  text: string;
}
export function copyDiagramItems(
  kind: BulkDiagramKind,
  source: string,
  keys: readonly string[],
): DiagramClipboard | undefined {
  const items = diagramBulkItems(kind, source);
  const selected = items.filter((item) => keys.includes(item.key));
  if (!selected.length) return undefined;
  const implicit =
    kind === "usecase"
      ? parseUseCase(source).elements.filter(
          (item) => item.implicit && selected.some((selected) => selected.id === item.id),
        )
      : [];
  let ranges = mergeRanges(
    selected
      .filter((item) => !implicit.some((element) => element.id === item.id))
      .map((item) => endLine(source, item.copyRange)),
  );
  const includes = (range: Range) => ranges.some((part) => range.from >= part.from && range.to <= part.to);
  // Keep edges and attached notes between the copied declarations, without pulling external elements in.
  if (kind === "class" || kind === "component" || kind === "usecase") {
    const doc = kind === "usecase" ? parseUseCase(source) : parseClassDiagram(source);
    const declarations = "entities" in doc ? doc.entities : doc.elements;
    const ids = new Set([
      ...implicit.map((item) => item.id),
      ...declarations.filter((item) => includes(item.sourceRange)).map((item) => item.id),
    ]);
    const edges = doc.relationships.filter((item) => ids.has(item.from) && ids.has(item.to));
    const edgeIds = new Set(edges.map((item) => item.id));
    ranges = mergeRanges([
      ...ranges,
      ...edges.map((item) => endLine(source, item.sourceRange)),
      ...doc.notes
        .filter((item) =>
          "targetId" in item
            ? !!item.targetId && (ids.has(item.targetId) || edgeIds.has(item.targetId))
            : "targetIds" in item && item.targetIds.length > 0 && item.targetIds.every((id) => ids.has(id)),
        )
        .map((item) => endLine(source, item.sourceRange)),
    ]);
  } else if (kind === "sequence") {
    const doc = parseSequence(source);
    const ids = new Set(doc.participants.filter((item) => includes(item.sourceRange)).map((item) => item.id));
    ranges = mergeRanges([
      ...ranges,
      ...doc.messages
        .filter((item) => ids.has(item.from.toLowerCase()) && ids.has(item.to.toLowerCase()))
        .map((item) => endLine(source, item.sourceRange)),
    ]);
  } else if (kind === "wbs") {
    const doc = parseWbs(source);
    const aliases = new Set(doc.nodes.filter((item) => includes(item.sourceRange)).map((item) => item.alias));
    ranges = mergeRanges([
      ...ranges,
      ...doc.relationships
        .filter((item) => aliases.has(item.from) && aliases.has(item.to))
        .map((item) => endLine(source, item.sourceRange)),
    ]);
  }
  return {
    kind,
    text: [
      ...implicit.map((item) => insertUseCaseElement("", item).trimEnd()),
      ...ranges.map((range) => source.slice(range.from, range.to).trimEnd()),
    ].join("\n"),
  };
}

function occurrences(kind: BulkDiagramKind, source: string) {
  if (kind === "class" || kind === "component") return collectClassSymbolOccurrences(source, parseClassDiagram(source));
  if (kind === "usecase") return collectUseCaseSymbolOccurrences(source, parseUseCase(source));
  if (kind === "sequence") {
    const doc = parseSequence(source);
    return sequenceParticipantOccurrences(source, doc).map((item) => {
      const participant = doc.participants.find((participant) => participant.id === item.key);
      const declared =
        participant &&
        /^(?:participant|actor|boundary|control|entity|database|collections|queue)\b/i.test(
          source.slice(participant.sourceRange.from, participant.sourceRange.to).trim(),
        );
      return {
        ...item,
        role:
          item.role === "declaration" && !declared && item.kind === "participant" ? ("reference" as const) : item.role,
        declaration: participant?.alias === item.value ? ("alias" as const) : ("label" as const),
      };
    });
  }
  if (kind === "wbs") return collectWbsSymbolOccurrences(source, parseWbs(source));
  return [];
}

export function pasteDiagramItems(
  kind: BulkDiagramKind,
  source: string,
  clipboard: DiagramClipboard,
  parentId?: string,
) {
  if (kind !== clipboard.kind) throw new Error("Paste into a diagram of the same type.");
  const envelope = (text: string) => (kind === "wbs" ? `@startwbs\n${text}\n@endwbs` : `@startuml\n${text}\n@enduml`);
  let fragment = envelope(clipboard.text);
  const existing = occurrences(kind, source);
  const copied = occurrences(kind, fragment);
  const taken = new Set([...existing, ...copied].map((item) => item.value.toLowerCase()));
  const edits: Array<Range & { text: string }> = [];
  const declarations = copied.filter((item) => item.role === "declaration");
  const renames = new Map<string, string>();
  for (const item of declarations) {
    // Aliased display names are allowed to repeat; identity aliases must be unique.
    const alias = "declaration" in item && item.declaration === "alias";
    const hasAlias = declarations.some(
      (other) => other.key === item.key && "declaration" in other && other.declaration === "alias",
    );
    if (!alias && hasAlias) continue;
    if (!existing.some((other) => other.value.toLowerCase() === item.value.toLowerCase())) continue;
    const separator = alias || !item.value.includes(" ") ? "_" : " ";
    let next = `${item.value}${separator}copy`;
    for (let n = 2; taken.has(next.toLowerCase()); n++) next = `${item.value}${separator}copy${separator}${n}`;
    taken.add(next.toLowerCase());
    renames.set(`${item.kind}:${item.key}`, next);
  }
  for (const item of copied) {
    const next = renames.get(`${item.kind}:${item.key}`);
    if (
      !next ||
      (item.role === "declaration" &&
        "declaration" in item &&
        item.declaration === "label" &&
        declarations.some((other) => other.key === item.key && "declaration" in other && other.declaration === "alias"))
    )
      continue;
    edits.push({ ...item.range, text: next });
  }
  fragment = replaceRanges(fragment, edits);
  let block = fragment.slice(fragment.indexOf("\n") + 1, fragment.lastIndexOf("\n"));
  let at = /^\s*@end(?:uml|wbs)\b/im.exec(source)?.index ?? source.length;
  if (kind === "wbs") {
    const doc = parseWbs(source);
    const parent = doc.nodes.find((item) => item.id === parentId) ?? doc.roots[0];
    const pasted = parseWbs(envelope(block));
    const minimum = Math.min(...pasted.nodes.map((item) => item.depth));
    const delta = parent ? parent.depth + 1 - minimum : 1 - minimum;
    block = block.replace(
      /^(\s*)(\*+|[+-]+)(?=\s|\[|\(|:)/gm,
      (_, indent: string, marker: string) => `${indent}${marker[0]!.repeat(Math.max(1, marker.length + delta))}`,
    );
    if (parent) at = endLine(source, parent.subtreeRange).to;
  }
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  const nextSource = source.slice(0, at) + prefix + block + "\n" + source.slice(at);
  const start = at + prefix.length;
  const keys = diagramBulkItems(kind, nextSource)
    .filter((item) => item.range.from >= start && item.range.from < start + block.length)
    .map((item) => item.key);
  return { source: nextSource, keys };
}
