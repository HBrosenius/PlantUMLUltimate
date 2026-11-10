import { WorkspaceDiagramPane } from "./WorkspaceDiagramPane";
import { MobileWorkList } from "../MobileWorkList";
import { editTaskRow, editTaskRows, type TaskRowDraft } from "../gantt-task-table";
import { GanttTaskTable } from "../GanttTaskTable";
import { requestSidePanelChange } from "../side-panel-events";
import { parseWbs, updateWbsNode } from "@plantuml-studio/diagram-wbs";

import { type BulkTaskResult } from "../gantt-bulk-operations";

import { StageView } from "../stage/StageView";
import type { DocumentSnapshot, DocumentVersion, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type { ParseResult, GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { ClassDocument, ClassRelationship } from "../../../../packages/diagram-class/src/model";
import type { ActiveCollaboration, RemoteEditFlash } from "../use-collaboration-lifecycle";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { RefObject, JSX, Dispatch, SetStateAction } from "react";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type {
  SequenceFragment,
  SequenceActivation,
  SequenceNote,
  SequenceTimelineItem,
  SequenceReference,
  SequenceParticipantBox,
  SequenceAutonumber,
  SequenceCreation,
  SequenceDuration,
  SequenceParticipant,
  SequenceMessage,
  SequenceDocument,
} from "../../../../packages/diagram-sequence/src/index";
import type { WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { ResolvedTaskDates } from "../gantt-schedule";
import type { ResourceCapacity, ResourceOverAllocation } from "../ResourceWorkloadPanel";
import type { RenderResult, ViewMode, RenderStatus, DiagramKind } from "../model";
import type { GanttScheduleMode } from "../features/gantt/use-gantt-controller";
import type { SchedulePreview } from "../SchedulePreviewDialog";
import type { AddItem, DockAction, StageSelection } from "../stage/stage-selection";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";
import { diagramFocusSelector } from "./diagram-focus";

export interface WorkspaceMainProps {
  activeDocument: DocumentSnapshot;
  activityDocument: ActivityDocument;
  applyBulkTaskChange: (verb: string, result: BulkTaskResult, keepSelection?: boolean) => void;
  attachActivityNoteByDrag: (noteId: string, targetId: string) => void;
  baselineParseResult: ParseResult | undefined;
  baselineVersion: DocumentVersion | undefined;
  classDocument: ClassDocument;
  clearBaseline: () => void;
  clearSelectedActivityObject: () => void;
  collaboration: ActiveCollaboration | undefined;
  collaborationAppliesToActiveDiagram: boolean;
  commandReadOnly: boolean;
  commitGeneratedSource: (
    source: string,
    description: string,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  commitLinkedGanttSchedule: (nextSource: string, description: string) => boolean;
  connectActivityActionsByDrag: (fromId: string, toId: string) => void;
  connectTasks: (
    predecessorTaskId: string,
    successorTaskId: string,
    predecessorAnchor: "start" | "end",
    successorAnchor: "start" | "end",
  ) => boolean;
  createClassRelationshipByDrag: (from: string, to: string) => void;
  createSequenceMessageByDrag: (fromId: string, toId: string) => void;
  createUseCaseRelationshipByDrag: (from: string, to: string) => void;
  createWbsRelationship: (fromId: string, toId: string) => void;
  deleteDependency: () => void;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  dismissAllInspectors: () => void;
  dismissClassInspector: () => void;
  externalizeSequenceMessage: (messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?") => void;
  initialDiagramFit:
    | {
        documentId: string;
        fit: boolean;
        scroll: { left: number; top: number } | undefined;
        onScrollChange: (scroll: { left: number; top: number }, flushRecovery?: boolean) => void;
      }
    | undefined;
  jiraDiagramStatuses: Map<string, "synchronized" | "local-changes">;
  lastDiagramFocus: RefObject<HTMLElement | SVGElement | undefined>;
  lastDiagramFocusSelector: RefObject<string | undefined>;
  linkedGanttTaskIds: Set<string>;
  linkedWbs: DocumentSnapshot | undefined;
  linkedWbsNodeIds: Set<string>;
  mapProjectRename: (
    kind: "class-entity" | "sequence-participant" | "gantt-task" | "wbs-node",
    from: number,
    declaration: { symbolKey: string; from: number; to: number },
    source: string,
    previousSymbolKey?: string,
  ) => Promise<void>;
  mobileListActive: boolean;
  mobileRevealActive: { documentId: string; kind: "gantt" | "wbs"; id: string; source: string } | undefined;
  moveClassEntityByDrag: (id: string, packageId?: string) => void;
  moveGanttTask: (taskId: string, days: number) => void;
  moveUseCaseElementByDrag: (elementId: string, packageId: string) => void;
  moveWbsNode: (nodeId: string, parentId?: string, beforeId?: string, side?: "left" | "right") => void;
  openClassMemberMenu: (target: Element, x: number, y: number) => boolean;
  openDateActionMenu: (date: string) => void;
  openDiagramSymbolMenu: (target: Element, x: number, y: number) => boolean;
  openMember: (documentId: string) => void;
  openProjectInspector: () => void;
  openResourcePanel: () => void;
  openSourceBytes: number;
  openVersionHistory: () => Promise<void>;
  parseResult: DiagramParseResult<GanttDocument>;
  parsed: { value: DiagramParseResult<GanttDocument>; durationMs: number };
  previewClass: ClassDocument | undefined;
  previewSequence:
    | {
        structures: (
          | SequenceFragment
          | SequenceActivation
          | SequenceNote
          | SequenceTimelineItem
          | SequenceReference
          | SequenceParticipantBox
          | SequenceAutonumber
          | SequenceCreation
          | SequenceDuration
        )[];
        participants: SequenceParticipant[];
        messages: SequenceMessage[];
        fragments: SequenceFragment[];
        activations: SequenceActivation[];
        notes: SequenceNote[];
        timelineItems: SequenceTimelineItem[];
        references: SequenceReference[];
        boxes: SequenceParticipantBox[];
        autonumbers: SequenceAutonumber[];
        creations: SequenceCreation[];
        durations: SequenceDuration[];
      }
    | undefined;
  previewSvg: string | undefined;
  previewWbs: WbsDocument | undefined;
  projectDiagramLinks: Map<string, { documentId: string; path: string; label: string; relationship: string }[]>;
  projectInspectorOpen: boolean;
  reconnectClassRelationshipByDrag: (id: string, endpoint: "from" | "to", targetId: string) => void;
  reconnectSequenceElement: (structureId: string, endpoint: number, participantId: string) => void;
  reconnectSequenceMessage: (messageId: string, endpoint: "from" | "to", participantId: string) => void;
  reconnectUseCaseRelationshipByDrag: (relationshipId: string, endpoint: "from" | "to", targetId: string) => void;
  reconnectWbsArrow: (relationshipId: string, endpoint: "from" | "to", targetId: string) => void;
  rememberSelectedTask: (taskId: string | undefined) => void;
  remoteEditFlash: RemoteEditFlash | undefined;
  renderSourceEditor: (lens?: {
    visibleRange?: { from: number; to: number } | undefined;
    revealWithoutFocus?: boolean | undefined;
  }) => JSX.Element;
  reorderActivityActionByDrag: (id: string, targetId: string, placement: "before" | "after") => void;
  reorderClassEntityByDrag: (id: string, targetId: string, placement: "before" | "after") => void;
  reorderDiagramDivider: (dividerIndex: number, beforeTaskId?: string) => void;
  reorderGanttTask: (taskId: string, beforeTaskId?: string) => void;
  reorderSequenceMessage: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderSequenceParticipant: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderSequenceTimeline: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderUseCaseElementByDrag: (elementId: string, targetId: string, placement: "before" | "after") => void;
  resize: (event: React.PointerEvent<HTMLDivElement>) => void;
  resizeGanttTask: (taskId: string, days: number, calendarDays?: number) => void;
  resolvedTaskDates: Map<string, ResolvedTaskDates>;
  resourceCapacities: ResourceCapacity;
  resourceFilter: string;
  resourceNames: string[];
  resourceOverAllocations: ResourceOverAllocation[];
  resourceWarningsEnabled: boolean;
  result: RenderResult | undefined;
  retryRender: () => void;
  scheduleMode: GanttScheduleMode;
  schedulePreview: SchedulePreview | undefined;
  selectActivityObject: (id: string | undefined) => void;
  selectClassMember: (entityId: string, memberId: string) => void;
  selectClassObject: (id: string) => void;
  selectNormalViewMode: (mode: ViewMode) => void;
  selectSequenceMessage: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceParticipant: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceStructure: (id: string | undefined, reveal?: boolean) => void;
  selectTask: (taskId: string) => void;
  selectUseCaseObject: (id: string | undefined) => void;
  selectWbsNode: (id: string | undefined) => void;
  selectWbsRelationship: (id: string | undefined) => void;
  selectedActivityObjectId: string | undefined;
  selectedClassObjectId: string | undefined;
  selectedClassRelationship: ClassRelationship | undefined;
  selectedDependencyIndex: number | undefined;
  selectedSequenceMessageId: string | undefined;
  selectedSequenceParticipantId: string | undefined;
  selectedSequenceStructureId: string | undefined;
  selectedTaskId: string | undefined;
  selectedTaskIds: string[];
  selectedUseCaseObjectId: string | undefined;
  selectedWbsNodeId: string | undefined;
  selectedWbsRelationshipId: string | undefined;
  sequenceDocument: SequenceDocument;
  sequenceStructures: (
    | SequenceFragment
    | SequenceActivation
    | SequenceNote
    | SequenceTimelineItem
    | SequenceReference
    | SequenceParticipantBox
    | SequenceAutonumber
    | SequenceCreation
    | SequenceDuration
  )[];
  setFocusNoteTaskId: Dispatch<SetStateAction<string | undefined>>;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setLegendFocusColor: Dispatch<SetStateAction<string | undefined>>;
  setLegendInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setMobileDiagramDocument: Dispatch<SetStateAction<string | undefined>>;
  setMobileReveal: Dispatch<
    SetStateAction<{ documentId: string; kind: "gantt" | "wbs"; id: string; source: string } | undefined>
  >;
  setMobileSheetOpen: Dispatch<SetStateAction<boolean>>;
  setOutlineMode: Dispatch<SetStateAction<"find" | "dock" | undefined>>;
  setResourceFilter: Dispatch<SetStateAction<string>>;
  setSelectedDependencyIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedDividerIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSelectedVerticalSeparatorIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectionRequest: Dispatch<SetStateAction<{ from: number; to: number } | undefined>>;
  setSettingsCategory: Dispatch<SetStateAction<string>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setStageInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setStageLensExpanded: Dispatch<SetStateAction<boolean>>;
  setTaskRowDrafts: Dispatch<SetStateAction<Record<string, TaskRowDraft[]>>>;
  setTaskTableInspector: Dispatch<SetStateAction<boolean>>;
  setTaskTablePercent: Dispatch<SetStateAction<number>>;
  sideInspectorOpen: boolean;
  sourceHighlightedActivityId: string | undefined;
  sourceHighlightedClassEntityId: string | undefined;
  sourceHighlightedClassMemberId: string | undefined;
  sourceHighlightedSequenceParticipantId: string | undefined;
  sourceHighlightedTaskId: string | undefined;
  sourceHighlightedUseCaseId: string | undefined;
  sourceHighlightedWbsNodeId: string | undefined;
  stageActive: boolean;
  stageAddItems: AddItem[];
  stageDockActions: DockAction[];
  stageInspectorOpen: boolean;
  stageLensExpanded: boolean;
  stageLensFocusRef: RefObject<boolean>;
  stageSelection: StageSelection | undefined;
  startInlineRename: (id: string, anchor: Element) => boolean;
  status: RenderStatus;
  tabs: {
    documents: DocumentSnapshot[];
    activeId: string;
    addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
    closeDocument: (id: string) => void;
    activateDocument: (id: string) => void;
    duplicateDocument: (id: string) => string;
    closeOtherDocuments: (id: string) => void;
    reorderDocument: (draggedId: string, targetId: string) => void;
    restoreSession: (next: WorkspaceSession) => void;
    setDocumentHistoryId: (id: string, historyId: string) => void;
    setDocumentBaselineVersionId: (id: string, baselineVersionId?: string) => void;
    replaceDocumentFromFile: (
      id: string,
      input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">,
      dirty?: boolean,
    ) => void;
    updateDocumentSource: (id: string, source: string, diagramKind: DocumentSnapshot["diagramKind"]) => void;
    updateDocumentFormat: (id: string, patch: Partial<DocumentSnapshot>, flushRecovery?: boolean) => void;
    getDocument: (id: string) => DocumentSnapshot | undefined;
    setOnboarded: () => void;
    session: WorkspaceSession;
  };
  taskRowDrafts: Record<string, TaskRowDraft[]>;
  taskTablePercent: number;
  taskViewActive: boolean;
  toggleTaskSelection: (taskId: string) => void;
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  updateLinkedSource: (
    document: { id: string; source: string },
    next: string,
    kind: DiagramKind,
    description: string,
  ) => void;
  useCaseDocument: UseCaseDocument;
  viewMode: ViewMode;
  wbsDependencyWarnings: Map<string, string>;
  wbsDocument: WbsDocument;
  wbsNodeCompletion: Map<string, number>;
  wbsNodeSchedule: Map<
    string,
    {
      label: string;
      slack: { total: string; free: string } | undefined;
      dates: string;
      duration: string;
      completion: string;
      resources: string;
      predecessors: { id: string; label: string }[];
      successors: { id: string; label: string }[];
    }
  >;
  workspace: WorkspaceSnapshot;
  workspaceElement: RefObject<HTMLElement | null>;
}

export function WorkspaceMain({
  activeDocument,
  activityDocument,
  applyBulkTaskChange,
  attachActivityNoteByDrag,
  baselineParseResult,
  baselineVersion,
  classDocument,
  clearBaseline,
  clearSelectedActivityObject,
  collaboration,
  collaborationAppliesToActiveDiagram,
  commandReadOnly,
  commitGeneratedSource,
  commitLinkedGanttSchedule,
  connectActivityActionsByDrag,
  connectTasks,
  createClassRelationshipByDrag,
  createSequenceMessageByDrag,
  createUseCaseRelationshipByDrag,
  createWbsRelationship,
  deleteDependency,
  diagramMulti,
  dismissAllInspectors,
  dismissClassInspector,
  externalizeSequenceMessage,
  initialDiagramFit,
  jiraDiagramStatuses,
  lastDiagramFocus,
  lastDiagramFocusSelector,
  linkedGanttTaskIds,
  linkedWbs,
  linkedWbsNodeIds,
  mapProjectRename,
  mobileListActive,
  mobileRevealActive,
  moveClassEntityByDrag,
  moveGanttTask,
  moveUseCaseElementByDrag,
  moveWbsNode,
  openClassMemberMenu,
  openDateActionMenu,
  openDiagramSymbolMenu,
  openMember,
  openProjectInspector,
  openResourcePanel,
  openSourceBytes,
  openVersionHistory,
  parseResult,
  parsed,
  previewClass,
  previewSequence,
  previewSvg,
  previewWbs,
  projectDiagramLinks,
  projectInspectorOpen,
  reconnectClassRelationshipByDrag,
  reconnectSequenceElement,
  reconnectSequenceMessage,
  reconnectUseCaseRelationshipByDrag,
  reconnectWbsArrow,
  rememberSelectedTask,
  remoteEditFlash,
  renderSourceEditor,
  reorderActivityActionByDrag,
  reorderClassEntityByDrag,
  reorderDiagramDivider,
  reorderGanttTask,
  reorderSequenceMessage,
  reorderSequenceParticipant,
  reorderSequenceTimeline,
  reorderUseCaseElementByDrag,
  resize,
  resizeGanttTask,
  resolvedTaskDates,
  resourceCapacities,
  resourceFilter,
  resourceNames,
  resourceOverAllocations,
  resourceWarningsEnabled,
  result,
  retryRender,
  scheduleMode,
  schedulePreview,
  selectActivityObject,
  selectClassMember,
  selectClassObject,
  selectNormalViewMode,
  selectSequenceMessage,
  selectSequenceParticipant,
  selectSequenceStructure,
  selectTask,
  selectUseCaseObject,
  selectWbsNode,
  selectWbsRelationship,
  selectedActivityObjectId,
  selectedClassObjectId,
  selectedClassRelationship,
  selectedDependencyIndex,
  selectedSequenceMessageId,
  selectedSequenceParticipantId,
  selectedSequenceStructureId,
  selectedTaskId,
  selectedTaskIds,
  selectedUseCaseObjectId,
  selectedWbsNodeId,
  selectedWbsRelationshipId,
  sequenceDocument,
  sequenceStructures,
  setFocusNoteTaskId,
  setInteractionMessage,
  setLegendFocusColor,
  setLegendInspectorOpen,
  setMobileDiagramDocument,
  setMobileReveal,
  setMobileSheetOpen,
  setOutlineMode,
  setResourceFilter,
  setSelectedDependencyIndex,
  setSelectedDividerIndex,
  setSelectedTaskId,
  setSelectedVerticalSeparatorIndex,
  setSelectionRequest,
  setSettingsCategory,
  setSettingsOpen,
  setStageInspectorOpen,
  setStageLensExpanded,
  setTaskRowDrafts,
  setTaskTableInspector,
  setTaskTablePercent,
  sideInspectorOpen,
  sourceHighlightedActivityId,
  sourceHighlightedClassEntityId,
  sourceHighlightedClassMemberId,
  sourceHighlightedSequenceParticipantId,
  sourceHighlightedTaskId,
  sourceHighlightedUseCaseId,
  sourceHighlightedWbsNodeId,
  stageActive,
  stageAddItems,
  stageDockActions,
  stageInspectorOpen,
  stageLensExpanded,
  stageLensFocusRef,
  stageSelection,
  startInlineRename,
  status,
  tabs,
  taskRowDrafts,
  taskTablePercent,
  taskViewActive,
  toggleTaskSelection,
  update,
  updateLinkedSource,
  useCaseDocument,
  viewMode,
  wbsDependencyWarnings,
  wbsDocument,
  wbsNodeCompletion,
  wbsNodeSchedule,
  workspace,
  workspaceElement,
}: WorkspaceMainProps) {
  return (
    <>
      <main
        ref={workspaceElement}
        tabIndex={-1}
        className={`workspace mode-${viewMode}${taskViewActive ? " tasks-workspace" : ""}`}
        onClickCapture={diagramMulti.onClickCapture}
        onKeyDownCapture={diagramMulti.onKeyDownCapture}
        onPointerDownCapture={(event) => {
          diagramMulti.onPointerDownCapture(event);
          if (!(event.target instanceof Element) || !event.target.closest(".diagram")) return;
          const target = event.target.closest<HTMLElement | SVGElement>("[tabindex], button");
          if (target) {
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = diagramFocusSelector(event.target);
          }
        }}
        onFocusCapture={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest(".diagram")) return;
          const target = event.target.closest<HTMLElement | SVGElement>("[tabindex], button");
          if (target) {
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = diagramFocusSelector(event.target);
          }
        }}
        onContextMenu={(event) => {
          if (!(event.target instanceof Element) || event.target.closest(".cm-editor")) return;
          if (
            !openClassMemberMenu(event.target, event.clientX, event.clientY) &&
            !openDiagramSymbolMenu(event.target, event.clientX, event.clientY)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === "f" &&
            event.target instanceof Element &&
            event.target.closest(".preview, .diagram") &&
            !event.target.closest("input, textarea, [contenteditable='true']")
          ) {
            event.preventDefault();
            event.stopPropagation();
            setOutlineMode("find");
            return;
          }
          if (
            (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) ||
            !(event.target instanceof Element)
          )
            return;
          if (!openClassMemberMenu(event.target, 0, 0) && !openDiagramSymbolMenu(event.target, 0, 0)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          gridTemplateColumns:
            viewMode === "split"
              ? taskViewActive
                ? `minmax(0, ${taskTablePercent}fr) 5px minmax(0, ${100 - taskTablePercent}fr)`
                : `min(${sideInspectorOpen || projectInspectorOpen ? Math.min(workspace.splitPercent, 35) : workspace.splitPercent}%, calc(100% - 205px)) 5px minmax(0, 1fr)`
              : undefined,
        }}
      >
        {mobileListActive && (workspace.diagramKind === "gantt" || workspace.diagramKind === "wbs") && (
          <MobileWorkList
            key={tabs.activeId}
            kind={workspace.diagramKind}
            source={workspace.source}
            readOnly={commandReadOnly}
            onSheetChange={setMobileSheetOpen}
            onApply={(draft) => {
              if (commandReadOnly || draft.source !== workspace.source)
                return "The source or editing permission changed. Cancel and reopen this task.";
              const result = editTaskRow(workspace.source, draft);
              if ("error" in result) return result.error;
              if (!commitLinkedGanttSchedule(result.source, "Update task check-in"))
                return "The check-in could not be applied. Review source errors or editing permission.";
              setInteractionMessage(`Updated ${result.task.label} check-in`);
              return undefined;
            }}
            onDiagram={(id) => {
              dismissAllInspectors();
              setMobileDiagramDocument(tabs.activeId);
              selectNormalViewMode("diagram");
              setMobileReveal({
                documentId: tabs.activeId,
                kind: workspace.diagramKind as "gantt" | "wbs",
                id,
                source: workspace.source,
              });
              setInteractionMessage("Showing the selected item in the diagram");
            }}
          />
        )}
        {taskViewActive && viewMode !== "diagram" && (
          <GanttTaskTable
            key={tabs.activeId}
            tasks={parseResult.document.tasks}
            source={workspace.source}
            selectedTaskId={selectedTaskId}
            readOnly={Boolean(collaborationAppliesToActiveDiagram && collaboration?.role === "viewer")}
            drafts={taskRowDrafts[tabs.activeId] ?? []}
            onDraftChange={(draft) => setTaskRowDrafts((current) => ({ ...current, [tabs.activeId]: draft }))}
            onSelect={(id) => {
              if (!requestSidePanelChange()) return false;
              setTaskTableInspector(false);
              selectTask(id);
              requestAnimationFrame(() =>
                workspaceElement.current
                  ?.querySelector(`[data-task-id="${CSS.escape(id)}"]`)
                  ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
              );
              return true;
            }}
            onDetails={(id) => {
              if (!requestSidePanelChange()) return;
              selectTask(id);
              setTaskTableInspector(true);
            }}
            onApply={(draft) => {
              if (!requestSidePanelChange()) return "Review the inspector draft before applying the task row.";
              const batch = editTaskRows(workspace.source, draft);
              if ("error" in batch) return batch.error;
              const edit = batch.edits[0];
              if (!edit) return undefined;
              if (!commitLinkedGanttSchedule(batch.source, `Edit ${batch.edits.length} task rows`))
                return "The row could not be applied. Review source errors or edit permissions.";
              setSelectedTaskId(edit.taskId);
              rememberSelectedTask(edit.taskId);
              let linkedSource = linkedWbs?.source;
              for (const edit of batch.edits) {
                if (edit.original.label !== edit.task.label) {
                  void mapProjectRename(
                    "gantt-task",
                    edit.original.sourceRange.from,
                    { symbolKey: edit.task.alias?.value ?? edit.task.label, ...edit.task.sourceRange },
                    batch.source,
                  );
                  const link = activeDocument.wbsGanttLinks?.find(
                    (item) => item.ganttAlias.toLowerCase() === edit.original.id,
                  );
                  const node =
                    linkedWbs &&
                    linkedSource &&
                    link &&
                    parseWbs(linkedSource).nodes.find((item) => item.alias === link.wbsAlias);
                  if (linkedSource && node)
                    linkedSource = updateWbsNode(linkedSource, node, {
                      label: edit.task.label.replace(/^(?:↳\s*)+/, "").trim(),
                      ...(node.color ? { color: node.color } : {}),
                      ...(node.textColor ? { textColor: node.textColor } : {}),
                      ...(node.stereotype ? { stereotype: node.stereotype } : {}),
                      ...(node.link ? { link: node.link } : {}),
                      ...(node.icon ? { icon: node.icon } : {}),
                      side: node.side === "left" ? "left" : "right",
                    });
                }
              }
              if (linkedWbs && linkedSource && linkedSource !== linkedWbs.source)
                updateLinkedSource(linkedWbs, linkedSource, "wbs", "Rename nodes from linked Gantt");
              setInteractionMessage(`Updated ${batch.edits.length} tasks from Tasks`);
              return undefined;
            }}
          />
        )}
        {!mobileListActive && !taskViewActive && viewMode !== "diagram" && viewMode !== "stage" && renderSourceEditor()}
        {viewMode === "split" && (
          <div
            className="divider"
            onPointerDown={resize}
            role="separator"
            aria-orientation="vertical"
            aria-label={taskViewActive ? "Task table and chart divider" : "Code and diagram divider"}
            tabIndex={taskViewActive ? 0 : undefined}
            aria-valuenow={taskViewActive ? Math.round(taskTablePercent) : undefined}
            aria-valuemin={taskViewActive ? 20 : undefined}
            aria-valuemax={taskViewActive ? 80 : undefined}
            onKeyDown={
              taskViewActive
                ? (event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    setTaskTablePercent((current) =>
                      event.key === "Home"
                        ? 20
                        : event.key === "End"
                          ? 80
                          : Math.max(20, Math.min(80, current + (event.key === "ArrowLeft" ? -5 : 5))),
                    );
                  }
                : undefined
            }
          />
        )}
        <WorkspaceDiagramPane
          activeDocument={activeDocument}
          activityDocument={activityDocument}
          applyBulkTaskChange={applyBulkTaskChange}
          attachActivityNoteByDrag={attachActivityNoteByDrag}
          baselineParseResult={baselineParseResult}
          baselineVersion={baselineVersion}
          classDocument={classDocument}
          clearBaseline={clearBaseline}
          clearSelectedActivityObject={clearSelectedActivityObject}
          collaboration={collaboration}
          collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
          commandReadOnly={commandReadOnly}
          commitGeneratedSource={commitGeneratedSource}
          connectActivityActionsByDrag={connectActivityActionsByDrag}
          connectTasks={connectTasks}
          createClassRelationshipByDrag={createClassRelationshipByDrag}
          createSequenceMessageByDrag={createSequenceMessageByDrag}
          createUseCaseRelationshipByDrag={createUseCaseRelationshipByDrag}
          createWbsRelationship={createWbsRelationship}
          deleteDependency={deleteDependency}
          diagramMulti={diagramMulti}
          dismissClassInspector={dismissClassInspector}
          externalizeSequenceMessage={externalizeSequenceMessage}
          initialDiagramFit={initialDiagramFit}
          jiraDiagramStatuses={jiraDiagramStatuses}
          linkedGanttTaskIds={linkedGanttTaskIds}
          linkedWbs={linkedWbs}
          linkedWbsNodeIds={linkedWbsNodeIds}
          mobileRevealActive={mobileRevealActive}
          moveClassEntityByDrag={moveClassEntityByDrag}
          moveGanttTask={moveGanttTask}
          moveUseCaseElementByDrag={moveUseCaseElementByDrag}
          moveWbsNode={moveWbsNode}
          openDateActionMenu={openDateActionMenu}
          openMember={openMember}
          openProjectInspector={openProjectInspector}
          openResourcePanel={openResourcePanel}
          openSourceBytes={openSourceBytes}
          openVersionHistory={openVersionHistory}
          parseResult={parseResult}
          parsed={parsed}
          previewClass={previewClass}
          previewSequence={previewSequence}
          previewSvg={previewSvg}
          previewWbs={previewWbs}
          projectDiagramLinks={projectDiagramLinks}
          reconnectClassRelationshipByDrag={reconnectClassRelationshipByDrag}
          reconnectSequenceElement={reconnectSequenceElement}
          reconnectSequenceMessage={reconnectSequenceMessage}
          reconnectUseCaseRelationshipByDrag={reconnectUseCaseRelationshipByDrag}
          reconnectWbsArrow={reconnectWbsArrow}
          remoteEditFlash={remoteEditFlash}
          reorderActivityActionByDrag={reorderActivityActionByDrag}
          reorderClassEntityByDrag={reorderClassEntityByDrag}
          reorderDiagramDivider={reorderDiagramDivider}
          reorderGanttTask={reorderGanttTask}
          reorderSequenceMessage={reorderSequenceMessage}
          reorderSequenceParticipant={reorderSequenceParticipant}
          reorderSequenceTimeline={reorderSequenceTimeline}
          reorderUseCaseElementByDrag={reorderUseCaseElementByDrag}
          resizeGanttTask={resizeGanttTask}
          resolvedTaskDates={resolvedTaskDates}
          resourceCapacities={resourceCapacities}
          resourceFilter={resourceFilter}
          resourceNames={resourceNames}
          resourceOverAllocations={resourceOverAllocations}
          resourceWarningsEnabled={resourceWarningsEnabled}
          result={result}
          retryRender={retryRender}
          scheduleMode={scheduleMode}
          schedulePreview={schedulePreview}
          selectActivityObject={selectActivityObject}
          selectClassMember={selectClassMember}
          selectClassObject={selectClassObject}
          selectSequenceMessage={selectSequenceMessage}
          selectSequenceParticipant={selectSequenceParticipant}
          selectSequenceStructure={selectSequenceStructure}
          selectTask={selectTask}
          selectUseCaseObject={selectUseCaseObject}
          selectWbsNode={selectWbsNode}
          selectWbsRelationship={selectWbsRelationship}
          selectedActivityObjectId={selectedActivityObjectId}
          selectedClassObjectId={selectedClassObjectId}
          selectedClassRelationship={selectedClassRelationship}
          selectedDependencyIndex={selectedDependencyIndex}
          selectedSequenceMessageId={selectedSequenceMessageId}
          selectedSequenceParticipantId={selectedSequenceParticipantId}
          selectedSequenceStructureId={selectedSequenceStructureId}
          selectedTaskId={selectedTaskId}
          selectedTaskIds={selectedTaskIds}
          selectedUseCaseObjectId={selectedUseCaseObjectId}
          selectedWbsNodeId={selectedWbsNodeId}
          selectedWbsRelationshipId={selectedWbsRelationshipId}
          sequenceDocument={sequenceDocument}
          sequenceStructures={sequenceStructures}
          setFocusNoteTaskId={setFocusNoteTaskId}
          setInteractionMessage={setInteractionMessage}
          setLegendFocusColor={setLegendFocusColor}
          setLegendInspectorOpen={setLegendInspectorOpen}
          setMobileReveal={setMobileReveal}
          setResourceFilter={setResourceFilter}
          setSelectedDependencyIndex={setSelectedDependencyIndex}
          setSelectedDividerIndex={setSelectedDividerIndex}
          setSelectedTaskId={setSelectedTaskId}
          setSelectedVerticalSeparatorIndex={setSelectedVerticalSeparatorIndex}
          setSelectionRequest={setSelectionRequest}
          setSettingsCategory={setSettingsCategory}
          setSettingsOpen={setSettingsOpen}
          setTaskTableInspector={setTaskTableInspector}
          sourceHighlightedActivityId={sourceHighlightedActivityId}
          sourceHighlightedClassEntityId={sourceHighlightedClassEntityId}
          sourceHighlightedClassMemberId={sourceHighlightedClassMemberId}
          sourceHighlightedSequenceParticipantId={sourceHighlightedSequenceParticipantId}
          sourceHighlightedTaskId={sourceHighlightedTaskId}
          sourceHighlightedUseCaseId={sourceHighlightedUseCaseId}
          sourceHighlightedWbsNodeId={sourceHighlightedWbsNodeId}
          startInlineRename={startInlineRename}
          status={status}
          tabs={tabs}
          taskViewActive={taskViewActive}
          toggleTaskSelection={toggleTaskSelection}
          update={update}
          useCaseDocument={useCaseDocument}
          viewMode={viewMode}
          wbsDependencyWarnings={wbsDependencyWarnings}
          wbsDocument={wbsDocument}
          wbsNodeCompletion={wbsNodeCompletion}
          wbsNodeSchedule={wbsNodeSchedule}
          workspace={workspace}
        />
        {stageActive && (
          <StageView
            containerRef={workspaceElement}
            documentId={tabs.activeId}
            diagramKind={workspace.diagramKind}
            selection={stageSelection}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            lensExpanded={stageLensExpanded}
            onLensExpandedChange={setStageLensExpanded}
            renderSourceEditor={renderSourceEditor}
            dockActions={stageDockActions}
            addItems={stageAddItems}
            readOnly={commandReadOnly}
            inspectorOpen={stageInspectorOpen}
            onToggleInspector={() => setStageInspectorOpen((open) => !open)}
            onLensFocusChange={(focused) => {
              stageLensFocusRef.current = focused;
            }}
          />
        )}
      </main>
    </>
  );
}
