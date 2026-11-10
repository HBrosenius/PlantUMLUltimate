import { BulkDiagramInspector } from "../BulkDiagramInspector";
import { BulkTaskInspector } from "../BulkTaskInspector";
import {
  moveTasksByDays,
  setTasksColor,
  setTasksCompletion,
  setTasksResource,
  deleteTasks,
  type BulkTaskResult,
} from "../gantt-bulk-operations";
import type {
  ActivityDocument,
  ActivityNode,
  ActivityArrow,
  ActivityControl,
  ActivityNote,
  ActivityPartition,
} from "../../../../packages/diagram-activity/src/model";
import type { ActivitySettings } from "../activity-settings";
import type {
  ClassEntityInput,
  ClassMemberInput,
  ClassNoteInput,
  ClassPackageInput,
  ClassRelationshipInput,
} from "../../../../packages/diagram-class/src/operations";
import type {
  ActivityActionInput,
  ActivityArrowInput,
  ActivityControlInput,
  ActivityNoteInput,
  ActivityPartitionInput,
} from "../../../../packages/diagram-activity/src/operations";
import type {
  ClassMember,
  ClassDocument,
  ClassEntity,
  ClassNote,
  ClassPackage,
  ClassRelationship,
} from "../../../../packages/diagram-class/src/model";
import type { ClassSettings } from "../class-settings";
import type { SequenceMessageInspectorValue } from "../SequenceMessageInspector";
import type { SequenceParticipantInspectorValue } from "../SequenceParticipantInspector";
import type { SequenceSettings } from "../sequence-settings";
import type {
  SequenceStructureInput,
  SequenceMessage,
  SequenceParticipant,
  SequenceStructure,
  SequenceDocument,
} from "../../../../packages/diagram-sequence/src/index";
import type {
  UseCaseElementInput,
  UseCaseNoteInput,
  UseCasePackageInput,
  UseCaseRelationshipInput,
} from "../../../../packages/diagram-usecase/src/operations";
import type { UseCaseSettings } from "../usecase-settings";
import type { ClassDialogKind } from "../features/class/ClassDialogs";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type {
  UseCaseElement,
  UseCaseNote,
  UseCasePackage,
  UseCaseRelationship,
  UseCaseDocument,
} from "../../../../packages/diagram-usecase/src/model";
import type { Dispatch, SetStateAction, ComponentProps } from "react";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ViewMode } from "../model";
import { lazyFeature } from "../lazy-feature";

const UseCaseInspectors = lazyFeature<
  ComponentProps<typeof import("../features/usecase/UseCaseInspectors").UseCaseInspectors>
>(
  () => import("../features/usecase/UseCaseInspectors").then((module) => ({ default: module.UseCaseInspectors })),
  "use case inspectors",
  { silent: true },
);

const ClassInspectors = lazyFeature<ComponentProps<typeof import("../features/class/ClassInspectors").ClassInspectors>>(
  () => import("../features/class/ClassInspectors").then((module) => ({ default: module.ClassInspectors })),
  "class inspectors",
  { silent: true },
);

const ActivityInspectors = lazyFeature<
  ComponentProps<typeof import("../features/activity/ActivityInspectors").ActivityInspectors>
>(
  () => import("../features/activity/ActivityInspectors").then((module) => ({ default: module.ActivityInspectors })),
  "activity inspectors",
  { silent: true },
);

const ClassDialogs = lazyFeature<ComponentProps<typeof import("../features/class/ClassDialogs").ClassDialogs>>(
  () => import("../features/class/ClassDialogs").then((module) => ({ default: module.ClassDialogs })),
  "class forms",
  { silent: true },
);

const SequenceInspectors = lazyFeature<
  ComponentProps<typeof import("../features/sequence/SequenceInspectors").SequenceInspectors>
>(
  () => import("../features/sequence/SequenceInspectors").then((module) => ({ default: module.SequenceInspectors })),
  "sequence inspectors",
  { silent: true },
);

export interface DiagramInspectorsProps {
  activityDocument: ActivityDocument;
  activityInspectorSettings: ActivitySettings;
  activitySettingsOpen: boolean;
  addClassEntity: (value: ClassEntityInput) => void;
  addClassMember: (value: ClassMemberInput) => void;
  addClassNote: (value: ClassNoteInput) => void;
  addClassPackage: (value: ClassPackageInput) => void;
  addClassRelationship: (value: ClassRelationshipInput) => void;
  applyActivityAction: (value: ActivityActionInput) => void;
  applyActivityArrow: (value: ActivityArrowInput) => void;
  applyActivityControl: (value: ActivityControlInput) => void;
  applyActivityNote: (value: ActivityNoteInput) => void;
  applyActivityPartition: (value: ActivityPartitionInput) => void;
  applyActivitySettings: (value: ActivitySettings) => void;
  applyBulkTaskChange: (verb: string, result: BulkTaskResult, keepSelection?: boolean) => void;
  applyClassEntity: (value: ClassEntityInput) => void;
  applyClassMember: (member: ClassMember, value: ClassMemberInput) => boolean;
  applyClassNote: (value: ClassNoteInput) => void;
  applyClassPackage: (value: ClassPackageInput) => void;
  applyClassRelationship: (value: ClassRelationshipInput) => void;
  applyClassSettings: (value: ClassSettings) => void;
  applySequenceMessage: (value: SequenceMessageInspectorValue) => void;
  applySequenceParticipant: (value: SequenceParticipantInspectorValue) => void;
  applySequenceSettings: (value: SequenceSettings) => void;
  applySequenceStructure: (value: SequenceStructureInput) => void;
  applyUseCaseElement: (value: UseCaseElementInput) => void;
  applyUseCaseNote: (value: UseCaseNoteInput) => void;
  applyUseCasePackage: (value: UseCasePackageInput) => void;
  applyUseCaseRelationship: (value: UseCaseRelationshipInput) => void;
  applyUseCaseSettings: (value: UseCaseSettings) => void;
  classDialogKind: ClassDialogKind | undefined;
  classDocument: ClassDocument;
  classInspectorSettings: ClassSettings;
  classSettingsOpen: boolean;
  clearSelectedActivityObject: () => void;
  clearSelectedClassObject: () => void;
  clearSelectedUseCaseObject: () => void;
  clearSelectedWbsNode: () => void;
  clearSelectedWbsRelationship: () => void;
  closeActivitySettings: () => void;
  closeClassDialog: (kind: ClassDialogKind) => void;
  closeClassSettings: () => void;
  closeSequenceSettings: () => void;
  closeUseCaseSettings: () => void;
  copySelectedTasks: () => void;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  dismissAllInspectors: () => void;
  duplicateSelectedTasks: () => void;
  moveActivityActionPartition: (partitionId?: string) => void;
  moveClassMember: (member: ClassMember, direction: -1 | 1) => void;
  moveSelectedActivityPartition: (parentId?: string) => void;
  moveSelectedClassEntity: (id?: string) => void;
  moveSelectedClassPackage: (parentId?: string) => void;
  moveSelectedUseCaseElementToPackage: (packageId?: string) => void;
  multipleTasksSelected: boolean;
  parseResult: DiagramParseResult<GanttDocument>;
  removeActivityAction: () => void;
  removeActivityArrow: () => void;
  removeActivityControl: () => void;
  removeActivityNote: () => void;
  removeActivityPartition: () => void;
  removeActivityTerminal: () => void;
  removeClassEntity: () => void;
  removeClassMember: (member: ClassMember) => void;
  removeClassNote: () => void;
  removeClassPackage: () => void;
  removeClassRelationship: () => void;
  removeSequenceMessage: () => void;
  removeSequenceParticipant: () => void;
  removeSequenceStructure: () => void;
  removeUseCaseElement: () => void;
  removeUseCaseNote: () => void;
  removeUseCasePackage: () => void;
  removeUseCaseRelationship: () => void;
  resourceNames: string[];
  selectedActivityAction: ActivityNode | undefined;
  selectedActivityArrow: ActivityArrow | undefined;
  selectedActivityControl: ActivityControl | undefined;
  selectedActivityNote: ActivityNote | undefined;
  selectedActivityPartition: ActivityPartition | undefined;
  selectedActivityTerminal: ActivityNode | undefined;
  selectedClassEntity: ClassEntity | undefined;
  selectedClassNote: ClassNote | undefined;
  selectedClassPackage: ClassPackage | undefined;
  selectedClassRelationship: ClassRelationship | undefined;
  selectedSequenceMessage: SequenceMessage | undefined;
  selectedSequenceParticipant: SequenceParticipant | undefined;
  selectedSequenceStructure: SequenceStructure | undefined;
  selectedTaskIds: string[];
  selectedUseCaseElement: UseCaseElement | undefined;
  selectedUseCaseNote: UseCaseNote | undefined;
  selectedUseCasePackage: UseCasePackage | undefined;
  selectedUseCaseRelationship: UseCaseRelationship | undefined;
  sequenceInspectorSettings: SequenceSettings;
  sequenceMessageAnchors: string[];
  sequenceParticipantNames: string[];
  sequenceSettingsOpen: boolean;
  setSelectedSequenceMessageId: (id: string | undefined, updatedDocument?: SequenceDocument) => void;
  setSelectedSequenceParticipantId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedSequenceStructureId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSelectionRequest: Dispatch<SetStateAction<{ from: number; to: number } | undefined>>;
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
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  useCaseDocument: UseCaseDocument;
  useCaseInspectorSettings: UseCaseSettings;
  useCaseSettingsOpen: boolean;
  viewMode: ViewMode;
  workspace: WorkspaceSnapshot;
}

export function DiagramInspectors({
  activityDocument,
  activityInspectorSettings,
  activitySettingsOpen,
  addClassEntity,
  addClassMember,
  addClassNote,
  addClassPackage,
  addClassRelationship,
  applyActivityAction,
  applyActivityArrow,
  applyActivityControl,
  applyActivityNote,
  applyActivityPartition,
  applyActivitySettings,
  applyBulkTaskChange,
  applyClassEntity,
  applyClassMember,
  applyClassNote,
  applyClassPackage,
  applyClassRelationship,
  applyClassSettings,
  applySequenceMessage,
  applySequenceParticipant,
  applySequenceSettings,
  applySequenceStructure,
  applyUseCaseElement,
  applyUseCaseNote,
  applyUseCasePackage,
  applyUseCaseRelationship,
  applyUseCaseSettings,
  classDialogKind,
  classDocument,
  classInspectorSettings,
  classSettingsOpen,
  clearSelectedActivityObject,
  clearSelectedClassObject,
  clearSelectedUseCaseObject,
  clearSelectedWbsNode,
  clearSelectedWbsRelationship,
  closeActivitySettings,
  closeClassDialog,
  closeClassSettings,
  closeSequenceSettings,
  closeUseCaseSettings,
  copySelectedTasks,
  diagramMulti,
  dismissAllInspectors,
  duplicateSelectedTasks,
  moveActivityActionPartition,
  moveClassMember,
  moveSelectedActivityPartition,
  moveSelectedClassEntity,
  moveSelectedClassPackage,
  moveSelectedUseCaseElementToPackage,
  multipleTasksSelected,
  parseResult,
  removeActivityAction,
  removeActivityArrow,
  removeActivityControl,
  removeActivityNote,
  removeActivityPartition,
  removeActivityTerminal,
  removeClassEntity,
  removeClassMember,
  removeClassNote,
  removeClassPackage,
  removeClassRelationship,
  removeSequenceMessage,
  removeSequenceParticipant,
  removeSequenceStructure,
  removeUseCaseElement,
  removeUseCaseNote,
  removeUseCasePackage,
  removeUseCaseRelationship,
  resourceNames,
  selectedActivityAction,
  selectedActivityArrow,
  selectedActivityControl,
  selectedActivityNote,
  selectedActivityPartition,
  selectedActivityTerminal,
  selectedClassEntity,
  selectedClassNote,
  selectedClassPackage,
  selectedClassRelationship,
  selectedSequenceMessage,
  selectedSequenceParticipant,
  selectedSequenceStructure,
  selectedTaskIds,
  selectedUseCaseElement,
  selectedUseCaseNote,
  selectedUseCasePackage,
  selectedUseCaseRelationship,
  sequenceInspectorSettings,
  sequenceMessageAnchors,
  sequenceParticipantNames,
  sequenceSettingsOpen,
  setSelectedSequenceMessageId,
  setSelectedSequenceParticipantId,
  setSelectedSequenceStructureId,
  setSelectedTaskId,
  setSelectionRequest,
  tabs,
  update,
  useCaseDocument,
  useCaseInspectorSettings,
  useCaseSettingsOpen,
  viewMode,
  workspace,
}: DiagramInspectorsProps) {
  return (
    <>
      {workspace.diagramKind === "usecase" && (
        <UseCaseInspectors
          settingsOpen={useCaseSettingsOpen}
          settings={useCaseInspectorSettings}
          selectedElement={diagramMulti.multiple ? undefined : selectedUseCaseElement}
          selectedRelationship={diagramMulti.multiple ? undefined : selectedUseCaseRelationship}
          selectedPackage={diagramMulti.multiple ? undefined : selectedUseCasePackage}
          selectedNote={diagramMulti.multiple ? undefined : selectedUseCaseNote}
          elements={useCaseDocument.elements}
          packages={useCaseDocument.packages}
          onSettingsChange={applyUseCaseSettings}
          onElementChange={applyUseCaseElement}
          onElementDelete={removeUseCaseElement}
          onElementPackageChange={moveSelectedUseCaseElementToPackage}
          onRelationshipChange={applyUseCaseRelationship}
          onRelationshipDelete={removeUseCaseRelationship}
          onPackageChange={applyUseCasePackage}
          onPackageDelete={removeUseCasePackage}
          onNoteChange={applyUseCaseNote}
          onNoteDelete={removeUseCaseNote}
          onCloseSettings={closeUseCaseSettings}
          onCloseSelection={clearSelectedUseCaseObject}
        />
      )}
      {(workspace.diagramKind === "class" || workspace.diagramKind === "component") && (
        <ClassInspectors
          componentMode={workspace.diagramKind === "component"}
          settingsOpen={classSettingsOpen}
          settings={classInspectorSettings}
          document={classDocument}
          selectedEntity={diagramMulti.multiple ? undefined : selectedClassEntity}
          selectedRelationship={diagramMulti.multiple ? undefined : selectedClassRelationship}
          selectedPackage={diagramMulti.multiple ? undefined : selectedClassPackage}
          selectedNote={diagramMulti.multiple ? undefined : selectedClassNote}
          onSettingsChange={applyClassSettings}
          onEntityChange={applyClassEntity}
          onEntityPackageChange={moveSelectedClassEntity}
          onEntityDelete={removeClassEntity}
          onMemberAdd={addClassMember}
          onMemberChange={applyClassMember}
          onMemberDelete={removeClassMember}
          onMemberMove={moveClassMember}
          onMemberReveal={(member) => {
            if (viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...member.sourceRange });
          }}
          onRelationshipChange={applyClassRelationship}
          onRelationshipDelete={removeClassRelationship}
          onPackageChange={applyClassPackage}
          onPackageParentChange={moveSelectedClassPackage}
          onPackageDelete={removeClassPackage}
          onNoteChange={applyClassNote}
          onNoteDelete={removeClassNote}
          onCloseSettings={closeClassSettings}
          onCloseSelection={clearSelectedClassObject}
        />
      )}
      {workspace.diagramKind === "activity" && (
        <ActivityInspectors
          settingsOpen={activitySettingsOpen}
          settings={activityInspectorSettings}
          document={activityDocument}
          selectedAction={diagramMulti.multiple ? undefined : selectedActivityAction}
          selectedControl={diagramMulti.multiple ? undefined : selectedActivityControl}
          selectedTerminal={diagramMulti.multiple ? undefined : selectedActivityTerminal}
          selectedArrow={diagramMulti.multiple ? undefined : selectedActivityArrow}
          selectedPartition={diagramMulti.multiple ? undefined : selectedActivityPartition}
          selectedNote={diagramMulti.multiple ? undefined : selectedActivityNote}
          onSettingsChange={applyActivitySettings}
          onActionChange={applyActivityAction}
          onActionPartitionChange={moveActivityActionPartition}
          onActionDelete={removeActivityAction}
          onControlChange={applyActivityControl}
          onControlDelete={removeActivityControl}
          onTerminalDelete={removeActivityTerminal}
          onArrowChange={applyActivityArrow}
          onArrowDelete={removeActivityArrow}
          onPartitionChange={applyActivityPartition}
          onPartitionParentChange={moveSelectedActivityPartition}
          onPartitionDelete={removeActivityPartition}
          onNoteChange={applyActivityNote}
          onNoteDelete={removeActivityNote}
          onCloseSettings={closeActivitySettings}
          onCloseSelection={clearSelectedActivityObject}
        />
      )}
      {(workspace.diagramKind === "class" || workspace.diagramKind === "component") && (
        <ClassDialogs
          componentMode={workspace.diagramKind === "component"}
          active={classDialogKind}
          document={classDocument}
          onAddEntity={addClassEntity}
          onAddRelationship={addClassRelationship}
          onAddPackage={addClassPackage}
          onAddNote={addClassNote}
          onClose={() => classDialogKind && closeClassDialog(classDialogKind)}
        />
      )}
      {workspace.diagramKind === "sequence" && (
        <SequenceInspectors
          settingsOpen={sequenceSettingsOpen}
          settings={sequenceInspectorSettings}
          selectedParticipant={diagramMulti.multiple ? undefined : selectedSequenceParticipant}
          selectedMessage={diagramMulti.multiple ? undefined : selectedSequenceMessage}
          selectedStructure={diagramMulti.multiple ? undefined : selectedSequenceStructure}
          participants={sequenceParticipantNames}
          anchors={sequenceMessageAnchors}
          onSettingsApply={applySequenceSettings}
          onParticipantApply={applySequenceParticipant}
          onParticipantDelete={removeSequenceParticipant}
          onMessageApply={applySequenceMessage}
          onMessageDelete={removeSequenceMessage}
          onStructureApply={applySequenceStructure}
          onStructureDelete={removeSequenceStructure}
          onCloseSettings={closeSequenceSettings}
          onCloseParticipant={() => setSelectedSequenceParticipantId(undefined)}
          onCloseMessage={() => setSelectedSequenceMessageId(undefined)}
          onCloseStructure={() => setSelectedSequenceStructureId(undefined)}
        />
      )}
      {diagramMulti.multiple && (
        <BulkDiagramInspector
          key={`${tabs.activeId}:${workspace.diagramKind}`}
          items={diagramMulti.selected}
          readOnly={diagramMulti.readOnly}
          onChange={diagramMulti.change}
          onCopy={diagramMulti.copy}
          onPaste={diagramMulti.paste}
          onDuplicate={diagramMulti.duplicate}
          onClose={() => {
            diagramMulti.clear();
            dismissAllInspectors();
            clearSelectedWbsNode();
            clearSelectedWbsRelationship();
          }}
        />
      )}
      {multipleTasksSelected && (
        <BulkTaskInspector
          labels={selectedTaskIds.map((id) => parseResult.document.symbols.tasks.get(id)?.label ?? id)}
          resourceNames={resourceNames}
          onMove={(days) => applyBulkTaskChange("Moved", moveTasksByDays(workspace.source, selectedTaskIds, days))}
          onColor={(color) =>
            applyBulkTaskChange("Recoloured", setTasksColor(workspace.source, selectedTaskIds, color))
          }
          onCompletion={(value) =>
            applyBulkTaskChange("Updated", setTasksCompletion(workspace.source, selectedTaskIds, value))
          }
          onResource={(name) =>
            applyBulkTaskChange("Assigned", setTasksResource(workspace.source, selectedTaskIds, name))
          }
          onDuplicate={duplicateSelectedTasks}
          onCopy={copySelectedTasks}
          onDelete={() => applyBulkTaskChange("Deleted", deleteTasks(workspace.source, selectedTaskIds), false)}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
    </>
  );
}
