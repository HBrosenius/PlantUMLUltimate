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
  | "gantt-separator"
  | "usecase-element"
  | "usecase-package"
  | "usecase-note"
  | "usecase-relationship"
  | "class-entity"
  | "class-package"
  | "class-note"
  | "class-relationship"
  | "activity-action"
  | "activity-partition"
  | "activity-note"
  | "activity-control"
  | "activity-terminal"
  | "activity-arrow"
  | "wbs-node"
  | "wbs-relationship"
  | "other";

/** Kinds whose selection is described by a generic `{ id, label|name, range }` item. */
export type GenericStageKind = Exclude<
  StageSelectionKind,
  | "gantt-task"
  | "gantt-milestone"
  | "gantt-dependency"
  | "gantt-divider"
  | "sequence-participant"
  | "sequence-message"
  | "sequence-structure"
  | "other"
>;

/** What is selected on the canvas, in the terms Stage's lens and dock need. */
export interface StageSelection {
  kind: StageSelectionKind;
  id: string;
  label: string;
  /** Source span of the whole element, used by the Source Lens. */
  range?: TextRange | undefined;
  /** CSS selector locating the element in the rendered preview, for dock placement. */
  anchor?: string | undefined;
  /** Selector for the other elements of the same family, so the dock can avoid covering them. */
  neighbours?: string | undefined;
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
  /** Selected items of the non-Gantt/Sequence families (and Gantt vertical separators), by kind. */
  items?: Partial<Record<GenericStageKind, GenericItem | undefined>> | undefined;
}

export type GenericItem = { id?: string; label?: string; name?: string; alias?: string } & RangedItem;

const FAMILY_ANCHORS: Record<string, { attribute: string; neighbours: string }> = {
  usecase: { attribute: "data-usecase-object-id", neighbours: "[data-usecase-object-id]" },
  class: { attribute: "data-class-object-id", neighbours: "[data-class-object-id]" },
  activity: { attribute: "data-activity-object-id", neighbours: "[data-activity-object-id]" },
  wbs: { attribute: "data-wbs-node-id", neighbours: "[data-wbs-node-id]" },
};

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
        neighbours: "[data-task-id]",
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
        neighbours: "[data-task-id]",
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
    const separator = input.items?.["gantt-separator"];
    if (separator)
      return {
        kind: "gantt-separator",
        id: separator.id ?? "separator",
        label: "Separator",
        range: union([rangeOf(separator), input.selectionRange]),
      };
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
        neighbours: "[data-sequence-drag-hit]",
      };
    if (input.participant)
      return {
        kind: "sequence-participant",
        id: input.participant.id,
        label: input.participant.label,
        range: union([rangeOf(input.participant)]),
        anchor: ".sequence-selected-participant",
        neighbours: "[data-sequence-drag-hit]",
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
  for (const [kind, item] of Object.entries(input.items ?? {})) {
    if (!item || kind === "gantt-separator") continue;
    const anchors = FAMILY_ANCHORS[kind.split("-")[0]!];
    const id = item.id ?? item.alias ?? "";
    return {
      kind: kind as GenericStageKind,
      id,
      label: item.label ?? item.name ?? item.alias ?? id,
      range: union([rangeOf(item)]),
      ...(anchors && id ? { anchor: `[${anchors.attribute}="${escape(id)}"]`, neighbours: anchors.neighbours } : {}),
    };
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
  /** Put the caret in the Source Lens on the selected element, to rename it by typing. */
  renameInLens(): void;
  /** Opens the family's "add relationship / arrow" dialog. */
  addLinked(): void;
  addClassMember(): void;
  addWbsNode(position: "child" | "sibling"): void;
  /** Delete operations for the families that have one, by selection kind. */
  remove: Partial<Record<StageSelectionKind, () => void>>;
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
      return genericActionsFor(selection, handlers, make);
  }
}

type MakeAction = (action: Omit<DockAction, "disabled"> & { disabled?: boolean }) => DockAction;

/** Actions for the other families, built only from operations the app already exposes. */
function genericActionsFor(selection: StageSelection, handlers: DockHandlers, make: MakeAction): DockAction[] {
  const rename = make({
    id: "rename",
    label: "Rename",
    title: "Edit the name in the source lens",
    run: handlers.renameInLens,
  });
  const remove = handlers.remove[selection.kind];
  const del = remove
    ? [make({ id: "delete", label: "Delete", title: "Delete this element", tone: "danger", run: remove })]
    : [];
  switch (selection.kind) {
    case "usecase-element":
      return [
        rename,
        make({ id: "relate", label: "Relate…", title: "Add a relationship", run: handlers.addLinked }),
        ...del,
      ];
    case "class-entity":
      return [
        rename,
        make({ id: "member", label: "+ Member", title: "Add a member to this class", run: handlers.addClassMember }),
        make({ id: "relate", label: "Relate…", title: "Add a relationship", run: handlers.addLinked }),
        ...del,
      ];
    case "activity-action":
      return [
        rename,
        make({ id: "arrow", label: "Arrow…", title: "Connect with an arrow", run: handlers.addLinked }),
        ...del,
      ];
    case "wbs-node":
      return [
        rename,
        make({ id: "child", label: "+ Child", title: "Add a child node", run: () => handlers.addWbsNode("child") }),
        make({
          id: "sibling",
          label: "+ Sibling",
          title: "Add a sibling node",
          run: () => handlers.addWbsNode("sibling"),
        }),
        ...del,
      ];
    case "usecase-package":
    case "usecase-note":
    case "class-package":
    case "class-note":
    case "activity-partition":
    case "activity-note":
      return [rename, ...del];
    case "gantt-separator":
    case "usecase-relationship":
    case "class-relationship":
    case "activity-control":
    case "activity-terminal":
    case "activity-arrow":
    case "wbs-relationship":
      return del;
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
