import type { DiagramKind } from "../model";

export interface TextRange {
  from: number;
  to: number;
}

export type StageSelectionKind =
  | "gantt-task"
  | "gantt-milestone"
  | "gantt-dependency"
  | "gantt-divider"
  | "sequence-participant"
  | "sequence-message"
  | "sequence-structure"
  | "other";

/** What is selected on the canvas, in the terms Stage's lens and dock need. */
export interface StageSelection {
  kind: StageSelectionKind;
  id: string;
  label: string;
  /** Source span of the whole element, used by the Source Lens. */
  range?: TextRange | undefined;
  /** CSS selector locating the element in the rendered preview, for dock placement. */
  anchor?: string | undefined;
}

interface RangedItem {
  sourceRange?: TextRange | undefined;
  range?: TextRange | undefined;
}

export interface StageSelectionInput {
  diagramKind: DiagramKind;
  /** The app's existing selection→source mapping (the range it highlights in the editor). */
  selectionRange?: TextRange | undefined;
  task?: ({ id: string; label: string; milestone?: unknown; declarations: RangedItem[] } & RangedItem) | undefined;
  dependency?: ({ predecessorTaskId: string; successorTaskId: string } & RangedItem) | undefined;
  dependencyIndex?: number | undefined;
  dividerIndex?: number | undefined;
  divider?: RangedItem | undefined;
  participant?: ({ id: string; label: string } & RangedItem) | undefined;
  message?: ({ id: string; label: string } & RangedItem) | undefined;
  structure?: ({ id: string } & RangedItem) | undefined;
  /** Selection in a family the dock does not specialise yet. */
  otherId?: string | undefined;
}

const escape = (value: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value);

function union(ranges: Array<TextRange | undefined>): TextRange | undefined {
  const present = ranges.filter((range): range is TextRange => Boolean(range));
  if (!present.length) return undefined;
  return { from: Math.min(...present.map((range) => range.from)), to: Math.max(...present.map((range) => range.to)) };
}

const rangeOf = (item: RangedItem | undefined) => item?.sourceRange ?? item?.range;

export function describeStageSelection(input: StageSelectionInput): StageSelection | undefined {
  if (input.diagramKind === "gantt") {
    if (input.task) {
      const { task } = input;
      return {
        kind: task.milestone ? "gantt-milestone" : "gantt-task",
        id: task.id,
        label: task.label,
        range: union([rangeOf(task), ...task.declarations.map(rangeOf)]),
        anchor: `[data-task-id="${escape(task.id)}"]`,
      };
    }
    if (input.dependency && input.dependencyIndex !== undefined) {
      const { dependency } = input;
      return {
        kind: "gantt-dependency",
        id: String(input.dependencyIndex),
        label: `${dependency.predecessorTaskId} → ${dependency.successorTaskId}`,
        range: union([rangeOf(dependency)]),
        anchor: `[data-dependency-index="${input.dependencyIndex}"]`,
      };
    }
    if (input.dividerIndex !== undefined) {
      return {
        kind: "gantt-divider",
        id: String(input.dividerIndex),
        label: "Divider",
        range: union([rangeOf(input.divider), input.selectionRange]),
      };
    }
    return undefined;
  }
  if (input.diagramKind === "sequence") {
    if (input.message)
      return {
        kind: "sequence-message",
        id: input.message.id,
        label: input.message.label || "Message",
        range: union([rangeOf(input.message)]),
        anchor: `[data-sequence-drag-hit][data-sequence-message-id="${escape(input.message.id)}"]`,
      };
    if (input.participant)
      return {
        kind: "sequence-participant",
        id: input.participant.id,
        label: input.participant.label,
        range: union([rangeOf(input.participant)]),
        anchor: ".sequence-selected-participant",
      };
    if (input.structure)
      return {
        kind: "sequence-structure",
        id: input.structure.id,
        label: "Element",
        range: union([rangeOf(input.structure)]),
        anchor: `[data-sequence-structure-id="${escape(input.structure.id)}"]`,
      };
    return undefined;
  }
  if (input.otherId)
    return { kind: "other", id: input.otherId, label: "Selection", range: union([input.selectionRange]) };
  return undefined;
}

export interface DockAction {
  id: string;
  label: string;
  title: string;
  run(): void;
  disabled?: boolean | undefined;
  tone?: "danger" | undefined;
}

/** Existing feature actions the dock reuses; undefined entries simply drop the matching button. */
export interface DockHandlers {
  readOnly: boolean;
  resizeTask(id: string, days: number): void;
  moveTask(id: string, days: number): void;
  addDependency(): void;
  duplicateTask(id: string): void;
  deleteTask(): void;
  deleteDependency(): void;
  deleteDivider(): void;
  moveSequenceMessage(id: string, direction: -1 | 1): void;
  moveSequenceParticipant(id: string, direction: -1 | 1): void;
  deleteSequenceMessage(): void;
  deleteSequenceParticipant(): void;
  deleteSequenceStructure(): void;
}

/** 3–5 object actions; the dock adds "⋯ Inspector" itself. Other families fall back to the inspector only. */
export function dockActionsFor(selection: StageSelection, handlers: DockHandlers): DockAction[] {
  const locked = handlers.readOnly;
  const make = (action: Omit<DockAction, "disabled"> & { disabled?: boolean }): DockAction => ({
    ...action,
    disabled: locked || action.disabled,
    title: locked ? "Viewing only" : action.title,
  });
  switch (selection.kind) {
    case "gantt-task":
      return [
        make({
          id: "shorter",
          label: "−1d",
          title: "Shorten by one working day",
          run: () => handlers.resizeTask(selection.id, -1),
        }),
        make({
          id: "longer",
          label: "+1d",
          title: "Lengthen by one working day",
          run: () => handlers.resizeTask(selection.id, 1),
        }),
        make({ id: "link", label: "Link…", title: "Add a dependency", run: handlers.addDependency }),
        make({
          id: "duplicate",
          label: "Duplicate",
          title: "Duplicate this task",
          run: () => handlers.duplicateTask(selection.id),
        }),
        make({ id: "delete", label: "Delete", title: "Delete this task", tone: "danger", run: handlers.deleteTask }),
      ];
    case "gantt-milestone":
      return [
        make({
          id: "earlier",
          label: "−1d",
          title: "Move one day earlier",
          run: () => handlers.moveTask(selection.id, -1),
        }),
        make({ id: "later", label: "+1d", title: "Move one day later", run: () => handlers.moveTask(selection.id, 1) }),
        make({ id: "link", label: "Link…", title: "Add a dependency", run: handlers.addDependency }),
        make({
          id: "delete",
          label: "Delete",
          title: "Delete this milestone",
          tone: "danger",
          run: handlers.deleteTask,
        }),
      ];
    case "gantt-dependency":
      return [
        make({
          id: "delete",
          label: "Delete link",
          title: "Delete this dependency",
          tone: "danger",
          run: handlers.deleteDependency,
        }),
      ];
    case "gantt-divider":
      return [
        make({
          id: "delete",
          label: "Delete",
          title: "Delete this divider",
          tone: "danger",
          run: handlers.deleteDivider,
        }),
      ];
    case "sequence-message":
      return [
        make({
          id: "up",
          label: "↑ Earlier",
          title: "Move the message earlier",
          run: () => handlers.moveSequenceMessage(selection.id, -1),
        }),
        make({
          id: "down",
          label: "↓ Later",
          title: "Move the message later",
          run: () => handlers.moveSequenceMessage(selection.id, 1),
        }),
        make({
          id: "delete",
          label: "Delete",
          title: "Delete this message",
          tone: "danger",
          run: handlers.deleteSequenceMessage,
        }),
      ];
    case "sequence-participant":
      return [
        make({
          id: "left",
          label: "← Left",
          title: "Move the participant left",
          run: () => handlers.moveSequenceParticipant(selection.id, -1),
        }),
        make({
          id: "right",
          label: "Right →",
          title: "Move the participant right",
          run: () => handlers.moveSequenceParticipant(selection.id, 1),
        }),
        make({
          id: "delete",
          label: "Delete",
          title: "Delete this participant",
          tone: "danger",
          run: handlers.deleteSequenceParticipant,
        }),
      ];
    case "sequence-structure":
      return [
        make({
          id: "delete",
          label: "Delete",
          title: "Delete this element",
          tone: "danger",
          run: handlers.deleteSequenceStructure,
        }),
      ];
    default:
      return [];
  }
}

export interface AddItem {
  id: string;
  label: string;
  run(): void;
}

export const DIAGRAM_NOUN: Record<DiagramKind, string> = {
  gantt: "Gantt",
  sequence: "Sequence",
  usecase: "Use case",
  class: "Class",
  component: "Component",
  activity: "Activity",
  wbs: "WBS",
};
