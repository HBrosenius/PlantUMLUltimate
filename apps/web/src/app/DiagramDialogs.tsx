import { CommandPalette } from "../CommandPalette";
import { DiagramOutlineDialog, DiagramOutlinePanel } from "../DiagramOutlineDialog";
import { SaveStarterDialog } from "../PersonalStarters";
import { OpenWorkDialog } from "../OpenWorkDialog";
import { NewDocumentDialog } from "../NewDocumentDialog";
import { starterSource } from "../use-workspace-documents";
import { setPlantUmlTheme } from "../plantuml-theme";
import { parseGantt, renameTask, applySourceEdits } from "@plantuml-studio/diagram-gantt";
import { applicationWbsAdapter } from "../diagram-adapters";
import { convertWbsToGantt } from "../wbs-gantt";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { GanttLinkedDeleteDialog } from "../features/gantt/GanttLinkedDeleteDialog";
import { deleteGanttTaskKeepingDates } from "../gantt-delete";
import { AddDependencyDialog } from "../AddDependencyDialog";
import { GanttDialogs, type GanttDialogKind } from "../features/gantt/GanttDialogs";
import { ProjectInspector } from "../ProjectInspector";
import { parseProjectSettings, type ProjectSettings } from "../project-settings";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ActivityDialogKind } from "../features/activity/ActivityDialogs";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type {
  ActivityActionInput,
  ActivityArrowInput,
  ActivityNoteInput,
  ActivityPartitionInput,
  ActivityStructureInput,
} from "../../../../packages/diagram-activity/src/operations";
import type { AddSeparatorValue } from "../AddDividerDialog";
import type { AddMilestoneValue } from "../AddMilestoneDialog";
import type { DiagramKind } from "../model";
import type { AddSequenceMessageValue } from "../AddSequenceMessageDialog";
import type { AddSequenceParticipantValue } from "../AddSequenceParticipantDialog";
import type { SequenceStructureInput } from "../../../../packages/diagram-sequence/src/index";
import type { AddTaskValue } from "../AddTaskDialog";
import type {
  UseCaseElementInput,
  UseCaseNoteInput,
  UseCasePackageInput,
  UseCaseRelationshipInput,
} from "../../../../packages/diagram-usecase/src/operations";
import type { WbsNodeInput, WbsNode, WbsRelationship, WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { WbsInsertPosition } from "../features/wbs/WbsDialogs";
import type { AppDialog } from "../use-app-dialog";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { Command } from "@plantuml-studio/editor-core";
import type { StarterExample } from "../starter-examples";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { DiagramOutlineEntry } from "../diagram-outline";
import type { openDocumentFile } from "../file-service";
import type { LinkedWorkPreview } from "../projects/LinkedWorkPreviewDialog";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { PortableProject } from "../../../../packages/document-format/src/types";
import type { VirtualProject } from "../projects/project-index";
import type { SequenceDialog } from "../features/sequence/SequenceDialogs";
import type { Dispatch, SetStateAction, ComponentProps } from "react";
import type { useSingleFileProject } from "../projects/use-single-file-project";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";
import { lazyFeature } from "../lazy-feature";

const AddWbsNodeDialog = lazyFeature<ComponentProps<typeof import("../features/wbs/WbsDialogs").AddWbsNodeDialog>>(
  () => import("../features/wbs/WbsDialogs").then((module) => ({ default: module.AddWbsNodeDialog })),
  "the WBS node form",
);

const WbsSettingsInspector = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsSettingsInspector>
>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsSettingsInspector })),
  "WBS settings",
);

const WbsNodeInspector = lazyFeature<ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsNodeInspector>>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsNodeInspector })),
  "the WBS node inspector",
);

const WbsRelinkDialog = lazyFeature<ComponentProps<typeof import("../features/wbs/WbsRelinkDialog").WbsRelinkDialog>>(
  () => import("../features/wbs/WbsRelinkDialog").then((module) => ({ default: module.WbsRelinkDialog })),
  "the relink review",
);

const WbsLinkedDeleteDialog = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsLinkedDeleteDialog").WbsLinkedDeleteDialog>
>(
  () => import("../features/wbs/WbsLinkedDeleteDialog").then((module) => ({ default: module.WbsLinkedDeleteDialog })),
  "the linked delete review",
);

const WbsRelationshipInspector = lazyFeature<
  ComponentProps<typeof import("../features/wbs/WbsInspectors").WbsRelationshipInspector>
>(
  () => import("../features/wbs/WbsInspectors").then((module) => ({ default: module.WbsRelationshipInspector })),
  "the WBS relationship inspector",
);

const ActivityDialogs = lazyFeature<
  ComponentProps<typeof import("../features/activity/ActivityDialogs").ActivityDialogs>
>(
  () => import("../features/activity/ActivityDialogs").then((module) => ({ default: module.ActivityDialogs })),
  "activity forms",
  { silent: true },
);

const SequenceDialogs = lazyFeature<
  ComponentProps<typeof import("../features/sequence/SequenceDialogs").SequenceDialogs>
>(
  () => import("../features/sequence/SequenceDialogs").then((module) => ({ default: module.SequenceDialogs })),
  "sequence forms",
  { silent: true },
);

const UseCaseDialogs = lazyFeature<ComponentProps<typeof import("../features/usecase/UseCaseDialogs").UseCaseDialogs>>(
  () => import("../features/usecase/UseCaseDialogs").then((module) => ({ default: module.UseCaseDialogs })),
  "use case forms",
  { silent: true },
);

const LinkedWorkPreviewDialog = lazyFeature<
  ComponentProps<typeof import("../projects/LinkedWorkPreviewDialog").LinkedWorkPreviewDialog>
>(
  () => import("../projects/LinkedWorkPreviewDialog").then((module) => ({ default: module.LinkedWorkPreviewDialog })),
  "the linked work preview",
);

export interface DiagramDialogsProps {
  activeDocument: DocumentSnapshot;
  activeInLegacyProject: boolean;
  activeInSingleFileProject: boolean;
  activityDialogKind: ActivityDialogKind | undefined;
  activityDocument: ActivityDocument;
  addActivityAction: (value: ActivityActionInput) => void;
  addActivityArrow: (value: ActivityArrowInput) => void;
  addActivityNote: (value: ActivityNoteInput) => void;
  addActivityPartition: (value: ActivityPartitionInput) => void;
  addActivityStructure: (value: ActivityStructureInput) => void;
  addActivityTerminal: (kind: "start" | "stop" | "end" | "detach" | "kill") => void;
  addDivider: (value: AddSeparatorValue) => void;
  addMilestone: (value: AddMilestoneValue) => void;
  addProjectDiagram: (kind: DiagramKind, name: string, initialSource?: string) => Promise<boolean>;
  addSequenceMessage: (value: AddSequenceMessageValue) => void;
  addSequenceParticipant: (value: AddSequenceParticipantValue) => void;
  addSequenceStructure: (value: SequenceStructureInput) => void;
  addTask: (value: AddTaskValue) => void;
  addUseCaseElement: (value: UseCaseElementInput) => void;
  addUseCaseNote: (value: UseCaseNoteInput) => void;
  addUseCasePackage: (value: UseCasePackageInput) => void;
  addUseCaseRelationship: (value: UseCaseRelationshipInput) => void;
  addWbsNode: (value: WbsNodeInput, position: WbsInsertPosition) => void;
  applyProjectSettings: (value: ProjectSettings) => void;
  applyWbsNode: (value: WbsNodeInput) => string | undefined;
  applyWbsRelationshipColor: (color: string) => void;
  applyWbsRelink: (nodeId: string, documentId: string, targetTaskId: string, policy: "keep" | "delete") => void;
  applyWbsSettings: (value: { title: string }) => void;
  clearSelectedWbsNode: () => void;
  clearSelectedWbsRelationship: () => void;
  closeDialog: (kind?: AppDialog["kind"]) => void;
  closeNewDocumentDialog: () => void;
  closeWbsSettings: () => void;
  closedDayFocus: number;
  collaboration: ActiveCollaboration | undefined;
  collaborationAppliesToActiveDiagram: boolean;
  commandReadOnly: boolean;
  commands: Command[];
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
  connectTasks: (
    predecessorTaskId: string,
    successorTaskId: string,
    predecessorAnchor: "start" | "end",
    successorAnchor: "start" | "end",
  ) => boolean;
  createDocument: (
    diagramKind: DiagramKind,
    example?: Pick<StarterExample, "title" | "source" | "personal">,
    name?: string,
    contentSource?: string,
  ) => void;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  diagramOutlineEntries: DiagramOutlineEntry[];
  dialog: AppDialog | undefined;
  ganttDialogKind: GanttDialogKind | undefined;
  importDocumentFile: (opened: Awaited<ReturnType<typeof openDocumentFile>>) => Promise<boolean>;
  linkedDiagramActions: (
    { label: string; disabled: boolean; run: () => void } | { label: string; run: () => void; disabled?: never }
  )[];
  linkedGantt: DocumentSnapshot | undefined;
  linkedWbs: DocumentSnapshot | undefined;
  linkedWorkPreview: LinkedWorkPreview | undefined;
  mapWbsProjectEdit: (node: WbsNode, source: string) => void;
  narrow: boolean;
  newDocumentOpen: boolean;
  openDialog: (next: AppDialog) => void;
  openDocument: () => Promise<void>;
  openLinkedGanttTask: (alias: string) => void;
  openWorkOpen: boolean;
  outlineMode: "find" | "dock" | undefined;
  outlineWide: boolean;
  parseResult: DiagramParseResult<GanttDocument>;
  pendingGanttDeleteTaskId: string | undefined;
  pendingWbsDeleteId: string | undefined;
  pendingWbsRelink: { nodeId: string; documentId: string; targetTaskId: string } | undefined;
  portable: PortableProject | undefined;
  project: VirtualProject | undefined;
  projectInspectorOpen: boolean;
  removeWbsNode: () => void;
  removeWbsRelationship: () => void;
  restorePreviousFocus: (preferred?: HTMLElement | SVGElement) => void;
  revealOutlineEntry: (entry: DiagramOutlineEntry, showSource?: boolean) => void;
  selectedTaskId: string | undefined;
  selectedWbsNode: WbsNode | undefined;
  selectedWbsNodeLink:
    | {
        link: { wbsAlias: string; ganttAlias: string } | undefined;
        targetKey: string | undefined;
        label: string | undefined;
      }
    | undefined;
  selectedWbsRelationship: WbsRelationship | undefined;
  sequenceDialog: SequenceDialog | undefined;
  sequenceMessageAnchors: string[];
  sequenceParticipantNames: string[];
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setLinkedWorkPreview: Dispatch<SetStateAction<LinkedWorkPreview | undefined>>;
  setOpenWorkOpen: Dispatch<SetStateAction<boolean>>;
  setOutlineMatches: Dispatch<SetStateAction<readonly DiagramOutlineEntry[]>>;
  setOutlineMode: Dispatch<SetStateAction<"find" | "dock" | undefined>>;
  setPendingGanttDeleteTaskId: Dispatch<SetStateAction<string | undefined>>;
  setPendingWbsDeleteId: Dispatch<SetStateAction<string | undefined>>;
  setPendingWbsRelink: Dispatch<
    SetStateAction<{ nodeId: string; documentId: string; targetTaskId: string } | undefined>
  >;
  setProjectInspectorOpen: (value: SetStateAction<boolean>) => void;
  setSelectedDependencyIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setStarterDraft: Dispatch<SetStateAction<{ kind: DiagramKind; source: string; name: string } | undefined>>;
  singleFileProject: ReturnType<typeof useSingleFileProject>;
  starterDraft: { kind: DiagramKind; source: string; name: string } | undefined;
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
  updateLinkedSource: (
    document: { id: string; source: string },
    next: string,
    kind: DiagramKind,
    description: string,
  ) => void;
  useCaseDocument: UseCaseDocument;
  usingSingleFileProject: boolean;
  wbsDependencyWarnings: Map<string, string>;
  wbsDocument: WbsDocument;
  wbsGanttTargets: { key: string; label: string }[];
  wbsSettingsOpen: boolean;
  workspace: WorkspaceSnapshot;
}

export function DiagramDialogs({
  activeDocument,
  activeInLegacyProject,
  activeInSingleFileProject,
  activityDialogKind,
  activityDocument,
  addActivityAction,
  addActivityArrow,
  addActivityNote,
  addActivityPartition,
  addActivityStructure,
  addActivityTerminal,
  addDivider,
  addMilestone,
  addProjectDiagram,
  addSequenceMessage,
  addSequenceParticipant,
  addSequenceStructure,
  addTask,
  addUseCaseElement,
  addUseCaseNote,
  addUseCasePackage,
  addUseCaseRelationship,
  addWbsNode,
  applyProjectSettings,
  applyWbsNode,
  applyWbsRelationshipColor,
  applyWbsRelink,
  applyWbsSettings,
  clearSelectedWbsNode,
  clearSelectedWbsRelationship,
  closeDialog,
  closeNewDocumentDialog,
  closeWbsSettings,
  closedDayFocus,
  collaboration,
  collaborationAppliesToActiveDiagram,
  commandReadOnly,
  commands,
  commitGeneratedSource,
  commitSource,
  connectTasks,
  createDocument,
  diagramMulti,
  diagramOutlineEntries,
  dialog,
  ganttDialogKind,
  importDocumentFile,
  linkedDiagramActions,
  linkedGantt,
  linkedWbs,
  linkedWorkPreview,
  mapWbsProjectEdit,
  narrow,
  newDocumentOpen,
  openDialog,
  openDocument,
  openLinkedGanttTask,
  openWorkOpen,
  outlineMode,
  outlineWide,
  parseResult,
  pendingGanttDeleteTaskId,
  pendingWbsDeleteId,
  pendingWbsRelink,
  portable,
  project,
  projectInspectorOpen,
  removeWbsNode,
  removeWbsRelationship,
  restorePreviousFocus,
  revealOutlineEntry,
  selectedTaskId,
  selectedWbsNode,
  selectedWbsNodeLink,
  selectedWbsRelationship,
  sequenceDialog,
  sequenceMessageAnchors,
  sequenceParticipantNames,
  setInteractionMessage,
  setLinkedWorkPreview,
  setOpenWorkOpen,
  setOutlineMatches,
  setOutlineMode,
  setPendingGanttDeleteTaskId,
  setPendingWbsDeleteId,
  setPendingWbsRelink,
  setProjectInspectorOpen,
  setSelectedDependencyIndex,
  setSelectedTaskId,
  setStarterDraft,
  singleFileProject,
  starterDraft,
  tabs,
  updateLinkedSource,
  useCaseDocument,
  usingSingleFileProject,
  wbsDependencyWarnings,
  wbsDocument,
  wbsGanttTargets,
  wbsSettingsOpen,
  workspace,
}: DiagramDialogsProps) {
  return (
    <>
      {dialog?.kind === "command-palette" && (
        <CommandPalette
          commands={[
            ...commands,
            ...(workspace.diagramKind === "gantt" || workspace.diagramKind === "wbs"
              ? linkedDiagramActions.map((action, index) => ({
                  id: `plan.${workspace.diagramKind}.linked-${index}`,
                  label: action.label,
                  category: "Plan",
                  enabled: !action.disabled,
                  run: action.run,
                }))
              : []),
          ]}
          onClose={() => closeDialog("command-palette")}
        />
      )}
      {dialog?.kind === "diagram-outline" && (
        <DiagramOutlineDialog
          entries={diagramOutlineEntries}
          onDock={
            outlineWide
              ? () => {
                  closeDialog("diagram-outline");
                  setOutlineMode("dock");
                }
              : undefined
          }
          onSelect={(entry) => {
            closeDialog("diagram-outline");
            revealOutlineEntry(entry);
          }}
          onClose={() => closeDialog("diagram-outline")}
        />
      )}
      {outlineMode &&
        ((outlineMode === "dock" ? !outlineWide : narrow) ? (
          <DiagramOutlineDialog
            title={outlineMode === "find" ? "Find in diagram" : "Diagram outline"}
            entries={diagramOutlineEntries}
            onMatches={setOutlineMatches}
            onSelect={(entry) => {
              setOutlineMode(undefined);
              revealOutlineEntry(entry, false);
            }}
            onClose={() => {
              setOutlineMode(undefined);
              restorePreviousFocus();
            }}
          />
        ) : (
          <DiagramOutlinePanel
            key={outlineMode}
            mode={outlineMode}
            title={outlineMode === "find" ? "Find in diagram" : "Diagram outline"}
            entries={diagramOutlineEntries}
            onMatches={setOutlineMatches}
            onSelect={(entry) => revealOutlineEntry(entry, false)}
            onClose={() => {
              setOutlineMode(undefined);
              restorePreviousFocus();
            }}
          />
        ))}
      {starterDraft && <SaveStarterDialog {...starterDraft} onClose={() => setStarterDraft(undefined)} />}
      {openWorkOpen && (
        <OpenWorkDialog
          onClose={() => setOpenWorkOpen(false)}
          onOpen={async (file, destination) =>
            destination === "document" ? singleFileProject.openOpenedProject(file) : importDocumentFile(file)
          }
        />
      )}
      {newDocumentOpen && (
        <NewDocumentDialog
          onOpenRecent={() => {
            closeNewDocumentDialog();
            setOpenWorkOpen(true);
          }}
          onOpen={() => {
            closeNewDocumentDialog();
            void openDocument();
          }}
          documentName={project?.manifest.name}
          onAddToDocument={
            project &&
            (activeInSingleFileProject ||
              activeInLegacyProject ||
              (usingSingleFileProject && portable?.diagrams.length === 0)) &&
            !(collaborationAppliesToActiveDiagram && collaboration?.role === "viewer")
              ? async (kind, name, initialSource, preserveStyles) => {
                  let targetName = name;
                  if (!usingSingleFileProject) {
                    const base =
                      name
                        .toLowerCase()
                        .replace(/[^a-z0-9-]+/g, "-")
                        .replace(/^-|-$/g, "") || `${kind}-diagram`;
                    targetName = `${base}.puml`;
                    let suffix = 2;
                    while (
                      project.manifest.documents.some(
                        (member) => member.path.toLowerCase() === targetName.toLowerCase(),
                      )
                    )
                      targetName = `${base}-${suffix++}.puml`;
                  }
                  const source = initialSource ?? starterSource(kind);
                  return addProjectDiagram(
                    kind,
                    targetName,
                    workspace.defaultDiagramTheme && !preserveStyles
                      ? setPlantUmlTheme(source, workspace.defaultDiagramTheme)
                      : source,
                  );
                }
              : undefined
          }
          onChoose={(kind, name, source) => createDocument(kind, undefined, name, source)}
          onChooseExample={(example, name) => createDocument(example.kind, example, name)}
          onClose={closeNewDocumentDialog}
        />
      )}
      {dialog?.kind === "add-wbs-node" && (
        <AddWbsNodeDialog
          selected={selectedWbsNode}
          hasRoot={wbsDocument.roots.length > 0}
          onAdd={addWbsNode}
          onClose={() => closeDialog("add-wbs-node")}
        />
      )}
      {wbsSettingsOpen && (
        <WbsSettingsInspector source={workspace.source} onApply={applyWbsSettings} onClose={closeWbsSettings} />
      )}
      {selectedWbsNode && !diagramMulti.multiple && (
        <WbsNodeInspector
          key={selectedWbsNode.id}
          node={selectedWbsNode}
          linkedTask={selectedWbsNodeLink?.link}
          linkedTaskTargetKey={selectedWbsNodeLink?.targetKey}
          linkedTaskLabel={selectedWbsNodeLink?.label}
          ganttTargets={wbsGanttTargets}
          onLinkGanttTask={(key) => {
            const split = key.indexOf(":");
            const document = tabs.documents.find((item) => item.id === key.slice(0, split));
            const task =
              document && parseGantt(document.source).document.tasks.find((item) => item.id === key.slice(split + 1));
            if (!document || !task) return;
            const oldLink = document.wbsGanttLinks?.find((link) => link.wbsAlias === selectedWbsNode.alias);
            if (oldLink?.ganttAlias.toLowerCase() === task.id) return;
            if (oldLink)
              setPendingWbsRelink({ nodeId: selectedWbsNode.id, documentId: document.id, targetTaskId: task.id });
            else applyWbsRelink(selectedWbsNode.id, document.id, task.id, "keep");
          }}
          onOpenLinkedTask={() => selectedWbsNode.alias && openLinkedGanttTask(selectedWbsNode.alias)}
          onApply={(value) => {
            const updated = applyWbsNode(value);
            if (!updated) return;
            mapWbsProjectEdit(selectedWbsNode, updated);
            if (!linkedGantt || !selectedWbsNode.alias || value.label === selectedWbsNode.label) return;
            const link = linkedGantt.wbsGanttLinks?.find((item) => item.wbsAlias === selectedWbsNode.alias);
            const parsed = parseGantt(linkedGantt.source).document;
            const task = link && parsed.symbols.tasks.get(link.ganttAlias.toLowerCase());
            if (!task) return;
            const label = value.label.replaceAll("]", ")").replaceAll("\n", " ").trim();
            const result = renameTask(linkedGantt.source, parsed, task, label);
            if (!result.unavailableReason && result.edits.length)
              updateLinkedSource(
                linkedGantt,
                applySourceEdits(linkedGantt.source, result.edits),
                "gantt",
                "Rename task from linked WBS",
              );
          }}
          onDelete={() => {
            const affected = wbsDocument.nodes.filter(
              (node) =>
                node.sourceRange.from >= selectedWbsNode.sourceRange.from &&
                node.sourceRange.to <= selectedWbsNode.subtreeRange.to,
            );
            if (linkedGantt?.wbsGanttLinks?.some((link) => affected.some((node) => node.alias === link.wbsAlias)))
              setPendingWbsDeleteId(selectedWbsNode.id);
            else removeWbsNode();
          }}
          onAddChild={() => openDialog({ kind: "add-wbs-node" })}
          onClose={clearSelectedWbsNode}
        />
      )}
      {pendingWbsRelink &&
        (() => {
          const node = wbsDocument.nodes.find((item) => item.id === pendingWbsRelink.nodeId);
          const document = tabs.documents.find((item) => item.id === pendingWbsRelink.documentId);
          const parsed = document ? parseGantt(document.source).document : undefined;
          const oldLink = document?.wbsGanttLinks?.find((link) => link.wbsAlias === node?.alias);
          const oldTask = oldLink && parsed?.symbols.tasks.get(oldLink.ganttAlias.toLowerCase());
          const newTask = parsed?.symbols.tasks.get(pendingWbsRelink.targetTaskId);
          if (!node || !document || !oldLink || !newTask) return null;
          return (
            <WbsRelinkDialog
              nodeLabel={node.label}
              oldTaskLabel={oldTask?.label ?? oldLink.ganttAlias}
              newTaskLabel={newTask.label}
              onClose={() => setPendingWbsRelink(undefined)}
              onChoose={(policy) => {
                applyWbsRelink(node.id, document.id, newTask.id, policy);
                setPendingWbsRelink(undefined);
              }}
            />
          );
        })()}
      {pendingWbsDeleteId &&
        (() => {
          const node = wbsDocument.nodes.find((item) => item.id === pendingWbsDeleteId);
          if (!node || !linkedGantt) return null;
          const subtree = wbsDocument.nodes.filter(
            (item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.to <= node.subtreeRange.to,
          );
          const affected =
            linkedGantt.wbsGanttLinks?.filter((link) => subtree.some((item) => item.alias === link.wbsAlias)) ?? [];
          return (
            <WbsLinkedDeleteDialog
              label={node.label}
              nodeCount={subtree.length}
              taskCount={affected.length}
              onClose={() => setPendingWbsDeleteId(undefined)}
              onChoose={(policy) => {
                const deletion = applicationWbsAdapter.applyVisualOperation(
                  { kind: "delete-node", nodeId: node.id },
                  wbsDocument,
                  workspace.source,
                );
                if (deletion.unavailableReason) {
                  setInteractionMessage(deletion.unavailableReason);
                  return;
                }
                const nextWbs = applySourceEdits(workspace.source, deletion.edits);
                const converted = convertWbsToGantt(
                  nextWbs,
                  linkedGantt.source,
                  linkedGantt.wbsGanttLinks,
                  linkedGantt.wbsGanttDependencies,
                  policy,
                  false,
                );
                if (!commitSource(converted.wbsSource, `Delete WBS subtree ${node.label}`)) return;
                updateLinkedSource(linkedGantt, converted.ganttSource, "gantt", `Delete linked work ${node.label}`);
                tabs.updateDocumentFormat(linkedGantt.id, {
                  wbsGanttLinks: converted.links,
                  wbsGanttDependencies: converted.dependencies,
                });
                clearSelectedWbsNode();
                clearSelectedWbsRelationship();
                setPendingWbsDeleteId(undefined);
                setInteractionMessage(
                  policy === "keep"
                    ? `Deleted WBS subtree; kept ${affected.length} unlinked Gantt tasks`
                    : `Deleted WBS subtree and ${affected.length} linked Gantt tasks`,
                );
              }}
            />
          );
        })()}
      {pendingGanttDeleteTaskId &&
        (() => {
          const task = parseResult.document.symbols.tasks.get(pendingGanttDeleteTaskId);
          const link = activeDocument.wbsGanttLinks?.find(
            (item) => item.ganttAlias.toLowerCase() === pendingGanttDeleteTaskId,
          );
          const wbs = linkedWbs && parseWbs(linkedWbs.source);
          const node = wbs?.nodes.find((item) => item.alias === link?.wbsAlias);
          if (!task || !link || !linkedWbs || !wbs || !node) return null;
          const subtree = wbs.nodes.filter(
            (item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.to <= node.subtreeRange.to,
          );
          const affected =
            activeDocument.wbsGanttLinks?.filter((item) =>
              subtree.some((descendant) => descendant.alias === item.wbsAlias),
            ) ?? [];
          return (
            <GanttLinkedDeleteDialog
              taskLabel={task.label}
              nodeCount={subtree.length}
              taskCount={affected.length}
              onClose={() => setPendingGanttDeleteTaskId(undefined)}
              onChoose={(policy) => {
                if (policy === "keep") {
                  const operation = deleteGanttTaskKeepingDates(workspace.source, parseResult.document, task);
                  if (operation.unavailableReason) return setInteractionMessage(operation.unavailableReason);
                  const nextLinks = (activeDocument.wbsGanttLinks ?? []).filter((item) => item !== link);
                  const converted = convertWbsToGantt(
                    linkedWbs.source,
                    applySourceEdits(workspace.source, operation.edits),
                    nextLinks,
                    activeDocument.wbsGanttDependencies,
                    "keep-scheduled",
                    false,
                  );
                  if (!commitGeneratedSource(converted.ganttSource, `Delete ${task.label}`)) return;
                  tabs.updateDocumentFormat(tabs.activeId, {
                    wbsGanttLinks: converted.links,
                    wbsGanttDependencies: converted.dependencies,
                  });
                  setInteractionMessage(`Deleted ${task.label}; kept its WBS node unlinked`);
                } else {
                  const deletion = applicationWbsAdapter.applyVisualOperation(
                    { kind: "delete-node", nodeId: node.id },
                    wbs,
                    linkedWbs.source,
                  );
                  if (deletion.unavailableReason) return setInteractionMessage(deletion.unavailableReason);
                  const converted = convertWbsToGantt(
                    applySourceEdits(linkedWbs.source, deletion.edits),
                    workspace.source,
                    activeDocument.wbsGanttLinks,
                    activeDocument.wbsGanttDependencies,
                    "delete",
                    false,
                  );
                  if (!commitGeneratedSource(converted.ganttSource, `Delete linked work ${task.label}`)) return;
                  updateLinkedSource(linkedWbs, converted.wbsSource, "wbs", `Delete linked work ${task.label}`);
                  tabs.updateDocumentFormat(tabs.activeId, {
                    wbsGanttLinks: converted.links,
                    wbsGanttDependencies: converted.dependencies,
                  });
                  setInteractionMessage(`Deleted WBS subtree and ${affected.length} linked Gantt tasks`);
                }
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setPendingGanttDeleteTaskId(undefined);
              }}
            />
          );
        })()}
      {selectedWbsRelationship && !diagramMulti.multiple && (
        <WbsRelationshipInspector
          key={`${selectedWbsRelationship.id}:${selectedWbsRelationship.sourceRange.to}`}
          relationship={selectedWbsRelationship}
          document={wbsDocument}
          dependencyStatus={
            linkedGantt
              ? (wbsDependencyWarnings.get(selectedWbsRelationship.id) ?? "Linked to a Gantt dependency.")
              : undefined
          }
          onApply={applyWbsRelationshipColor}
          onDelete={removeWbsRelationship}
          onClose={clearSelectedWbsRelationship}
        />
      )}
      {workspace.diagramKind === "activity" && (
        <ActivityDialogs
          active={activityDialogKind}
          document={activityDocument}
          onAddAction={addActivityAction}
          onAddPartition={addActivityPartition}
          onAddNote={addActivityNote}
          onAddStructure={addActivityStructure}
          onAddTerminal={addActivityTerminal}
          onAddArrow={addActivityArrow}
          onClose={() => closeDialog(dialog?.kind)}
        />
      )}
      {workspace.diagramKind === "sequence" && (
        <SequenceDialogs
          active={sequenceDialog}
          participants={sequenceParticipantNames}
          anchors={sequenceMessageAnchors}
          onAddParticipant={addSequenceParticipant}
          onAddMessage={addSequenceMessage}
          onAddStructure={addSequenceStructure}
          onClose={() => closeDialog(dialog?.kind)}
        />
      )}
      {workspace.diagramKind === "usecase" && (
        <UseCaseDialogs
          active={
            dialog?.kind === "add-usecase-element"
              ? { kind: "element", elementKind: dialog.elementKind }
              : dialog?.kind === "add-usecase-relationship"
                ? { kind: "relationship" }
                : dialog?.kind === "add-usecase-package"
                  ? { kind: "package" }
                  : dialog?.kind === "add-usecase-note"
                    ? { kind: "note" }
                    : undefined
          }
          elements={useCaseDocument.elements}
          onAddElement={addUseCaseElement}
          onAddRelationship={addUseCaseRelationship}
          onAddPackage={addUseCasePackage}
          onAddNote={addUseCaseNote}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "add-dependency" && workspace.diagramKind === "gantt" && (
        <AddDependencyDialog
          key={tabs.activeId}
          tasks={parseResult.document.tasks}
          selectedTaskId={selectedTaskId}
          readOnly={commandReadOnly}
          onClose={() => closeDialog("add-dependency")}
          onAdd={(predecessor, successor, from, to) => {
            if (commandReadOnly) return false;
            return connectTasks(predecessor, successor, from, to);
          }}
        />
      )}
      <GanttDialogs
        active={ganttDialogKind}
        tasks={parseResult.document.tasks}
        defaultStartDate={
          parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
        }
        onAddTask={addTask}
        onAddDivider={addDivider}
        onAddMilestone={addMilestone}
        onClose={() => ganttDialogKind && closeDialog(`add-${ganttDialogKind}`)}
      />
      {projectInspectorOpen && (
        <ProjectInspector
          focusClosedDay={closedDayFocus}
          settings={parseProjectSettings(workspace.source)}
          onApply={applyProjectSettings}
          onClose={() => setProjectInspectorOpen(false)}
        />
      )}
      {linkedWorkPreview && (
        <LinkedWorkPreviewDialog
          preview={linkedWorkPreview}
          current={
            linkedWorkPreview.diagrams.every(
              (diagram) => tabs.documents.find((tab) => tab.id === diagram.id)?.source === diagram.before,
            ) &&
            Boolean(portable) &&
            !(collaboration?.sharedDocumentId === portable?.projectId && collaboration?.role === "viewer")
          }
          onClose={() => setLinkedWorkPreview(undefined)}
        />
      )}
    </>
  );
}
