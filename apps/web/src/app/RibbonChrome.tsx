import { Ribbon, RibbonGroup } from "../Ribbon";
import { FileMenu } from "../FileMenu";
import { FileSaveStatus, type FileSaveState } from "../FileSaveStatus";
import { HistoryMenu } from "../HistoryMenu";
import { AddMenu } from "../AddMenu";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { SourceHistory } from "../../../../packages/editor-core/src/history";
import type { AppDialog } from "../use-app-dialog";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { Command } from "@plantuml-studio/editor-core";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { VirtualProject } from "../projects/project-index";
import type { ViewMode, DiagramKind } from "../model";
import type { Dispatch, SetStateAction } from "react";
import type { useSingleFileProject } from "../projects/use-single-file-project";

export interface RibbonChromeProps {
  activeDocument: DocumentSnapshot;
  activeHistory: SourceHistory;
  activeInLegacyProject: boolean;
  activeInSingleFileProject: boolean;
  backupWorkspace: () => Promise<void>;
  closeDialog: (kind?: AppDialog["kind"]) => void;
  collaboration: ActiveCollaboration | undefined;
  collaborationAppliesToActiveDiagram: boolean;
  commandReadOnly: boolean;
  commands: Command[];
  copyConfluence: () => Promise<void>;
  copyImage: () => Promise<void>;
  copyMarkdown: () => Promise<void>;
  currentFileSaveState: FileSaveState | undefined;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  dialog: AppDialog | undefined;
  exportPdf: () => Promise<void>;
  exportPng: () => Promise<void>;
  exportReady: boolean;
  exportSource: () => void;
  exportSvg: () => void;
  fileCopy: "new" | "file" | "download" | undefined;
  fileDirty: boolean;
  fileSaving: boolean;
  linkedDiagramActions: (
    { label: string; disabled: boolean; run: () => void } | { label: string; run: () => void; disabled?: never }
  )[];
  linkedDiagramIssueCount: number;
  linkedWbs: DocumentSnapshot | undefined;
  narrow: boolean;
  newDocument: () => void;
  openActivitySettingsFromToolbar: () => void;
  openClassSettingsFromToolbar: () => void;
  openDialog: (next: AppDialog) => void;
  openDocument: () => Promise<void>;
  openPresentation: () => void;
  openProjectInspector: () => void;
  openReports: () => void;
  openResourcePanel: () => void;
  openSequenceSettings: () => void;
  openUseCaseSettingsFromToolbar: () => void;
  openVersionHistory: () => Promise<void>;
  openWbsSettingsFromToolbar: () => void;
  parseResult: DiagramParseResult<GanttDocument>;
  project: VirtualProject | undefined;
  projectInspectorOpen: boolean;
  redo: (steps?: unknown) => void;
  restoreWorkspace: () => Promise<void>;
  saveCurrentDocument: () => Promise<void>;
  saveCurrentDocumentAs: () => Promise<void>;
  saveNeeded: boolean;
  selectViewMode: (mode: ViewMode) => void;
  setClosedDayFocus: Dispatch<SetStateAction<number>>;
  setCollaborationDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDocumentSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setExportDialog: Dispatch<SetStateAction<"export" | "share" | undefined>>;
  setJiraDialogOpen: Dispatch<SetStateAction<boolean>>;
  setLegendInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setOpenWorkOpen: Dispatch<SetStateAction<boolean>>;
  setOutlineMode: Dispatch<SetStateAction<"find" | "dock" | undefined>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setSettingsCategory: Dispatch<SetStateAction<string>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setStarterDraft: Dispatch<SetStateAction<{ kind: DiagramKind; source: string; name: string } | undefined>>;
  showDocumentNavigator: () => void;
  sideInspectorOpen: boolean;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
  tabLabels: Map<string, string>;
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
  undo: (steps?: unknown) => void;
  viewMode: ViewMode;
  workspace: WorkspaceSnapshot;
}

export function RibbonChrome({
  activeDocument,
  activeHistory,
  activeInLegacyProject,
  activeInSingleFileProject,
  backupWorkspace,
  closeDialog,
  collaboration,
  collaborationAppliesToActiveDiagram,
  commandReadOnly,
  commands,
  copyConfluence,
  copyImage,
  copyMarkdown,
  currentFileSaveState,
  diagramMulti,
  dialog,
  exportPdf,
  exportPng,
  exportReady,
  exportSource,
  exportSvg,
  fileCopy,
  fileDirty,
  fileSaving,
  linkedDiagramActions,
  linkedDiagramIssueCount,
  linkedWbs,
  narrow,
  newDocument,
  openActivitySettingsFromToolbar,
  openClassSettingsFromToolbar,
  openDialog,
  openDocument,
  openPresentation,
  openProjectInspector,
  openReports,
  openResourcePanel,
  openSequenceSettings,
  openUseCaseSettingsFromToolbar,
  openVersionHistory,
  openWbsSettingsFromToolbar,
  parseResult,
  project,
  projectInspectorOpen,
  redo,
  restoreWorkspace,
  saveCurrentDocument,
  saveCurrentDocumentAs,
  saveNeeded,
  selectViewMode,
  setClosedDayFocus,
  setCollaborationDialogOpen,
  setDocumentSettingsOpen,
  setExportDialog,
  setJiraDialogOpen,
  setLegendInspectorOpen,
  setOpenWorkOpen,
  setOutlineMode,
  setProblemsOpen,
  setSettingsCategory,
  setSettingsOpen,
  setStarterDraft,
  showDocumentNavigator,
  sideInspectorOpen,
  singleFileProject,
  tabLabels,
  tabs,
  undo,
  viewMode,
  workspace,
}: RibbonChromeProps) {
  return (
    <>
      <Ribbon
        file={
          <>
            <FileMenu
              saving={fileSaving}
              canExport={exportReady}
              onNew={newDocument}
              onNewProject={() => openDialog({ kind: "new-project" })}
              onOpenRecent={() => setOpenWorkOpen(true)}
              onOpen={() => void openDocument()}
              onOpenProject={() => void singleFileProject.openProject()}
              onProjectConnections={project ? showDocumentNavigator : undefined}
              projectName={project?.manifest.name}
              onSave={() => void saveCurrentDocument()}
              onSaveAs={() => void saveCurrentDocumentAs()}
              onSaveAsStarter={() =>
                setStarterDraft({
                  kind: workspace.diagramKind,
                  source: workspace.source,
                  name: tabs.documents.find((item) => item.id === tabs.activeId)?.displayName ?? "My starter",
                })
              }
              onVersionHistory={() => void openVersionHistory()}
              onDocumentSettings={() => setDocumentSettingsOpen(true)}
              onBackup={backupWorkspace}
              onRestore={() => void restoreWorkspace()}
              onExportPreview={() => setExportDialog("export")}
              onShareLink={() => setExportDialog("share")}
              onExportSource={exportSource}
              onExportSvg={exportSvg}
              onExportPng={() => void exportPng()}
              onExportPdf={() => void exportPdf()}
              onCopyImage={() => void copyImage()}
              onCopyMarkdown={() => void copyMarkdown()}
              onCopyConfluence={() => void copyConfluence()}
            />
          </>
        }
        utilities={
          <>
            <button
              className="ribbon-command-trigger"
              onClick={() => openDialog({ kind: "command-palette" })}
              title="Command palette (Cmd/Ctrl+Shift+P)"
            >
              Commands
            </button>
            <button
              className={
                collaboration
                  ? `collaboration-button ribbon-command-trigger ${collaboration.connection}`
                  : "collaboration-button ribbon-command-trigger"
              }
              onClick={() => setCollaborationDialogOpen(true)}
            >
              {collaboration ? `${collaboration.participants.length} online` : "Collaborate"}
            </button>
            <button
              type="button"
              className={`save-button${saveNeeded ? " save-needed" : ""}`}
              disabled={fileSaving}
              onClick={() => void saveCurrentDocument()}
              title="Save (Ctrl/Cmd+S)"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsCategory("Editor & navigation");
                setSettingsOpen(true);
              }}
              title="Application settings"
              aria-label="Settings"
            >
              ⚙
            </button>
            <button type="button" aria-label="Help" title="Help" onClick={() => openDialog({ kind: "help" })}>
              ?
            </button>
          </>
        }
        identity={
          <>
            <div className="document-identity">
              <span
                className="document-name"
                title={
                  activeInSingleFileProject || activeInLegacyProject
                    ? (project?.manifest.name ?? workspace.fileName)
                    : workspace.fileName
                }
              >
                {activeInSingleFileProject || activeInLegacyProject
                  ? `${tabLabels.get(activeDocument.id)} — ${project?.manifest.name ?? workspace.fileName}`
                  : activeDocument.fileCopy === "new"
                    ? `${tabLabels.get(activeDocument.id)} — New separate file`
                    : tabLabels.get(activeDocument.id) === workspace.fileName
                      ? workspace.fileName
                      : `${tabLabels.get(activeDocument.id)} — ${workspace.fileName}`}
              </span>
              <FileSaveStatus
                dirty={fileDirty}
                fileCopy={fileCopy}
                fileName={workspace.fileName}
                state={currentFileSaveState}
                onRetry={() => void saveCurrentDocument()}
              />
            </div>
          </>
        }
        history={
          <>
            <div className="history-tools" aria-label="History controls">
              <button onClick={undo} disabled={commandReadOnly || !activeHistory.canUndo} aria-label="Undo">
                ↶
              </button>
              <button onClick={redo} disabled={commandReadOnly || !activeHistory.canRedo} aria-label="Redo">
                ↷
              </button>
            </div>
          </>
        }
        panels={{
          Edit: (
            <>
              <RibbonGroup label="History">
                <HistoryMenu
                  undoSteps={commandReadOnly ? [] : activeHistory.undoDescriptions}
                  redoSteps={commandReadOnly ? [] : activeHistory.redoDescriptions}
                  onUndo={undo}
                  onRedo={redo}
                />
              </RibbonGroup>
              <RibbonGroup label="Diagram selection">
                <button
                  disabled={!diagramMulti.selected.length}
                  aria-label="Copy selection"
                  title={!diagramMulti.selected.length ? "Select diagram elements first" : undefined}
                  onClick={() => void diagramMulti.copy()}
                >
                  Copy selection
                </button>
                <button
                  disabled={commandReadOnly}
                  aria-label="Paste elements"
                  title={commandReadOnly ? "Viewing only" : "Paste copied diagram elements"}
                  onClick={() => void diagramMulti.paste()}
                >
                  Paste elements
                </button>
                <button
                  disabled={commandReadOnly || !diagramMulti.selected.length}
                  aria-label="Duplicate selection"
                  title={
                    commandReadOnly
                      ? "Viewing only"
                      : !diagramMulti.selected.length
                        ? "Select diagram elements first"
                        : undefined
                  }
                  onClick={() => void diagramMulti.duplicate()}
                >
                  Duplicate selection
                </button>
              </RibbonGroup>
              <RibbonGroup label="Source editing">
                {commands
                  .filter((command) =>
                    ["edit.go-to-line", "edit.format-source", "edit.rename-symbol"].includes(command.id),
                  )
                  .map((command) => (
                    <button
                      key={command.id}
                      disabled={command.enabled === false}
                      aria-label={command.label}
                      title={
                        command.enabled === false
                          ? command.id === "edit.rename-symbol"
                            ? "Select a renameable symbol in editable source"
                            : "Viewing only"
                          : undefined
                      }
                      onClick={() => void command.run()}
                    >
                      {command.label}
                    </button>
                  ))}
              </RibbonGroup>
            </>
          ),
          Insert: (
            <RibbonGroup label="Insert elements">
              <AddMenu
                inline
                diagramKind={workspace.diagramKind}
                disabled={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
                onTask={() => openDialog({ kind: "add-task" })}
                onMilestone={() => openDialog({ kind: "add-milestone" })}
                onDivider={() => openDialog({ kind: "add-divider" })}
                onClosedDay={() => {
                  openProjectInspector();
                  setClosedDayFocus((value) => value + 1);
                }}
                onParticipant={() => openDialog({ kind: "add-sequence-participant" })}
                onMessage={() => openDialog({ kind: "add-sequence-message" })}
                onFragment={() => openDialog({ kind: "add-sequence-structure", structureKind: "fragment" })}
                onActivation={() => openDialog({ kind: "add-sequence-structure", structureKind: "activation" })}
                onNote={() => openDialog({ kind: "add-sequence-structure", structureKind: "note" })}
                onSequenceSpacing={() => openDialog({ kind: "add-sequence-structure", structureKind: "separator" })}
                onReference={() => openDialog({ kind: "add-sequence-structure", structureKind: "reference" })}
                onParticipantBox={() => openDialog({ kind: "add-sequence-structure", structureKind: "box" })}
                onUseCaseActor={() => openDialog({ kind: "add-usecase-element", elementKind: "actor" })}
                onUseCase={() => openDialog({ kind: "add-usecase-element", elementKind: "usecase" })}
                onUseCaseRelationship={() => openDialog({ kind: "add-usecase-relationship" })}
                onUseCasePackage={() => openDialog({ kind: "add-usecase-package" })}
                onUseCaseNote={() => openDialog({ kind: "add-usecase-note" })}
                onClassEntity={() => openDialog({ kind: "add-class-entity" })}
                onClassRelationship={() => openDialog({ kind: "add-class-relationship" })}
                onClassPackage={() => openDialog({ kind: "add-class-package" })}
                onClassNote={() => openDialog({ kind: "add-class-note" })}
                onActivityAction={() => openDialog({ kind: "add-activity-action" })}
                onActivityPartition={() => openDialog({ kind: "add-activity-partition" })}
                onActivityNote={() => openDialog({ kind: "add-activity-note" })}
                onActivityStructure={() => openDialog({ kind: "add-activity-structure" })}
                onActivityTerminal={() => openDialog({ kind: "add-activity-terminal" })}
                onActivityArrow={() => openDialog({ kind: "add-activity-arrow" })}
                onWbsNode={() => openDialog({ kind: "add-wbs-node" })}
              />
              {workspace.diagramKind === "gantt" && (
                <button
                  type="button"
                  disabled={commandReadOnly || parseResult.document.tasks.length < 2}
                  title={
                    commandReadOnly
                      ? "Viewing only"
                      : parseResult.document.tasks.length < 2
                        ? "Add at least two tasks first"
                        : "Choose predecessor and successor tasks"
                  }
                  onClick={() => openDialog({ kind: "add-dependency" })}
                >
                  Add dependency…
                </button>
              )}
            </RibbonGroup>
          ),
          Plan: (
            <>
              {workspace.diagramKind !== "wbs" && (
                <RibbonGroup label="Planning tools">
                  {workspace.diagramKind === "gantt" ? (
                    <>
                      <button data-inspector-trigger onClick={openProjectInspector}>
                        Calendar &amp; schedule
                      </button>
                      <button data-inspector-trigger onClick={openResourcePanel}>
                        Workload
                      </button>
                      <button onClick={openReports}>Reports…</button>
                      <button
                        disabled={commandReadOnly}
                        title={commandReadOnly ? "Viewing only" : undefined}
                        onClick={() => openDialog({ kind: "delivery-scenario" })}
                      >
                        What-if scenario…
                      </button>
                      <button onClick={() => setJiraDialogOpen(true)}>Jira…</button>
                    </>
                  ) : (
                    <span className="ribbon-unavailable">Planning tools are for Gantt and WBS diagrams.</span>
                  )}
                </RibbonGroup>
              )}
              {(workspace.diagramKind === "wbs" || linkedWbs) && (
                <RibbonGroup label="Linked diagrams">
                  <span className="ribbon-link-count" aria-label="Sync issues">
                    {linkedDiagramIssueCount > 0 ? `${linkedDiagramIssueCount} sync issues` : ""}
                  </span>
                  {linkedDiagramActions.map((action) => (
                    <button
                      key={action.label}
                      disabled={action.disabled}
                      title={
                        action.disabled
                          ? commandReadOnly
                            ? "Viewing only"
                            : "Linked diagrams are already synchronized"
                          : undefined
                      }
                      data-inspector-trigger
                      onClick={action.run}
                    >
                      {action.label}
                    </button>
                  ))}
                </RibbonGroup>
              )}
            </>
          ),
          View: (
            <>
              <RibbonGroup label="Navigation and panels">
                {(sideInspectorOpen || projectInspectorOpen) && (
                  <button type="button" onClick={() => selectViewMode(viewMode === "diagram" ? "split" : "diagram")}>
                    {viewMode === "diagram" ? "Restore split view" : "Focus on diagram"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeDialog("diagram-outline");
                    if (viewMode === "code") selectViewMode(narrow ? "diagram" : "split");
                    setOutlineMode("find");
                  }}
                >
                  Find in diagram
                </button>
                <button
                  type="button"
                  className={dialog?.kind === "diagram-outline" ? "active" : ""}
                  onClick={() => openDialog({ kind: "diagram-outline" })}
                >
                  Outline
                </button>
                <button onClick={openPresentation}>Presentation &amp; local review…</button>
                <button onClick={() => setProblemsOpen(true)}>Issues</button>
              </RibbonGroup>
              <RibbonGroup label="Diagram settings">
                <div className="ribbon-settings">
                  {workspace.diagramKind === "sequence" && (
                    <button
                      disabled={commandReadOnly}
                      title={commandReadOnly ? "Viewing only" : undefined}
                      data-inspector-trigger
                      onClick={openSequenceSettings}
                    >
                      Diagram settings
                    </button>
                  )}
                  {workspace.diagramKind === "usecase" && (
                    <button
                      disabled={commandReadOnly}
                      title={commandReadOnly ? "Viewing only" : undefined}
                      data-inspector-trigger
                      onClick={openUseCaseSettingsFromToolbar}
                    >
                      Diagram settings
                    </button>
                  )}
                  {(workspace.diagramKind === "class" || workspace.diagramKind === "component") && (
                    <button
                      disabled={commandReadOnly}
                      title={commandReadOnly ? "Viewing only" : undefined}
                      data-inspector-trigger
                      onClick={openClassSettingsFromToolbar}
                    >
                      Diagram settings
                    </button>
                  )}
                  {workspace.diagramKind === "activity" && (
                    <button
                      disabled={commandReadOnly}
                      title={commandReadOnly ? "Viewing only" : undefined}
                      data-inspector-trigger
                      onClick={openActivitySettingsFromToolbar}
                    >
                      Diagram settings
                    </button>
                  )}
                  {workspace.diagramKind === "wbs" && (
                    <button
                      disabled={commandReadOnly}
                      title={commandReadOnly ? "Viewing only" : undefined}
                      data-inspector-trigger
                      onClick={() => {
                        openWbsSettingsFromToolbar();
                      }}
                    >
                      Diagram settings
                    </button>
                  )}
                </div>
                {commandReadOnly && <span>Viewing only</span>}
                {workspace.diagramKind === "gantt" && (
                  <button
                    disabled={commandReadOnly}
                    title={commandReadOnly ? "Viewing only" : undefined}
                    onClick={() => setLegendInspectorOpen(true)}
                  >
                    Legend labels…
                  </button>
                )}
              </RibbonGroup>
            </>
          ),
        }}
      />
    </>
  );
}
