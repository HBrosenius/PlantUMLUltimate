import type {
  UseCaseDocument,
  UseCaseElement,
  UseCaseElementKind,
  UseCaseNote,
  UseCasePackage,
  UseCaseRelationship,
  UseCaseRelationshipKind,
} from "./model";

export interface UseCaseElementInput {
  kind: UseCaseElementKind;
  label: string;
  alias?: string;
  business?: boolean;
  stereotype?: string;
  color?: string;
}

export interface UseCaseRelationshipInput {
  from: string;
  to: string;
  kind: UseCaseRelationshipKind;
  label?: string;
  arrow?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted" | "bold";
  direction?: "left" | "right" | "up" | "down";
}

export interface UseCasePackageInput {
  kind: "package" | "rectangle";
  label: string;
  alias?: string;
  stereotype?: string;
  color?: string;
}

export interface UseCaseNoteInput {
  text: string;
  placement: "left" | "right" | "top" | "bottom";
  targetId?: string;
  alias?: string;
  color?: string;
}

const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const reference = (element: UseCaseElement) => element.alias ?? element.label;

function insertionPoint(source: string): number {
  const match = /(?:^|\n)\s*@enduml\b/i.exec(source);
  return match ? match.index + (match[0].startsWith("\n") ? 1 : 0) : source.length;
}

function statement(value: UseCaseElementInput): string {
  const keyword = `${value.kind}${value.business ? "/" : ""}`;
  const alias = value.alias?.trim();
  const stereotype = value.stereotype?.trim();
  const color = value.color?.trim();
  return `${keyword} ${quote(value.label.trim())}${alias ? ` as ${alias}` : ""}${stereotype ? ` <<${stereotype}>>` : ""}${color ? ` ${color.startsWith("#") ? color : `#${color}`}` : ""}`;
}

const endpointReference = (document: UseCaseDocument, id: string) => {
  const element = document.elements.find((item) => item.id === id);
  return element ? reference(element) : id;
};

function relationshipStatement(document: UseCaseDocument, value: UseCaseRelationshipInput): string {
  const arrow = value.arrow?.trim() || relationshipArrow(value);
  const semanticLabel = value.kind === "include" || value.kind === "extend" ? `<<${value.kind}>>` : value.label?.trim();
  return `${endpointReference(document, value.from)} ${arrow} ${endpointReference(document, value.to)}${semanticLabel ? ` : ${semanticLabel}` : ""}`;
}

function relationshipArrow(value: UseCaseRelationshipInput): string {
  const color = value.color?.trim();
  const modifiers = [
    ...(color ? [color.startsWith("#") ? color : `#${color}`] : []),
    ...(value.lineStyle && value.lineStyle !== "solid" ? [value.lineStyle] : []),
  ];
  const style = modifiers.length ? `[${modifiers.join(",")}]` : "";
  const direction = value.direction ?? "";
  if (value.kind === "include" || value.kind === "extend") return `.${style}${direction}.>`;
  if (value.kind === "generalization") return `-${style}${direction}-|>`;
  return `-${style}${direction}->`;
}

function packageOpening(value: UseCasePackageInput): string {
  const alias = value.alias?.trim();
  const stereotype = value.stereotype?.trim();
  const color = value.color?.trim();
  return `${value.kind} ${quote(value.label.trim())}${alias ? ` as ${alias}` : ""}${stereotype ? ` <<${stereotype}>>` : ""}${color ? ` ${color.startsWith("#") ? color : `#${color}`}` : ""} {`;
}

function noteStatement(document: UseCaseDocument, value: UseCaseNoteInput): string {
  const color = value.color?.trim();
  const colorSuffix = color ? ` ${color.startsWith("#") ? color : `#${color}`}` : "";
  if (!value.targetId) {
    const alias = value.alias?.trim() || "Note";
    return value.text.includes("\n")
      ? `note as ${alias}${colorSuffix}\n${value.text.trim()}\nend note`
      : `note ${quote(value.text.trim())} as ${alias}${colorSuffix}`;
  }
  const target = ` of ${endpointReference(document, value.targetId)}`;
  const prefix = `note ${value.placement}${target}${colorSuffix}`;
  return value.text.includes("\n") ? `${prefix}\n${value.text.trim()}\nend note` : `${prefix} : ${value.text.trim()}`;
}

function replaceRanges(source: string, replacements: Array<{ from: number; to: number; text: string }>): string {
  return replacements
    .sort((a, b) => b.from - a.from)
    .reduce((current, item) => `${current.slice(0, item.from)}${item.text}${current.slice(item.to)}`, source);
}

export function insertUseCaseElement(source: string, value: UseCaseElementInput): string {
  const at = insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${statement(value)}\n${source.slice(at)}`;
}

export function updateUseCaseElement(
  source: string,
  document: UseCaseDocument,
  element: UseCaseElement,
  value: UseCaseElementInput,
): string {
  const next = value.alias?.trim() || value.label.trim();
  const replacements = [{ ...element.sourceRange, text: statement(value) }];
  for (const relationship of document.relationships) {
    const endpoint = (id: string) => {
      if (id === element.id) return next;
      const related = document.elements.find((item) => item.id === id);
      return related ? reference(related) : id;
    };
    const from = endpoint(relationship.from);
    const to = endpoint(relationship.to);
    if (relationship.from !== element.id && relationship.to !== element.id) continue;
    const label = relationship.label ? ` : ${relationship.label}` : "";
    replacements.push({ ...relationship.sourceRange, text: `${from} ${relationship.arrow} ${to}${label}` });
  }
  for (const note of document.notes) {
    if (!note.targetIds.includes(element.id) || note.targetIds.length !== 1 || !note.placement) continue;
    const color = note.color ? ` ${note.color}` : "";
    const body = note.text.includes("\n") ? `\n${note.text}\nend note` : ` : ${note.text}`;
    replacements.push({ ...note.sourceRange, text: `note ${note.placement} of ${next}${color}${body}` });
  }
  return replaceRanges(source, replacements);
}

export function deleteUseCaseElement(source: string, document: UseCaseDocument, element: UseCaseElement): string {
  const ranges = [
    element.sourceRange,
    ...document.relationships
      .filter((item) => item.from === element.id || item.to === element.id)
      .map((item) => item.sourceRange),
    ...document.notes.filter((item) => item.targetIds.includes(element.id)).map((item) => item.sourceRange),
  ];
  const replacements = ranges.map((range) => ({
    from: range.from,
    to: source[range.to] === "\n" ? range.to + 1 : range.to,
    text: "",
  }));
  return replaceRanges(source, replacements);
}

export function insertUseCaseRelationship(
  source: string,
  document: UseCaseDocument,
  value: UseCaseRelationshipInput,
): string {
  const at = insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${relationshipStatement(document, value)}\n${source.slice(at)}`;
}

export function updateUseCaseRelationship(
  source: string,
  document: UseCaseDocument,
  relationship: UseCaseRelationship,
  value: UseCaseRelationshipInput,
): string {
  return replaceRanges(source, [{ ...relationship.sourceRange, text: relationshipStatement(document, value) }]);
}

export function deleteUseCaseRelationship(source: string, relationship: UseCaseRelationship): string {
  const to =
    source[relationship.sourceRange.to] === "\n" ? relationship.sourceRange.to + 1 : relationship.sourceRange.to;
  return replaceRanges(source, [{ from: relationship.sourceRange.from, to, text: "" }]);
}

export function insertUseCasePackage(source: string, value: UseCasePackageInput): string {
  const at = insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${packageOpening(value)}\n}\n${source.slice(at)}`;
}

export function updateUseCasePackage(source: string, item: UseCasePackage, value: UseCasePackageInput): string {
  return replaceRanges(source, [{ ...item.openRange, text: packageOpening(value) }]);
}

export function deleteUseCasePackage(source: string, item: UseCasePackage): string {
  const ranges = [item.closeRange, item.openRange].map((range) => ({
    from: range.from,
    to: source[range.to] === "\n" ? range.to + 1 : range.to,
    text: "",
  }));
  return replaceRanges(source, ranges);
}

export function insertUseCaseNote(source: string, document: UseCaseDocument, value: UseCaseNoteInput): string {
  const at = insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${noteStatement(document, value)}\n${source.slice(at)}`;
}

export function updateUseCaseNote(
  source: string,
  document: UseCaseDocument,
  note: UseCaseNote,
  value: UseCaseNoteInput,
): string {
  return replaceRanges(source, [{ ...note.sourceRange, text: noteStatement(document, value) }]);
}

export function deleteUseCaseNote(source: string, note: UseCaseNote): string {
  const to = source[note.sourceRange.to] === "\n" ? note.sourceRange.to + 1 : note.sourceRange.to;
  return replaceRanges(source, [{ from: note.sourceRange.from, to, text: "" }]);
}

export function moveUseCaseElementToPackage(
  source: string,
  document: UseCaseDocument,
  element: UseCaseElement,
  packageId?: string,
): string {
  if (element.packageId === packageId) return source;
  const target = packageId ? document.packages.find((item) => item.id === packageId) : undefined;
  if (packageId && !target) return source;
  const declaration = source.slice(element.sourceRange.from, element.sourceRange.to).trim();
  const originalInsertion = target?.closeRange.from ?? insertionPoint(source);
  const precedingReferences = [
    ...document.relationships.filter(
      (item) =>
        item.sourceRange.from < originalInsertion && (item.from === element.id || item.to === element.id),
    ),
    ...document.notes.filter(
      (item) => item.sourceRange.from < originalInsertion && item.targetIds.includes(element.id),
    ),
  ].sort((a, b) => a.sourceRange.from - b.sourceRange.from);
  const movedStatements = precedingReferences.map((item) => source.slice(item.sourceRange.from, item.sourceRange.to).trim());
  const ranges = [element.sourceRange, ...precedingReferences.map((item) => item.sourceRange)]
    .map((range) => ({
      from: range.from,
      to: source[range.to] === "\n" ? range.to + 1 : range.to,
    }))
    .sort((a, b) => b.from - a.from);
  const without = ranges.reduce((current, range) => `${current.slice(0, range.from)}${current.slice(range.to)}`, source);
  const removedBeforeInsertion = ranges.reduce(
    (total, range) => total + (range.from < originalInsertion ? range.to - range.from : 0),
    0,
  );
  const at = originalInsertion - removedBeforeInsertion;
  const block = [declaration, ...movedStatements].join("\n");
  return `${without.slice(0, at)}${block}\n${without.slice(at)}`;
}

export function reorderUseCaseElement(
  source: string,
  element: UseCaseElement,
  target: UseCaseElement,
  placement: "before" | "after",
): string {
  if (element.id === target.id || element.packageId !== target.packageId) return source;
  const from = element.sourceRange.from;
  const to = source[element.sourceRange.to] === "\n" ? element.sourceRange.to + 1 : element.sourceRange.to;
  const declaration = source.slice(element.sourceRange.from, element.sourceRange.to).trim();
  const targetAt =
    placement === "before"
      ? target.sourceRange.from
      : target.sourceRange.to + (source[target.sourceRange.to] === "\n" ? 1 : 0);
  const without = `${source.slice(0, from)}${source.slice(to)}`;
  const at = targetAt > to ? targetAt - (to - from) : targetAt;
  return `${without.slice(0, at)}${declaration}\n${without.slice(at)}`;
}
