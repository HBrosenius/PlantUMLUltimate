import type { ActivityDocument, ActivityNode, ActivityNote, ActivityPartition } from "./model";

export interface ActivityActionInput { label: string; color?: string; stereotype?: string; partitionId?: string }
export interface ActivityNoteInput { text: string; placement: "left" | "right" | "top" | "bottom"; color?: string; targetId?: string }
export interface ActivityPartitionInput { label: string; color?: string; parentId?: string }

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
