import type { WbsGanttMissingItem } from "../projects/wbs-gantt-missing";
import { convertWbsToGantt, addMissingGanttTasksToWbs } from "../wbs-gantt";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { PortableProject } from "../../../../packages/document-format/src/types";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { LinkedWorkPreview } from "../projects/LinkedWorkPreviewDialog";
import type { useSingleFileProject } from "../projects/use-single-file-project";
import type { DocumentSnapshot, WorkspaceSession } from "../workspace-storage";
import type { DiagramKind } from "../model";

export interface createAddMissingProjectItemInputs {
  linkedWorkContext: RefObject<{
    portable: PortableProject | undefined;
    collaboration: ActiveCollaboration | undefined;
  }>;
  portable: PortableProject | undefined;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setLinkedWorkPreview: Dispatch<SetStateAction<LinkedWorkPreview | undefined>>;
  setPendingProjectWbsSelection: Dispatch<SetStateAction<{ tabId: string; nodeId: string } | undefined>>;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
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
}

export function createAddMissingProjectItem({
  linkedWorkContext,
  portable,
  setInteractionMessage,
  setLinkedWorkPreview,
  setPendingProjectWbsSelection,
  setSelectedTaskId,
  singleFileProject,
  tabsRef,
  updateLinkedSource,
}: createAddMissingProjectItemInputs) {
  const addMissingProjectItem = async (item: WbsGanttMissingItem) => {
    if (!portable) return;
    const wbsId = item.kind === "wbs" ? item.documentId : item.counterpartDocumentId;
    const ganttId = item.kind === "gantt" ? item.documentId : item.counterpartDocumentId;
    const wbs = portable.diagrams.find((diagram) => diagram.id === wbsId);
    const gantt = portable.diagrams.find((diagram) => diagram.id === ganttId);
    if (!wbs || !gantt?.wbsGantt) return;
    const connection = gantt.wbsGantt;
    const ganttTabId = await singleFileProject.openMember(ganttId);
    const wbsTabId = await singleFileProject.openMember(wbsId);
    if (!ganttTabId || !wbsTabId) return;
    const wbsTab = tabsRef.current.documents.find((tab) => tab.id === wbsTabId);
    const ganttTab = tabsRef.current.documents.find((tab) => tab.id === ganttTabId);
    const wbsSource = wbsTab?.source ?? wbs.document.current.source;
    const ganttSource = ganttTab?.source ?? gantt.document.current.source;
    const links = ganttTab?.wbsGanttLinks ?? connection.links;
    const dependencies = ganttTab?.wbsGanttDependencies ?? connection.dependencies;
    try {
      const result =
        item.kind === "wbs"
          ? convertWbsToGantt(wbsSource, ganttSource, links, dependencies, "keep-scheduled", true, [item.key])
          : addMissingGanttTasksToWbs(wbsSource, ganttSource, links, dependencies, [item.key]);
      const metadata = JSON.stringify({ links, dependencies });
      setLinkedWorkPreview({
        label: item.label,
        diagrams: [
          { id: wbsTabId, name: wbs.name, before: wbsSource, after: result.wbsSource },
          { id: ganttTabId, name: gantt.name, before: ganttSource, after: result.ganttSource },
        ],
        warnings: result.warnings,
        apply: () => {
          const context = linkedWorkContext.current;
          const currentWbs = tabsRef.current.documents.find((tab) => tab.id === wbsTabId);
          const currentGantt = tabsRef.current.documents.find((tab) => tab.id === ganttTabId);
          if (
            context.portable?.projectId !== portable.projectId ||
            !context.portable.diagrams.some((diagram) => diagram.id === wbsId) ||
            context.portable.diagrams.find((diagram) => diagram.id === ganttId)?.wbsGantt?.wbsDiagramId !== wbsId ||
            (context.collaboration?.sharedDocumentId === portable.projectId &&
              context.collaboration.role === "viewer") ||
            currentWbs?.source !== wbsSource ||
            currentGantt?.source !== ganttSource ||
            JSON.stringify({
              links: currentGantt?.wbsGanttLinks ?? connection.links,
              dependencies: currentGantt?.wbsGanttDependencies ?? connection.dependencies,
            }) !== metadata
          ) {
            setInteractionMessage("The connected document changed. Cancel and create a fresh preview.");
            return false;
          }
          updateLinkedSource({ id: wbsTabId, source: wbsSource }, result.wbsSource, "wbs", "Add missing linked work");
          updateLinkedSource(
            { id: ganttTabId, source: ganttSource },
            result.ganttSource,
            "gantt",
            "Add missing linked work",
          );
          tabsRef.current.updateDocumentFormat(ganttTabId, {
            wbsGanttLinks: result.links,
            wbsGanttDependencies: result.dependencies,
          });
          setInteractionMessage(
            `Added ${item.label} to ${item.kind === "wbs" ? gantt.name : wbs.name}${result.warnings.length ? `. ${result.warnings.join(" ")}` : ""}`,
          );
          if (item.kind === "wbs") {
            const alias = parseWbs(result.wbsSource).nodes.find((node) => node.id === item.key)?.alias;
            const taskAlias = result.links.find((link) => link.wbsAlias === alias)?.ganttAlias;
            tabsRef.current.activateDocument(ganttTabId);
            if (taskAlias) window.setTimeout(() => setSelectedTaskId(taskAlias.toLowerCase()), 100);
          } else {
            const alias = result.links.find((link) => link.ganttAlias.toLowerCase() === item.key)?.wbsAlias;
            const node = parseWbs(result.wbsSource).nodes.find((candidate) => candidate.alias === alias);
            tabsRef.current.activateDocument(wbsTabId);
            if (node) setPendingProjectWbsSelection({ tabId: wbsTabId, nodeId: node.id });
          }
          return true;
        },
      });
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not add linked work");
    }
  };

  return { addMissingProjectItem };
}
