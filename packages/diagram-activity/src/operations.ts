import type { ActivityArrow, ActivityControl, ActivityDocument, ActivityNode, ActivityNote, ActivityPartition } from "./model";

export interface ActivityActionInput { label: string; color?: string; stereotype?: string; partitionId?: string }
export interface ActivityNoteInput { text: string; placement: "left" | "right" | "top" | "bottom"; color?: string; targetId?: string }
export interface ActivityPartitionInput { label: string; color?: string; parentId?: string }
export interface ActivityControlInput { condition?: string; label?: string }
export interface ActivityArrowInput { label?: string; color?: string; lineStyle?: "solid" | "dashed" | "dotted" | "bold" }

const point = (source: string) => /(?:^|\n)\s*@enduml\b/i.exec(source)?.index ?? source.length;
const insert = (source: string, text: string, at = point(source)) => `${source.slice(0, at)}${at && source[at - 1] !== "\n" ? "\n" : ""}${text}\n${source.slice(at)}`;
const replace = (source: string, range: { from: number; to: number }, text: string) => `${source.slice(0, range.from)}${text}${source.slice(range.to)}`;
const actionLine = (value: ActivityActionInput) => `:${value.label.trim().replaceAll("\n", "\\n")};${value.stereotype ? ` <<${value.stereotype.trim()}>>` : ""}${value.color ? ` <<${value.color.startsWith("#") ? value.color : `#${value.color}`}>>` : ""}`;

export function insertActivityAction(source: string, document: ActivityDocument, value: ActivityActionInput) {
  const partition = value.partitionId ? document.partitions.find((item) => item.id === value.partitionId) : undefined;
  return insert(source, actionLine(value), partition?.closeRange.from ?? point(source));
}
export const updateActivityAction = (source: string, node: ActivityNode, value: ActivityActionInput) => replace(source, node.sourceRange, actionLine(value));
export const deleteActivityNode = (source: string, node: ActivityNode) => replace(source, { from: node.sourceRange.from, to: source[node.sourceRange.to] === "\n" ? node.sourceRange.to + 1 : node.sourceRange.to }, "");
export const insertActivityTerminal = (source: string, kind: "start" | "stop" | "end" | "detach" | "kill") => insert(source, kind);

const partitionLine = (value: ActivityPartitionInput) => `partition "${value.label.trim().replaceAll('"', '\\"')}"${value.color ? ` ${value.color.startsWith("#") ? value.color : `#${value.color}`}` : ""} {`;
export function insertActivityPartition(source: string, document: ActivityDocument, value: ActivityPartitionInput) {
  const parent = value.parentId ? document.partitions.find((item) => item.id === value.parentId) : undefined;
  return insert(source, `${partitionLine(value)}\n}`, parent?.closeRange.from ?? point(source));
}
export const updateActivityPartition = (source: string, item: ActivityPartition, value: ActivityPartitionInput) => replace(source, item.openRange, partitionLine(value));
export const deleteActivityPartition = (source: string, item: ActivityPartition) => replace(replace(source, item.closeRange, ""), item.openRange, "");

const noteLine = (value: ActivityNoteInput) => `note ${value.placement}${value.color ? ` ${value.color.startsWith("#") ? value.color : `#${value.color}`}` : ""}\n${value.text.trim()}\nend note`;
export const insertActivityNote = (source: string, document: ActivityDocument, value: ActivityNoteInput) => {
  const target = [...document.nodes, ...document.controls].find((item) => item.id === value.targetId);
  return insert(source, noteLine(value), target?.sourceRange.to ?? point(source));
};
export const updateActivityNote = (source: string, note: ActivityNote, value: ActivityNoteInput) => replace(source, note.sourceRange, noteLine(value));
export const deleteActivityNote = (source: string, note: ActivityNote) => replace(source, { from: note.sourceRange.from, to: source[note.sourceRange.to] === "\n" ? note.sourceRange.to + 1 : note.sourceRange.to }, "");

const controlLine = (item: ActivityControl, value: ActivityControlInput) => {
  const condition = value.condition?.trim() || item.condition || "condition";
  const label = value.label?.trim();
  if (item.kind === "if" || item.kind === "elseif") return `${item.kind} (${condition}) then${label ? ` (${label})` : ""}`;
  if (item.kind === "else") return `else${label ? ` (${label})` : ""}`;
  if (item.kind === "while") return `while (${condition})${label ? ` is (${label})` : ""}`;
  if (item.kind === "repeat-while") return `repeat while (${condition})${label ? ` is (${label})` : ""}`;
  if (item.kind === "switch") return `switch (${condition})`;
  if (item.kind === "case") return `case (${label || condition})`;
  if (item.kind === "endwhile") return `endwhile${label ? ` (${label})` : ""}`;
  return item.kind.replaceAll("-", " ");
};
export const updateActivityControl = (source: string, item: ActivityControl, value: ActivityControlInput) =>
  replace(source, item.sourceRange, controlLine(item, value));

const arrowLine = (value: ActivityArrowInput) => {
  const modifiers = [
    ...(value.color?.trim() ? [value.color.startsWith("#") ? value.color : `#${value.color}`] : []),
    ...(value.lineStyle && value.lineStyle !== "solid" ? [value.lineStyle] : []),
  ];
  return `-${modifiers.length ? `[${modifiers.join(",")}]` : ""}->${value.label?.trim() ? ` [${value.label.trim()}]` : ""}`;
};
export const updateActivityArrow = (source: string, item: ActivityArrow, value: ActivityArrowInput) =>
  replace(source, item.sourceRange, arrowLine(value));
export const deleteActivityArrow = (source: string, item: ActivityArrow) =>
  replace(source, { from: item.sourceRange.from, to: source[item.sourceRange.to] === "\n" ? item.sourceRange.to + 1 : item.sourceRange.to }, "");

export function reorderActivityAction(
  source: string,
  document: ActivityDocument,
  item: ActivityNode,
  target: ActivityNode,
  placement: "before" | "after",
) {
  if (item.id === target.id || item.kind !== "action" || target.kind !== "action" || item.partitionId !== target.partitionId)
    return source;
  const first = Math.min(item.sourceRange.from, target.sourceRange.from);
  const last = Math.max(item.sourceRange.from, target.sourceRange.from);
  if (document.controls.some((control) => control.sourceRange.from > first && control.sourceRange.from < last)) return source;
  const attached = document.notes.filter((note) => note.targetId === item.id);
  const from = item.sourceRange.from;
  const itemEnd = Math.max(item.sourceRange.to, ...attached.map((note) => note.sourceRange.to));
  const to = source[itemEnd] === "\n" ? itemEnd + 1 : itemEnd;
  const block = source.slice(from, itemEnd).trim();
  const targetNotes = document.notes.filter((note) => note.targetId === target.id);
  const targetEnd = Math.max(target.sourceRange.to, ...targetNotes.map((note) => note.sourceRange.to));
  const targetAt = placement === "before" ? target.sourceRange.from : targetEnd + (source[targetEnd] === "\n" ? 1 : 0);
  const without = source.slice(0, from) + source.slice(to);
  const at = targetAt > to ? targetAt - (to - from) : targetAt;
  return without.slice(0, at) + block + "\n" + without.slice(at);
}
