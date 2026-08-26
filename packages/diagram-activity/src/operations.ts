import type {
  ActivityArrow,
  ActivityControl,
  ActivityDocument,
  ActivityNode,
  ActivityNote,
  ActivityPartition,
} from "./model";

export interface ActivityActionInput {
  label: string;
  color?: string;
  stereotype?: string;
  partitionId?: string;
}
export interface ActivityNoteInput {
  text: string;
  placement: "left" | "right" | "top" | "bottom";
  color?: string;
  targetId?: string;
  floating?: boolean;
}
export interface ActivityPartitionInput {
  label: string;
  color?: string;
  parentId?: string;
}
export interface ActivityControlInput {
  condition?: string;
  label?: string;
}
export interface ActivityArrowInput {
  label?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted" | "bold";
  targetId?: string;
}
export interface ActivityStructureInput {
  kind: "if" | "while" | "repeat" | "fork" | "split" | "switch";
  condition?: string;
  actionLabel?: string;
  partitionId?: string;
}

const point = (source: string) => /(?:^|\n)\s*@enduml\b/i.exec(source)?.index ?? source.length;
const insert = (source: string, text: string, at = point(source)) =>
  `${source.slice(0, at)}${at && source[at - 1] !== "\n" ? "\n" : ""}${text}\n${source.slice(at)}`;
const replace = (source: string, range: { from: number; to: number }, text: string) =>
  `${source.slice(0, range.from)}${text}${source.slice(range.to)}`;
const actionLine = (value: ActivityActionInput) =>
  `:${value.label.trim().replaceAll("\n", "\\n")};${value.stereotype ? ` <<${value.stereotype.trim()}>>` : ""}${value.color ? ` <<${value.color.startsWith("#") ? value.color : `#${value.color}`}>>` : ""}`;

export function insertActivityAction(source: string, document: ActivityDocument, value: ActivityActionInput) {
  const partition = value.partitionId ? document.partitions.find((item) => item.id === value.partitionId) : undefined;
  return insert(source, actionLine(value), partition?.closeRange.from ?? point(source));
}
export const updateActivityAction = (source: string, node: ActivityNode, value: ActivityActionInput) =>
  replace(source, node.sourceRange, actionLine(value));
export const deleteActivityNode = (source: string, node: ActivityNode) =>
  replace(
    source,
    {
      from: node.sourceRange.from,
      to: source[node.sourceRange.to] === "\n" ? node.sourceRange.to + 1 : node.sourceRange.to,
    },
    "",
  );
export const insertActivityTerminal = (source: string, kind: "start" | "stop" | "end" | "detach" | "kill") =>
  insert(source, kind);

export function insertActivityStructure(source: string, document: ActivityDocument, value: ActivityStructureInput) {
  const condition = value.condition?.trim() || "Condition?";
  const action = `  :${value.actionLabel?.trim().replaceAll("\n", "\\n") || "New action"};`;
  const templates: Record<ActivityStructureInput["kind"], string> = {
    if: `if (${condition}) then (yes)\n${action}\nelse (no)\n  :Alternative action;\nendif`,
    while: `while (${condition}) is (yes)\n${action}\nendwhile (no)`,
    repeat: `repeat\n${action}\nrepeat while (${condition}) is (yes)`,
    fork: `fork\n${action}\nfork again\n  :Parallel action;\nend fork`,
    split: `split\n${action}\nsplit again\n  :Parallel action;\nend split`,
    switch: `switch (${condition})\ncase (Option)\n${action}\nendswitch`,
  };
  const partition = value.partitionId ? document.partitions.find((item) => item.id === value.partitionId) : undefined;
  return insert(source, templates[value.kind], partition?.closeRange.from ?? point(source));
}

const partitionLine = (value: ActivityPartitionInput) =>
  `partition "${value.label.trim().replaceAll('"', '\\"')}"${value.color ? ` ${value.color.startsWith("#") ? value.color : `#${value.color}`}` : ""} {`;
export function insertActivityPartition(source: string, document: ActivityDocument, value: ActivityPartitionInput) {
  const parent = value.parentId ? document.partitions.find((item) => item.id === value.parentId) : undefined;
  return insert(source, `${partitionLine(value)}\n}`, parent?.closeRange.from ?? point(source));
}
export const updateActivityPartition = (source: string, item: ActivityPartition, value: ActivityPartitionInput) =>
  replace(source, item.openRange, partitionLine(value));
export const deleteActivityPartition = (source: string, item: ActivityPartition) =>
  replace(replace(source, item.closeRange, ""), item.openRange, "");
export function moveActivityPartition(
  source: string,
  document: ActivityDocument,
  item: ActivityPartition,
  parentId?: string,
) {
  if (item.parentId === parentId) return source;
  const parent = parentId ? document.partitions.find((partition) => partition.id === parentId) : undefined;
  if (
    parentId &&
    (!parent ||
      parent.id === item.id ||
      (parent.sourceRange.from > item.sourceRange.from && parent.sourceRange.to < item.sourceRange.to))
  )
    return source;
  const to = source[item.sourceRange.to] === "\n" ? item.sourceRange.to + 1 : item.sourceRange.to;
  const block = source.slice(item.sourceRange.from, to).trimEnd();
  const without = replace(source, { from: item.sourceRange.from, to }, "");
  const originalAt = parent?.closeRange.from ?? point(source);
  const at = originalAt > to ? originalAt - (to - item.sourceRange.from) : originalAt;
  return insert(without, block, at);
}

const noteLine = (value: ActivityNoteInput) =>
  `${value.floating ? "floating " : ""}note ${value.placement}${value.color ? ` ${value.color.startsWith("#") ? value.color : `#${value.color}`}` : ""}\n${value.text.trim()}\nend note`;
export const insertActivityNote = (source: string, document: ActivityDocument, value: ActivityNoteInput) => {
  const target = [...document.nodes, ...document.controls].find((item) => item.id === value.targetId);
  const at = target ? target.sourceRange.to + (source[target.sourceRange.to] === "\n" ? 1 : 0) : point(source);
  return insert(source, noteLine(value), at);
};
export const updateActivityNote = (source: string, note: ActivityNote, value: ActivityNoteInput) =>
  replace(source, note.sourceRange, noteLine(value));
export const deleteActivityNote = (source: string, note: ActivityNote) =>
  replace(
    source,
    {
      from: note.sourceRange.from,
      to: source[note.sourceRange.to] === "\n" ? note.sourceRange.to + 1 : note.sourceRange.to,
    },
    "",
  );

const actionBlockRange = (source: string, document: ActivityDocument, item: ActivityNode) => {
  const attached = document.notes.filter((note) => note.targetId === item.id);
  const end = Math.max(item.sourceRange.to, ...attached.map((note) => note.sourceRange.to));
  return { from: item.sourceRange.from, to: source[end] === "\n" ? end + 1 : end };
};
export function moveActivityActionToPartition(
  source: string,
  document: ActivityDocument,
  item: ActivityNode,
  partitionId?: string,
) {
  if (item.partitionId === partitionId) return source;
  const target = partitionId ? document.partitions.find((partition) => partition.id === partitionId) : undefined;
  if (partitionId && !target) return source;
  const range = actionBlockRange(source, document, item);
  const block = source.slice(range.from, range.to).trimEnd();
  const without = replace(source, range, "");
  const originalAt = target?.closeRange.from ?? point(source);
  const at = originalAt > range.to ? originalAt - (range.to - range.from) : originalAt;
  return insert(without, block, at);
}

export function updateActivityNoteWithTarget(
  source: string,
  document: ActivityDocument,
  note: ActivityNote,
  value: ActivityNoteInput,
) {
  if (!value.targetId || value.targetId === note.targetId) return updateActivityNote(source, note, value);
  const target = [...document.nodes, ...document.controls].find((item) => item.id === value.targetId);
  if (!target) return updateActivityNote(source, note, value);
  const removeTo = source[note.sourceRange.to] === "\n" ? note.sourceRange.to + 1 : note.sourceRange.to;
  const without = replace(source, { from: note.sourceRange.from, to: removeTo }, "");
  const targetAt = target.sourceRange.to + (source[target.sourceRange.to] === "\n" ? 1 : 0);
  const at = targetAt > removeTo ? targetAt - (removeTo - note.sourceRange.from) : targetAt;
  return insert(without, noteLine(value), at);
}

const controlLine = (item: ActivityControl, value: ActivityControlInput) => {
  const condition = value.condition?.trim() || item.condition || "condition";
  const label = value.label?.trim();
  if (item.kind === "if" || item.kind === "elseif")
    return `${item.kind} (${condition}) then${label ? ` (${label})` : ""}`;
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

const controlEnd: Partial<Record<ActivityControl["kind"], ActivityControl["kind"]>> = {
  if: "endif",
  switch: "endswitch",
  fork: "end-fork",
  split: "end-split",
  repeat: "repeat-while",
  while: "endwhile",
};
export function deleteActivityControlBlock(source: string, document: ActivityDocument, item: ActivityControl) {
  const range = activityControlBlockRange(source, document, item);
  return range ? replace(source, range, "") : source;
}
function activityControlBlockRange(source: string, document: ActivityDocument, item: ActivityControl) {
  const closingKind = controlEnd[item.kind];
  if (!closingKind) return undefined;
  const start = document.controls.findIndex((control) => control.id === item.id);
  let depth = 0;
  for (let index = start + 1; index < document.controls.length; index += 1) {
    const control = document.controls[index]!;
    if (control.kind === item.kind) depth += 1;
    if (control.kind !== closingKind) continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    const to = source[control.sourceRange.to] === "\n" ? control.sourceRange.to + 1 : control.sourceRange.to;
    return { from: item.sourceRange.from, to };
  }
  return undefined;
}

export function reorderActivityControlBlock(
  source: string,
  document: ActivityDocument,
  item: ActivityControl,
  target: ActivityNode,
  placement: "before" | "after",
) {
  if (target.kind !== "action") return source;
  const range = activityControlBlockRange(source, document, item);
  if (!range || (target.sourceRange.from >= range.from && target.sourceRange.to <= range.to)) return source;
  const block = source.slice(range.from, range.to).trimEnd();
  const targetNotes = document.notes.filter((note) => note.targetId === target.id);
  const targetEnd = Math.max(target.sourceRange.to, ...targetNotes.map((note) => note.sourceRange.to));
  const targetAt = placement === "before" ? target.sourceRange.from : targetEnd + (source[targetEnd] === "\n" ? 1 : 0);
  const without = replace(source, range, "");
  const at = targetAt > range.to ? targetAt - (range.to - range.from) : targetAt;
  return insert(without, block, at);
}

const arrowLine = (value: ActivityArrowInput) => {
  const modifiers = [
    ...(value.color?.trim() ? [value.color.startsWith("#") ? value.color : `#${value.color}`] : []),
    ...(value.lineStyle && value.lineStyle !== "solid" ? [value.lineStyle] : []),
  ];
  return `-${modifiers.length ? `[${modifiers.join(",")}]` : ""}->${value.label?.trim() ? ` [${value.label.trim()}]` : ""}`;
};
export function insertActivityArrow(source: string, document: ActivityDocument, value: ActivityArrowInput) {
  const target = [...document.nodes, ...document.controls].find((item) => item.id === value.targetId);
  const at = target ? target.sourceRange.to + (source[target.sourceRange.to] === "\n" ? 1 : 0) : point(source);
  return insert(source, arrowLine(value), at);
}
export const updateActivityArrow = (source: string, item: ActivityArrow, value: ActivityArrowInput) =>
  replace(source, item.sourceRange, arrowLine(value));
export const deleteActivityArrow = (source: string, item: ActivityArrow) =>
  replace(
    source,
    {
      from: item.sourceRange.from,
      to: source[item.sourceRange.to] === "\n" ? item.sourceRange.to + 1 : item.sourceRange.to,
    },
    "",
  );

export function reorderActivityAction(
  source: string,
  document: ActivityDocument,
  item: ActivityNode,
  target: ActivityNode,
  placement: "before" | "after",
) {
  if (item.id === target.id || item.kind !== "action" || target.kind !== "action") return source;
  const first = Math.min(item.sourceRange.from, target.sourceRange.from);
  const last = Math.max(item.sourceRange.from, target.sourceRange.from);
  if (
    item.partitionId === target.partitionId &&
    document.controls.some((control) => control.sourceRange.from > first && control.sourceRange.from < last)
  )
    return source;
  const { from, to } = actionBlockRange(source, document, item);
  const block = source.slice(from, to).trim();
  const targetNotes = document.notes.filter((note) => note.targetId === target.id);
  const targetEnd = Math.max(target.sourceRange.to, ...targetNotes.map((note) => note.sourceRange.to));
  const targetAt = placement === "before" ? target.sourceRange.from : targetEnd + (source[targetEnd] === "\n" ? 1 : 0);
  const without = source.slice(0, from) + source.slice(to);
  const at = targetAt > to ? targetAt - (to - from) : targetAt;
  return without.slice(0, at) + block + "\n" + without.slice(at);
}
