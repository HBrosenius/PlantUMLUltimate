import type { TextRange } from "@plantuml-studio/language-core";
import type {
  ActivityControl,
  ActivityControlKind,
  ActivityDocument,
  ActivityNode,
  ActivityPartition,
} from "./model";

const id = (value: string) => value.trim().replace(/^"|"$/g, "").toLowerCase().replace(/[^\w.-]+/g, "-");
const unquote = (value: string) => value.trim().replace(/^"([\s\S]*)"$/, "$1");

export function parseActivity(source: string): ActivityDocument {
  const nodes: ActivityNode[] = [];
  const controls: ActivityControl[] = [];
  const partitions: ActivityPartition[] = [];
  const notes: ActivityDocument["notes"] = [];
  const arrows: ActivityDocument["arrows"] = [];
  const unknown: ActivityDocument["unknown"] = [];
  const diagnostics: ActivityDocument["diagnostics"] = [];
  const lines: Array<{ text: string; from: number; to: number }> = [];
  const consumed = new Set<number>();
  const partitionStack: Array<{ value: ActivityPartition; from: number }> = [];
  const controlStack: Array<{ kind: "if" | "switch" | "fork" | "split" | "repeat" | "while"; range: TextRange }> = [];
  let offset = 0;
  for (const text of source.split("\n")) {
    lines.push({ text, from: offset, to: offset + text.length });
    offset += text.length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = line.text.match(/^\s*note\s+(left|right|top|bottom)(?:\s+(#[\w-]+))?\s*(?::\s*(.*))?$/i);
    if (!match) continue;
    let end = index;
    let text = match[3] ?? "";
    if (!match[3]) {
      const body: string[] = [];
      end = index + 1;
      while (end < lines.length && !/^\s*end\s+note\s*$/i.test(lines[end]!.text)) body.push(lines[end++]!.text);
      if (end >= lines.length) {
        diagnostics.push({ severity: "error", message: "Note is missing end note", range: line, code: "unterminated-note" });
        end = index;
      } else text = body.join("\n").trim();
    }
    for (let item = index; item <= end; item += 1) consumed.add(item);
    notes.push({
      id: `note-${notes.length}`,
      text,
      placement: match[1]!.toLowerCase() as ActivityDocument["notes"][number]["placement"],
      ...(match[2] ? { color: match[2] } : {}),
      sourceRange: { from: line.from, to: lines[end]!.to },
    });
    index = end;
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue;
    const line = lines[index]!;
    const text = line.text.trim();
    const range = { from: line.from, to: line.to };
    if (!text || text.startsWith("'") || /^@(?:startuml|enduml)\b/i.test(text)) continue;
    if (/^(?:title|caption|header|footer|legend|endlegend|skinparam\b|scale\b|!)/i.test(text)) continue;

    const partition = line.text.match(/^\s*partition\s+("[^"]+"|[^\s#{]+)(?:\s+(#[\w-]+))?\s*\{\s*$/i);
    if (partition) {
      const label = unquote(partition[1]!);
      const value: ActivityPartition = {
        id: id(label),
        label,
        ...(partition[2] ? { color: partition[2] } : {}),
        ...(partitionStack.at(-1) ? { parentId: partitionStack.at(-1)!.value.id } : {}),
        sourceRange: range,
        openRange: range,
        closeRange: range,
      };
      partitions.push(value);
      partitionStack.push({ value, from: line.from });
      continue;
    }
    if (/^}\s*$/.test(text)) {
      const open = partitionStack.pop();
      if (!open) diagnostics.push({ severity: "error", message: "Unexpected partition closing brace", range, code: "unexpected-partition-end" });
      else {
        open.value.closeRange = range;
        open.value.sourceRange = { from: open.from, to: line.to };
      }
      continue;
    }

    const action = line.text.match(/^\s*(#[\w-]+)?\s*:(.*);\s*(.*)$/);
    if (action) {
      const label = action[2]!.replaceAll("\\n", "\n").trim();
      const decorations = [...(action[3] ?? "").matchAll(/<<\s*(.*?)\s*>>/g)].map((match) => match[1]!.trim());
      const color = decorations.find((item) => item.startsWith("#")) ?? action[1];
      const stereotype = decorations.find((item) => !item.startsWith("#"));
      const value: ActivityNode = {
        id: `action-${nodes.filter((item) => item.kind === "action").length}`,
        kind: "action",
        label,
        ...(color ? { color } : {}),
        ...(stereotype ? { stereotype } : {}),
        ...(partitionStack.at(-1) ? { partitionId: partitionStack.at(-1)!.value.id } : {}),
        sourceRange: range,
      };
      nodes.push(value);
      continue;
    }
    const terminal = text.match(/^(start|stop|end|detach|kill)\s*$/i);
    if (terminal) {
      const kind = terminal[1]!.toLowerCase() as ActivityNode["kind"];
      const value: ActivityNode = {
        id: `${kind}-${nodes.filter((item) => item.kind === kind).length}`,
        kind,
        label: kind,
        ...(partitionStack.at(-1) ? { partitionId: partitionStack.at(-1)!.value.id } : {}),
        sourceRange: range,
      };
      nodes.push(value);
      continue;
    }

    const control = parseControl(text);
    if (control) {
      const value: ActivityControl = { id: `control-${controls.length}`, ...control, sourceRange: range };
      controls.push(value);
      updateControlStack(value, controlStack, diagnostics);
      continue;
    }
    const arrow = line.text.match(/^\s*-(?:\[([^\]]+)\])?->(?:\s*\[([^\]]+)\])?\s*$/);
    if (arrow) {
      const modifiers = arrow[1]?.split(",").map((item) => item.trim()) ?? [];
      const color = modifiers.find((item) => item.startsWith("#"));
      const lineStyle = modifiers.find((item) => ["dashed", "dotted", "bold"].includes(item)) as
        | "dashed"
        | "dotted"
        | "bold"
        | undefined;
      arrows.push({
        id: `arrow-${arrows.length}`,
        ...(arrow[2] ? { label: arrow[2].trim() } : {}),
        ...(color ? { color } : {}),
        ...(lineStyle ? { lineStyle } : {}),
        sourceRange: range,
      });
      continue;
    }
    unknown.push({ text: line.text, range });
  }

  for (const open of partitionStack)
    diagnostics.push({ severity: "error", message: `Partition ${open.value.label} is missing }`, range: open.value.openRange, code: "unterminated-partition" });
  for (const open of controlStack)
    diagnostics.push({ severity: "error", message: `${open.kind} block is not closed`, range: open.range, code: "unterminated-control" });
  for (const note of notes) {
    if (note.targetId) continue;
    const target = [...nodes, ...controls]
      .filter((item) => item.sourceRange.to < note.sourceRange.from)
      .sort((a, b) => b.sourceRange.to - a.sourceRange.to)[0];
    if (target) note.targetId = target.id;
  }
  return { nodes, controls, partitions, notes, arrows, unknown, diagnostics };
}

function parseControl(text: string): Omit<ActivityControl, "id" | "sourceRange"> | undefined {
  const conditional = text.match(/^(if|elseif)\s*\((.*)\)\s*then(?:\s*\((.*)\))?\s*$/i);
  if (conditional) return { kind: conditional[1]!.toLowerCase() as "if" | "elseif", condition: conditional[2]!.trim(), ...(conditional[3] ? { label: conditional[3].trim() } : {}) };
  const whileMatch = text.match(/^while\s*\((.*)\)(?:\s+is\s+\((.*)\))?\s*$/i);
  if (whileMatch) return { kind: "while", condition: whileMatch[1]!.trim(), ...(whileMatch[2] ? { label: whileMatch[2].trim() } : {}) };
  const repeatWhile = text.match(/^repeat\s+while\s*\((.*)\)(?:\s+is\s+\((.*)\))?\s*$/i);
  if (repeatWhile) return { kind: "repeat-while", condition: repeatWhile[1]!.trim(), ...(repeatWhile[2] ? { label: repeatWhile[2].trim() } : {}) };
  const switchMatch = text.match(/^switch\s*\((.*)\)\s*$/i);
  if (switchMatch) return { kind: "switch", condition: switchMatch[1]!.trim() };
  const caseMatch = text.match(/^case\s*\((.*)\)\s*$/i);
  if (caseMatch) return { kind: "case", label: caseMatch[1]!.trim() };
  const endwhileMatch = text.match(/^endwhile(?:\s*\((.*)\))?\s*$/i);
  if (endwhileMatch) return { kind: "endwhile", ...(endwhileMatch[1] ? { label: endwhileMatch[1].trim() } : {}) };
  const elseMatch = text.match(/^else(?:\s*\((.*)\))?\s*$/i);
  if (elseMatch) return { kind: "else", ...(elseMatch[1] ? { label: elseMatch[1].trim() } : {}) };
  const simple = text.toLowerCase().replace(/\s+/g, "-") as ActivityControlKind;
  if (["else", "endif", "endswitch", "fork", "fork-again", "end-fork", "split", "split-again", "end-split", "repeat", "endwhile", "break"].includes(simple)) return { kind: simple };
  return undefined;
}

function updateControlStack(
  value: ActivityControl,
  stack: Array<{ kind: "if" | "switch" | "fork" | "split" | "repeat" | "while"; range: TextRange }>,
  diagnostics: ActivityDocument["diagnostics"],
) {
  const opening = value.kind === "if" || value.kind === "switch" || value.kind === "fork" || value.kind === "split" || value.kind === "repeat" || value.kind === "while" ? value.kind : undefined;
  if (opening) stack.push({ kind: opening, range: value.sourceRange });
  const closing: Partial<Record<ActivityControlKind, (typeof stack)[number]["kind"]>> = { endif: "if", endswitch: "switch", "end-fork": "fork", "end-split": "split", "repeat-while": "repeat", endwhile: "while" };
  const expected = closing[value.kind];
  if (!expected) return;
  const actual = stack.pop();
  if (actual?.kind !== expected) diagnostics.push({ severity: "error", message: `${value.kind} does not match an open ${expected} block`, range: value.sourceRange, code: "mismatched-control" });
}

export const findActivityObjectAt = (document: ActivityDocument, position: number) =>
  [...document.nodes, ...document.controls, ...document.partitions, ...document.notes, ...document.arrows]
    .filter((item) => position >= item.sourceRange.from && position <= item.sourceRange.to)
    .sort((a, b) => a.sourceRange.to - a.sourceRange.from - (b.sourceRange.to - b.sourceRange.from))[0];
