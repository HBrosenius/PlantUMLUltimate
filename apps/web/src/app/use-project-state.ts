import { useFolderProject } from "../projects/use-folder-project";
import { useSingleFileProject } from "../projects/use-single-file-project";
import { embeddedMemberHistoryId } from "../projects/embedded-project";
import { useRef, useCallback, useMemo, type RefObject, type Dispatch, type SetStateAction } from "react";
import type { WbsGanttProjectLink } from "../projects/wbs-gantt-project-links";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { type WbsGanttMissingItem, collectMissingWbsGanttItems } from "../projects/wbs-gantt-missing";
import { createAddMissingProjectItem } from "./add-missing-project-item";
import { type WbsGanttIssue, collectWbsGanttIssues } from "../wbs-gantt-health";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActiveCollaboration, CollaborationDocumentBridge } from "../use-collaboration-lifecycle";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { OpenedFileBytes } from "../file-service";
import type { LinkedWorkPreview } from "../projects/LinkedWorkPreviewDialog";
import type { FileSaveState } from "../FileSaveStatus";
import type { DiagramKind } from "../model";

export interface useProjectStateInputs {
  activeDocument: DocumentSnapshot;
  collaboration: ActiveCollaboration | undefined;
  documentCollaborationBridge: RefObject<CollaborationDocumentBridge | undefined>;
  parseResult: DiagramParseResult<GanttDocument>;
  projectLaunchRef: RefObject<((opened: OpenedFileBytes) => Promise<boolean>) | undefined>;
  reportFileError: (error: unknown) => void;
  resetFileSelection: () => void;
  saveDocument: () => Promise<void>;
  saveDocumentAs: () => Promise<void>;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setLinkedWorkPreview: Dispatch<SetStateAction<LinkedWorkPreview | undefined>>;
  setPendingProjectWbsSelection: Dispatch<SetStateAction<{ tabId: string; nodeId: string } | undefined>>;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  showDocumentNavigator: () => void;
  standaloneSaveState: FileSaveState | undefined;
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
  tabsRef: RefObject<{
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
  }>;
  updateLinkedSource: (
    document: { id: string; source: string },
    next: string,
    kind: DiagramKind,
    description: string,
  ) => void;
  workspace: WorkspaceSnapshot;
}

export function useProjectState({
  activeDocument,
  collaboration,
  documentCollaborationBridge,
  parseResult,
  projectLaunchRef,
  reportFileError,
  resetFileSelection,
  saveDocument,
  saveDocumentAs,
  setInteractionMessage,
  setLinkedWorkPreview,
  setPendingProjectWbsSelection,
  setSelectedTaskId,
  showDocumentNavigator,
  standaloneSaveState,
  tabs,
  tabsRef,
  updateLinkedSource,
  workspace,
}: useProjectStateInputs) {
  const {
    project: legacyProject,
    fileSaveState: legacySaveState,
    saveZipProject,
    saveFolderProject,
    openMember: openLegacyMember,
    addProjectDiagram: addLegacyProjectDiagram,
    isProjectMemberTab: isLegacyProjectMemberTab,
    updateLinks: updateLegacyLinks,
    updateElements: updateLegacyElements,
    applyRenameMappings,
  } = useFolderProject({
    tabs,
    resetSelection: resetFileSelection,
    setInteractionMessage,
    reportError: reportFileError,
  });
  const singleFileProject = useSingleFileProject({
    tabs,
    resetSelection: resetFileSelection,
    onOpened: showDocumentNavigator,
    setInteractionMessage,
    reportError: reportFileError,
  });
  // App file launches should retain the ordinary document-opening experience
  // for .puml/.plantuml files. Native project files are still claimed here.
  documentCollaborationBridge.current = {
    getDocument: () => singleFileProject.sharedDocument,
    receiveDocument: singleFileProject.receiveSharedDocument,
    activeDiagram: () => {
      const shared = singleFileProject.sharedDocument;
      const diagram = shared?.diagrams.find(
        (item) => activeDocument.historyId === embeddedMemberHistoryId(shared.id, item.id),
      );
      return diagram ? { id: diagram.id, name: diagram.name } : undefined;
    },
    containsTab: (id) => {
      const shared = singleFileProject.sharedDocument;
      const tab = tabs.documents.find((item) => item.id === id);
      return Boolean(
        shared && tab && shared.diagrams.some((item) => tab.historyId === embeddedMemberHistoryId(shared.id, item.id)),
      );
    },
  };
  projectLaunchRef.current = (opened) =>
    opened.kind === "legacy" ? Promise.resolve(false) : singleFileProject.openOpenedProject(opened);
  const usingSingleFileProject = Boolean(singleFileProject.portableProject);
  const activeInLegacyProject = !usingSingleFileProject && isLegacyProjectMemberTab(tabs.activeId);
  const activeInSingleFileProject = Boolean(
    singleFileProject.portableProject &&
    activeDocument.historyId.startsWith(`project-history-${singleFileProject.portableProject.projectId}-`),
  );
  const project = singleFileProject.project ?? legacyProject;
  const openMember = usingSingleFileProject ? singleFileProject.openMember : openLegacyMember;
  const addProjectDiagram = usingSingleFileProject ? singleFileProject.addProjectDiagram : addLegacyProjectDiagram;
  const isProjectMemberTab = usingSingleFileProject
    ? (id: string) =>
        tabs.documents.some(
          (document) =>
            document.id === id &&
            document.historyId.startsWith(`project-history-${singleFileProject.portableProject!.projectId}-`),
        )
    : isLegacyProjectMemberTab;
  const portable = singleFileProject.portableProject;
  const linkedWorkContext = useRef({ portable, collaboration });
  linkedWorkContext.current = { portable, collaboration };
  const portableWbsDiagramId =
    portable && activeDocument.historyId.startsWith(`project-history-${portable.projectId}-`)
      ? activeDocument.historyId.slice(`project-history-${portable.projectId}-`.length)
      : undefined;
  const existingProjectGantt = portable?.diagrams.find(
    (diagram) => diagram.wbsGantt?.wbsDiagramId === portableWbsDiagramId,
  );
  const projectWbsGanttLinks: WbsGanttProjectLink[] = portable
    ? portable.diagrams.flatMap((gantt) => {
        const connection = gantt.wbsGantt;
        const wbs = portable.diagrams.find((item) => item.id === connection?.wbsDiagramId);
        if (!connection || !wbs) return [];
        const wbsTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, wbs.id),
        );
        const ganttTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, gantt.id),
        );
        const nodes = new Map(
          parseWbs(wbsTab?.source ?? wbs.document.current.source)
            .nodes.filter((node) => node.alias)
            .map((node) => [node.alias!, node]),
        );
        const tasks = parseGantt(ganttTab?.source ?? gantt.document.current.source).document.symbols.tasks;
        return (ganttTab?.wbsGanttLinks ?? connection.links).flatMap((link) => {
          const node = nodes.get(link.wbsAlias);
          const task = tasks.get(link.ganttAlias.toLowerCase());

          return [
            {
              id: `${gantt.id}:${link.wbsAlias}:${link.ganttAlias}`,
              missingWbsNode: !node,
              missingGanttTask: !task,
              wbsLabel: node?.label ?? `${link.wbsAlias} (missing)`,
              ganttLabel: task?.label ?? `${link.ganttAlias} (missing)`,
              wbsDiagramName: wbs.name,
              ganttDiagramName: gantt.name,
              wbsDocumentId: wbs.id,
              ganttDocumentId: gantt.id,
              wbsNodeId: node?.id ?? link.wbsAlias,
              ganttTaskId: task?.id ?? link.ganttAlias.toLowerCase(),
            },
          ];
        });
      })
    : [];
  const projectWbsGanttMissing: WbsGanttMissingItem[] = portable
    ? portable.diagrams.flatMap((gantt) => {
        const connection = gantt.wbsGantt;
        const wbs = portable.diagrams.find((item) => item.id === connection?.wbsDiagramId);
        if (!connection || !wbs) return [];
        const wbsTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, wbs.id),
        );
        const ganttTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, gantt.id),
        );
        return collectMissingWbsGanttItems(
          { id: wbs.id, name: wbs.name, source: wbsTab?.source ?? wbs.document.current.source },
          { id: gantt.id, name: gantt.name, source: ganttTab?.source ?? gantt.document.current.source },
          ganttTab?.wbsGanttLinks ?? connection.links,
        );
      })
    : [];
  const { addMissingProjectItem } = createAddMissingProjectItem({
    linkedWorkContext,
    portable,
    setInteractionMessage,
    setLinkedWorkPreview,
    setPendingProjectWbsSelection,
    setSelectedTaskId,
    singleFileProject,
    tabsRef,
    updateLinkedSource,
  });
  const projectWbsGanttIssues: (WbsGanttIssue & { documentId: string })[] = project
    ? tabs.documents.flatMap((gantt) => {
        if (gantt.diagramKind !== "gantt" || !gantt.linkedWbsDocumentId || !isProjectMemberTab(gantt.id)) return [];
        const wbs = tabs.documents.find(
          (item) => item.id === gantt.linkedWbsDocumentId && item.diagramKind === "wbs" && isProjectMemberTab(item.id),
        );
        if (!wbs)
          return [
            {
              message: `Linked WBS diagram for ${gantt.fileName} is missing.`,
              diagram: "gantt" as const,
              kind: "document" as const,
              documentId: gantt.id,
            },
          ];
        return collectWbsGanttIssues(
          wbs.source,
          gantt.source,
          gantt.wbsGanttLinks ?? [],
          gantt.wbsGanttDependencies ?? [],
        ).map((issue) => ({ ...issue, documentId: issue.diagram === "wbs" ? wbs.id : gantt.id }));
      })
    : [];
  const updateLinks = usingSingleFileProject ? singleFileProject.updateLinks : updateLegacyLinks;
  const updateElements = usingSingleFileProject ? singleFileProject.updateElements : updateLegacyElements;
  const applyActiveProjectRenameMappings = usingSingleFileProject
    ? singleFileProject.applyRenameMappings
    : applyRenameMappings;
  const saveActiveProject = useCallback(async () => {
    if (!usingSingleFileProject) return;
    const result = await singleFileProject.saveProject();
    if (!result) await singleFileProject.saveProjectAs();
  }, [singleFileProject, usingSingleFileProject]);
  const currentFileSaveState = activeInSingleFileProject
    ? singleFileProject.fileSaveState?.documentId === singleFileProject.portableProject?.projectId
      ? singleFileProject.fileSaveState
      : undefined
    : activeInLegacyProject && legacySaveState?.documentId === project?.manifest.projectId
      ? legacySaveState
      : standaloneSaveState?.documentId === tabs.activeId
        ? standaloneSaveState
        : undefined;
  const fileSaving = currentFileSaveState?.status === "saving";
  const fileDirty = activeInSingleFileProject ? singleFileProject.dirty : Boolean(activeDocument.dirty);
  const fileCopy = activeInSingleFileProject || activeInLegacyProject ? undefined : activeDocument.fileCopy;
  const saveNeeded = fileDirty || fileCopy === "new" || currentFileSaveState?.status === "error";
  const saveCurrentDocument = useCallback(async () => {
    if (fileSaving) return;
    if (activeInSingleFileProject) await saveActiveProject();
    else if (activeInLegacyProject && project)
      await ("archiveEntries" in project ? saveZipProject() : saveFolderProject());
    else await saveDocument();
  }, [
    activeInSingleFileProject,
    activeInLegacyProject,
    fileSaving,
    project,
    saveZipProject,
    saveFolderProject,
    saveActiveProject,
    saveDocument,
  ]);
  const saveCurrentDocumentAs = useCallback(async () => {
    if (fileSaving) return;
    if (activeInSingleFileProject) await singleFileProject.saveProjectAs();
    else await saveDocumentAs();
  }, [fileSaving, activeInSingleFileProject, singleFileProject, saveDocumentAs]);
  const projectLinkedTaskIds = useMemo(() => {
    if (!project || workspace.diagramKind !== "gantt") return new Set<string>();
    const member = project.members.find((item) => item.path === workspace.fileName);
    if (!member) return new Set<string>();
    const endpoints = new Set(project.manifest.links.flatMap((link) => [link.from, link.to]));
    const symbols = new Set(
      project.manifest.elements
        .filter((element) => element.documentId === member.documentId && endpoints.has(element.id))
        .map((element) => element.locator.symbolKey),
    );
    return new Set(parseResult.document.tasks.filter((task) => symbols.has(task.label)).map((task) => task.id));
  }, [parseResult.document.tasks, project, workspace.diagramKind, workspace.fileName]);
  const linkedGanttTaskIds = useMemo(
    () =>
      new Set([
        ...projectLinkedTaskIds,
        ...(activeDocument.wbsGanttLinks ?? []).map((link) => link.ganttAlias.toLowerCase()),
      ]),
    [activeDocument.wbsGanttLinks, projectLinkedTaskIds],
  );
  const projectDiagramLinks = useMemo(() => {
    const links = new Map<string, Array<{ documentId: string; path: string; label: string; relationship: string }>>();
    if (!project || workspace.diagramKind !== "gantt") return links;
    const projectHistoryPrefix = `project-history-${project.manifest.projectId}-`;
    const memberIdFromTab = activeDocument.historyId.startsWith(projectHistoryPrefix)
      ? activeDocument.historyId.slice(projectHistoryPrefix.length)
      : undefined;
    const currentMember =
      project.members.find((member) => member.documentId === memberIdFromTab) ??
      project.members.find((member) => member.path === workspace.fileName);
    if (!currentMember) return links;
    const tasksBySymbol = new Map<string, (typeof parseResult.document.tasks)[number]>();
    for (const task of parseResult.document.tasks) {
      tasksBySymbol.set(task.label.trim().toLocaleLowerCase(), task);
      if (task.alias?.value) tasksBySymbol.set(task.alias.value.trim().toLocaleLowerCase(), task);
    }
    const elementsById = new Map(project.manifest.elements.map((element) => [element.id, element]));
    const membersById = new Map(project.members.map((member) => [member.documentId, member]));
    for (const element of project.manifest.elements) {
      if (element.documentId !== currentMember.documentId || element.kind !== "gantt-task") continue;
      const task = tasksBySymbol.get(element.locator.symbolKey.trim().toLocaleLowerCase());
      if (!task) continue;
      for (const link of project.manifest.links) {
        if (link.from !== element.id && link.to !== element.id) continue;
        const target = elementsById.get(link.from === element.id ? link.to : link.from);
        if (!target || target.documentId === currentMember.documentId) continue;
        const targetMember = membersById.get(target.documentId);
        if (!targetMember) continue;
        const relationship =
          link.from === element.id
            ? link.kind === "implements"
              ? "Implements"
              : "Represents"
            : link.kind === "implements"
              ? "Implemented by"
              : "Represented by";
        const targets = links.get(task.id) ?? [];
        targets.push({
          documentId: targetMember.documentId,
          path: targetMember.path,
          label: target.locator.symbolKey,
          relationship,
        });
        links.set(task.id, targets);
      }
    }
    return links;
  }, [activeDocument.historyId, parseResult, project, workspace.diagramKind, workspace.fileName]);

  return {
    openLegacyMember,
    singleFileProject,
    usingSingleFileProject,
    activeInLegacyProject,
    activeInSingleFileProject,
    project,
    openMember,
    addProjectDiagram,
    isProjectMemberTab,
    portable,
    portableWbsDiagramId,
    existingProjectGantt,
    projectWbsGanttLinks,
    projectWbsGanttMissing,
    addMissingProjectItem,
    projectWbsGanttIssues,
    updateLinks,
    updateElements,
    applyActiveProjectRenameMappings,
    saveActiveProject,
    currentFileSaveState,
    fileSaving,
    fileDirty,
    fileCopy,
    saveNeeded,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    linkedGanttTaskIds,
    projectDiagramLinks,
  };
}
