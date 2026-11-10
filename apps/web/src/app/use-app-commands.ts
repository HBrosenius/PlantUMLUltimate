import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Command } from "@plantuml-studio/editor-core";
import { optionShortcut } from "../platform-shortcuts";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "../diagram-zoom";
import type { SourceHistory } from "../../../../packages/editor-core/src/history";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { AppDialog } from "../use-app-dialog";
import type { VirtualProject } from "../projects/project-index";
import type { RenderResult, ViewMode } from "../model";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";

export interface useAppCommandsInputs {
  activateTab: (id: string) => void;
  activeHistory: SourceHistory;
  backupWorkspace: () => Promise<void>;
  canRenameCommand: boolean;
  closeTab: (id: string) => void;
  collaboration: ActiveCollaboration | undefined;
  commandReadOnly: boolean;
  copyConfluence: () => Promise<void>;
  copyImage: () => Promise<void>;
  copyMarkdown: () => Promise<void>;
  dependencyTaskCount: number;
  exportPdf: () => Promise<void>;
  exportPng: () => Promise<void>;
  exportReady: boolean;
  exportSource: () => void;
  exportSvg: () => void;
  newDocument: () => void;
  openActivitySettingsFromToolbar: () => void;
  openClassSettingsFromToolbar: () => void;
  openDialog: (next: AppDialog) => void;
  openDocument: () => Promise<void>;
  openFormatSource: () => void;
  openProjectInspector: () => void;
  openReports: () => void;
  openResourcePanel: () => void;
  openSequenceSettings: () => void;
  openTasksView: () => void;
  openUseCaseSettingsFromToolbar: () => void;
  openVersionHistory: () => Promise<void>;
  openWbsSettings: () => void;
  project: VirtualProject | undefined;
  redo: (steps?: unknown) => void;
  renameCommandPosition: number;
  requestSymbolRename: (position: number) => boolean;
  restoreWorkspace: () => Promise<void>;
  result: RenderResult | undefined;
  saveCurrentDocument: () => Promise<void>;
  saveCurrentDocumentAs: () => Promise<void>;
  setCollaborationDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDocumentSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setJiraDialogOpen: Dispatch<SetStateAction<boolean>>;
  setLegendInspectorOpen: Dispatch<SetStateAction<boolean>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setSettingsCategory: Dispatch<SetStateAction<string>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  showDocumentNavigator: () => void;
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
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  viewMode: ViewMode;
  viewModes: ViewMode[];
  workspace: WorkspaceSnapshot;
}

export function useAppCommands({
  activateTab,
  activeHistory,
  backupWorkspace,
  canRenameCommand,
  closeTab,
  collaboration,
  commandReadOnly,
  copyConfluence,
  copyImage,
  copyMarkdown,
  dependencyTaskCount,
  exportPdf,
  exportPng,
  exportReady,
  exportSource,
  exportSvg,
  newDocument,
  openActivitySettingsFromToolbar,
  openClassSettingsFromToolbar,
  openDialog,
  openDocument,
  openFormatSource,
  openProjectInspector,
  openReports,
  openResourcePanel,
  openSequenceSettings,
  openTasksView,
  openUseCaseSettingsFromToolbar,
  openVersionHistory,
  openWbsSettings,
  project,
  redo,
  renameCommandPosition,
  requestSymbolRename,
  restoreWorkspace,
  result,
  saveCurrentDocument,
  saveCurrentDocumentAs,
  setCollaborationDialogOpen,
  setDocumentSettingsOpen,
  setJiraDialogOpen,
  setLegendInspectorOpen,
  setProblemsOpen,
  setSettingsCategory,
  setSettingsOpen,
  showDocumentNavigator,
  tabs,
  undo,
  update,
  viewMode,
  viewModes,
  workspace,
}: useAppCommandsInputs) {
  const commands = useMemo<Command[]>(() => {
    const revealViewCommand = (eventName: string, targetView: "code" | "diagram") => {
      if (viewMode !== "split") update("viewMode", targetView);
      requestAnimationFrame(() => window.dispatchEvent(new Event(eventName)));
    };
    const diagramCommands: Command[] =
      workspace.diagramKind === "gantt"
        ? [
            {
              id: "edit.add-task",
              label: "Add task…",
              category: "Edit",
              shortcut: optionShortcut("T"),
              run: () => openDialog({ kind: "add-task" }),
            },
            {
              id: "edit.add-dependency",
              label: "Add dependency…",
              category: "Insert",
              enabled: !commandReadOnly && dependencyTaskCount >= 2,
              run: () => openDialog({ kind: "add-dependency" }),
            },
            {
              id: "edit.add-milestone",
              label: "Add milestone…",
              category: "Edit",
              shortcut: optionShortcut("M"),
              run: () => openDialog({ kind: "add-milestone" }),
            },
            {
              id: "edit.add-divider",
              label: "Add divider…",
              category: "Edit",
              shortcut: optionShortcut("D"),
              run: () => openDialog({ kind: "add-divider" }),
            },
            { id: "edit.project-calendar", label: "Calendar & schedule…", category: "Edit", run: openProjectInspector },
            { id: "edit.legend", label: "Legend labels…", category: "Edit", run: () => setLegendInspectorOpen(true) },
            {
              id: "view.reports",
              label: "Reports…",
              category: "View",
              run: openReports,
            },
            { id: "view.resource-workload", label: "Resource workload…", category: "View", run: openResourcePanel },
            {
              id: "view.delivery-scenario",
              label: "What-if scenario…",
              category: "View",
              run: () => openDialog({ kind: "delivery-scenario" }),
            },
          ]
        : workspace.diagramKind === "wbs"
          ? [
              {
                id: "edit.add-wbs-node",
                label: "Add WBS node…",
                category: "Edit",
                shortcut: optionShortcut("N"),
                run: () => openDialog({ kind: "add-wbs-node" }),
              },
              {
                id: "edit.wbs-settings",
                label: "WBS settings…",
                category: "Edit",
                run: openWbsSettings,
              },
            ]
          : workspace.diagramKind === "sequence"
            ? [
                {
                  id: "edit.add-participant",
                  label: "Add participant…",
                  category: "Edit",
                  shortcut: optionShortcut("P"),
                  run: () => openDialog({ kind: "add-sequence-participant" }),
                },
                {
                  id: "edit.add-message",
                  label: "Add message…",
                  category: "Edit",
                  shortcut: optionShortcut("M"),
                  run: () => openDialog({ kind: "add-sequence-message" }),
                },
                {
                  id: "edit.add-fragment",
                  label: "Add combined fragment…",
                  category: "Edit",
                  run: () => openDialog({ kind: "add-sequence-structure", structureKind: "fragment" }),
                },
                {
                  id: "edit.add-activation",
                  label: "Add activation…",
                  category: "Edit",
                  run: () => openDialog({ kind: "add-sequence-structure", structureKind: "activation" }),
                },
                {
                  id: "edit.add-note",
                  label: "Add Sequence note…",
                  category: "Edit",
                  run: () => openDialog({ kind: "add-sequence-structure", structureKind: "note" }),
                },
              ]
            : [];
    const creationCommands: Command[] =
      workspace.diagramKind === "usecase"
        ? [
            {
              id: "edit.add-usecase-actor",
              label: "Add actor…",
              category: "Edit",
              run: () => openDialog({ kind: "add-usecase-element", elementKind: "actor" }),
            },
            {
              id: "edit.add-usecase",
              label: "Add use case…",
              category: "Edit",
              run: () => openDialog({ kind: "add-usecase-element", elementKind: "usecase" }),
            },
            ...(["relationship", "package", "note"] as const).map((kind) => ({
              id: `edit.add-usecase-${kind}`,
              label: `Add ${kind}…`,
              category: "Edit",
              run: () => openDialog({ kind: `add-usecase-${kind}` }),
            })),
          ]
        : workspace.diagramKind === "class" || workspace.diagramKind === "component"
          ? (["entity", "relationship", "package", "note"] as const).map((kind) => ({
              id: `edit.add-class-${kind}`,
              label: `Add ${kind}…`,
              category: "Edit",
              run: () => openDialog({ kind: `add-class-${kind}` }),
            }))
          : workspace.diagramKind === "activity"
            ? (["action", "partition", "note", "structure", "terminal", "arrow"] as const).map((kind) => ({
                id: `edit.add-activity-${kind}`,
                label: `Add ${kind}…`,
                category: "Edit",
                run: () => openDialog({ kind: `add-activity-${kind}` }),
              }))
            : workspace.diagramKind === "sequence"
              ? (["separator", "reference", "box"] as const).map((kind) => ({
                  id: `edit.add-sequence-${kind}`,
                  label: `Add Sequence ${kind}…`,
                  category: "Edit",
                  run: () => openDialog({ kind: "add-sequence-structure", structureKind: kind }),
                }))
              : [];
    const settingsCommand =
      workspace.diagramKind === "sequence"
        ? openSequenceSettings
        : workspace.diagramKind === "usecase"
          ? openUseCaseSettingsFromToolbar
          : workspace.diagramKind === "class" || workspace.diagramKind === "component"
            ? openClassSettingsFromToolbar
            : workspace.diagramKind === "activity"
              ? openActivitySettingsFromToolbar
              : undefined;
    return [
      { id: "file.version-history", label: "Version history…", category: "File", run: () => void openVersionHistory() },
      {
        id: "file.document-settings",
        label: "Document settings…",
        category: "Document",
        run: () => setDocumentSettingsOpen(true),
      },
      {
        id: "file.close-tab",
        label: "Close tab",
        category: "File",
        shortcut: "⌘W",
        run: () => closeTab(tabs.activeId),
      },
      ...([-1, 1] as const).map((direction) => ({
        id: direction === 1 ? "view.next-tab" : "view.previous-tab",
        label: direction === 1 ? "Next tab" : "Previous tab",
        category: "View",
        enabled: tabs.documents.length > 1,
        run: () => {
          const index = tabs.documents.findIndex((tab) => tab.id === tabs.activeId);
          const next = tabs.documents[(index + direction + tabs.documents.length) % tabs.documents.length];
          if (next) activateTab(next.id);
        },
      })),
      {
        id: "view.fit",
        label: "Fit diagram",
        category: "View",
        enabled: !!result?.svg,
        run: () => revealViewCommand("fit-active-diagram", "diagram"),
      },
      {
        id: "edit.go-to-line",
        label: "Go to line…",
        category: "Edit",
        run: () => revealViewCommand("go-to-source-line", "code"),
      },
      {
        id: "edit.format-source",
        label: "Format source…",
        category: "Edit",
        enabled: !commandReadOnly,
        run: openFormatSource,
      },
      {
        id: "edit.rename-symbol",
        label: "Rename symbol at cursor…",
        category: "Edit",
        enabled: canRenameCommand,
        run: () => {
          requestSymbolRename(renameCommandPosition);
        },
      },
      ...(settingsCommand
        ? [
            {
              id: "edit.diagram-settings",
              label: "Diagram settings…",
              category: "Edit",
              enabled: !commandReadOnly,
              run: settingsCommand,
            },
          ]
        : []),
      ...(workspace.diagramKind === "gantt"
        ? [{ id: "plan.jira", label: "Jira…", category: "Plan", run: () => setJiraDialogOpen(true) }]
        : []),
      ...creationCommands.map((command) => ({ ...command, enabled: !commandReadOnly })),
      { id: "file.new", label: "New diagram", category: "File", shortcut: "⌘N", run: newDocument },
      { id: "file.open", label: "Open…", category: "File", shortcut: "⌘O", run: openDocument },
      { id: "file.save", label: "Save", category: "File", shortcut: "⌘S", run: saveCurrentDocument },
      {
        id: "settings.open",
        label: "Settings…",
        category: "View",
        run: () => {
          setSettingsCategory("Editor & navigation");
          setSettingsOpen(true);
        },
      },
      ...(["light", "dark", "system"] as const).map((theme) => ({
        id: `appearance.${theme}`,
        label: `App theme: ${theme}`,
        category: "Appearance",
        run: () => update("theme", theme),
      })),
      { id: "view.issues", label: "Issues", category: "View", run: () => setProblemsOpen(true) },
      { id: "file.save-as", label: "Save as…", category: "File", run: saveCurrentDocumentAs },
      ...(project
        ? [
            {
              id: "project.connections",
              label: "Diagram connections",
              category: "Document",
              run: showDocumentNavigator,
            },
          ]
        : []),
      { id: "file.backup", label: "Back up workspace", category: "File", run: backupWorkspace },
      { id: "file.restore", label: "Restore workspace…", category: "File", run: () => void restoreWorkspace() },
      {
        id: "collaboration.open",
        label: collaboration ? "Show collaboration room" : "Start collaboration…",
        category: "Collaboration",
        run: () => setCollaborationDialogOpen(true),
      },
      {
        id: "view.diagram-outline",
        label: "Diagram outline…",
        category: "View",
        shortcut: "⇧⌘O",
        run: () => openDialog({ kind: "diagram-outline" }),
      },
      ...diagramCommands.map((command) => ({
        ...command,
        enabled: command.category === "Edit" ? !commandReadOnly : command.enabled,
      })),
      {
        id: "help.reference",
        label: "Help & keyboard shortcuts",
        category: "Help",
        shortcut: "?",
        run: () => openDialog({ kind: "help" }),
      },
      { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "⌘Z", enabled: activeHistory.canUndo, run: undo },
      { id: "edit.redo", label: "Redo", category: "Edit", shortcut: "⇧⌘Z", enabled: activeHistory.canRedo, run: redo },
      ...(workspace.diagramKind === "gantt"
        ? [{ id: "view.tasks", label: "Tasks view", category: "View", run: openTasksView }]
        : []),
      ...viewModes.map((mode) => ({
        id: `view.${mode}`,
        label: `${mode[0]!.toUpperCase()}${mode.slice(1)} view`,
        category: "View",
        shortcut: `⌘${mode === "code" ? 1 : mode === "split" ? 2 : mode === "diagram" ? 3 : 4}`,
        run: () => update("viewMode", mode),
      })),
      {
        id: "view.zoom-in",
        label: "Zoom in",
        category: "View",
        run: () => update("zoom", Math.min(MAX_DIAGRAM_ZOOM, workspace.zoom + 0.1)),
      },
      {
        id: "view.zoom-out",
        label: "Zoom out",
        category: "View",
        run: () => update("zoom", Math.max(MIN_DIAGRAM_ZOOM, workspace.zoom - 0.1)),
      },
      { id: "export.source", label: "Export source", category: "Export", run: exportSource },
      {
        id: "export.svg",
        label: "Export SVG",
        category: "Export",
        enabled: exportReady,
        run: exportSvg,
      },
      {
        id: "export.png",
        label: "Export PNG",
        category: "Export",
        enabled: exportReady,
        run: exportPng,
      },
      {
        id: "export.pdf",
        label: "Export PDF",
        category: "Export",
        enabled: exportReady,
        run: exportPdf,
      },
      {
        id: "export.copy-image",
        label: "Copy diagram image",
        category: "Export",
        enabled: exportReady,
        run: copyImage,
      },
      { id: "export.copy-markdown", label: "Copy as Markdown", category: "Export", run: copyMarkdown },
      { id: "export.copy-confluence", label: "Copy for Confluence", category: "Export", run: copyConfluence },
    ];
  }, [
    commandReadOnly,
    openFormatSource,
    canRenameCommand,
    renameCommandPosition,
    requestSymbolRename,
    viewMode,
    dependencyTaskCount,
    activateTab,
    closeTab,
    tabs.documents,
    openVersionHistory,
    openSequenceSettings,
    openUseCaseSettingsFromToolbar,
    openClassSettingsFromToolbar,
    openActivitySettingsFromToolbar,
    setJiraDialogOpen,
    setProblemsOpen,
    activeHistory,
    backupWorkspace,
    collaboration,
    copyConfluence,
    copyImage,
    copyMarkdown,
    exportReady,
    exportPdf,
    exportPng,
    exportSource,
    exportSvg,
    newDocument,
    openDocument,
    openDialog,
    openWbsSettings,
    openProjectInspector,
    openResourcePanel,
    openReports,
    project,
    redo,
    restoreWorkspace,
    result,
    tabs.activeId,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    setCollaborationDialogOpen,
    showDocumentNavigator,
    setLegendInspectorOpen,
    undo,
    update,
    viewModes,
    openTasksView,
    workspace.zoom,
    workspace.diagramKind,
  ]);

  return { commands };
}
