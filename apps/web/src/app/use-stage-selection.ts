import { useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { describeStageSelection, type StageSelectionInput } from "../stage/stage-selection";
import { findTaskAt } from "@plantuml-studio/diagram-gantt";
import { findSequenceObjectAt } from "@plantuml-studio/diagram-sequence";
import { findUseCaseObjectAt } from "@plantuml-studio/diagram-usecase";
import { findClassObjectAt } from "@plantuml-studio/diagram-class";
import { findActivityObjectAt } from "@plantuml-studio/diagram-activity";
import { findWbsNodeAt } from "@plantuml-studio/diagram-wbs";
import type {
  ActivityDocument,
  ActivityNode,
  ActivityArrow,
  ActivityControl,
  ActivityNote,
  ActivityPartition,
} from "../../../../packages/diagram-activity/src/model";
import type {
  ClassDocument,
  ClassEntity,
  ClassNote,
  ClassPackage,
  ClassRelationship,
} from "../../../../packages/diagram-class/src/model";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type {
  GanttDocument,
  GanttDependency,
  GanttDivider,
  GanttTask,
  GanttVerticalSeparator,
} from "../../../../packages/diagram-gantt/src/model";
import type {
  SequenceMessage,
  SequenceParticipant,
  SequenceStructure,
  SequenceDocument,
} from "../../../../packages/diagram-sequence/src/index";
import type {
  UseCaseElement,
  UseCaseNote,
  UseCasePackage,
  UseCaseRelationship,
  UseCaseDocument,
} from "../../../../packages/diagram-usecase/src/model";
import type { WbsNode, WbsRelationship, WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { SemanticSymbolOccurrence } from "../semantic-symbol-provider";
import type { WorkspaceSnapshot } from "../workspace-storage";

export interface useStageSelectionInputs {
  activityDocument: ActivityDocument;
  classDocument: ClassDocument;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  parseResult: DiagramParseResult<GanttDocument>;
  selectActivityFromSource: (highlightedId: string | undefined, fallbackObjectId?: string) => void;
  selectClassFromSource: (
    highlightedEntityId: string | undefined,
    highlightedMemberId: string | undefined,
    fallbackObjectId?: string,
  ) => void;
  selectSequenceMessage: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceParticipant: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceStructure: (id: string | undefined, reveal?: boolean) => void;
  selectTask: (taskId: string) => void;
  selectUseCaseFromSource: (highlightedId: string | undefined, fallbackObjectId?: string) => void;
  selectWbsFromSource: (highlightedId: string | undefined, fallbackNodeId?: string) => void;
  selectedActivityAction: ActivityNode | undefined;
  selectedActivityArrow: ActivityArrow | undefined;
  selectedActivityControl: ActivityControl | undefined;
  selectedActivityNote: ActivityNote | undefined;
  selectedActivityObjectId: string | undefined;
  selectedActivityPartition: ActivityPartition | undefined;
  selectedActivityTerminal: ActivityNode | undefined;
  selectedClassEntity: ClassEntity | undefined;
  selectedClassNote: ClassNote | undefined;
  selectedClassObjectId: string | undefined;
  selectedClassPackage: ClassPackage | undefined;
  selectedClassRelationship: ClassRelationship | undefined;
  selectedDependency: GanttDependency | undefined;
  selectedDependencyIndex: number | undefined;
  selectedDivider: GanttDivider | undefined;
  selectedDividerIndex: number | undefined;
  selectedSequenceMessage: SequenceMessage | undefined;
  selectedSequenceParticipant: SequenceParticipant | undefined;
  selectedSequenceStructure: SequenceStructure | undefined;
  selectedTask: GanttTask | undefined;
  selectedUseCaseElement: UseCaseElement | undefined;
  selectedUseCaseNote: UseCaseNote | undefined;
  selectedUseCaseObjectId: string | undefined;
  selectedUseCasePackage: UseCasePackage | undefined;
  selectedUseCaseRelationship: UseCaseRelationship | undefined;
  selectedVerticalSeparator: GanttVerticalSeparator | undefined;
  selectedWbsNode: WbsNode | undefined;
  selectedWbsNodeId: string | undefined;
  selectedWbsRelationship: WbsRelationship | undefined;
  selectionRequest: { from: number; to: number } | undefined;
  sequenceDocument: SequenceDocument;
  setSourceHighlightedActivityId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedClassEntityId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedSequenceParticipantId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSourceHighlightedUseCaseId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedWbsNodeId: Dispatch<SetStateAction<string | undefined>>;
  setStageInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setStageLensExpanded: Dispatch<SetStateAction<boolean>>;
  stageActive: boolean;
  symbolAt: (position: number) => SemanticSymbolOccurrence | undefined;
  useCaseDocument: UseCaseDocument;
  wbsDocument: WbsDocument;
  workspace: WorkspaceSnapshot;
}

export function useStageSelection({
  activityDocument,
  classDocument,
  diagramMulti,
  parseResult,
  selectActivityFromSource,
  selectClassFromSource,
  selectSequenceMessage,
  selectSequenceParticipant,
  selectSequenceStructure,
  selectTask,
  selectUseCaseFromSource,
  selectWbsFromSource,
  selectedActivityAction,
  selectedActivityArrow,
  selectedActivityControl,
  selectedActivityNote,
  selectedActivityObjectId,
  selectedActivityPartition,
  selectedActivityTerminal,
  selectedClassEntity,
  selectedClassNote,
  selectedClassObjectId,
  selectedClassPackage,
  selectedClassRelationship,
  selectedDependency,
  selectedDependencyIndex,
  selectedDivider,
  selectedDividerIndex,
  selectedSequenceMessage,
  selectedSequenceParticipant,
  selectedSequenceStructure,
  selectedTask,
  selectedUseCaseElement,
  selectedUseCaseNote,
  selectedUseCaseObjectId,
  selectedUseCasePackage,
  selectedUseCaseRelationship,
  selectedVerticalSeparator,
  selectedWbsNode,
  selectedWbsNodeId,
  selectedWbsRelationship,
  selectionRequest,
  sequenceDocument,
  setSourceHighlightedActivityId,
  setSourceHighlightedClassEntityId,
  setSourceHighlightedSequenceParticipantId,
  setSourceHighlightedTaskId,
  setSourceHighlightedUseCaseId,
  setSourceHighlightedWbsNodeId,
  setStageInspectorOpen,
  setStageLensExpanded,
  stageActive,
  symbolAt,
  useCaseDocument,
  wbsDocument,
  workspace,
}: useStageSelectionInputs) {
  const stageSelection = useMemo(
    () =>
      stageActive && !diagramMulti.multiple
        ? describeStageSelection({
            diagramKind: workspace.diagramKind,
            selectionRange: selectionRequest,
            task: selectedTask,
            dependency: selectedDependency,
            dependencyIndex: selectedDependencyIndex,
            dividerIndex: selectedDividerIndex,
            divider: selectedDivider,
            participant: selectedSequenceParticipant,
            message: selectedSequenceMessage,
            structure: selectedSequenceStructure,
            otherId: selectedUseCaseObjectId ?? selectedClassObjectId ?? selectedActivityObjectId ?? selectedWbsNodeId,
            items: {
              "gantt-separator": selectedVerticalSeparator,
              "usecase-element": selectedUseCaseElement,
              "usecase-package": selectedUseCasePackage,
              "usecase-note": selectedUseCaseNote,
              "usecase-relationship": selectedUseCaseRelationship,
              "class-entity": selectedClassEntity,
              "class-package": selectedClassPackage,
              "class-note": selectedClassNote,
              "class-relationship": selectedClassRelationship,
              "activity-action": selectedActivityAction,
              "activity-partition": selectedActivityPartition,
              "activity-note": selectedActivityNote,
              "activity-control": selectedActivityControl,
              "activity-terminal": selectedActivityTerminal,
              "activity-arrow": selectedActivityArrow,
              "wbs-node": selectedWbsNode,
              "wbs-relationship": selectedWbsRelationship,
            } as StageSelectionInput["items"],
          })
        : undefined,
    [
      selectedVerticalSeparator,
      selectedUseCaseElement,
      selectedUseCasePackage,
      selectedUseCaseNote,
      selectedUseCaseRelationship,
      selectedClassEntity,
      selectedClassPackage,
      selectedClassNote,
      selectedClassRelationship,
      selectedActivityAction,
      selectedActivityPartition,
      selectedActivityNote,
      selectedActivityControl,
      selectedActivityTerminal,
      selectedActivityArrow,
      selectedWbsNode,
      selectedWbsRelationship,
      stageActive,
      diagramMulti.multiple,
      workspace.diagramKind,
      selectionRequest,
      selectedTask,
      selectedDependency,
      selectedDependencyIndex,
      selectedDividerIndex,
      selectedDivider,
      selectedSequenceParticipant,
      selectedSequenceMessage,
      selectedSequenceStructure,
      selectedUseCaseObjectId,
      selectedClassObjectId,
      selectedActivityObjectId,
      selectedWbsNodeId,
    ],
  );
  useEffect(() => {
    if (!stageSelection) setStageInspectorOpen(false);
  }, [stageSelection, setStageInspectorOpen]);
  useEffect(() => {
    if (!stageActive) setStageLensExpanded(false);
  }, [stageActive, setStageLensExpanded]);
  // The canvas outline and the dock/lens must agree: with no Stage selection, drop outlines that only come from
  // a restored or stale source cursor.
  useEffect(() => {
    if (!stageActive || stageSelection) return;
    setSourceHighlightedTaskId(undefined);
    setSourceHighlightedSequenceParticipantId(undefined);
    setSourceHighlightedUseCaseId(undefined);
    setSourceHighlightedClassEntityId(undefined);
    setSourceHighlightedActivityId(undefined);
    setSourceHighlightedWbsNodeId(undefined);
  }, [
    stageActive,
    stageSelection,
    setSourceHighlightedTaskId,
    setSourceHighlightedSequenceParticipantId,
    setSourceHighlightedUseCaseId,
    setSourceHighlightedClassEntityId,
    setSourceHighlightedActivityId,
    setSourceHighlightedWbsNodeId,
  ]);
  // Renaming the selected element in the lens changes its identity (ids follow names), which would drop the
  // selection. Re-resolve it from where the element started, as the editor's own cursor selection does.
  const stageLensFocusRef = useRef(false);
  const stageLastRange = useRef<{ from: number } | undefined>(undefined);
  useEffect(() => {
    if (!stageActive) return;
    if (stageSelection) {
      stageLastRange.current = stageSelection.range;
      return;
    }
    const range = stageLastRange.current;
    stageLastRange.current = undefined;
    if (!range || !stageLensFocusRef.current) return;
    const position = Math.min(range.from + 1, workspace.source.length);
    switch (workspace.diagramKind) {
      case "gantt": {
        const task = findTaskAt(parseResult.document, position);
        if (task) selectTask(task.id);
        break;
      }
      case "sequence": {
        const object = findSequenceObjectAt(sequenceDocument, position);
        if (!object) break;
        if (sequenceDocument.participants.includes(object as (typeof sequenceDocument.participants)[number]))
          selectSequenceParticipant(object.id, false);
        else if ("from" in object) selectSequenceMessage(object.id, false);
        else selectSequenceStructure(object.id, false);
        break;
      }
      case "usecase":
        selectUseCaseFromSource(symbolAt(position)?.key, findUseCaseObjectAt(useCaseDocument, position)?.id);
        break;
      case "class":
      case "component":
        selectClassFromSource(symbolAt(position)?.key, undefined, findClassObjectAt(classDocument, position)?.id);
        break;
      case "activity":
        selectActivityFromSource(symbolAt(position)?.key, findActivityObjectAt(activityDocument, position)?.id);
        break;
      case "wbs":
        selectWbsFromSource(symbolAt(position)?.key, findWbsNodeAt(wbsDocument, position)?.id);
        break;
    }
    // Re-resolution is driven only by the selection being lost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageActive, stageSelection]);

  return { stageSelection, stageLensFocusRef };
}
