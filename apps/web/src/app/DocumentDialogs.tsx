import { ProjectNavigator } from "../projects/ProjectNavigator";
import { ProjectNameDialog } from "../projects/ProjectNameDialog";
import { convertWbsToGantt, setGeneratedGanttProjectStart } from "../wbs-gantt";
import { ProjectUnlockDialog } from "../projects/ProjectUnlockDialog";
import { UnsavedProjectDialog } from "../projects/UnsavedProjectDialog";
import { DateActionMenu } from "../DateActionMenu";
import { parseProjectSettings } from "../project-settings";
import { DocumentSettingsDialog } from "../DocumentSettingsDialog";
import { plantUmlTheme, setPlantUmlTheme } from "../plantuml-theme";
import { ExternalFileConflictDialog } from "../ExternalFileConflictDialog";
import { HighlightDateDialog } from "../HighlightDateDialog";
import type {
  DocumentSnapshot,
  DocumentVersion,
  DocumentVersionReason,
  WorkspaceSnapshot,
  WorkspaceSession,
} from "../workspace-storage";
import type { WbsGanttMissingItem } from "../projects/wbs-gantt-missing";
import type { DiagramKind } from "../model";
import type { AppDialog } from "../use-app-dialog";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { ExternalFileConflict } from "../use-document-files";
import type { JiraDocumentBinding } from "../../../../packages/jira-integration/src/types";
import type { CollaborationRole } from "../collaboration";
import type { PortableProject } from "../../../../packages/document-format/src/types";
import type { VirtualProject } from "../projects/project-index";
import type { WbsGanttIssue } from "../wbs-gantt-health";
import type { WbsGanttProjectLink } from "../projects/wbs-gantt-project-links";
import type { DocumentVersionOverride } from "../use-document-versions";
import type { RefObject, Dispatch, SetStateAction, ComponentProps } from "react";
import type { GanttScheduleMode } from "../features/gantt/use-gantt-controller";
import type { useSingleFileProject } from "../projects/use-single-file-project";
import type { ProjectElement, ProjectLink } from "../../../../packages/project-model/src/types";
import { lazyFeature } from "../lazy-feature";

const VersionHistoryDialog = lazyFeature<ComponentProps<typeof import("../VersionHistoryDialog").VersionHistoryDialog>>(
  () => import("../VersionHistoryDialog").then((module) => ({ default: module.VersionHistoryDialog })),
  "version history",
);

const SettingsDialog = lazyFeature<ComponentProps<typeof import("../SettingsDialog").SettingsDialog>>(
  () => import("../SettingsDialog").then((module) => ({ default: module.SettingsDialog })),
  "settings",
);

const CollaborationDialog = lazyFeature<ComponentProps<typeof import("../CollaborationDialog").CollaborationDialog>>(
  () => import("../CollaborationDialog").then((module) => ({ default: module.CollaborationDialog })),
  "collaboration",
);

const JiraDialog = lazyFeature<ComponentProps<typeof import("../JiraDialog").JiraDialog>>(
  () => import("../JiraDialog").then((module) => ({ default: module.JiraDialog })),
  "the Jira integration",
);

export interface DocumentDialogsProps {
  activeDocument: DocumentSnapshot;
  addMissingProjectItem: (item: WbsGanttMissingItem) => Promise<void>;
  addProjectDiagram: (kind: DiagramKind, name: string, initialSource?: string) => Promise<boolean>;
  applyExternalConflictMerge: (source: string) => Promise<void>;
  applyTimelineDateClosed: (date: string) => void;
  applyTimelineDateHighlight: (color: string) => void;
  clearTimelineDateHighlight: () => void;
  clearTimelineDateSetting: (date: string) => void;
  closeDialog: (kind?: AppDialog["kind"]) => void;
  collaboration: ActiveCollaboration | undefined;
  collaborationAppliesToActiveDiagram: boolean;
  collaborationDialogOpen: boolean;
  commandReadOnly: boolean;
  commitGeneratedSource: (
    source: string,
    description: string,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  commitSource: (
    source: string,
    description: string,
    validate?: boolean,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  configureDocumentFormat: (settings: {
    compression: "gzip" | "none";
    encrypted: boolean;
    password?: string;
    maxVersions: number;
    maxLogicalMiB: number;
    forecastTimeZone?: string;
  }) => Promise<void>;
  dateMenuFor: string | undefined;
  defaultCollaborationEndpoint: any;
  defaultJiraEndpoint: any;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  dialog: AppDialog | undefined;
  dismissExternalConflict: () => void;
  documentSettingsOpen: boolean;
  documentVersions: DocumentVersion[];
  editDocumentVersion: (version: DocumentVersion, patch: { label?: string; pinned?: boolean }) => Promise<void>;
  externalConflict: ExternalFileConflict | undefined;
  fileSaving: boolean;
  highlightDate: string | undefined;
  jiraBinding: JiraDocumentBinding | undefined;
  jiraDialogOpen: boolean;
  keepLocalExternalConflict: () => void;
  leaveCollaboration: () => void;
  openExternalConflictCopy: () => Promise<void>;
  openMember: (documentId: string) => void;
  pendingCollaboration:
    { roomId: string; endpoint: string; accessToken?: string | undefined; role: CollaborationRole } | undefined;
  portable: PortableProject | undefined;
  portableWbsDiagramId: string | undefined;
  project: VirtualProject | undefined;
  projectNavigatorOpen: boolean;
  projectWbsGanttIssues: (WbsGanttIssue & { documentId: string })[];
  projectWbsGanttLinks: WbsGanttProjectLink[];
  projectWbsGanttMissing: WbsGanttMissingItem[];
  recordDocumentVersion: (
    reason: DocumentVersionReason,
    label?: string,
    override?: DocumentVersionOverride,
  ) => Promise<DocumentVersion>;
  reloadExternalConflict: () => Promise<void>;
  removeDocumentVersion: (version: DocumentVersion) => Promise<void>;
  reportFileError: (error: unknown) => void;
  resourceWarningsEnabled: boolean;
  restoreDocumentVersion: (version: DocumentVersion) => Promise<void>;
  reviewApplyContext: RefObject<{ documentId: string; source: string; readOnly: boolean }>;
  rotateCollaborationRoom: () => Promise<void>;
  saveCurrentDocumentAs: () => Promise<void>;
  scheduleMode: GanttScheduleMode;
  selectWbsNode: (id: string | undefined) => void;
  selectWbsRelationship: (id: string | undefined) => void;
  setBaseline: (version?: DocumentVersion) => Promise<void>;
  setCollaborationDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDateMenuFor: Dispatch<SetStateAction<string | undefined>>;
  setDocumentSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setHighlightDate: Dispatch<SetStateAction<string | undefined>>;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setJiraDialogOpen: Dispatch<SetStateAction<boolean>>;
  setPendingProjectWbsSelection: Dispatch<SetStateAction<{ tabId: string; nodeId: string } | undefined>>;
  setProjectNavigatorOpen: Dispatch<SetStateAction<boolean>>;
  setResourceWarningsEnabled: Dispatch<SetStateAction<boolean>>;
  setScheduleMode: Dispatch<SetStateAction<GanttScheduleMode>>;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setVersionHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setWorkspace: (action: SetStateAction<WorkspaceSnapshot>) => void;
  settingsCategory: string;
  settingsOpen: boolean;
  sideInspectorOpen: boolean;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
  startCollaboration: (
    name: string,
    endpoint: string,
    requestedRoomId?: string,
    requestedAccessToken?: string,
    requestedRole?: CollaborationRole,
    createdMessage?: string,
  ) => void;
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
  updateElements: (elements: readonly ProjectElement[]) => void;
  updateLinks: (links: readonly ProjectLink[]) => void;
  usingSingleFileProject: boolean;
  versionHistoryOpen: boolean;
  workspace: WorkspaceSnapshot;
}

export function DocumentDialogs({
  activeDocument,
  addMissingProjectItem,
  addProjectDiagram,
  applyExternalConflictMerge,
  applyTimelineDateClosed,
  applyTimelineDateHighlight,
  clearTimelineDateHighlight,
  clearTimelineDateSetting,
  closeDialog,
  collaboration,
  collaborationAppliesToActiveDiagram,
  collaborationDialogOpen,
  commandReadOnly,
  commitGeneratedSource,
  commitSource,
  configureDocumentFormat,
  dateMenuFor,
  defaultCollaborationEndpoint,
  defaultJiraEndpoint,
  diagramMulti,
  dialog,
  dismissExternalConflict,
  documentSettingsOpen,
  documentVersions,
  editDocumentVersion,
  externalConflict,
  fileSaving,
  highlightDate,
  jiraBinding,
  jiraDialogOpen,
  keepLocalExternalConflict,
  leaveCollaboration,
  openExternalConflictCopy,
  openMember,
  pendingCollaboration,
  portable,
  portableWbsDiagramId,
  project,
  projectNavigatorOpen,
  projectWbsGanttIssues,
  projectWbsGanttLinks,
  projectWbsGanttMissing,
  recordDocumentVersion,
  reloadExternalConflict,
  removeDocumentVersion,
  reportFileError,
  resourceWarningsEnabled,
  restoreDocumentVersion,
  reviewApplyContext,
  rotateCollaborationRoom,
  saveCurrentDocumentAs,
  scheduleMode,
  selectWbsNode,
  selectWbsRelationship,
  setBaseline,
  setCollaborationDialogOpen,
  setDateMenuFor,
  setDocumentSettingsOpen,
  setHighlightDate,
  setInteractionMessage,
  setJiraDialogOpen,
  setPendingProjectWbsSelection,
  setProjectNavigatorOpen,
  setResourceWarningsEnabled,
  setScheduleMode,
  setSelectedTaskId,
  setSettingsOpen,
  setVersionHistoryOpen,
  setWorkspace,
  settingsCategory,
  settingsOpen,
  sideInspectorOpen,
  singleFileProject,
  startCollaboration,
  tabs,
  updateElements,
  updateLinks,
  usingSingleFileProject,
  versionHistoryOpen,
  workspace,
}: DocumentDialogsProps) {
  return (
    <>
      {project && projectNavigatorOpen && !sideInspectorOpen && !diagramMulti.multiple && (
        <ProjectNavigator
          project={project}
          readOnly={Boolean(
            collaboration?.sharedDocumentId &&
            collaboration.sharedDocumentId === portable?.projectId &&
            collaboration.role === "viewer",
          )}
          wbsGanttIssues={projectWbsGanttIssues}
          wbsGanttLinks={projectWbsGanttLinks}
          {...(portable?.diagrams.some((diagram) => diagram.wbsGantt)
            ? { wbsGanttMissing: projectWbsGanttMissing }
            : {})}
          onAddMissingWbsGanttItem={(item) => void addMissingProjectItem(item)}
          onLinkMissingWbsGanttItem={async (item) => {
            await singleFileProject.openMember(item.kind === "wbs" ? item.counterpartDocumentId : item.documentId);
            const tabId = await singleFileProject.openMember(item.documentId);
            if (!tabId) return;
            setProjectNavigatorOpen(false);
            if (item.kind === "wbs") setPendingProjectWbsSelection({ tabId, nodeId: item.key });
            else window.setTimeout(() => setSelectedTaskId(item.key), 100);
          }}
          onOpenWbsGanttLink={async (documentId, kind, key) => {
            const tabId = await singleFileProject.openMember(documentId);
            if (!tabId) return;
            if (kind === "wbs") setPendingProjectWbsSelection({ tabId, nodeId: key });
            else window.setTimeout(() => setSelectedTaskId(key), 100);
          }}
          onOpenWbsGanttIssue={(issue) => {
            tabs.activateDocument(issue.documentId);
            window.setTimeout(() => {
              if (issue.kind === "task") setSelectedTaskId(issue.key);
              if (issue.kind === "node" && issue.key) selectWbsNode(issue.key);
              if (issue.kind === "relationship" && issue.key) selectWbsRelationship(issue.key);
            }, 100);
          }}
          {...(usingSingleFileProject
            ? {
                dirty: singleFileProject.dirty,
                recoveryStatus: singleFileProject.recoveryStatus,
                indexStatus: singleFileProject.indexStatus,
                saving: singleFileProject.saving,
                onCancelSave: singleFileProject.cancelSave,
                onReviewChanges: singleFileProject.reviewChanges,
                hasReviewBaseline: singleFileProject.hasReviewBaseline,
                onExportReview: singleFileProject.exportReviewReport,
              }
            : {})}
          onOpen={openMember}
          onAdd={async (kind, name) => {
            await addProjectDiagram(kind, name);
          }}
          {...(usingSingleFileProject ? { onImport: singleFileProject.importDiagram } : {})}
          onClose={() => setProjectNavigatorOpen(false)}
          {...(usingSingleFileProject ? { onCloseProject: singleFileProject.closeProject } : {})}
          onLinksChange={updateLinks}
          onElementsChange={updateElements}
          {...(usingSingleFileProject
            ? {
                onElementsRegistered: singleFileProject.registerElements,
                onRename: singleFileProject.renameDiagram,
                onDelete: singleFileProject.deleteDiagram,
              }
            : {})}
        />
      )}
      {dialog?.kind === "new-project" && (
        <ProjectNameDialog
          title="New document"
          initialValue="PlantUML document"
          submitLabel="Create document"
          onSubmit={(name) => {
            closeDialog("new-project");
            void singleFileProject.newProject(name);
          }}
          onClose={() => closeDialog("new-project")}
        />
      )}
      {dialog?.kind === "wbs-gantt-project" && (
        <ProjectNameDialog
          title={portableWbsDiagramId ? "Create Gantt chart from WBS" : "Create document from WBS"}
          initialValue={workspace.fileName.replace(/\.[^.]+$/, "") || "WBS document"}
          hideName={Boolean(portableWbsDiagramId)}
          initialStartDate={(() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          })()}
          submitLabel="Create Gantt chart"
          onSubmit={(name, startDate) => {
            if (!startDate) return;
            const converted = convertWbsToGantt(workspace.source);
            converted.ganttSource = setGeneratedGanttProjectStart(converted.ganttSource, startDate);
            const sourceTabId = tabs.activeId;
            closeDialog("wbs-gantt-project");
            void (
              portableWbsDiagramId
                ? singleFileProject.addGanttFromWbs(portableWbsDiagramId, converted, sourceTabId)
                : singleFileProject.createWbsGanttProject(name, converted, sourceTabId)
            ).catch(reportFileError);
          }}
          onClose={() => closeDialog("wbs-gantt-project")}
        />
      )}
      {singleFileProject.unlockRequest && (
        <ProjectUnlockDialog
          fileName={singleFileProject.unlockRequest.fileName}
          onUnlock={singleFileProject.unlock}
          onClose={singleFileProject.cancelUnlock}
        />
      )}
      {singleFileProject.leaveRequest && (
        <UnsavedProjectDialog {...singleFileProject.leaveRequest} onChoice={singleFileProject.decideLeave} />
      )}
      {dateMenuFor && (
        <DateActionMenu
          date={dateMenuFor}
          state={(() => {
            const rule = parseProjectSettings(workspace.source).dateRules.find(
              (item) => item.from === dateMenuFor && item.to === dateMenuFor,
            );
            if (!rule) return "none";
            return rule.state === "colored" ? "highlighted" : rule.state;
          })()}
          onHighlight={() => {
            setHighlightDate(dateMenuFor);
            setDateMenuFor(undefined);
          }}
          onMarkClosed={() => applyTimelineDateClosed(dateMenuFor)}
          onClear={() => clearTimelineDateSetting(dateMenuFor)}
          onClose={() => setDateMenuFor(undefined)}
        />
      )}
      {versionHistoryOpen && (
        <VersionHistoryDialog
          versions={documentVersions}
          currentSource={workspace.source}
          onCreate={async (label) => {
            const version = await recordDocumentVersion("manual", label || "Manual version");
            setInteractionMessage("Created document version");
            return version;
          }}
          onRestore={restoreDocumentVersion}
          onUpdate={editDocumentVersion}
          onDelete={removeDocumentVersion}
          baselineVersionId={activeDocument.baselineVersionId}
          diagramKind={workspace.diagramKind}
          fileName={workspace.fileName}
          readOnly={commandReadOnly}
          onApplyReview={async (source, expectedSource) => {
            const documentId = tabs.activeId;
            const isCurrent = () =>
              reviewApplyContext.current.documentId === documentId &&
              reviewApplyContext.current.source === expectedSource &&
              !reviewApplyContext.current.readOnly;
            if (!isCurrent()) return false;
            try {
              await recordDocumentVersion("before-restore", "Before semantic review");
              if (!isCurrent()) {
                setInteractionMessage("The working copy changed during review. Nothing was applied.");
                return false;
              }
              const applied = commitGeneratedSource(source, "Apply semantic review selection");
              if (applied) {
                setInteractionMessage("Applied selected review changes");
                setVersionHistoryOpen(false);
              }
              return applied;
            } catch (error) {
              reportFileError(error);
              return false;
            }
          }}
          onSetBaseline={setBaseline}
          onClose={() => setVersionHistoryOpen(false)}
        />
      )}
      {documentSettingsOpen && (
        <DocumentSettingsDialog
          current={{
            compression: activeDocument.compression ?? "gzip",
            encrypted: activeDocument.encrypted === true,
            maxVersions: activeDocument.historyMaxVersions ?? 100,
            maxLogicalMiB: Math.round((activeDocument.historyMaxLogicalBytes ?? 16 * 1024 * 1024) / 1024 / 1024),
            diagramTheme: plantUmlTheme(workspace.source) ?? "",
            ...(workspace.diagramKind === "gantt" && activeDocument.progressForecast
              ? { forecastTimeZone: activeDocument.progressForecast.timeZone ?? "UTC" }
              : {}),
          }}
          diagramKind={workspace.diagramKind}
          onApply={async (settings) => {
            try {
              await configureDocumentFormat(settings);
              const themedSource = setPlantUmlTheme(workspace.source, settings.diagramTheme);
              if (themedSource !== workspace.source) commitSource(themedSource, "Change diagram theme", false);
            } catch (error) {
              reportFileError(error);
              throw error;
            }
          }}
          onClose={() => setDocumentSettingsOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          mode="settings"
          initialCategory={settingsCategory}
          onDocumentSettings={() => {
            setSettingsOpen(false);
            setDocumentSettingsOpen(true);
          }}
          scheduleMode={scheduleMode}
          onScheduleModeChange={setScheduleMode}
          resourceWarningsEnabled={resourceWarningsEnabled}
          onResourceWarningsChange={setResourceWarningsEnabled}
          current={{
            theme: workspace.theme,
            advancedMode: workspace.advancedMode,
            defaultDiagramTheme: workspace.defaultDiagramTheme,
            startupMode: workspace.startupMode,
          }}
          onApply={(settings) => {
            setWorkspace((current) => ({
              ...current,
              ...settings,
              viewMode:
                settings.advancedMode === current.advancedMode
                  ? current.viewMode
                  : settings.advancedMode
                    ? "split"
                    : "diagram",
            }));
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {externalConflict && (
        <ExternalFileConflictDialog
          fileName={externalConflict.fileName}
          baseSource={externalConflict.baseSource}
          localSource={externalConflict.localSource}
          externalSource={externalConflict.external.source}
          native={externalConflict.native === true}
          onMerge={(source) => void applyExternalConflictMerge(source)}
          onReload={() => void reloadExternalConflict()}
          onKeepLocal={keepLocalExternalConflict}
          onOpenCopy={() => void openExternalConflictCopy()}
          onClose={dismissExternalConflict}
        />
      )}
      {collaborationDialogOpen && (
        <CollaborationDialog
          documentName={singleFileProject.sharedDocument?.name}
          diagramCount={singleFileProject.sharedDocument?.diagrams.length}
          pendingRoom={pendingCollaboration?.roomId}
          pendingAccessToken={pendingCollaboration?.accessToken}
          pendingRole={pendingCollaboration?.role}
          pendingEndpoint={pendingCollaboration?.endpoint}
          defaultEndpoint={defaultCollaborationEndpoint}
          active={collaboration}
          onStart={startCollaboration}
          onRotate={rotateCollaborationRoom}
          onLeave={leaveCollaboration}
          onSaveLocal={
            collaborationAppliesToActiveDiagram && !fileSaving
              ? () => {
                  void saveCurrentDocumentAs().catch(reportError);
                }
              : undefined
          }
          onClose={() => setCollaborationDialogOpen(false)}
        />
      )}
      {jiraDialogOpen && workspace.diagramKind === "gantt" && (
        <JiraDialog
          endpoint={defaultJiraEndpoint}
          source={workspace.source}
          binding={jiraBinding}
          readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
          onApply={(source, message) => {
            if (commitGeneratedSource(source, "Synchronize Jira")) setInteractionMessage(message);
          }}
          onClose={() => setJiraDialogOpen(false)}
        />
      )}
      {highlightDate && (
        <HighlightDateDialog
          date={highlightDate}
          initialColor={
            parseProjectSettings(workspace.source).dateRules.find(
              (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
            )?.color
          }
          canClear={parseProjectSettings(workspace.source).dateRules.some(
            (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
          )}
          onApply={applyTimelineDateHighlight}
          onClear={clearTimelineDateHighlight}
          onClose={() => setHighlightDate(undefined)}
        />
      )}
    </>
  );
}
