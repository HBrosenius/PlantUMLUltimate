import type { JiraDiagramStatus } from "@plantuml-studio/jira-integration";
import { DiagramPreview } from "../DiagramPreview";
import { moveTasksByDays, type BulkTaskResult } from "../gantt-bulk-operations";
import { moveVerticalSeparatorByDays, applySourceEdits } from "@plantuml-studio/diagram-gantt";
import { forecastToday } from "../forecast-date";
import { prepareForecastApply } from "../gantt-apply-forecast";
import {
  SequenceDiagramPreview,
  UseCaseDiagramPreview,
  ClassDiagramPreview,
  ActivityDiagramPreview,
  WbsDiagramPreview,
} from "./lazy-previews";
import type { DocumentSnapshot, DocumentVersion, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type { ParseResult, GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { ClassDocument, ClassRelationship } from "../../../../packages/diagram-class/src/model";
import type { ActiveCollaboration, RemoteEditFlash } from "../use-collaboration-lifecycle";
import type { DiagramBulkItem } from "../diagram-bulk-operations";
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
import type { RenderResult, RenderStatus, ViewMode } from "../model";
import type { GanttScheduleMode } from "../features/gantt/use-gantt-controller";
import type { SchedulePreview } from "../SchedulePreviewDialog";
import type { Dispatch, SetStateAction } from "react";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";

export interface WorkspaceDiagramPaneProps {
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
  diagramMulti: {
    selected: DiagramBulkItem[];
    multiple: boolean;
    clear: () => void;
    copy: () => void;
    paste: () => void;
    duplicate: () => void;
    canDuplicateAt: (range: { from: number; to: number }) => boolean;
    duplicateAt: (range: { from: number; to: number }) => void;
    change: (mode: "color" | "stereotype", value: string) => void;
    onPointerDownCapture: (event: React.PointerEvent) => void;
    onClickCapture: (event: React.MouseEvent) => void;
    onKeyDownCapture: (event: React.KeyboardEvent) => void;
    readOnly: boolean;
  };
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
  jiraDiagramStatuses: Map<string, JiraDiagramStatus>;
  linkedGanttTaskIds: Set<string>;
  linkedWbs: DocumentSnapshot | undefined;
  linkedWbsNodeIds: Set<string>;
  mobileRevealActive: { documentId: string; kind: "gantt" | "wbs"; id: string; source: string } | undefined;
  moveClassEntityByDrag: (id: string, packageId?: string) => void;
  moveGanttTask: (taskId: string, days: number) => void;
  moveUseCaseElementByDrag: (elementId: string, packageId: string) => void;
  moveWbsNode: (nodeId: string, parentId?: string, beforeId?: string, side?: "left" | "right") => void;
  openDateActionMenu: (date: string) => void;
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
  reconnectClassRelationshipByDrag: (id: string, endpoint: "from" | "to", targetId: string) => void;
  reconnectSequenceElement: (structureId: string, endpoint: number, participantId: string) => void;
  reconnectSequenceMessage: (messageId: string, endpoint: "from" | "to", participantId: string) => void;
  reconnectUseCaseRelationshipByDrag: (relationshipId: string, endpoint: "from" | "to", targetId: string) => void;
  reconnectWbsArrow: (relationshipId: string, endpoint: "from" | "to", targetId: string) => void;
  remoteEditFlash: RemoteEditFlash | undefined;
  reorderActivityActionByDrag: (id: string, targetId: string, placement: "before" | "after") => void;
  reorderClassEntityByDrag: (id: string, targetId: string, placement: "before" | "after") => void;
  reorderDiagramDivider: (dividerIndex: number, beforeTaskId?: string) => void;
  reorderGanttTask: (taskId: string, beforeTaskId?: string) => void;
  reorderSequenceMessage: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderSequenceParticipant: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderSequenceTimeline: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderUseCaseElementByDrag: (elementId: string, targetId: string, placement: "before" | "after") => void;
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
  setMobileReveal: Dispatch<
    SetStateAction<{ documentId: string; kind: "gantt" | "wbs"; id: string; source: string } | undefined>
  >;
  setResourceFilter: Dispatch<SetStateAction<string>>;
  setSelectedDependencyIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedDividerIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSelectedVerticalSeparatorIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectionRequest: Dispatch<SetStateAction<{ from: number; to: number } | undefined>>;
  setSettingsCategory: Dispatch<SetStateAction<string>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setTaskTableInspector: Dispatch<SetStateAction<boolean>>;
  sourceHighlightedActivityId: string | undefined;
  sourceHighlightedClassEntityId: string | undefined;
  sourceHighlightedClassMemberId: string | undefined;
  sourceHighlightedSequenceParticipantId: string | undefined;
  sourceHighlightedTaskId: string | undefined;
  sourceHighlightedUseCaseId: string | undefined;
  sourceHighlightedWbsNodeId: string | undefined;
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
  taskViewActive: boolean;
  toggleTaskSelection: (taskId: string) => void;
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
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
}

export function WorkspaceDiagramPane({
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
  connectActivityActionsByDrag,
  connectTasks,
  createClassRelationshipByDrag,
  createSequenceMessageByDrag,
  createUseCaseRelationshipByDrag,
  createWbsRelationship,
  deleteDependency,
  diagramMulti,
  dismissClassInspector,
  externalizeSequenceMessage,
  initialDiagramFit,
  jiraDiagramStatuses,
  linkedGanttTaskIds,
  linkedWbs,
  linkedWbsNodeIds,
  mobileRevealActive,
  moveClassEntityByDrag,
  moveGanttTask,
  moveUseCaseElementByDrag,
  moveWbsNode,
  openDateActionMenu,
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
  reconnectClassRelationshipByDrag,
  reconnectSequenceElement,
  reconnectSequenceMessage,
  reconnectUseCaseRelationshipByDrag,
  reconnectWbsArrow,
  remoteEditFlash,
  reorderActivityActionByDrag,
  reorderClassEntityByDrag,
  reorderDiagramDivider,
  reorderGanttTask,
  reorderSequenceMessage,
  reorderSequenceParticipant,
  reorderSequenceTimeline,
  reorderUseCaseElementByDrag,
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
  setMobileReveal,
  setResourceFilter,
  setSelectedDependencyIndex,
  setSelectedDividerIndex,
  setSelectedTaskId,
  setSelectedVerticalSeparatorIndex,
  setSelectionRequest,
  setSettingsCategory,
  setSettingsOpen,
  setTaskTableInspector,
  sourceHighlightedActivityId,
  sourceHighlightedClassEntityId,
  sourceHighlightedClassMemberId,
  sourceHighlightedSequenceParticipantId,
  sourceHighlightedTaskId,
  sourceHighlightedUseCaseId,
  sourceHighlightedWbsNodeId,
  startInlineRename,
  status,
  tabs,
  taskViewActive,
  toggleTaskSelection,
  update,
  useCaseDocument,
  viewMode,
  wbsDependencyWarnings,
  wbsDocument,
  wbsNodeCompletion,
  wbsNodeSchedule,
  workspace,
}: WorkspaceDiagramPaneProps) {
  return (
    <>
      {viewMode !== "code" &&
        (workspace.diagramKind === "gantt" ? (
          <DiagramPreview
            initialFit={initialDiagramFit}
            svg={previewSvg}
            renderedSource={result?.source}
            sharedDates={resolvedTaskDates}
            tasks={parseResult.document.tasks}
            dependencies={parseResult.document.dependencies}
            dividers={parseResult.document.dividers}
            verticalSeparators={parseResult.document.verticalSeparators}
            source={workspace.source}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            selectedTaskId={selectedTaskId}
            highlightedTaskId={mobileRevealActive?.kind === "gantt" ? mobileRevealActive.id : sourceHighlightedTaskId}
            remoteEditTaskId={collaborationAppliesToActiveDiagram ? remoteEditFlash?.taskId : undefined}
            remoteEditColor={collaborationAppliesToActiveDiagram ? remoteEditFlash?.color : undefined}
            remoteEditName={collaborationAppliesToActiveDiagram ? remoteEditFlash?.name : undefined}
            onTaskSelect={(id) => {
              setMobileReveal(undefined);
              if (taskViewActive) setTaskTableInspector(false);
              selectTask(id);
            }}
            onTaskToggle={toggleTaskSelection}
            selectedTaskIds={selectedTaskIds}
            onTasksMove={(ids, days) => applyBulkTaskChange("Moved", moveTasksByDays(workspace.source, ids, days))}
            onNoteSelect={(taskId) => {
              selectTask(taskId);
              setFocusNoteTaskId(taskId);
            }}
            onBackgroundSelect={() => {
              setSelectedTaskId(undefined);
              setSelectedDependencyIndex(undefined);
              setFocusNoteTaskId(undefined);
            }}
            onTaskMove={moveGanttTask}
            onTaskReorder={(taskId, beforeTaskId) => {
              if (linkedWbs && activeDocument.wbsGanttLinks?.some((link) => link.ganttAlias.toLowerCase() === taskId)) {
                setInteractionMessage("Reorder linked work in the WBS; the Gantt chart updates automatically");
                return;
              }
              reorderGanttTask(taskId, beforeTaskId);
            }}
            onDividerReorder={reorderDiagramDivider}
            onVerticalSeparatorMove={(index, days) => {
              const separator = parseResult.document.verticalSeparators[index];
              if (!separator) return;
              const operation = moveVerticalSeparatorByDays(workspace.source, separator, days);
              if (operation.unavailableReason) {
                setInteractionMessage(operation.unavailableReason);
                return;
              }
              if (commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Move vertical separator"))
                setInteractionMessage(`Moved vertical separator ${days > 0 ? "+" : ""}${days} days`);
            }}
            onVerticalSeparatorSelect={(index) => {
              setSelectedTaskId(undefined);
              setSelectedDependencyIndex(undefined);
              setSelectedDividerIndex(undefined);
              setSelectedVerticalSeparatorIndex(index);
            }}
            onDividerSelect={(index) => {
              setSelectedTaskId(undefined);
              setSelectedDependencyIndex(undefined);
              setSelectedDividerIndex(index);
              const divider = parseResult.document.dividers[index];
              if (divider) setSelectionRequest({ ...divider.sourceRange });
            }}
            onTaskResize={resizeGanttTask}
            onDependencyCreate={connectTasks}
            selectedDependencyIndex={selectedDependencyIndex}
            onDependencySelect={(index) => {
              setSelectedDependencyIndex(index);
              const dependency = index === undefined ? undefined : parseResult.document.dependencies[index];
              if (dependency) setSelectionRequest(dependency.sourceRange);
            }}
            onDependencyDelete={deleteDependency}
            onInteractionMessage={setInteractionMessage}
            resourceFilter={resourceFilter}
            resourceNames={resourceNames}
            onResourceFilterChange={setResourceFilter}
            scheduleMode={scheduleMode}
            onOpenGanttPreferences={() => {
              setSettingsCategory("Gantt");
              setSettingsOpen(true);
            }}
            onOpenCalendar={openProjectInspector}
            scheduleGhost={
              schedulePreview
                ? { taskIds: schedulePreview.affected.map((item) => item.id), days: schedulePreview.days }
                : undefined
            }
            projectStart={
              parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
            }
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            parseDurationMs={parsed.durationMs}
            openDocumentCount={tabs.documents.length}
            openSourceBytes={openSourceBytes}
            resourceOverAllocations={resourceOverAllocations}
            showResourceOverAllocationWarnings={resourceWarningsEnabled}
            resourceCapacities={resourceCapacities}
            onOpenResourceWorkload={openResourcePanel}
            onDateHighlightRequest={openDateActionMenu}
            onLegendEditRequest={(color) => {
              setLegendFocusColor(color);
              setLegendInspectorOpen(true);
            }}
            baselineTasks={baselineParseResult?.document.tasks}
            baselineDependencies={baselineParseResult?.document.dependencies}
            baselineSource={baselineVersion?.source}
            baselineProjectStart={
              baselineParseResult?.document.projectStart?.resolved
                ? baselineParseResult.document.projectStart.value
                : undefined
            }
            onChangeBaseline={() => void openVersionHistory()}
            onClearBaseline={clearBaseline}
            jiraTaskStatuses={jiraDiagramStatuses}
            projectLinkedTaskIds={linkedGanttTaskIds}
            projectDiagramLinks={projectDiagramLinks}
            onOpenProjectDiagram={openMember}
            progressForecast={activeDocument.progressForecast}
            onProgressForecastChange={(value) =>
              tabs.updateDocumentFormat(tabs.activeId, { progressForecast: value, dirty: true })
            }
            onApplyForecast={
              collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"
                ? undefined
                : (review) => {
                    const settings = activeDocument.progressForecast;
                    const asOf = settings?.asOf ?? forecastToday(settings?.timeZone ?? "UTC");
                    if (
                      !settings?.enabled ||
                      workspace.source !== review.sourceBefore ||
                      asOf !== review.asOf ||
                      JSON.stringify(settings.remainingDays) !== JSON.stringify(review.overridesBefore)
                    ) {
                      setInteractionMessage("Forecast inputs changed. Recalculate the review before applying.");
                      return false;
                    }
                    const fresh = prepareForecastApply(
                      workspace.source,
                      asOf,
                      settings.remainingDays,
                      settings.enabled ? (settings.timeZone ?? "UTC") : undefined,
                    );
                    if (!fresh.sourceAfter || fresh.sourceAfter !== review.sourceAfter) {
                      setInteractionMessage(fresh.error ?? "Forecast changed. Recalculate the review before applying.");
                      return false;
                    }
                    const applied = commitGeneratedSource(fresh.sourceAfter, "Apply progress forecast to plan", {
                      before: settings,
                      after: { ...settings, remainingDays: fresh.overridesAfter },
                    });
                    if (applied)
                      setInteractionMessage("Applied forecast to plan. Undo restores dates and estimates together.");
                    return applied;
                  }
            }
          />
        ) : workspace.diagramKind === "sequence" ? (
          <SequenceDiagramPreview
            editingEnabled={result?.source === workspace.source}
            geometryDocument={previewSequence}
            initialFit={initialDiagramFit}
            svg={previewSvg}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            participants={sequenceDocument.participants}
            messages={sequenceDocument.messages}
            structures={sequenceStructures}
            selectedParticipantId={
              diagramMulti.multiple
                ? undefined
                : (selectedSequenceParticipantId ??
                  (!selectedSequenceMessageId && !selectedSequenceStructureId
                    ? sourceHighlightedSequenceParticipantId
                    : undefined))
            }
            selectedMessageId={diagramMulti.multiple ? undefined : selectedSequenceMessageId}
            selectedStructureId={diagramMulti.multiple ? undefined : selectedSequenceStructureId}
            onParticipantSelect={selectSequenceParticipant}
            onMessageSelect={selectSequenceMessage}
            onStructureSelect={selectSequenceStructure}
            onParticipantReorder={reorderSequenceParticipant}
            onMessageReorder={reorderSequenceMessage}
            onTimelineReorder={reorderSequenceTimeline}
            onMessageReconnect={reconnectSequenceMessage}
            onStructureReconnect={reconnectSequenceElement}
            onMessageCreate={createSequenceMessageByDrag}
            onMessageExternalize={externalizeSequenceMessage}
          />
        ) : workspace.diagramKind === "usecase" ? (
          <UseCaseDiagramPreview
            onInlineRename={commandReadOnly ? undefined : startInlineRename}
            initialFit={initialDiagramFit}
            svg={previewSvg}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            document={useCaseDocument}
            selectedId={diagramMulti.multiple ? undefined : (selectedUseCaseObjectId ?? sourceHighlightedUseCaseId)}
            onSelect={(id) => {
              selectUseCaseObject(id);
              const object = [...useCaseDocument.elements, ...useCaseDocument.packages, ...useCaseDocument.notes].find(
                (item) => item.id === id,
              );
              if (object) setSelectionRequest({ ...object.sourceRange });
            }}
            onRelationshipCreate={createUseCaseRelationshipByDrag}
            onRelationshipReconnect={reconnectUseCaseRelationshipByDrag}
            onMoveToPackage={moveUseCaseElementByDrag}
            onReorder={reorderUseCaseElementByDrag}
          />
        ) : workspace.diagramKind === "class" || workspace.diagramKind === "component" ? (
          <ClassDiagramPreview
            editingEnabled={result?.source === workspace.source}
            geometryDocument={previewClass}
            onInlineRename={commandReadOnly ? undefined : startInlineRename}
            initialFit={initialDiagramFit}
            diagramKind={workspace.diagramKind}
            svg={previewSvg}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            document={classDocument}
            selectedId={
              diagramMulti.multiple
                ? undefined
                : selectedClassRelationship
                  ? selectedClassObjectId
                  : (sourceHighlightedClassEntityId ?? selectedClassObjectId)
            }
            highlightedMemberId={sourceHighlightedClassMemberId}
            onSelect={selectClassObject}
            onMemberSelect={selectClassMember}
            onBackgroundSelect={dismissClassInspector}
            onRelationshipCreate={createClassRelationshipByDrag}
            onRelationshipReconnect={reconnectClassRelationshipByDrag}
            onMoveToPackage={moveClassEntityByDrag}
            onReorder={reorderClassEntityByDrag}
          />
        ) : workspace.diagramKind === "activity" ? (
          <ActivityDiagramPreview
            onInlineRename={commandReadOnly ? undefined : startInlineRename}
            initialFit={initialDiagramFit}
            svg={previewSvg}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            document={activityDocument}
            selectedId={diagramMulti.multiple ? undefined : (sourceHighlightedActivityId ?? selectedActivityObjectId)}
            onSelect={(id) => {
              selectActivityObject(id);
              const object = [
                ...activityDocument.nodes,
                ...activityDocument.controls,
                ...activityDocument.partitions,
                ...activityDocument.notes,
                ...activityDocument.arrows,
              ].find((item) => item.id === id);
              if (object) setSelectionRequest({ ...object.sourceRange });
            }}
            onBackgroundSelect={clearSelectedActivityObject}
            onReorder={reorderActivityActionByDrag}
            onConnect={connectActivityActionsByDrag}
            onAttachNote={attachActivityNoteByDrag}
          />
        ) : (
          <WbsDiagramPreview
            editingEnabled={result?.source === workspace.source}
            geometryDocument={previewWbs}
            initialFit={initialDiagramFit}
            svg={previewSvg}
            document={wbsDocument}
            dependencyWarnings={wbsDependencyWarnings}
            nodeCompletion={wbsNodeCompletion}
            nodeSchedule={wbsNodeSchedule}
            linkedNodeIds={linkedWbsNodeIds}
            selectedId={
              diagramMulti.multiple
                ? undefined
                : mobileRevealActive?.kind === "wbs"
                  ? mobileRevealActive.id
                  : (sourceHighlightedWbsNodeId ?? selectedWbsNodeId)
            }
            selectedRelationshipId={diagramMulti.multiple ? undefined : selectedWbsRelationshipId}
            zoom={workspace.zoom}
            renderStatus={status}
            renderError={result?.error}
            onRenderRetry={retryRender}
            onZoomChange={(zoom) => update("zoom", zoom)}
            onSelect={(id) => {
              setMobileReveal(undefined);
              selectWbsNode(id);
              const node = wbsDocument.nodes.find((item) => item.id === id);
              if (node) setSelectionRequest({ ...node.sourceRange });
            }}
            onRelationshipSelect={(id) => {
              selectWbsRelationship(id);
              const relationship = wbsDocument.relationships.find((item) => item.id === id);
              if (relationship) setSelectionRequest({ ...relationship.sourceRange });
            }}
            onMove={moveWbsNode}
            onRelationshipCreate={createWbsRelationship}
            onRelationshipReconnect={reconnectWbsArrow}
          />
        ))}
    </>
  );
}
