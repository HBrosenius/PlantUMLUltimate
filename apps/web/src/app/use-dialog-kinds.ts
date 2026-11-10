import type { ActivityDialogKind } from "../features/activity/ActivityDialogs";
import type { SequenceDialog } from "../features/sequence/SequenceDialogs";
import type { ClassDialogKind } from "../features/class/ClassDialogs";
import type { GanttDialogKind } from "../features/gantt/GanttDialogs";
import type { AppDialog } from "../use-app-dialog";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";

export interface useDialogKindsInputs {
  dialog: AppDialog | undefined;
  parseResult: DiagramParseResult<GanttDocument>;
  selectedDividerIndex: number | undefined;
  selectedVerticalSeparatorIndex: number | undefined;
}

export function useDialogKinds({
  dialog,
  parseResult,
  selectedDividerIndex,
  selectedVerticalSeparatorIndex,
}: useDialogKindsInputs) {
  const activityDialogKind: ActivityDialogKind | undefined =
    dialog?.kind === "add-activity-action"
      ? "action"
      : dialog?.kind === "add-activity-partition"
        ? "partition"
        : dialog?.kind === "add-activity-note"
          ? "note"
          : dialog?.kind === "add-activity-structure"
            ? "structure"
            : dialog?.kind === "add-activity-terminal"
              ? "terminal"
              : dialog?.kind === "add-activity-arrow"
                ? "arrow"
                : undefined;
  const sequenceDialog: SequenceDialog | undefined =
    dialog?.kind === "add-sequence-participant"
      ? { kind: "participant" }
      : dialog?.kind === "add-sequence-message"
        ? { kind: "message" }
        : dialog?.kind === "add-sequence-structure"
          ? { kind: "structure", structureKind: dialog.structureKind }
          : undefined;
  const classDialogKind: ClassDialogKind | undefined =
    dialog?.kind === "add-class-entity"
      ? "entity"
      : dialog?.kind === "add-class-relationship"
        ? "relationship"
        : dialog?.kind === "add-class-package"
          ? "package"
          : dialog?.kind === "add-class-note"
            ? "note"
            : undefined;
  const ganttDialogKind: GanttDialogKind | undefined =
    dialog?.kind === "add-task"
      ? "task"
      : dialog?.kind === "add-divider"
        ? "divider"
        : dialog?.kind === "add-milestone"
          ? "milestone"
          : undefined;
  const selectedDivider =
    selectedDividerIndex === undefined ? undefined : parseResult.document.dividers[selectedDividerIndex];
  const selectedVerticalSeparator =
    selectedVerticalSeparatorIndex === undefined
      ? undefined
      : parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];

  return {
    activityDialogKind,
    sequenceDialog,
    classDialogKind,
    ganttDialogKind,
    selectedDivider,
    selectedVerticalSeparator,
  };
}
