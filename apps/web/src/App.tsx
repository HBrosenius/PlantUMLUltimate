import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { DiagramPreview } from "./DiagramPreview";
import { SequenceDiagramPreview } from "./SequenceDiagramPreview";
import { UseCaseDiagramPreview } from "./UseCaseDiagramPreview";
import { ClassDiagramPreview } from "./ClassDiagramPreview";
import { ActivityDiagramPreview } from "./ActivityDiagramPreview";
import { WbsDiagramPreview } from "./WbsDiagramPreview";
import {
  AddWbsNodeDialog,
  WbsNodeInspector,
  WbsRelationshipInspector,
  WbsSettingsInspector,
  type WbsInsertPosition,
} from "./WbsEditors";
import { ActivitySettingsInspector } from "./ActivitySettingsInspector";
import { parseActivitySettings, updateActivitySettings, type ActivitySettings } from "./activity-settings";
import {
  ActivityActionInspector,
  ActivityArrowInspector,
  ActivityControlInspector,
  ActivityTerminalInspector,
  AddActivityStructureDialog,
  AddActivityTerminalDialog,
  AddActivityArrowDialog,
  ActivityNoteInspector,
  ActivityPartitionInspector,
  AddActivityActionDialog,
  AddActivityNoteDialog,
  AddActivityPartitionDialog,
} from "./ActivityEditors";
import {
  AddClassEntityDialog,
  AddClassPackageDialog,
  AddClassRelationshipDialog,
  AddClassNoteDialog,
  ClassEntityInspector,
  ClassPackageInspector,
  ClassRelationshipInspector,
  ClassNoteInspector,
} from "./ClassEditors";
import { ClassSettingsInspector } from "./ClassSettingsInspector";
import { parseClassSettings, updateClassSettings, type ClassSettings } from "./class-settings";
import { AddTaskDialog, type AddTaskValue } from "./AddTaskDialog";
import { AddDividerDialog, type AddSeparatorValue } from "./AddDividerDialog";
import { AddMilestoneDialog, type AddMilestoneValue } from "./AddMilestoneDialog";
import { CommandPalette } from "./CommandPalette";
import { TaskInspector, type TaskInspectorValue } from "./TaskInspector";
import { MilestoneInspector, type MilestoneInspectorValue } from "./MilestoneInspector";
import { DependencyInspector, type DependencyInspectorValue } from "./DependencyInspector";
import { DividerInspector } from "./DividerInspector";
import { LegendInspector } from "./LegendInspector";
import { VerticalSeparatorInspector, type VerticalSeparatorValue } from "./VerticalSeparatorInspector";
import { parseLegendEntries, removeLegend, synchronizeLegend, usedLegendColors } from "./legend";
import { ProjectInspector } from "./ProjectInspector";
import { SchedulePreviewDialog, type SchedulePreview } from "./SchedulePreviewDialog";
import { buildResourceOverAllocations, ResourceWorkloadPanel } from "./ResourceWorkloadPanel";
import { HelpDialog } from "./HelpDialog";
import { ProblemsPanel } from "./ProblemsPanel";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { HighlightDateDialog } from "./HighlightDateDialog";
import { DateActionMenu } from "./DateActionMenu";
import { FileMenu } from "./FileMenu";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { AddMenu } from "./AddMenu";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { AddSequenceParticipantDialog, type AddSequenceParticipantValue } from "./AddSequenceParticipantDialog";
import { AddSequenceMessageDialog, type AddSequenceMessageValue } from "./AddSequenceMessageDialog";
import { SequenceParticipantInspector, type SequenceParticipantInspectorValue } from "./SequenceParticipantInspector";
import { SequenceMessageInspector, type SequenceMessageInspectorValue } from "./SequenceMessageInspector";
import { AddSequenceStructureDialog, type SequenceStructureKind } from "./AddSequenceStructureDialog";
import { SequenceStructureInspector } from "./SequenceStructureInspector";
import { SequenceSettingsInspector } from "./SequenceSettingsInspector";
import { parseSequenceSettings, updateSequenceSettings, type SequenceSettings } from "./sequence-settings";
import { UseCaseSettingsInspector } from "./UseCaseSettingsInspector";
import { parseUseCaseSettings, updateUseCaseSettings, type UseCaseSettings } from "./usecase-settings";
import { detectDiagramKind } from "./diagram-kind";
import { resolveTaskDates } from "./gantt-schedule";
import { optionShortcut } from "./platform-shortcuts";
import { parseGanttCalendar } from "./gantt-calendar";
import { parseProjectSettings, updateProjectSettings } from "./project-settings";
import type { DiagramKind, Theme, ViewMode } from "./model";
import { useRenderer } from "./render/use-renderer";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import {
  createDocumentVersion,
  deleteDocumentVersion,
  documentDisplayNames,
  importDocumentVersions,
  loadDocumentVersions,
  updateDocumentVersion,
  type DocumentVersion,
  type DocumentVersionReason,
} from "./workspace-storage";
import {
  applySourceEdits,
  deleteTask,
  deleteDivider,
  deleteVerticalSeparator,
  findTaskAt,
  ganttAdapter,
  insertDivider,
  insertVerticalSeparator,
  insertMilestone,
  insertTask,
  moveDependentTasksByDays,
  moveDivider,
  moveVerticalSeparatorByDays,
  normalizeTaskId,
  parseGantt,
  renameResource,
  renameTask,
  setNote,
  setTaskDeclaration,
  setTaskPauses,
  setTaskLinks,
  setTaskResources,
  updateDependency,
  updateDivider,
  updateVerticalSeparator,
} from "@plantuml-studio/diagram-gantt";
import { RenameSymbolDialog } from "./RenameSymbolDialog";
import { SymbolReferencesPanel } from "./SymbolReferencesPanel";
import type { Command } from "@plantuml-studio/editor-core";
import {
  downloadSvgAsPng,
  downloadText,
  openPlantUmlDocument,
  openWorkspaceBackupFile,
  savePlantUmlDocumentAs,
  svgFileName,
  writePlantUmlDocument,
  type WritableFileHandle,
} from "./file-service";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  DEFAULT_SOURCE,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_WBS_SOURCE,
} from "./model";
import {
  deleteWbsNode,
  deleteWbsRelationship,
  findWbsNodeAt,
  insertWbsNode,
  insertWbsRelationship,
  moveWbsSubtree,
  parseWbs,
  reconnectWbsRelationship,
  updateWbsNode,
  updateWbsRelationshipColor,
  type WbsNodeInput,
} from "@plantuml-studio/diagram-wbs";
import {
  deleteSequenceMessage,
  deleteSequenceParticipant,
  deleteSequenceStructure,
  findSequenceObjectAt,
  insertSequenceMessage,
  insertSequenceParticipant,
  insertSequenceParticipantBox,
  insertSequenceStructure,
  parseSequence,
  reconnectSequenceStructure,
  reorderSequenceStatement,
  updateSequenceMessage,
  updateSequenceParticipant,
  updateSequenceStructure,
} from "@plantuml-studio/diagram-sequence";
import { findUseCaseObjectAt, parseUseCase } from "@plantuml-studio/diagram-usecase";
import {
  deleteClassEntity,
  deleteClassPackage,
  deleteClassRelationship,
  deleteClassNote,
  deleteClassMember,
  findClassObjectAt,
  insertClassEntity,
  insertClassPackage,
  insertClassRelationship,
  insertClassNote,
  insertClassMember,
  moveClassEntityToPackage,
  moveClassPackageToPackage,
  parseClassDiagram,
  reorderClassEntity,
  reorderClassMember,
  updateClassEntity,
  updateClassPackage,
  updateClassRelationship,
  updateClassNote,
  updateClassMember,
  type ClassMember,
  type ClassMemberInput,
  type ClassEntityInput,
  type ClassPackageInput,
  type ClassRelationshipInput,
  type ClassNoteInput,
} from "@plantuml-studio/diagram-class";
import {
  deleteActivityArrow,
  deleteActivityControlBlock,
  deleteActivityNode,
  deleteActivityNote,
  deleteActivityPartition,
  findActivityObjectAt,
  insertActivityAction,
  insertActivityArrow,
  insertActivityNote,
  insertActivityPartition,
  insertActivityStructure,
  insertActivityTerminal,
  parseActivity,
  moveActivityActionToPartition,
  moveActivityPartition,
  reorderActivityAction,
  reorderActivityControlBlock,
  updateActivityAction,
  updateActivityArrow,
  updateActivityControl,
  updateActivityNoteWithTarget,
  updateActivityPartition,
  type ActivityActionInput,
  type ActivityArrowInput,
  type ActivityControlInput,
  type ActivityNoteInput,
  type ActivityPartitionInput,
  type ActivityStructureInput,
} from "@plantuml-studio/diagram-activity";
import {
  deleteUseCaseElement,
  deleteUseCaseNote,
  deleteUseCasePackage,
  deleteUseCaseRelationship,
  insertUseCaseElement,
  insertUseCaseNote,
  insertUseCasePackage,
  insertUseCaseRelationship,
  moveUseCaseElementToPackage,
  reorderUseCaseElement,
  updateUseCaseElement,
  updateUseCaseNote,
  updateUseCasePackage,
  updateUseCaseRelationship,
  type UseCaseElementInput,
  type UseCaseElementKind,
  type UseCaseNoteInput,
  type UseCasePackageInput,
  type UseCaseRelationshipInput,
} from "@plantuml-studio/diagram-usecase";
import { AddUseCaseElementDialog } from "./AddUseCaseElementDialog";
import { UseCaseElementInspector } from "./UseCaseElementInspector";
import { AddUseCaseRelationshipDialog } from "./AddUseCaseRelationshipDialog";
import { UseCaseRelationshipInspector } from "./UseCaseRelationshipInspector";
import { AddUseCasePackageDialog } from "./AddUseCasePackageDialog";
import { UseCasePackageInspector } from "./UseCasePackageInspector";
import { AddUseCaseNoteDialog } from "./AddUseCaseNoteDialog";
import { UseCaseNoteInspector } from "./UseCaseNoteInspector";
import { validateGeneratedSource } from "./generated-source-validation";
import { UnsupportedSyntaxPanel } from "./UnsupportedSyntaxPanel";
import { useDocumentHistory } from "./use-document-history";
import { useResourceCapacities } from "./use-resource-capacities";
import { parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";
import {
  createSemanticSymbolProvider,
  type SemanticRenameRequest,
  type SemanticSymbolOccurrence,
} from "./semantic-symbol-provider";

type InspectorFocusSnapshot = {
  inspectorLabel: string;
  controlIndex: number;
  selectionStart?: number;
  selectionEnd?: number;
};

function captureInspectorFocus(): InspectorFocusSnapshot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return undefined;
  const inspector = active.closest<HTMLElement>(".task-inspector");
  const inspectorLabel = inspector?.getAttribute("aria-label");
  if (!inspector || !inspectorLabel) return undefined;
  const controls = [...inspector.querySelectorAll<HTMLElement>("input, select, textarea, button")];
  const controlIndex = controls.indexOf(active);
  if (controlIndex < 0) return undefined;
  const selectionControl =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : undefined;
  const snapshot: InspectorFocusSnapshot = {
    inspectorLabel,
    controlIndex,
  };
  if (selectionControl?.selectionStart !== null && selectionControl?.selectionStart !== undefined)
    snapshot.selectionStart = selectionControl.selectionStart;
  if (selectionControl?.selectionEnd !== null && selectionControl?.selectionEnd !== undefined)
    snapshot.selectionEnd = selectionControl.selectionEnd;
  return snapshot;
}

function diagramFocusSelector(target: Element): string | undefined {
  for (const attribute of [
    "data-task-id",
    "data-sequence-participant-id",
    "data-usecase-object-id",
    "data-class-object-id",
    "data-activity-object-id",
    "data-wbs-node-id",
  ]) {
    const owner = target.closest(`[${attribute}]`);
    const value = owner?.getAttribute(attribute);
    if (value)
      return `[${attribute}="${CSS.escape(value)}"][tabindex], [${attribute}="${CSS.escape(value)}"] [tabindex]`;
  }
  return undefined;
}

export function App() {
  const [workspace, setWorkspace, hydrated, tabs] = usePersistedWorkspace();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [sourceHighlightedTaskId, setSourceHighlightedTaskId] = useState<string>();
  const [sourceHighlightedSequenceParticipantId, setSourceHighlightedSequenceParticipantId] = useState<string>();
  const [sourceHighlightedUseCaseId, setSourceHighlightedUseCaseId] = useState<string>();
  const [sourceHighlightedClassEntityId, setSourceHighlightedClassEntityId] = useState<string>();
  const [sourceHighlightedClassMemberId, setSourceHighlightedClassMemberId] = useState<string>();
  const [sourceHighlightedActivityId, setSourceHighlightedActivityId] = useState<string>();
  const [sourceHighlightedWbsNodeId, setSourceHighlightedWbsNodeId] = useState<string>();
  const [sourceSymbol, setSourceSymbol] = useState<Pick<SemanticSymbolOccurrence, "kind" | "key">>();
  const [sourceSymbolPosition, setSourceSymbolPosition] = useState<number>();
  const [renameSymbol, setRenameSymbol] = useState<SemanticRenameRequest>();
  const [symbolMenu, setSymbolMenu] = useState<{
    position?: number;
    occurrence?: SemanticSymbolOccurrence;
    x: number;
    y: number;
  }>();
  const [classMemberMenu, setClassMemberMenu] = useState<{
    entityId: string;
    memberId: string;
    x: number;
    y: number;
  }>();
  const [referenceSymbol, setReferenceSymbol] = useState<{
    kind: SemanticSymbolOccurrence["kind"];
    key: string;
    label: string;
  }>();
  const [focusNoteTaskId, setFocusNoteTaskId] = useState<string>();
  const [selectionRequest, setSelectionRequest] = useState<{ from: number; to: number }>();
  const [interactionMessage, setInteractionMessage] = useState<string>();
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [problemPreview, setProblemPreview] = useState<{
    source: string;
    diagnostics: ReturnType<typeof diagnosticsForDiagram>;
    message: string;
  }>();
  const [selectedDependencyIndex, setSelectedDependencyIndex] = useState<number>();
  const [selectedDividerIndex, setSelectedDividerIndex] = useState<number>();
  const [selectedVerticalSeparatorIndex, setSelectedVerticalSeparatorIndex] = useState<number>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addDividerOpen, setAddDividerOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [replaceActiveDocumentOnCreate, setReplaceActiveDocumentOnCreate] = useState(false);
  const [addSequenceParticipantOpen, setAddSequenceParticipantOpen] = useState(false);
  const [addSequenceMessageOpen, setAddSequenceMessageOpen] = useState(false);
  const [addSequenceStructureKind, setAddSequenceStructureKind] = useState<SequenceStructureKind>();
  const [selectedSequenceParticipantId, setSelectedSequenceParticipantId] = useState<string>();
  const [selectedSequenceMessageId, setSelectedSequenceMessageId] = useState<string>();
  const [selectedSequenceStructureId, setSelectedSequenceStructureId] = useState<string>();
  const [selectedUseCaseObjectId, setSelectedUseCaseObjectId] = useState<string>();
  const [selectedClassObjectId, setSelectedClassObjectId] = useState<string>();
  const [selectedActivityObjectId, setSelectedActivityObjectId] = useState<string>();
  const [selectedWbsNodeId, setSelectedWbsNodeId] = useState<string>();
  const [selectedWbsRelationshipId, setSelectedWbsRelationshipId] = useState<string>();
  const [addWbsNodeOpen, setAddWbsNodeOpen] = useState(false);
  const [wbsSettingsOpen, setWbsSettingsOpen] = useState(false);
  const [addActivityActionOpen, setAddActivityActionOpen] = useState(false);
  const [addActivityPartitionOpen, setAddActivityPartitionOpen] = useState(false);
  const [addActivityNoteOpen, setAddActivityNoteOpen] = useState(false);
  const [addActivityStructureOpen, setAddActivityStructureOpen] = useState(false);
  const [addActivityTerminalOpen, setAddActivityTerminalOpen] = useState(false);
  const [addActivityArrowOpen, setAddActivityArrowOpen] = useState(false);
  const [activitySettingsOpen, setActivitySettingsOpen] = useState(false);
  const [addClassEntityOpen, setAddClassEntityOpen] = useState(false);
  const [addClassRelationshipOpen, setAddClassRelationshipOpen] = useState(false);
  const [addClassPackageOpen, setAddClassPackageOpen] = useState(false);
  const [addClassNoteOpen, setAddClassNoteOpen] = useState(false);
  const [classSettingsOpen, setClassSettingsOpen] = useState(false);
  const [addUseCaseElementKind, setAddUseCaseElementKind] = useState<UseCaseElementKind>();
  const [addUseCaseRelationshipOpen, setAddUseCaseRelationshipOpen] = useState(false);
  const [addUseCasePackageOpen, setAddUseCasePackageOpen] = useState(false);
  const [addUseCaseNoteOpen, setAddUseCaseNoteOpen] = useState(false);
  const [sequenceSettingsOpen, setSequenceSettingsOpen] = useState(false);
  const [useCaseSettingsOpen, setUseCaseSettingsOpen] = useState(false);
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(false);
  const [legendInspectorOpen, setLegendInspectorOpen] = useState(false);
  const [legendFocusColor, setLegendFocusColor] = useState<string>();
  const [highlightDate, setHighlightDate] = useState<string>();
  const [dateMenuFor, setDateMenuFor] = useState<string>();
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [baselineVersion, setBaselineVersion] = useState<DocumentVersion>();
  const [draggedTabId, setDraggedTabId] = useState<string>();
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number }>();
  const [resourceFilter, setResourceFilter] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview>();
  const [scheduleMode, setScheduleMode] = useState<"ask" | "single" | "cascade">(
    () => (localStorage.getItem("plantuml-studio.schedule-mode") as "ask" | "single" | "cascade" | null) ?? "ask",
  );
  const [resourcePanelOpen, setResourcePanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);
  const fileHandles = useRef(new Map<string, WritableFileHandle>());
  const workspaceElement = useRef<HTMLElement>(null);
  const pendingInspectorFocus = useRef<InspectorFocusSnapshot | undefined>(undefined);
  const lastDiagramFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
  const lastDiagramFocusSelector = useRef<string | undefined>(undefined);
  const renameReturnFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
  const pendingDiagramFocusSelector = useRef<string | undefined>(undefined);
  const startupSplashShown = useRef(false);
  const selectedTasksByDocument = useRef(new Map<string, string>());
  const { activeHistory, refreshHistoryControls, removeHistory, retainHistories } = useDocumentHistory(tabs.activeId);
  const {
    capacities: resourceCapacities,
    updateCapacities: updateResourceCapacities,
    renameCapacity,
  } = useResourceCapacities(tabs.activeId);
  const {
    status,
    result,
    retry: retryRender,
  } = useRenderer(
    workspace.source,
    hydrated && !newDocumentOpen && workspace.viewMode !== "code",
    workspace.diagramKind === "class" || workspace.diagramKind === "usecase" || workspace.diagramKind === "activity"
      ? "graphviz"
      : "native",
  );
  useEffect(() => {
    const selector = pendingDiagramFocusSelector.current;
    if (!selector || !result?.svg) return;
    const target = document.querySelector<HTMLElement | SVGElement>(selector);
    if (!target) return;
    pendingDiagramFocusSelector.current = undefined;
    lastDiagramFocus.current = target;
    target.focus({ preventScroll: true });
  }, [result?.svg]);
  const parsed = useMemo(() => {
    const started = performance.now();
    const value = ganttAdapter.parse(workspace.source);
    return { value, durationMs: performance.now() - started };
  }, [workspace.source]);
  const parseResult = parsed.value;
  const sequenceDocument = useMemo(() => parseSequence(workspace.source), [workspace.source]);
  const useCaseDocument = useMemo(() => parseUseCase(workspace.source), [workspace.source]);
  const classDocument = useMemo(() => parseClassDiagram(workspace.source), [workspace.source]);
  const activityDocument = useMemo(() => parseActivity(workspace.source), [workspace.source]);
  const wbsDocument = useMemo(() => parseWbs(workspace.source), [workspace.source]);
  const symbolProvider = useMemo(
    () =>
      createSemanticSymbolProvider({
        diagramKind: workspace.diagramKind,
        source: workspace.source,
        gantt: parseResult.document,
        sequence: sequenceDocument,
        useCase: useCaseDocument,
        classDiagram: classDocument,
        activity: activityDocument,
        wbs: wbsDocument,
      }),
    [
      activityDocument,
      classDocument,
      parseResult.document,
      sequenceDocument,
      useCaseDocument,
      wbsDocument,
      workspace.diagramKind,
      workspace.source,
    ],
  );
  const symbolOccurrences = symbolProvider.occurrences;
  const symbolHighlights = useMemo(
    () =>
      sourceSymbol
        ? symbolOccurrences
            .filter((item) => item.kind === sourceSymbol.kind && item.key === sourceSymbol.key)
            .map((item) => ({
              ...item.range,
              active:
                sourceSymbolPosition !== undefined &&
                sourceSymbolPosition >= item.range.from &&
                sourceSymbolPosition <= item.range.to,
            }))
        : [],
    [sourceSymbol, sourceSymbolPosition, symbolOccurrences],
  );
  const symbolAt = symbolProvider.occurrenceAt;
  const requestSymbolRename = useCallback(
    (position: number) => {
      const occurrence = symbolAt(position);
      if (!occurrence) return false;
      const request = symbolProvider.renameRequest(occurrence);
      if (!request) return false;
      const active = document.activeElement;
      if (active instanceof HTMLElement || active instanceof SVGElement) renameReturnFocus.current = active;
      setRenameSymbol(request);
      return true;
    },
    [symbolAt, symbolProvider],
  );
  const occurrencesFor = useCallback(
    (symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">) => symbolProvider.occurrencesFor(symbol),
    [symbolProvider],
  );
  const navigateOccurrence = useCallback(
    (occurrence: SemanticSymbolOccurrence, direction: -1 | 1) => {
      const occurrences = occurrencesFor(occurrence);
      const currentIndex = occurrences.findIndex(
        (item) => item.range.from === occurrence.range.from && item.range.to === occurrence.range.to,
      );
      const next = occurrences[(Math.max(0, currentIndex) + direction + occurrences.length) % occurrences.length];
      if (next) {
        if (workspace.viewMode === "diagram") setWorkspace((current) => ({ ...current, viewMode: "split" }));
        setSelectionRequest({ ...next.range });
      }
    },
    [occurrencesFor, setWorkspace, workspace.viewMode],
  );
  const diagramOccurrenceForTarget = useCallback(
    (target: Element): SemanticSymbolOccurrence | undefined => {
      const closestValue = (attribute: string) => target.closest(`[${attribute}]`)?.getAttribute(attribute);
      if (target instanceof SVGTextElement) {
        const text = target.textContent?.trim().replace(/^\{|\}$/g, "");
        const person = text
          ? symbolOccurrences.find(
              (item) => item.kind === "person" && item.value.toLocaleLowerCase() === text.toLocaleLowerCase(),
            )
          : undefined;
        if (person) return person;
      }
      const candidates: Array<{ kind: SemanticSymbolOccurrence["kind"]; key: string | null | undefined }> = [
        { kind: "task", key: closestValue("data-task-id") ?? closestValue("data-visual-task-id") },
        { kind: "participant", key: closestValue("data-sequence-participant-id") },
        {
          kind:
            closestValue("data-usecase-object-type") === "package" ||
            closestValue("data-usecase-object-type") === "rectangle"
              ? "usecase-package"
              : closestValue("data-usecase-object-type") === "actor"
                ? "actor"
                : "usecase",
          key: closestValue("data-usecase-object-id"),
        },
        {
          kind: closestValue("data-class-object-type") === "package" ? "class-package" : "class-entity",
          key: closestValue("data-class-object-id"),
        },
        {
          kind: closestValue("data-activity-object-type") === "action" ? "activity-action" : "activity-partition",
          key: closestValue("data-activity-object-id"),
        },
        { kind: "wbs-node", key: closestValue("data-wbs-node-id") },
      ];
      for (const candidate of candidates) {
        if (!candidate.key) continue;
        const occurrence = symbolOccurrences.find(
          (item) => item.kind === candidate.kind && item.key === candidate.key && item.role === "declaration",
        );
        if (occurrence) return occurrence;
      }
      return undefined;
    },
    [symbolOccurrences],
  );
  const openDiagramSymbolMenu = useCallback(
    (target: Element, x: number, y: number) => {
      const occurrence = diagramOccurrenceForTarget(target);
      if (!occurrence) return false;
      const focusTarget = target.closest<HTMLElement | SVGElement>("[tabindex], button");
      if (focusTarget) {
        lastDiagramFocus.current = focusTarget;
        lastDiagramFocusSelector.current = diagramFocusSelector(target);
        renameReturnFocus.current = focusTarget;
      }
      const bounds = target.getBoundingClientRect();
      setSymbolMenu({
        occurrence,
        x: x || bounds.left + Math.min(24, bounds.width / 2),
        y: y || bounds.top + Math.min(24, bounds.height),
      });
      return true;
    },
    [diagramOccurrenceForTarget],
  );
  const openClassMemberMenu = useCallback((target: Element, x: number, y: number) => {
    const element = target.closest("[data-class-member-id]");
    const memberId = element?.getAttribute("data-class-member-id");
    const entityId = element?.getAttribute("data-class-object-id");
    if (!element || !memberId || !entityId) return false;
    const bounds = element.getBoundingClientRect();
    setClassMemberMenu({
      entityId,
      memberId,
      x: x || bounds.left + Math.min(24, bounds.width / 2),
      y: y || bounds.top + Math.min(24, bounds.height),
    });
    return true;
  }, []);
  const activeDocument = tabs.documents.find((document) => document.id === tabs.activeId)!;
  useEffect(() => {
    if (!hydrated || startupSplashShown.current) return;
    startupSplashShown.current = true;
    setReplaceActiveDocumentOnCreate(activeDocument.historyId === "history-welcome");
    setNewDocumentOpen(true);
  }, [activeDocument.historyId, hydrated]);
  useEffect(() => {
    let cancelled = false;
    if (!activeDocument.baselineVersionId) {
      setBaselineVersion(undefined);
      return;
    }
    void loadDocumentVersions(activeDocument.historyId).then((versions) => {
      if (!cancelled) setBaselineVersion(versions.find((version) => version.id === activeDocument.baselineVersionId));
    });
    return () => {
      cancelled = true;
    };
  }, [activeDocument.baselineVersionId, activeDocument.historyId]);
  const baselineParseResult = useMemo(
    () => (baselineVersion ? parseGantt(baselineVersion.source) : undefined),
    [baselineVersion],
  );
  const selectedWbsNode = wbsDocument.nodes.find((item) => item.id === selectedWbsNodeId);
  const selectedWbsRelationship = wbsDocument.relationships.find((item) => item.id === selectedWbsRelationshipId);
  useEffect(() => {
    if (workspace.diagramKind !== "wbs") {
      setSelectedWbsNodeId(undefined);
      setSelectedWbsRelationshipId(undefined);
      setWbsSettingsOpen(false);
      setAddWbsNodeOpen(false);
    }
  }, [workspace.diagramKind]);
  const selectedActivityAction = activityDocument.nodes.find(
    (item) => item.id === selectedActivityObjectId && item.kind === "action",
  );
  const selectedActivityTerminal = activityDocument.nodes.find(
    (item) => item.id === selectedActivityObjectId && item.kind !== "action",
  );
  const selectedActivityPartition = activityDocument.partitions.find((item) => item.id === selectedActivityObjectId);
  const selectedActivityNote = activityDocument.notes.find((item) => item.id === selectedActivityObjectId);
  const selectedActivityControl = activityDocument.controls.find((item) => item.id === selectedActivityObjectId);
  const selectedActivityArrow = activityDocument.arrows.find((item) => item.id === selectedActivityObjectId);
  const selectedClassEntity = classDocument.entities.find((x) => x.id === selectedClassObjectId);
  const selectedClassRelationship = classDocument.relationships.find((x) => x.id === selectedClassObjectId);
  const selectedClassPackage = classDocument.packages.find((x) => x.id === selectedClassObjectId);
  const selectedClassNote = classDocument.notes.find((x) => x.id === selectedClassObjectId);
  const selectedSequenceParticipant = sequenceDocument.participants.find(
    (item) => item.id === selectedSequenceParticipantId,
  );
  const selectedSequenceMessage = sequenceDocument.messages.find((item) => item.id === selectedSequenceMessageId);
  const sequenceStructures = useMemo(
    () => [
      ...sequenceDocument.fragments,
      ...sequenceDocument.activations,
      ...sequenceDocument.notes,
      ...sequenceDocument.timelineItems,
      ...sequenceDocument.references,
      ...sequenceDocument.boxes,
      ...sequenceDocument.autonumbers,
      ...sequenceDocument.creations,
      ...sequenceDocument.durations,
    ],
    [sequenceDocument],
  );
  const selectedSequenceStructure = sequenceStructures.find((item) => item.id === selectedSequenceStructureId);
  const selectedUseCaseElement = useCaseDocument.elements.find((item) => item.id === selectedUseCaseObjectId);
  const selectedUseCaseRelationship = useCaseDocument.relationships.find((item) => item.id === selectedUseCaseObjectId);
  const selectedUseCasePackage = useCaseDocument.packages.find((item) => item.id === selectedUseCaseObjectId);
  const selectedUseCaseNote = useCaseDocument.notes.find((item) => item.id === selectedUseCaseObjectId);
  const sequenceParticipantNames = [
    ...new Set([
      ...sequenceDocument.participants.map((participant) => participant.alias ?? participant.label),
      ...sequenceDocument.creations.map((creation) => creation.participant),
    ]),
  ];
  const activeDiagnostics = useMemo(
    () => diagnosticsForDiagram(workspace.diagramKind, workspace.source),
    [workspace.diagramKind, workspace.source],
  );
  const activeQuickFixes = useMemo(
    () => quickFixesForDiagram(workspace.diagramKind, workspace.source),
    [workspace.diagramKind, workspace.source],
  );
  const diagnosticCount = activeDiagnostics.length;
  const unsupportedCount =
    workspace.diagramKind === "gantt"
      ? parseResult.document.unknown.length
      : workspace.diagramKind === "usecase"
        ? useCaseDocument.unknown.length
        : workspace.diagramKind === "class"
          ? classDocument.unknown.length
          : workspace.diagramKind === "activity"
            ? activityDocument.unknown.length
            : workspace.diagramKind === "wbs"
              ? wbsDocument.unknown.length
              : 0;
  const selectedTask = selectedTaskId ? parseResult.document.symbols.tasks.get(selectedTaskId) : undefined;
  const selectedTaskDependency = selectedTask
    ? parseResult.document.dependencies.find((item) => item.successorTaskId === selectedTask.id)
    : undefined;
  const selectedPredecessorId = selectedTaskDependency?.predecessorTaskId ?? "";
  const selectedDependency =
    selectedDependencyIndex === undefined ? undefined : parseResult.document.dependencies[selectedDependencyIndex];
  const resourceNames = useMemo(
    () =>
      [...new Set(parseResult.document.tasks.flatMap((task) => (task.resources ?? []).map((item) => item.value)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [parseResult.document.tasks],
  );
  const selectedResourceConflicts = useMemo(
    () => (selectedTask ? findResourceConflicts(selectedTask, parseResult.document.tasks) : []),
    [selectedTask, parseResult.document.tasks],
  );
  const ganttCalendar = useMemo(() => parseGanttCalendar(workspace.source), [workspace.source]);
  const resolvedTaskDates = useMemo(
    () =>
      resolveTaskDates(
        parseResult.document.tasks,
        parseResult.document.dependencies,
        parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined,
        ganttCalendar,
      ),
    [ganttCalendar, parseResult.document],
  );
  const resourceOverAllocations = useMemo(
    () =>
      buildResourceOverAllocations(parseResult.document.tasks, resourceCapacities, resolvedTaskDates, ganttCalendar),
    [ganttCalendar, parseResult.document.tasks, resourceCapacities, resolvedTaskDates],
  );
  const legendEntries = useMemo(() => {
    const labels = new Map(
      parseLegendEntries(workspace.source).map((entry) => [entry.color.toLowerCase(), entry.label]),
    );
    return usedLegendColors(parseResult.document.tasks).map((color) => ({
      color,
      label: labels.get(color.toLowerCase()) ?? color,
    }));
  }, [parseResult.document.tasks, workspace.source]);

  useEffect(() => {
    if (workspace.diagramKind !== "gantt") return;
    const timer = window.setTimeout(() => {
      const next = parseProjectSettings(workspace.source).showLegend
        ? synchronizeLegend(workspace.source, parseResult.document.tasks)
        : removeLegend(workspace.source);
      if (next !== workspace.source) commitSource(next, "Synchronize legend");
    }, 400);
    return () => window.clearTimeout(timer);
    // The effect already tracks the source used by commitSource; the callback is declared later in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseResult.document.tasks, workspace.diagramKind, workspace.source]);
  const openSourceBytes = useMemo(
    () => tabs.documents.reduce((total, document) => total + document.source.length * 2, 0),
    [tabs.documents],
  );

  useEffect(() => {
    setSourceHighlightedTaskId(undefined);
    setSourceSymbol(undefined);
    setSourceSymbolPosition(undefined);
    setRenameSymbol(undefined);
    setReferenceSymbol(undefined);
  }, [tabs.activeId, workspace.diagramKind]);

  useEffect(() => {
    if (!hydrated) return;
    const lines = workspace.source.split(/\n/);
    const lineIndex = Math.min(Math.max(0, workspace.cursor.line - 1), lines.length - 1);
    let position = 0;
    for (let index = 0; index < lineIndex; index += 1) position += (lines[index]?.length ?? 0) + 1;
    position += Math.min(Math.max(0, workspace.cursor.column - 1), lines[lineIndex]?.length ?? 0);
    setSelectionRequest({ from: position, to: position });
    // Restore the saved cursor only when hydration or the active tab changes; source edits must not steal selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tabs.activeId]);

  useEffect(() => {
    if (!tabs.documents.some((document) => document.dirty)) return;
    const protectUnsavedDocuments = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedDocuments);
    return () => window.removeEventListener("beforeunload", protectUnsavedDocuments);
  }, [tabs.documents]);

  const activateTab = useCallback(
    (id: string) => {
      if (selectedTaskId) selectedTasksByDocument.current.set(tabs.activeId, selectedTaskId);
      tabs.activateDocument(id);
      setSelectedTaskId(selectedTasksByDocument.current.get(id));
      setSelectedDependencyIndex(undefined);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      setInteractionMessage(undefined);
    },
    [selectedTaskId, tabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      const document = tabs.documents.find((item) => item.id === id);
      if (!document) return;
      if (document.dirty && !window.confirm(`Close “${document.fileName}” without saving?`)) return;
      const closingLastDocument = tabs.documents.length === 1;
      tabs.closeDocument(id);
      removeHistory(id);
      fileHandles.current.delete(id);
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      if (closingLastDocument) {
        setReplaceActiveDocumentOnCreate(true);
        setNewDocumentOpen(true);
      }
    },
    [removeHistory, tabs],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      tabs.duplicateDocument(id);
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setTabMenu(undefined);
      setInteractionMessage("Duplicated document");
    },
    [tabs],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      const dirtyOthers = tabs.documents.filter((item) => item.id !== id && item.dirty);
      if (
        dirtyOthers.length &&
        !window.confirm(
          `Close ${tabs.documents.length - 1} other tab${tabs.documents.length === 2 ? "" : "s"}? ${dirtyOthers.length} contain unsaved changes.`,
        )
      )
        return;
      tabs.closeOtherDocuments(id);
      retainHistories([id]);
      for (const documentId of [...fileHandles.current.keys()])
        if (documentId !== id) fileHandles.current.delete(documentId);
      setTabMenu(undefined);
    },
    [retainHistories, tabs],
  );

  const tabLabels = useMemo(() => {
    return documentDisplayNames(tabs.documents);
  }, [tabs.documents]);

  useEffect(() => {
    if (!tabMenu) return;
    const dismiss = () => setTabMenu(undefined);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [tabMenu]);

  useEffect(() => {
    if (!symbolMenu) return;
    const dismiss = () => setSymbolMenu(undefined);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [symbolMenu]);

  useEffect(() => {
    if (
      !selectedTaskId &&
      selectedDependencyIndex === undefined &&
      selectedDividerIndex === undefined &&
      selectedVerticalSeparatorIndex === undefined &&
      !selectedSequenceParticipantId &&
      !selectedSequenceMessageId &&
      !selectedSequenceStructureId &&
      !selectedUseCaseObjectId &&
      !selectedClassObjectId &&
      !selectedActivityObjectId &&
      !projectInspectorOpen &&
      !useCaseSettingsOpen &&
      !classSettingsOpen &&
      !activitySettingsOpen
    )
      return;
    const dismissInspector = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".task-inspector")) return;
      if (event.composedPath().some((item) => item instanceof Element && item.matches(".task-inspector"))) return;
      const inspectorTrigger =
        "[data-inspector-trigger], [data-task-id], [data-dependency-index], [data-divider-index], [data-vertical-separator-index], [data-sequence-participant-id], [data-sequence-message-id], [data-sequence-message-endpoint], [data-sequence-structure-id], [data-sequence-structure-endpoint], [data-usecase-object-id], [data-usecase-connect-from], [data-usecase-move-id], [data-usecase-relationship-endpoint], [data-class-object-id], [data-class-connect-from], [data-activity-object-id], [data-wbs-node-id], [data-wbs-connect-from], [data-wbs-relationship-id], [data-wbs-relationship-endpoint]";
      if (target instanceof Element && target.closest(inspectorTrigger)) return;
      if (event.composedPath().some((item) => item instanceof Element && item.matches(inspectorTrigger))) return;
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setSelectedDividerIndex(undefined);
      setSelectedVerticalSeparatorIndex(undefined);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      setSelectedUseCaseObjectId(undefined);
      setSelectedClassObjectId(undefined);
      setSelectedActivityObjectId(undefined);
      setProjectInspectorOpen(false);
      setUseCaseSettingsOpen(false);
      setClassSettingsOpen(false);
      setActivitySettingsOpen(false);
      setFocusNoteTaskId(undefined);
    };
    document.addEventListener("click", dismissInspector);
    return () => document.removeEventListener("click", dismissInspector);
  }, [
    projectInspectorOpen,
    useCaseSettingsOpen,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedSequenceMessageId,
    selectedSequenceParticipantId,
    selectedSequenceStructureId,
    selectedUseCaseObjectId,
    selectedClassObjectId,
    selectedActivityObjectId,
    classSettingsOpen,
    activitySettingsOpen,
    selectedTaskId,
    selectedVerticalSeparatorIndex,
  ]);

  const selectTask = (taskId: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    setResourcePanelOpen(false);
    setProjectInspectorOpen(false);
    setSelectedTaskId(task.id);
    setSelectedDividerIndex(undefined);
    setFocusNoteTaskId(undefined);
    selectedTasksByDocument.current.set(tabs.activeId, task.id);
    const declaration = task.declarations[0];
    setSelectionRequest(declaration ? { ...declaration.range } : { ...task.sourceRange });
  };

  const openProjectInspector = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(true);
  }, []);

  const openDateActionMenu = useCallback((date: string) => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(false);
    setResourcePanelOpen(false);
    setDateMenuFor(date);
  }, []);

  const openResourcePanel = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(false);
    setResourcePanelOpen(true);
  }, []);

  const moveTask = (taskId: string, days: number) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    let operation = ganttAdapter.applyVisualOperation(
      { kind: "move-task", taskId, days },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      const dependency = parseResult.document.dependencies.find((item) => item.successorTaskId === task.id);
      const predecessor = dependency ? parseResult.document.symbols.tasks.get(dependency.predecessorTaskId) : undefined;
      if (dependency && predecessor) {
        const currentOffset = (dependency.direction === "before" ? -1 : 1) * (dependency.offset?.value ?? 0);
        const nextOffset = currentOffset + days;
        operation = updateDependency(workspace.source, dependency, {
          predecessorLabel: predecessor.alias?.value ?? predecessor.label,
          successorLabel: task.alias?.value ?? task.label,
          relation: dependency.relation,
          offset: Math.abs(nextOffset),
          direction: nextOffset < 0 ? "before" : "after",
          ...(dependency.color?.value ? { color: dependency.color.value } : {}),
          lineStyle: dependency.lineStyle?.value ?? "solid",
        });
      }
    }
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    stageScheduleChange(task.id, task.label, days, "Move", operation.edits);
  };

  const resizeTask = (taskId: string, days: number, calendarDays = days) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "resize-task", taskId, days },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    stageScheduleChange(task.id, task.label, calendarDays, "Resize", operation.edits);
  };

  const reorderDiagramTask = (taskId: string, beforeTaskId?: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    const beforeTask = beforeTaskId ? parseResult.document.symbols.tasks.get(beforeTaskId) : undefined;
    if (!task) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "reorder-task", taskId, ...(beforeTaskId ? { beforeTaskId } : {}) },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const reorderedSource = applySourceEdits(workspace.source, operation.edits);
    if (!commitGeneratedSource(reorderedSource, `Reorder ${task.label}`)) return;
    setInteractionMessage(
      beforeTask ? `Moved ${task.label} before ${beforeTask.label}` : `Moved ${task.label} to the end`,
    );
  };

  const reorderDiagramDivider = (dividerIndex: number, beforeTaskId?: string) => {
    const divider = parseResult.document.dividers[dividerIndex];
    const beforeTask = beforeTaskId ? parseResult.document.symbols.tasks.get(beforeTaskId) : undefined;
    if (!divider) return;
    const beforeRange = beforeTask?.sourceRange;
    const operation = moveDivider(workspace.source, divider.sourceRange, beforeRange);
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const reorderedSource = applySourceEdits(workspace.source, operation.edits);
    if (!commitGeneratedSource(reorderedSource, `Move divider ${divider.label}`)) return;
    setInteractionMessage(
      beforeTask ? `Moved ${divider.label} before ${beforeTask.label}` : `Moved ${divider.label} to the end`,
    );
  };

  const applyDividerInspector = (label: string) => {
    if (selectedDividerIndex === undefined) return;
    const divider = parseResult.document.dividers[selectedDividerIndex];
    if (!divider) return;
    const operation = updateDivider(workspace.source, divider.sourceRange, label);
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    if (commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Rename divider ${divider.label}`))
      setInteractionMessage(`Renamed divider to ${label.trim()}`);
  };

  const deleteSelectedDivider = () => {
    if (selectedDividerIndex === undefined) return;
    const divider = parseResult.document.dividers[selectedDividerIndex];
    if (!divider || !window.confirm(`Delete divider “${divider.label}”?`)) return;
    if (
      !commitGeneratedSource(
        applySourceEdits(workspace.source, deleteDivider(workspace.source, divider.sourceRange).edits),
        `Delete divider ${divider.label}`,
      )
    )
      return;
    setSelectedDividerIndex(undefined);
    setInteractionMessage(`Deleted divider ${divider.label}`);
  };

  const stageScheduleChange = (
    taskId: string,
    taskLabel: string,
    days: number,
    action: "Move" | "Resize",
    taskEdits: import("@plantuml-studio/diagram-gantt").SourceEdit[],
  ) => {
    const dependents = moveDependentTasksByDays(parseResult.document, taskId, days);
    const singleSource = applySourceEdits(workspace.source, taskEdits);
    if (dependents.unavailableReason) {
      setInteractionMessage(dependents.unavailableReason);
      return;
    }
    if (!dependents.affectedLabels.length) {
      commitGeneratedSource(singleSource, `${action} ${taskLabel} ${days} days`);
      return;
    }
    const cascadeSource = applySourceEdits(workspace.source, [...taskEdits, ...dependents.edits]);
    if (scheduleMode !== "ask") {
      commitGeneratedSource(
        scheduleMode === "cascade" ? cascadeSource : singleSource,
        `${action} ${taskLabel}${scheduleMode === "cascade" ? " with dependents" : ""}`,
      );
      return;
    }
    const cascadeDocument = parseGantt(cascadeSource).document;
    const affected = dependents.affectedTaskIds.map((id, index) => {
      const before = parseResult.document.symbols.tasks.get(id);
      const after = cascadeDocument.symbols.tasks.get(id);
      return {
        id,
        label: dependents.affectedLabels[index]!,
        oldDate: before?.start?.value ?? before?.end?.value ?? "",
        newDate: after?.start?.value ?? after?.end?.value ?? "",
      };
    });
    const conflicts = [
      ...new Set(
        dependents.affectedTaskIds.flatMap((id) => {
          const task = cascadeDocument.symbols.tasks.get(id);
          return task
            ? findResourceConflicts(task, cascadeDocument.tasks).map((label) => `${task.label} ↔ ${label}`)
            : [];
        }),
      ),
    ];
    setSchedulePreview({ taskLabel, days, action, singleSource, cascadeSource, affected, conflicts });
  };

  useEffect(() => {
    localStorage.setItem("plantuml-studio.schedule-mode", scheduleMode);
  }, [scheduleMode]);

  const connectTasks = (
    predecessorTaskId: string,
    successorTaskId: string,
    predecessorAnchor: "start" | "end",
    successorAnchor: "start" | "end",
  ) => {
    const predecessor = parseResult.document.symbols.tasks.get(predecessorTaskId);
    const successor = parseResult.document.symbols.tasks.get(successorTaskId);
    if (!predecessor || !successor) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "create-dependency", predecessorTaskId, successorTaskId, predecessorAnchor, successorAnchor },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    commitGeneratedSource(
      applySourceEdits(workspace.source, operation.edits),
      `Connect ${predecessor.label}'s ${predecessorAnchor} to ${successor.label}'s ${successorAnchor}`,
    );
  };

  const deleteDependency = () => {
    if (selectedDependencyIndex === undefined) return;
    const dependency = parseResult.document.dependencies[selectedDependencyIndex];
    if (!dependency) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "remove-dependency", dependencyIndex: selectedDependencyIndex },
      parseResult.document,
      workspace.source,
    );
    if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Delete dependency")) return;
    setSelectedDependencyIndex(undefined);
  };

  const applyDependencyInspector = (value: DependencyInspectorValue) => {
    if (!selectedDependency) return;
    const predecessor = parseResult.document.symbols.tasks.get(value.predecessorId);
    const successor = parseResult.document.symbols.tasks.get(value.successorId);
    if (!predecessor || !successor) return;
    const operation = updateDependency(workspace.source, selectedDependency, {
      predecessorLabel: predecessor.alias?.value ?? predecessor.label,
      successorLabel: successor.alias?.value ?? successor.label,
      relation: value.relation,
      offset: value.offset,
      direction: value.direction,
      ...(value.color.trim() ? { color: value.color.trim() } : {}),
      lineStyle: value.lineStyle,
    });
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const noteOperation = setNote(
      workspace.source,
      selectedDependency.sourceRange,
      selectedDependency.notes,
      value.note,
      value.notePosition,
    );
    if (noteOperation.unavailableReason) {
      setInteractionMessage(noteOperation.unavailableReason);
      return;
    }
    if (
      !commitGeneratedSource(
        applySourceEdits(workspace.source, [...operation.edits, ...noteOperation.edits]),
        "Update dependency",
      )
    )
      return;
    setInteractionMessage("Updated dependency");
  };

  const update = useCallback(
    <K extends keyof typeof workspace>(key: K, value: (typeof workspace)[K]) => {
      setWorkspace((current) => ({ ...current, [key]: value }));
    },
    [setWorkspace],
  );

  const commitSource = useCallback(
    (source: string, description: string, validate = true): boolean => {
      if (source === workspace.source) return true;
      if (validate) {
        const validation = validateGeneratedSource(workspace.diagramKind, workspace.source, source);
        if (!validation.valid) {
          setInteractionMessage(
            `Cancelled ${description.toLowerCase()}: ${validation.message ?? "the operation would produce invalid PlantUML"}`,
          );
          setProblemPreview({
            source,
            diagnostics: validation.introduced,
            message: validation.message ?? "The operation would produce invalid PlantUML.",
          });
          setProblemsOpen(true);
          return false;
        }
      }
      pendingInspectorFocus.current = captureInspectorFocus();
      setProblemPreview(undefined);
      activeHistory.record(workspace.source, source, description);
      setWorkspace((current) => ({ ...current, source, dirty: true }));
      refreshHistoryControls();
      return true;
    },
    [activeHistory, refreshHistoryControls, setWorkspace, workspace.diagramKind, workspace.source],
  );

  useLayoutEffect(() => {
    const snapshot = pendingInspectorFocus.current;
    if (!snapshot) return;
    pendingInspectorFocus.current = undefined;
    const inspector = [...document.querySelectorAll<HTMLElement>(".task-inspector")].find(
      (item) => item.getAttribute("aria-label") === snapshot.inspectorLabel,
    );
    const control = inspector?.querySelectorAll<HTMLElement>("input, select, textarea, button")[snapshot.controlIndex];
    if (!control) {
      workspaceElement.current?.focus({ preventScroll: true });
      return;
    }
    control.focus({ preventScroll: true });
    if (
      snapshot.selectionStart !== undefined &&
      snapshot.selectionEnd !== undefined &&
      (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
    ) {
      control.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }, [workspace.source]);

  const commitGeneratedSource = useCallback(
    (source: string, description: string): boolean => commitSource(source, description),
    [commitSource],
  );

  const applyTimelineDateHighlight = useCallback(
    (color: string) => {
      if (!highlightDate) return;
      const settings = parseProjectSettings(workspace.source);
      const existing = settings.dateRules.find(
        (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, color } : rule))
        : [
            ...settings.dateRules,
            {
              id: `highlight-${highlightDate}`,
              from: highlightDate,
              to: highlightDate,
              state: "colored",
              color,
            },
          ];
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Highlight ${highlightDate}`))
        return;
      setHighlightDate(undefined);
      setInteractionMessage(`Highlighted ${highlightDate}`);
    },
    [commitGeneratedSource, highlightDate, workspace.source],
  );

  const clearTimelineDateHighlight = useCallback(() => {
    if (!highlightDate) return;
    const settings = parseProjectSettings(workspace.source);
    const remaining = settings.dateRules.filter(
      (rule) => !(rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate),
    );
    if (remaining.length === settings.dateRules.length) {
      setHighlightDate(undefined);
      return;
    }
    settings.dateRules = remaining;
    if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Clear highlight ${highlightDate}`))
      return;
    setHighlightDate(undefined);
    setInteractionMessage(`Cleared highlight for ${highlightDate}`);
  }, [commitGeneratedSource, highlightDate, workspace.source]);

  const applyTimelineDateClosed = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(workspace.source);
      const existing = settings.dateRules.find(
        (rule) => rule.from === date && rule.to === date && rule.state !== "colored",
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, state: "closed" } : rule))
        : [...settings.dateRules, { id: `closed-${date}`, from: date, to: date, state: "closed" as const }];
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Close ${date}`)) return;
      setDateMenuFor(undefined);
      setInteractionMessage(`Marked ${date} as a closed day`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const clearTimelineDateSetting = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(workspace.source);
      const remaining = settings.dateRules.filter((rule) => !(rule.from === date && rule.to === date));
      if (remaining.length === settings.dateRules.length) {
        setDateMenuFor(undefined);
        return;
      }
      settings.dateRules = remaining;
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Clear date setting ${date}`))
        return;
      setDateMenuFor(undefined);
      setInteractionMessage(`Cleared the date setting for ${date}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const undo = useCallback(() => {
    const source = activeHistory.undo(workspace.source);
    if (source === undefined) return;
    setWorkspace((current) => ({ ...current, source, dirty: true }));
    refreshHistoryControls();
  }, [activeHistory, refreshHistoryControls, setWorkspace, workspace.source]);

  const redo = useCallback(() => {
    const source = activeHistory.redo(workspace.source);
    if (source === undefined) return;
    setWorkspace((current) => ({ ...current, source, dirty: true }));
    refreshHistoryControls();
  }, [activeHistory, refreshHistoryControls, setWorkspace, workspace.source]);

  const reportFileError = useCallback((error: unknown) => {
    setInteractionMessage(error instanceof Error ? error.message : "File operation failed");
  }, []);

  const recordDocumentVersion = useCallback(
    async (
      reason: DocumentVersionReason,
      label?: string,
      override?: { historyId?: string; source?: string; fileName?: string; diagramKind?: DiagramKind },
    ) => {
      const historyId = override?.historyId ?? activeDocument.historyId;
      const existing = await loadDocumentVersions(historyId);
      const version = await createDocumentVersion({
        historyId,
        ...(existing[0] ? { parentVersionId: existing[0].id } : {}),
        source: override?.source ?? workspace.source,
        fileName: override?.fileName ?? workspace.fileName,
        diagramKind: override?.diagramKind ?? workspace.diagramKind,
        reason,
        ...(label?.trim() ? { label: label.trim() } : {}),
        pinned: reason === "manual" || reason === "before-restore",
      });
      setDocumentVersions(await loadDocumentVersions(historyId));
      return version;
    },
    [activeDocument.historyId, workspace.diagramKind, workspace.fileName, workspace.source],
  );

  const openVersionHistory = useCallback(async () => {
    try {
      let versions = await loadDocumentVersions(activeDocument.historyId);
      if (!versions.length) {
        await recordDocumentVersion("opened", "Initial version");
        versions = await loadDocumentVersions(activeDocument.historyId);
      }
      setDocumentVersions(versions);
      setVersionHistoryOpen(true);
    } catch (error) {
      reportFileError(error);
    }
  }, [activeDocument.historyId, recordDocumentVersion, reportFileError]);

  const openDocument = useCallback(async () => {
    try {
      const opened = await openPlantUmlDocument();
      if (!opened) return;
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const id = tabs.addDocument({
        historyId,
        diagramKind: detectDiagramKind(opened.source) ?? "gantt",
        source: opened.source,
        fileName: opened.fileName,
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (opened.handle) fileHandles.current.set(id, opened.handle);
      await recordDocumentVersion("opened", "Opened file", {
        historyId,
        source: opened.source,
        fileName: opened.fileName,
        diagramKind: detectDiagramKind(opened.source) ?? "gantt",
      });
      refreshHistoryControls();
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(`Opened ${opened.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, refreshHistoryControls, reportFileError, tabs]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const saved = await savePlantUmlDocumentAs(workspace.source, workspace.fileName);
      if (!saved) return;
      if (saved.handle) fileHandles.current.set(tabs.activeId, saved.handle);
      else fileHandles.current.delete(tabs.activeId);
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      tabs.setDocumentHistoryId(tabs.activeId, historyId);
      tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
      setBaselineVersion(undefined);
      setWorkspace((current) => ({ ...current, fileName: saved.fileName, dirty: false }));
      await recordDocumentVersion("saved", "Saved as new file", { historyId, fileName: saved.fileName });
      setInteractionMessage(`Saved ${saved.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, reportFileError, setWorkspace, tabs, workspace.fileName, workspace.source]);

  const editDocumentVersion = useCallback(
    async (version: DocumentVersion, patch: { label?: string; pinned?: boolean }) => {
      try {
        await updateDocumentVersion(version.id, patch);
        setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
        setInteractionMessage("Updated document version");
      } catch (error) {
        reportFileError(error);
      }
    },
    [activeDocument.historyId, reportFileError],
  );

  const removeDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      if (!window.confirm(`Delete version “${version.label || new Date(version.createdAt).toLocaleString()}”?`)) return;
      try {
        await deleteDocumentVersion(version.id);
        if (version.id === activeDocument.baselineVersionId) {
          tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
          setBaselineVersion(undefined);
        }
        setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
        setInteractionMessage("Deleted document version");
      } catch (error) {
        reportFileError(error);
      }
    },
    [activeDocument.baselineVersionId, activeDocument.historyId, reportFileError, tabs],
  );

  const saveDocument = useCallback(async () => {
    const handle = fileHandles.current.get(tabs.activeId);
    if (!handle) {
      await saveDocumentAs();
      return;
    }
    try {
      await writePlantUmlDocument(handle, workspace.source);
      setWorkspace((current) => ({ ...current, fileName: handle.name, dirty: false }));
      await recordDocumentVersion("saved", undefined, { fileName: handle.name });
      setInteractionMessage(`Saved ${handle.name}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, reportFileError, saveDocumentAs, setWorkspace, tabs.activeId, workspace.source]);

  const restoreDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      try {
        await recordDocumentVersion("before-restore", "Before restore");
        commitSource(version.source, `Restore version from ${new Date(version.createdAt).toLocaleString()}`, false);
        setInteractionMessage(`Restored ${version.label || new Date(version.createdAt).toLocaleString()}`);
        setVersionHistoryOpen(false);
      } catch (error) {
        reportFileError(error);
      }
    },
    [commitSource, recordDocumentVersion, reportFileError],
  );

  const exportSource = useCallback(
    () => downloadText(workspace.source, workspace.fileName, "text/plain;charset=utf-8"),
    [workspace.fileName, workspace.source],
  );
  const backupWorkspace = useCallback(async () => {
    try {
      const versions = (
        await Promise.all(tabs.documents.map((document) => loadDocumentVersions(document.historyId)))
      ).flat();
      downloadText(
        serializeWorkspaceBackup(tabs.session, versions),
        "plantuml-studio-backup.json",
        "application/json;charset=utf-8",
      );
      setInteractionMessage(
        `Backed up ${tabs.documents.length} open document${tabs.documents.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, tabs.documents, tabs.session]);
  const restoreWorkspace = useCallback(async () => {
    try {
      const contents = await openWorkspaceBackupFile();
      if (!contents) return;
      const restored = parseWorkspaceBackupBundle(contents);
      if (
        tabs.documents.some((document) => document.dirty) &&
        !window.confirm("Restore this backup and replace all currently open tabs?")
      )
        return;
      tabs.restoreSession(restored.session);
      await importDocumentVersions(restored.versions);
      fileHandles.current.clear();
      retainHistories(restored.session.documents.map((document) => document.id));
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(
        `Restored ${restored.session.documents.length} document${restored.session.documents.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, retainHistories, tabs]);
  const exportSvg = useCallback(() => {
    if (!result?.svg) {
      setInteractionMessage("Render a valid diagram before exporting SVG");
      return;
    }
    downloadText(result.svg, svgFileName(workspace.fileName), "image/svg+xml;charset=utf-8");
  }, [result?.svg, workspace.fileName]);
  const exportPng = useCallback(async () => {
    if (!result?.svg) {
      setInteractionMessage("Render a valid diagram before exporting PNG");
      return;
    }
    try {
      await downloadSvgAsPng(result.svg, workspace.fileName);
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, result?.svg, workspace.fileName]);

  const createDocument = useCallback(
    (diagramKind: DiagramKind) => {
      const replacedDocumentId = replaceActiveDocumentOnCreate ? tabs.activeId : undefined;
      tabs.addDocument({
        diagramKind,
        source:
          diagramKind === "sequence"
            ? DEFAULT_SEQUENCE_SOURCE
            : diagramKind === "usecase"
              ? DEFAULT_USECASE_SOURCE
              : diagramKind === "class"
                ? DEFAULT_CLASS_SOURCE
                : diagramKind === "activity"
                  ? DEFAULT_ACTIVITY_SOURCE
                  : diagramKind === "wbs"
                    ? DEFAULT_WBS_SOURCE
                    : DEFAULT_SOURCE,
        fileName: "untitled.puml",
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (replacedDocumentId) {
        tabs.closeDocument(replacedDocumentId);
        removeHistory(replacedDocumentId);
        fileHandles.current.delete(replacedDocumentId);
      }
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      refreshHistoryControls();
      setReplaceActiveDocumentOnCreate(false);
      setNewDocumentOpen(false);
      const displayName =
        diagramKind === "sequence"
          ? "Sequence"
          : diagramKind === "usecase"
            ? "Use Case"
            : diagramKind === "class"
              ? "Class"
              : diagramKind === "activity"
                ? "Activity"
                : diagramKind === "wbs"
                  ? "WBS"
                  : "Gantt";
      setInteractionMessage(`Created a new ${displayName} diagram`);
    },
    [refreshHistoryControls, removeHistory, replaceActiveDocumentOnCreate, tabs],
  );

  const newDocument = useCallback(() => {
    setReplaceActiveDocumentOnCreate(false);
    setNewDocumentOpen(true);
  }, []);

  const addWbsNode = useCallback(
    (value: WbsNodeInput, position: WbsInsertPosition) => {
      const selected = wbsDocument.nodes.find((item) => item.id === selectedWbsNodeId);
      const parent = position === "child" ? selected : undefined;
      const after = position === "sibling" ? selected : undefined;
      const source = insertWbsNode(workspace.source, wbsDocument, value, parent, after);
      commitSource(source, `Add WBS node ${value.label}`);
      setAddWbsNodeOpen(false);
      setInteractionMessage(`Added WBS node ${value.label}`);
    },
    [commitSource, selectedWbsNodeId, wbsDocument, workspace.source],
  );

  const applyWbsNode = useCallback(
    (value: WbsNodeInput) => {
      if (!selectedWbsNode) return;
      commitSource(updateWbsNode(workspace.source, selectedWbsNode, value), `Update WBS node ${selectedWbsNode.label}`);
      setInteractionMessage(`Updated WBS node ${value.label}`);
    },
    [commitSource, selectedWbsNode, workspace.source],
  );

  const removeWbsNode = useCallback(() => {
    if (!selectedWbsNode) return;
    const descendants = wbsDocument.nodes.filter(
      (item) =>
        item.sourceRange.from > selectedWbsNode.sourceRange.from &&
        item.sourceRange.to <= selectedWbsNode.subtreeRange.to,
    ).length;
    if (
      !window.confirm(
        `Delete “${selectedWbsNode.label}”${descendants ? ` and its ${descendants} descendant${descendants === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteWbsNode(workspace.source, wbsDocument, selectedWbsNode),
      `Delete WBS subtree ${selectedWbsNode.label}`,
    );
    setSelectedWbsNodeId(undefined);
    setSelectedWbsRelationshipId(undefined);
    setInteractionMessage(`Deleted WBS subtree ${selectedWbsNode.label}`);
  }, [commitSource, selectedWbsNode, wbsDocument, workspace.source]);

  const moveWbsNode = useCallback(
    (nodeId: string, parentId?: string, beforeId?: string) => {
      const node = wbsDocument.nodes.find((item) => item.id === nodeId);
      const parent = parentId ? wbsDocument.nodes.find((item) => item.id === parentId) : undefined;
      const before = beforeId ? wbsDocument.nodes.find((item) => item.id === beforeId) : undefined;
      if (!node) return;
      const source = moveWbsSubtree(workspace.source, wbsDocument, node, parent, before);
      if (source === workspace.source) {
        setInteractionMessage("That WBS subtree cannot be moved there");
        return;
      }
      commitSource(source, `Move WBS subtree ${node.label}`);
      setInteractionMessage(
        before ? `Reordered ${node.label}` : `Moved ${node.label}${parent ? ` under ${parent.label}` : " to the root"}`,
      );
    },
    [commitSource, wbsDocument, workspace.source],
  );

  const createWbsRelationship = useCallback(
    (fromId: string, toId: string) => {
      const from = wbsDocument.nodes.find((node) => node.id === fromId);
      const to = wbsDocument.nodes.find((node) => node.id === toId);
      if (!from || !to || from.id === to.id) return;
      const source = insertWbsRelationship(workspace.source, wbsDocument, from, to);
      if (source === workspace.source) {
        setInteractionMessage("That WBS arrow already exists");
        return;
      }
      commitSource(source, `Connect ${from.label} to ${to.label}`);
      setInteractionMessage(`Connected ${from.label} to ${to.label}`);
    },
    [commitSource, wbsDocument, workspace.source],
  );

  const applyWbsRelationshipColor = useCallback(
    (color: string) => {
      if (!selectedWbsRelationship) return;
      commitSource(
        updateWbsRelationshipColor(workspace.source, selectedWbsRelationship, color),
        `Update WBS arrow ${selectedWbsRelationship.from} to ${selectedWbsRelationship.to}`,
      );
      setInteractionMessage("Updated WBS arrow color");
    },
    [commitSource, selectedWbsRelationship, workspace.source],
  );

  const reconnectWbsArrow = useCallback(
    (relationshipId: string, endpoint: "from" | "to", targetId: string) => {
      const relationship = wbsDocument.relationships.find((item) => item.id === relationshipId);
      const target = wbsDocument.nodes.find((item) => item.id === targetId);
      if (!relationship || !target) return;
      const source = reconnectWbsRelationship(workspace.source, wbsDocument, relationship, endpoint, target);
      if (source === workspace.source) {
        setInteractionMessage("That WBS arrow cannot be reconnected there");
        return;
      }
      commitSource(source, `Reconnect ${endpoint} end of WBS arrow`);
      setInteractionMessage(`Reconnected WBS arrow to ${target.label}`);
    },
    [commitSource, wbsDocument, workspace.source],
  );

  const removeWbsRelationship = useCallback(() => {
    if (!selectedWbsRelationship) return;
    commitSource(
      deleteWbsRelationship(workspace.source, selectedWbsRelationship),
      `Delete WBS arrow ${selectedWbsRelationship.from} to ${selectedWbsRelationship.to}`,
    );
    setSelectedWbsRelationshipId(undefined);
    setInteractionMessage("Deleted WBS arrow");
  }, [commitSource, selectedWbsRelationship, workspace.source]);

  const applyWbsSettings = useCallback(
    (value: { title: string }) => {
      let source = workspace.source
        .replace(/^\s*title\s+.*(?:\r?\n)?/im, "")
        .replace(/^\s*(?:left side|right side|(?:left to right|top to bottom) direction)\s*(?:\r?\n)?/im, "");
      const start = /^\s*@startwbs\b.*$/im.exec(source);
      if (!start) return;
      const at = start.index + start[0].length;
      const settings = value.title.trim() ? `\ntitle ${value.title.trim()}` : "";
      source = `${source.slice(0, at)}${settings}${source.slice(at)}`;
      commitSource(source, "Update WBS settings");
      setInteractionMessage("Updated WBS settings");
    },
    [commitSource, workspace.source],
  );

  const addSequenceParticipant = useCallback(
    (value: AddSequenceParticipantValue) => {
      commitSource(insertSequenceParticipant(workspace.source, value), `Add ${value.kind} ${value.label.trim()}`);
      setAddSequenceParticipantOpen(false);
      setInteractionMessage(`Added ${value.kind} ${value.label.trim()}`);
    },
    [commitSource, workspace.source],
  );

  const addUseCaseElement = useCallback(
    (value: UseCaseElementInput) => {
      commitSource(insertUseCaseElement(workspace.source, value), `Add ${value.kind} ${value.label.trim()}`);
      setAddUseCaseElementKind(undefined);
      setInteractionMessage(`Added ${value.kind === "actor" ? "actor" : "use case"} ${value.label.trim()}`);
    },
    [commitSource, workspace.source],
  );

  const applyUseCaseElement = useCallback(
    (value: UseCaseElementInput) => {
      if (!selectedUseCaseElement) return;
      commitSource(
        updateUseCaseElement(workspace.source, useCaseDocument, selectedUseCaseElement, value),
        `Update ${selectedUseCaseElement.kind} ${selectedUseCaseElement.label}`,
      );
      setSelectedUseCaseObjectId((value.alias?.trim() || value.label.trim()).toLowerCase());
    },
    [commitSource, selectedUseCaseElement, useCaseDocument, workspace.source],
  );

  const removeUseCaseElement = useCallback(() => {
    if (!selectedUseCaseElement) return;
    const connected = useCaseDocument.relationships.filter(
      (item) => item.from === selectedUseCaseElement.id || item.to === selectedUseCaseElement.id,
    ).length;
    if (
      !window.confirm(
        `Delete “${selectedUseCaseElement.label}”${connected ? ` and ${connected} connected relationship${connected === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteUseCaseElement(workspace.source, useCaseDocument, selectedUseCaseElement),
      `Delete ${selectedUseCaseElement.kind} ${selectedUseCaseElement.label}`,
    );
    setSelectedUseCaseObjectId(undefined);
  }, [commitSource, selectedUseCaseElement, useCaseDocument, workspace.source]);

  const addUseCaseRelationship = useCallback(
    (value: UseCaseRelationshipInput) => {
      commitSource(insertUseCaseRelationship(workspace.source, useCaseDocument, value), "Add Use Case relationship");
      setAddUseCaseRelationshipOpen(false);
      setInteractionMessage("Added Use Case relationship");
    },
    [commitSource, useCaseDocument, workspace.source],
  );

  const applyUseCaseRelationship = useCallback(
    (value: UseCaseRelationshipInput) => {
      if (!selectedUseCaseRelationship) return;
      if (
        !commitSource(
          updateUseCaseRelationship(workspace.source, useCaseDocument, selectedUseCaseRelationship, value),
          "Update Use Case relationship",
        )
      )
        return;
      setSelectedUseCaseObjectId(selectedUseCaseRelationship.id);
    },
    [commitSource, selectedUseCaseRelationship, useCaseDocument, workspace.source],
  );

  const removeUseCaseRelationship = useCallback(() => {
    if (!selectedUseCaseRelationship) return;
    commitSource(
      deleteUseCaseRelationship(workspace.source, selectedUseCaseRelationship),
      "Delete Use Case relationship",
    );
    setSelectedUseCaseObjectId(undefined);
  }, [commitSource, selectedUseCaseRelationship, workspace.source]);

  const addUseCasePackage = useCallback(
    (value: UseCasePackageInput) => {
      commitSource(insertUseCasePackage(workspace.source, value), `Add ${value.kind} ${value.label.trim()}`);
      setAddUseCasePackageOpen(false);
    },
    [commitSource, workspace.source],
  );

  const applyUseCasePackage = useCallback(
    (value: UseCasePackageInput) => {
      if (!selectedUseCasePackage) return;
      commitSource(
        updateUseCasePackage(workspace.source, selectedUseCasePackage, value),
        `Update ${selectedUseCasePackage.kind} ${selectedUseCasePackage.label}`,
      );
      setSelectedUseCaseObjectId((value.alias?.trim() || value.label.trim()).toLowerCase());
    },
    [commitSource, selectedUseCasePackage, workspace.source],
  );

  const removeUseCasePackage = useCallback(() => {
    if (!selectedUseCasePackage) return;
    commitSource(
      deleteUseCasePackage(workspace.source, selectedUseCasePackage),
      `Remove ${selectedUseCasePackage.kind} ${selectedUseCasePackage.label}`,
    );
    setSelectedUseCaseObjectId(undefined);
  }, [commitSource, selectedUseCasePackage, workspace.source]);

  const addUseCaseNote = useCallback(
    (value: UseCaseNoteInput) => {
      commitSource(insertUseCaseNote(workspace.source, useCaseDocument, value), "Add Use Case note");
      setAddUseCaseNoteOpen(false);
    },
    [commitSource, useCaseDocument, workspace.source],
  );

  const applyUseCaseNote = useCallback(
    (value: UseCaseNoteInput) => {
      if (!selectedUseCaseNote) return;
      commitSource(
        updateUseCaseNote(workspace.source, useCaseDocument, selectedUseCaseNote, value),
        "Update Use Case note",
      );
    },
    [commitSource, selectedUseCaseNote, useCaseDocument, workspace.source],
  );

  const removeUseCaseNote = useCallback(() => {
    if (!selectedUseCaseNote) return;
    commitSource(deleteUseCaseNote(workspace.source, selectedUseCaseNote), "Delete Use Case note");
    setSelectedUseCaseObjectId(undefined);
  }, [commitSource, selectedUseCaseNote, workspace.source]);

  const createUseCaseRelationshipByDrag = useCallback(
    (from: string, to: string) => {
      commitSource(
        insertUseCaseRelationship(workspace.source, useCaseDocument, { from, to, kind: "association" }),
        "Connect Use Case objects",
      );
      setInteractionMessage("Added association");
    },
    [commitSource, useCaseDocument, workspace.source],
  );

  const createClassRelationshipByDrag = useCallback(
    (from: string, to: string) => {
      commitSource(
        insertClassRelationship(workspace.source, classDocument, { from, to, kind: "association" }),
        "Connect Class objects",
      );
      setInteractionMessage("Added Class association");
    },
    [classDocument, commitSource, workspace.source],
  );
  const reconnectClassRelationshipByDrag = useCallback(
    (id: string, endpoint: "from" | "to", targetId: string) => {
      const relation = classDocument.relationships.find((item) => item.id === id);
      if (!relation) return;
      commitSource(
        updateClassRelationship(workspace.source, classDocument, relation, {
          from: endpoint === "from" ? targetId : relation.from,
          to: endpoint === "to" ? targetId : relation.to,
          kind: relation.kind,
          ...(relation.label ? { label: relation.label } : {}),
          ...(relation.fromMultiplicity ? { fromMultiplicity: relation.fromMultiplicity } : {}),
          ...(relation.toMultiplicity ? { toMultiplicity: relation.toMultiplicity } : {}),
          ...(relation.color ? { color: relation.color } : {}),
          ...(relation.lineStyle ? { lineStyle: relation.lineStyle } : {}),
          arrow: relation.arrow,
        }),
        "Reconnect Class relationship",
      );
    },
    [classDocument, commitSource, workspace.source],
  );
  const moveClassEntityByDrag = useCallback(
    (id: string, packageId?: string) => {
      const entity = classDocument.entities.find((item) => item.id === id);
      if (entity)
        commitSource(moveClassEntityToPackage(workspace.source, classDocument, entity, packageId), "Move Class object");
    },
    [classDocument, commitSource, workspace.source],
  );
  const reorderClassEntityByDrag = useCallback(
    (id: string, targetId: string, placement: "before" | "after") => {
      const entity = classDocument.entities.find((item) => item.id === id);
      const target = classDocument.entities.find((item) => item.id === targetId);
      if (entity && target)
        commitSource(reorderClassEntity(workspace.source, entity, target, placement), "Reorder Class objects");
    },
    [classDocument.entities, commitSource, workspace.source],
  );
  const addClassEntity = (v: ClassEntityInput) => {
    commitSource(insertClassEntity(workspace.source, v), "Add Class object");
    setAddClassEntityOpen(false);
  };
  const applyClassEntity = (v: ClassEntityInput) => {
    if (selectedClassEntity)
      commitSource(updateClassEntity(workspace.source, classDocument, selectedClassEntity, v), "Update Class object");
  };
  const removeClassEntity = () => {
    if (selectedClassEntity) {
      commitSource(deleteClassEntity(workspace.source, classDocument, selectedClassEntity), "Delete Class object");
      setSelectedClassObjectId(undefined);
    }
  };
  const addClassMember = (value: ClassMemberInput) => {
    if (selectedClassEntity)
      commitSource(insertClassMember(workspace.source, selectedClassEntity, value), "Add Class member");
  };
  const applyClassMember = (member: ClassMember, value: ClassMemberInput) =>
    commitSource(updateClassMember(workspace.source, member, value), "Update Class member");
  const removeClassMember = (member: ClassMember) => {
    if (selectedClassEntity)
      commitSource(deleteClassMember(workspace.source, selectedClassEntity, member), "Delete Class member");
  };
  const moveClassMember = (member: ClassMember, direction: -1 | 1) => {
    if (!selectedClassEntity) return;
    const index = selectedClassEntity.members.findIndex((candidate) => candidate.id === member.id);
    const target = selectedClassEntity.members[index + direction];
    if (target) commitSource(reorderClassMember(workspace.source, member, target), "Reorder Class members");
  };
  const addClassRelationship = (v: ClassRelationshipInput) => {
    commitSource(insertClassRelationship(workspace.source, classDocument, v), "Add Class relationship");
    setAddClassRelationshipOpen(false);
  };
  const applyClassRelationship = (v: ClassRelationshipInput) => {
    if (selectedClassRelationship)
      commitSource(
        updateClassRelationship(workspace.source, classDocument, selectedClassRelationship, v),
        "Update Class relationship",
      );
  };
  const removeClassRelationship = () => {
    if (selectedClassRelationship) {
      commitSource(
        deleteClassRelationship(workspace.source, selectedClassRelationship, classDocument),
        "Delete Class relationship",
      );
      setSelectedClassObjectId(undefined);
    }
  };
  const addClassPackage = (v: ClassPackageInput) => {
    commitSource(insertClassPackage(workspace.source, classDocument, v), "Add Class package");
    setAddClassPackageOpen(false);
  };
  const applyClassPackage = (v: ClassPackageInput) => {
    if (selectedClassPackage)
      commitSource(updateClassPackage(workspace.source, selectedClassPackage, v), "Update Class package");
  };
  const removeClassPackage = () => {
    if (selectedClassPackage) {
      commitSource(deleteClassPackage(workspace.source, selectedClassPackage), "Delete Class package");
      setSelectedClassObjectId(undefined);
    }
  };
  const moveSelectedClassPackage = (parentId?: string) => {
    if (selectedClassPackage)
      commitSource(
        moveClassPackageToPackage(workspace.source, classDocument, selectedClassPackage, parentId),
        "Move Class package",
      );
  };
  const moveSelectedClassEntity = (id?: string) => {
    if (selectedClassEntity)
      commitSource(
        moveClassEntityToPackage(workspace.source, classDocument, selectedClassEntity, id),
        "Move Class object",
      );
  };
  const applyClassSettings = (v: ClassSettings) => {
    commitSource(updateClassSettings(workspace.source, v), "Update Class settings");
    setInteractionMessage("Updated Class settings");
  };
  const applyActivitySettings = (value: ActivitySettings) => {
    commitSource(updateActivitySettings(workspace.source, value), "Update Activity settings");
    setInteractionMessage("Updated Activity settings");
  };
  const addClassNote = (v: ClassNoteInput) => {
    commitSource(insertClassNote(workspace.source, classDocument, v), "Add Class note");
    setAddClassNoteOpen(false);
  };
  const applyClassNote = (v: ClassNoteInput) => {
    if (selectedClassNote) {
      const source = updateClassNote(workspace.source, classDocument, selectedClassNote, v);
      const updated = parseClassDiagram(source).notes.find(
        (note) =>
          note.targetId === v.targetId &&
          note.text === v.text.trim() &&
          (note.color ?? "").toLowerCase() === (v.color ? `#${v.color.replace(/^#/, "")}` : "").toLowerCase(),
      );
      commitSource(source, "Update Class note");
      if (updated) setSelectedClassObjectId(updated.id);
    }
  };
  const removeClassNote = () => {
    if (selectedClassNote) {
      commitSource(deleteClassNote(workspace.source, selectedClassNote), "Delete Class note");
      setSelectedClassObjectId(undefined);
    }
  };

  const addActivityAction = (value: ActivityActionInput) => {
    commitSource(insertActivityAction(workspace.source, activityDocument, value), "Add Activity action");
    setAddActivityActionOpen(false);
  };
  const applyActivityAction = (value: ActivityActionInput) => {
    if (selectedActivityAction)
      commitSource(updateActivityAction(workspace.source, selectedActivityAction, value), "Update Activity action");
  };
  const moveActivityActionPartition = (partitionId?: string) => {
    if (!selectedActivityAction) return;
    commitSource(
      moveActivityActionToPartition(workspace.source, activityDocument, selectedActivityAction, partitionId),
      "Move Activity action",
    );
    setSelectedActivityObjectId(undefined);
  };
  const removeActivityAction = () => {
    if (!selectedActivityAction) return;
    commitSource(deleteActivityNode(workspace.source, selectedActivityAction), "Delete Activity action");
    setSelectedActivityObjectId(undefined);
  };
  const addActivityPartition = (value: ActivityPartitionInput) => {
    commitSource(insertActivityPartition(workspace.source, activityDocument, value), "Add Activity partition");
    setAddActivityPartitionOpen(false);
  };
  const applyActivityPartition = (value: ActivityPartitionInput) => {
    if (selectedActivityPartition)
      commitSource(
        updateActivityPartition(workspace.source, selectedActivityPartition, value),
        "Update Activity partition",
      );
  };
  const moveSelectedActivityPartition = (parentId?: string) => {
    if (!selectedActivityPartition) return;
    commitSource(
      moveActivityPartition(workspace.source, activityDocument, selectedActivityPartition, parentId),
      "Move Activity partition",
    );
    setSelectedActivityObjectId(undefined);
  };
  const removeActivityPartition = () => {
    if (!selectedActivityPartition) return;
    commitSource(deleteActivityPartition(workspace.source, selectedActivityPartition), "Delete Activity partition");
    setSelectedActivityObjectId(undefined);
  };
  const addActivityNote = (value: ActivityNoteInput) => {
    commitSource(insertActivityNote(workspace.source, activityDocument, value), "Add Activity note");
    setAddActivityNoteOpen(false);
  };
  const addActivityStructure = (value: ActivityStructureInput) => {
    commitSource(insertActivityStructure(workspace.source, activityDocument, value), "Add Activity flow structure");
    setAddActivityStructureOpen(false);
  };
  const addActivityTerminal = (kind: "start" | "stop" | "end" | "detach" | "kill") => {
    commitSource(insertActivityTerminal(workspace.source, kind), `Add Activity ${kind}`);
    setAddActivityTerminalOpen(false);
  };
  const addActivityArrow = (value: ActivityArrowInput) => {
    commitSource(insertActivityArrow(workspace.source, activityDocument, value), "Add Activity flow arrow");
    setAddActivityArrowOpen(false);
  };
  const applyActivityNote = (value: ActivityNoteInput) => {
    if (selectedActivityNote)
      commitSource(
        updateActivityNoteWithTarget(workspace.source, activityDocument, selectedActivityNote, value),
        "Update Activity note",
      );
  };
  const removeActivityNote = () => {
    if (!selectedActivityNote) return;
    commitSource(deleteActivityNote(workspace.source, selectedActivityNote), "Delete Activity note");
    setSelectedActivityObjectId(undefined);
  };
  const applyActivityControl = (value: ActivityControlInput) => {
    if (selectedActivityControl)
      commitSource(updateActivityControl(workspace.source, selectedActivityControl, value), "Update Activity control");
  };
  const removeActivityControl = () => {
    if (!selectedActivityControl) return;
    commitSource(
      deleteActivityControlBlock(workspace.source, activityDocument, selectedActivityControl),
      "Delete Activity flow structure",
    );
    setSelectedActivityObjectId(undefined);
  };
  const removeActivityTerminal = () => {
    if (!selectedActivityTerminal) return;
    commitSource(deleteActivityNode(workspace.source, selectedActivityTerminal), "Delete Activity terminal");
    setSelectedActivityObjectId(undefined);
  };
  const applyActivityArrow = (value: ActivityArrowInput) => {
    if (selectedActivityArrow)
      commitSource(updateActivityArrow(workspace.source, selectedActivityArrow, value), "Update Activity flow arrow");
  };
  const removeActivityArrow = () => {
    if (!selectedActivityArrow) return;
    commitSource(deleteActivityArrow(workspace.source, selectedActivityArrow), "Delete Activity flow arrow");
    setSelectedActivityObjectId(undefined);
  };
  const reorderActivityActionByDrag = (id: string, targetId: string, placement: "before" | "after") => {
    const item = activityDocument.nodes.find((node) => node.id === id);
    const target = activityDocument.nodes.find((node) => node.id === targetId);
    const control = activityDocument.controls.find((entry) => entry.id === id);
    if (!target || (!item && !control)) return;
    commitSource(
      item
        ? reorderActivityAction(workspace.source, activityDocument, item, target, placement)
        : reorderActivityControlBlock(workspace.source, activityDocument, control!, target, placement),
      item ? "Reorder Activity action" : "Reorder Activity flow structure",
    );
  };

  const reconnectUseCaseRelationshipByDrag = useCallback(
    (relationshipId: string, endpoint: "from" | "to", targetId: string) => {
      const relationship = useCaseDocument.relationships.find((item) => item.id === relationshipId);
      if (!relationship) return;
      const nextValue: UseCaseRelationshipInput = {
        from: endpoint === "from" ? targetId : relationship.from,
        to: endpoint === "to" ? targetId : relationship.to,
        kind: relationship.kind,
        arrow: relationship.arrow,
        ...(relationship.kind === "association" && relationship.label ? { label: relationship.label } : {}),
        ...(relationship.color ? { color: relationship.color } : {}),
        ...(relationship.lineStyle ? { lineStyle: relationship.lineStyle } : {}),
        ...(relationship.direction ? { direction: relationship.direction } : {}),
      };
      commitSource(
        updateUseCaseRelationship(workspace.source, useCaseDocument, relationship, nextValue),
        "Reconnect Use Case relationship",
      );
      setInteractionMessage(`Reconnected ${endpoint} endpoint`);
    },
    [commitSource, useCaseDocument, workspace.source],
  );

  const moveUseCaseElementByDrag = useCallback(
    (elementId: string, packageId: string) => {
      const element = useCaseDocument.elements.find((item) => item.id === elementId);
      const target = useCaseDocument.packages.find((item) => item.id === packageId);
      if (!element || !target) return;
      commitSource(
        moveUseCaseElementToPackage(workspace.source, useCaseDocument, element, packageId),
        `Move ${element.label} into ${target.label}`,
      );
      setInteractionMessage(`Moved ${element.label} into ${target.label}`);
    },
    [commitSource, useCaseDocument, workspace.source],
  );

  const moveSelectedUseCaseElementToPackage = useCallback(
    (packageId?: string) => {
      if (!selectedUseCaseElement) return;
      commitSource(
        moveUseCaseElementToPackage(workspace.source, useCaseDocument, selectedUseCaseElement, packageId),
        `Move ${selectedUseCaseElement.label}`,
      );
    },
    [commitSource, selectedUseCaseElement, useCaseDocument, workspace.source],
  );

  const reorderUseCaseElementByDrag = useCallback(
    (elementId: string, targetId: string, placement: "before" | "after") => {
      const element = useCaseDocument.elements.find((item) => item.id === elementId);
      const target = useCaseDocument.elements.find((item) => item.id === targetId);
      if (!element || !target) return;
      const next = reorderUseCaseElement(workspace.source, element, target, placement);
      if (next === workspace.source) {
        setInteractionMessage("Objects can be reordered only within the same container");
        return;
      }
      commitSource(next, `Reorder ${element.label}`);
    },
    [commitSource, useCaseDocument.elements, workspace.source],
  );

  const addSequenceMessage = useCallback(
    (value: AddSequenceMessageValue) => {
      commitSource(insertSequenceMessage(workspace.source, value), `Add message ${value.from} to ${value.to}`);
      setAddSequenceMessageOpen(false);
      setInteractionMessage(`Added message from ${value.from} to ${value.to}`);
    },
    [commitSource, workspace.source],
  );

  const addSequenceStructure = useCallback(
    (value: import("@plantuml-studio/diagram-sequence").SequenceStructureInput) => {
      const nextSource =
        value.kind === "box"
          ? insertSequenceParticipantBox(workspace.source, sequenceDocument, value)
          : insertSequenceStructure(workspace.source, value);
      commitSource(nextSource, `Add Sequence ${value.kind}`);
      setAddSequenceStructureKind(undefined);
      setInteractionMessage(`Added Sequence ${value.kind}`);
    },
    [commitSource, sequenceDocument, workspace.source],
  );

  const selectSequenceParticipant = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceParticipantId(id);
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      if (revealSource) {
        const participant = sequenceDocument.participants.find((item) => item.id === id);
        if (participant) setSelectionRequest({ ...participant.sourceRange });
      }
    },
    [sequenceDocument],
  );

  const selectSequenceMessage = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceMessageId(id);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceStructureId(undefined);
      if (revealSource) {
        const message = sequenceDocument.messages.find((item) => item.id === id);
        if (message) setSelectionRequest({ ...message.sourceRange });
      }
    },
    [sequenceDocument],
  );

  const selectSequenceStructure = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceStructureId(id);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      if (revealSource) {
        const structure = sequenceStructures.find((item) => item.id === id);
        if (structure) setSelectionRequest({ ...structure.sourceRange });
      }
    },
    [sequenceStructures],
  );

  const applySequenceParticipant = useCallback(
    (value: SequenceParticipantInspectorValue) => {
      if (!selectedSequenceParticipant) return;
      const { order, ...presentation } = value;
      const next = updateSequenceParticipant(workspace.source, sequenceDocument, selectedSequenceParticipant, {
        ...presentation,
        ...(order !== undefined ? { order } : {}),
      });
      commitSource(next, `Update participant ${selectedSequenceParticipant.label}`);
      setSelectedSequenceParticipantId((value.alias.trim() || value.label.trim()).toLowerCase());
      setInteractionMessage(`Updated participant ${value.label.trim()}`);
    },
    [commitSource, selectedSequenceParticipant, sequenceDocument, workspace.source],
  );

  const removeSequenceParticipant = useCallback(() => {
    if (!selectedSequenceParticipant) return;
    const reference = selectedSequenceParticipant.alias ?? selectedSequenceParticipant.label;
    const attached = sequenceDocument.messages.filter(
      (message) => message.from === reference || message.to === reference,
    ).length;
    if (
      !window.confirm(
        `Delete “${selectedSequenceParticipant.label}”${attached ? ` and ${attached} connected message${attached === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteSequenceParticipant(workspace.source, sequenceDocument, selectedSequenceParticipant),
      `Delete participant ${selectedSequenceParticipant.label}`,
    );
    setSelectedSequenceParticipantId(undefined);
    setInteractionMessage(`Deleted participant ${selectedSequenceParticipant.label}`);
  }, [commitSource, selectedSequenceParticipant, sequenceDocument, workspace.source]);

  const applySequenceMessage = useCallback(
    (value: SequenceMessageInspectorValue) => {
      if (!selectedSequenceMessage) return;
      if (
        !commitSource(
          updateSequenceMessage(workspace.source, selectedSequenceMessage, value),
          "Update Sequence message",
        )
      )
        return;
      setSelectedSequenceMessageId(selectedSequenceMessage.id);
      setInteractionMessage("Updated message");
    },
    [commitSource, selectedSequenceMessage, workspace.source],
  );

  const removeSequenceMessage = useCallback(() => {
    if (!selectedSequenceMessage || !window.confirm("Delete this message?")) return;
    commitSource(deleteSequenceMessage(workspace.source, selectedSequenceMessage), "Delete Sequence message");
    setSelectedSequenceMessageId(undefined);
    setInteractionMessage("Deleted message");
  }, [commitSource, selectedSequenceMessage, workspace.source]);

  const applySequenceStructure = useCallback(
    (value: import("@plantuml-studio/diagram-sequence").SequenceStructureInput) => {
      if (!selectedSequenceStructure) return;
      commitSource(
        updateSequenceStructure(workspace.source, selectedSequenceStructure, value),
        `Update Sequence ${value.kind}`,
      );
      setInteractionMessage(`Updated Sequence ${value.kind}`);
    },
    [commitSource, selectedSequenceStructure, workspace.source],
  );

  const removeSequenceStructure = useCallback(() => {
    if (!selectedSequenceStructure || !window.confirm("Delete this Sequence structure?")) return;
    commitSource(deleteSequenceStructure(workspace.source, selectedSequenceStructure), "Delete Sequence structure");
    setSelectedSequenceStructureId(undefined);
    setInteractionMessage("Deleted Sequence structure");
  }, [commitSource, selectedSequenceStructure, workspace.source]);

  const reorderSequenceParticipant = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = sequenceDocument.participants.find((item) => item.id === id);
      const target = sequenceDocument.participants.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(
        reorderSequenceStatement(workspace.source, moved, target, placement),
        `Reorder participant ${moved.label}`,
      );
      setInteractionMessage(`Moved ${moved.label} ${placement} ${target.label}`);
    },
    [commitSource, sequenceDocument.participants, workspace.source],
  );

  const reorderSequenceMessage = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = sequenceDocument.messages.find((item) => item.id === id);
      const target = sequenceDocument.messages.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(reorderSequenceStatement(workspace.source, moved, target, placement), "Reorder Sequence message");
      setSelectedSequenceMessageId(undefined);
      setInteractionMessage("Reordered message");
    },
    [commitSource, sequenceDocument.messages, workspace.source],
  );

  const reorderSequenceTimeline = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const timeline = [...sequenceDocument.messages, ...sequenceStructures];
      const moved = timeline.find((item) => item.id === id);
      const target = timeline.find((item) => item.id === targetId);
      if (!moved || !target) return;
      const next = reorderSequenceStatement(workspace.source, moved, target, placement);
      if (next === workspace.source) return;
      commitSource(next, "Reorder Sequence element");
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      setInteractionMessage(`Moved Sequence element ${placement} target`);
    },
    [commitSource, sequenceDocument.messages, sequenceStructures, workspace.source],
  );

  const reconnectSequenceElement = useCallback(
    (structureId: string, endpoint: number, participantId: string) => {
      const structure = sequenceStructures.find((item) => item.id === structureId);
      const participant = sequenceDocument.participants.find((item) => item.id === participantId);
      if (!structure || !participant) return;
      const next = reconnectSequenceStructure(
        workspace.source,
        structure,
        endpoint,
        participant.alias ?? participant.label,
      );
      if (next === workspace.source) return;
      commitSource(next, "Reconnect Sequence element");
      setInteractionMessage(`Attached Sequence element to ${participant.label}`);
    },
    [commitSource, sequenceDocument.participants, sequenceStructures, workspace.source],
  );

  const reconnectSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", participantId: string) => {
      const message = sequenceDocument.messages.find((item) => item.id === messageId);
      const participant = sequenceDocument.participants.find((item) => item.id === participantId);
      if (!message || !participant) return;
      const reference = participant.alias ?? participant.label;
      const next = updateSequenceMessage(workspace.source, message, { ...message, [endpoint]: reference });
      commitSource(next, `Reconnect message ${endpoint}`);
      setInteractionMessage(`Changed message ${endpoint === "from" ? "sender" : "recipient"} to ${participant.label}`);
    },
    [commitSource, sequenceDocument, workspace.source],
  );

  const externalizeSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?") => {
      const message = sequenceDocument.messages.find((item) => item.id === messageId);
      if (!message) return;
      commitSource(
        updateSequenceMessage(workspace.source, message, { ...message, [endpoint]: marker }),
        "Reconnect message to diagram edge",
      );
      setInteractionMessage(marker === "?" ? "Marked message as lost" : "Connected message to diagram edge");
    },
    [commitSource, sequenceDocument.messages, workspace.source],
  );

  const createSequenceMessageByDrag = useCallback(
    (fromId: string, toId: string) => {
      const from = sequenceDocument.participants.find((item) => item.id === fromId);
      const to = sequenceDocument.participants.find((item) => item.id === toId);
      if (!from || !to) return;
      const source = insertSequenceMessage(workspace.source, {
        from: from.alias ?? from.label,
        to: to.alias ?? to.label,
        arrow: "->",
        label: "New message",
      });
      commitSource(source, `Connect ${from.label} to ${to.label}`);
      setInteractionMessage(`Added message from ${from.label} to ${to.label}`);
    },
    [commitSource, sequenceDocument.participants, workspace.source],
  );

  const addTask = useCallback(
    (value: AddTaskValue) => {
      const operation = insertTask(workspace.source, value);
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add ${value.label.trim()}`))
        return;
      setAddTaskOpen(false);
      setInteractionMessage(`Added ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const addDivider = useCallback(
    (value: AddSeparatorValue) => {
      if (value.kind === "vertical") {
        const operation = insertVerticalSeparator(workspace.source, value);
        if (operation.unavailableReason) {
          setInteractionMessage(operation.unavailableReason);
          return;
        }
        if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Add vertical separator"))
          return;
        setAddDividerOpen(false);
        setInteractionMessage("Added vertical separator");
        return;
      }
      const beforeTask = value.beforeTaskId
        ? parseGantt(workspace.source).document.symbols.tasks.get(value.beforeTaskId)
        : undefined;
      const beforeRange = beforeTask?.declarations.map((item) => item.range).sort((a, b) => a.from - b.from)[0];
      const operation = insertDivider(workspace.source, value.label, beforeRange);
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (
        !commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add divider ${value.label.trim()}`)
      )
        return;
      setAddDividerOpen(false);
      setInteractionMessage(`Added divider ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const addMilestone = useCallback(
    (value: AddMilestoneValue) => {
      const operation = insertMilestone(workspace.source, {
        label: value.label,
        ...(value.mode === "fixed"
          ? { date: value.date ?? "" }
          : { referenceLabel: value.referenceLabel ?? "", referenceAnchor: value.referenceAnchor ?? "end" }),
      });
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add ${value.label.trim()}`))
        return;
      setAddMilestoneOpen(false);
      setInteractionMessage(`Added milestone ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const applyTaskInspector = useCallback(
    (value: TaskInspectorValue) => {
      if (!selectedTaskId) return;
      const duration = value.scheduleMode === "duration" && value.duration !== "" ? Number(value.duration) : undefined;
      const completion = value.completion === "" ? undefined : Number(value.completion);
      if (duration !== undefined && (!Number.isInteger(duration) || duration < 1)) {
        setInteractionMessage("Duration must be a positive whole number");
        return;
      }
      if (completion !== undefined && (!Number.isInteger(completion) || completion < 0 || completion > 100)) {
        setInteractionMessage("Completion must be between 0 and 100");
        return;
      }

      let source = workspace.source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(source).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(source, parseGantt(source).document, original, value.label);
      if (renamed.unavailableReason) {
        setInteractionMessage(renamed.unavailableReason);
        return;
      }
      source = applySourceEdits(source, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);

      const applyDeclaration = (
        kind: "start" | "end" | "duration" | "completion" | "color" | "same-row",
        statement?: string,
      ) => {
        const task = current();
        if (task) source = applySourceEdits(source, setTaskDeclaration(source, task, kind, statement).edits);
      };
      const predecessor = value.predecessorId
        ? parseGantt(source).document.symbols.tasks.get(value.predecessorId)
        : undefined;
      const derivedStart = resolvedTaskDates.get(selectedTaskId)?.start ?? "";
      if (predecessor) {
        const endsTask = value.dependencyRelation.startsWith("end-");
        const linkedAnchor = value.dependencyRelation.endsWith("-start") ? "start" : "end";
        const linkedStatement = `${endsTask ? "ends" : "starts"} at [${predecessor.alias?.value ?? predecessor.label}]'s ${linkedAnchor}`;
        applyDeclaration(
          "start",
          endsTask
            ? value.startDate && value.startDate !== derivedStart
              ? `starts ${value.startDate}`
              : undefined
            : linkedStatement,
        );
        applyDeclaration(
          "end",
          endsTask
            ? linkedStatement
            : value.scheduleMode === "end" && value.endDate
              ? `ends ${value.endDate}`
              : undefined,
        );
      } else {
        applyDeclaration("start", value.startDate ? `starts ${value.startDate}` : undefined);
        applyDeclaration("end", value.scheduleMode === "end" && value.endDate ? `ends ${value.endDate}` : undefined);
      }
      applyDeclaration(
        "duration",
        duration !== undefined ? `lasts ${duration} ${value.durationUnit}${duration === 1 ? "" : "s"}` : undefined,
      );
      applyDeclaration("completion", completion !== undefined ? `is ${completion}% completed` : undefined);
      applyDeclaration("color", value.color.trim() ? `is colored in ${value.color.trim()}` : undefined);
      const sameRowTask = value.sameRowTaskId
        ? parseGantt(source).document.symbols.tasks.get(value.sameRowTaskId)
        : undefined;
      applyDeclaration(
        "same-row",
        sameRowTask ? `displays on same row as [${sameRowTask.alias?.value ?? sameRowTask.label}]` : undefined,
      );
      const pauseDates = value.pauses.map((pause) => pause.value.trim()).filter(Boolean);
      const pauseOperation = current()
        ? setTaskPauses(source, current()!, pauseDates)
        : { edits: [], unavailableReason: "Task not found" };
      if (pauseOperation.unavailableReason) {
        setInteractionMessage(pauseOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, pauseOperation.edits);
      const links = value.links
        .filter((link) => link.url.trim())
        .map((link) => ({
          url: link.url.trim(),
          ...(link.label.trim() ? { label: link.label.trim() } : {}),
        }));
      const linkOperation = current()
        ? setTaskLinks(source, current()!, links)
        : { edits: [], unavailableReason: "Task not found" };
      if (linkOperation.unavailableReason) {
        setInteractionMessage(linkOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, linkOperation.edits);
      const resources = value.resources.map((item) => ({
        name: item.name.trim(),
        allocation: Number(item.allocation),
      }));
      const resourceOperation = current()
        ? setTaskResources(source, current()!, resources)
        : { edits: [], unavailableReason: "Task not found" };
      if (resourceOperation.unavailableReason) {
        setInteractionMessage(resourceOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, resourceOperation.edits);
      const taskForNote = current();
      if (taskForNote) {
        const noteOperation = setNote(
          source,
          taskForNote.sourceRange,
          taskForNote.notes,
          value.note,
          value.notePosition,
        );
        if (noteOperation.unavailableReason) {
          setInteractionMessage(noteOperation.unavailableReason);
          return;
        }
        source = applySourceEdits(source, noteOperation.edits);
      }
      setSelectedTaskId(currentId);
      selectedTasksByDocument.current.set(tabs.activeId, currentId);
      if (!commitGeneratedSource(source, `Update ${value.label.trim()}`)) {
        setSelectedTaskId(selectedTaskId);
        selectedTasksByDocument.current.set(tabs.activeId, selectedTaskId);
        return;
      }
      setInteractionMessage(`Updated ${value.label.trim()}`);
    },
    [commitGeneratedSource, resolvedTaskDates, selectedTaskId, tabs.activeId, workspace.source],
  );

  const applyMilestoneInspector = useCallback(
    (value: MilestoneInspectorValue) => {
      if (!selectedTaskId) return;
      if (value.mode === "fixed" && !value.date) {
        setInteractionMessage("Milestone date is required");
        return;
      }
      if (value.mode === "relative" && !value.referenceLabel) {
        setInteractionMessage("Choose a relative task or milestone");
        return;
      }
      let source = workspace.source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(source).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(source, parseGantt(source).document, original, value.label);
      if (renamed.unavailableReason) {
        setInteractionMessage(renamed.unavailableReason);
        return;
      }
      source = applySourceEdits(source, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);
      const task = current();
      if (!task) return;
      const milestoneStatement =
        value.mode === "fixed"
          ? `happens ${value.date}`
          : `happens at [${value.referenceLabel}]'s ${value.referenceAnchor}`;
      source = applySourceEdits(source, setTaskDeclaration(source, task, "milestone", milestoneStatement).edits);
      const colored = current();
      if (colored)
        source = applySourceEdits(
          source,
          setTaskDeclaration(
            source,
            colored,
            "color",
            value.color.trim() ? `is colored in ${value.color.trim()}` : undefined,
          ).edits,
        );
      const noted = current();
      if (noted) {
        const noteOperation = setNote(source, noted.sourceRange, noted.notes, value.note, value.notePosition);
        if (noteOperation.unavailableReason) {
          setInteractionMessage(noteOperation.unavailableReason);
          return;
        }
        source = applySourceEdits(source, noteOperation.edits);
      }
      if (!commitGeneratedSource(source, `Update ${value.label.trim()}`)) return;
      setSelectedTaskId(currentId);
      setInteractionMessage(`Updated milestone ${value.label.trim()}`);
    },
    [commitGeneratedSource, selectedTaskId, workspace.source],
  );

  const deleteSelectedTask = useCallback(() => {
    if (!selectedTask) return;
    const kind = selectedTask.milestone ? "milestone" : "task";
    if (!window.confirm(`Delete ${kind} “${selectedTask.label}” and its dependency links?`)) return;
    const operation = deleteTask(workspace.source, parseResult.document, selectedTask);
    if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Delete ${selectedTask.label}`))
      return;
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setInteractionMessage(`Deleted ${selectedTask.label}`);
  }, [commitGeneratedSource, parseResult.document, selectedTask, workspace.source]);

  const applyProjectSettings = useCallback(
    (value: ReturnType<typeof parseProjectSettings>) => {
      const zoom = value.scaleZoom === "" ? undefined : Number(value.scaleZoom);
      if (zoom !== undefined && (!Number.isInteger(zoom) || zoom < 1)) {
        setInteractionMessage("Scale zoom must be a positive whole number");
        return;
      }
      if (value.highlightToday && (!value.todayColor.trim() || /\s/.test(value.todayColor.trim()))) {
        setInteractionMessage("Today color must be a PlantUML color name or hex value");
        return;
      }
      if (value.dateRules.some((rule) => !rule.from || !rule.to || rule.to < rule.from)) {
        setInteractionMessage("Calendar dates need a valid start and end date");
        return;
      }
      if (
        value.dateRules.some(
          (rule) => rule.state === "colored" && (!rule.color?.trim() || /\s/.test(rule.color.trim())),
        )
      ) {
        setInteractionMessage("Highlighted dates need a PlantUML color name or hex value");
        return;
      }
      const settingsSource = updateProjectSettings(workspace.source, value);
      const nextSource = value.showLegend
        ? synchronizeLegend(settingsSource, parseGantt(settingsSource).document.tasks)
        : removeLegend(settingsSource);
      if (!commitGeneratedSource(nextSource, "Update project calendar")) return;
      setProjectInspectorOpen(false);
      setInteractionMessage("Updated project calendar");
    },
    [commitGeneratedSource, workspace.source],
  );

  const applySequenceSettings = useCallback(
    (value: SequenceSettings) => {
      commitSource(updateSequenceSettings(workspace.source, value), "Update Sequence settings");
      setSequenceSettingsOpen(false);
      setInteractionMessage("Updated Sequence settings");
    },
    [commitSource, workspace.source],
  );

  const applyUseCaseSettings = useCallback(
    (value: UseCaseSettings) => {
      commitSource(updateUseCaseSettings(workspace.source, value), "Update Use Case settings");
      setInteractionMessage("Updated Use Case settings");
    },
    [commitSource, workspace.source],
  );

  const commands = useMemo<Command[]>(() => {
    const diagramCommands: Command[] =
      workspace.diagramKind === "gantt"
        ? [
            {
              id: "edit.add-task",
              label: "Add task…",
              category: "Edit",
              shortcut: optionShortcut("T"),
              run: () => setAddTaskOpen(true),
            },
            {
              id: "edit.add-milestone",
              label: "Add milestone…",
              category: "Edit",
              shortcut: optionShortcut("M"),
              run: () => setAddMilestoneOpen(true),
            },
            {
              id: "edit.add-divider",
              label: "Add divider…",
              category: "Edit",
              shortcut: optionShortcut("D"),
              run: () => setAddDividerOpen(true),
            },
            { id: "edit.project-calendar", label: "Project & calendar…", category: "Edit", run: openProjectInspector },
            { id: "edit.legend", label: "Legend labels…", category: "Edit", run: () => setLegendInspectorOpen(true) },
            { id: "view.resource-workload", label: "Resource workload…", category: "View", run: openResourcePanel },
          ]
        : workspace.diagramKind === "wbs"
          ? [
              {
                id: "edit.add-wbs-node",
                label: "Add WBS node…",
                category: "Edit",
                shortcut: optionShortcut("N"),
                run: () => setAddWbsNodeOpen(true),
              },
              {
                id: "edit.wbs-settings",
                label: "WBS settings…",
                category: "Edit",
                run: () => setWbsSettingsOpen(true),
              },
            ]
          : [
              {
                id: "edit.add-participant",
                label: "Add participant…",
                category: "Edit",
                shortcut: optionShortcut("P"),
                run: () => setAddSequenceParticipantOpen(true),
              },
              {
                id: "edit.add-message",
                label: "Add message…",
                category: "Edit",
                shortcut: optionShortcut("M"),
                run: () => setAddSequenceMessageOpen(true),
              },
              {
                id: "edit.add-fragment",
                label: "Add combined fragment…",
                category: "Edit",
                run: () => setAddSequenceStructureKind("fragment"),
              },
              {
                id: "edit.add-activation",
                label: "Add activation…",
                category: "Edit",
                run: () => setAddSequenceStructureKind("activation"),
              },
              {
                id: "edit.add-note",
                label: "Add Sequence note…",
                category: "Edit",
                run: () => setAddSequenceStructureKind("note"),
              },
            ];
    return [
      { id: "file.new", label: "New document", category: "File", shortcut: "⌘N", run: newDocument },
      { id: "file.open", label: "Open…", category: "File", shortcut: "⌘O", run: openDocument },
      { id: "file.save", label: "Save", category: "File", shortcut: "⌘S", run: saveDocument },
      { id: "file.save-as", label: "Save As…", category: "File", run: saveDocumentAs },
      { id: "file.backup", label: "Back up workspace", category: "File", run: backupWorkspace },
      { id: "file.restore", label: "Restore workspace…", category: "File", run: () => void restoreWorkspace() },
      ...diagramCommands,
      {
        id: "help.reference",
        label: "Help & keyboard shortcuts",
        category: "Help",
        shortcut: "?",
        run: () => setHelpOpen(true),
      },
      { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "⌘Z", enabled: activeHistory.canUndo, run: undo },
      { id: "edit.redo", label: "Redo", category: "Edit", shortcut: "⇧⌘Z", enabled: activeHistory.canRedo, run: redo },
      ...(["code", "split", "diagram"] as ViewMode[]).map((mode, index) => ({
        id: `view.${mode}`,
        label: `${mode[0]!.toUpperCase()}${mode.slice(1)} view`,
        category: "View",
        shortcut: `⌘${index + 1}`,
        run: () => update("viewMode", mode),
      })),
      {
        id: "view.zoom-in",
        label: "Zoom in",
        category: "View",
        run: () => update("zoom", Math.min(2, workspace.zoom + 0.1)),
      },
      {
        id: "view.zoom-out",
        label: "Zoom out",
        category: "View",
        run: () => update("zoom", Math.max(0.5, workspace.zoom - 0.1)),
      },
      { id: "export.source", label: "Export source", category: "Export", run: exportSource },
      { id: "export.svg", label: "Export SVG", category: "Export", enabled: Boolean(result?.svg), run: exportSvg },
      { id: "export.png", label: "Export PNG", category: "Export", enabled: Boolean(result?.svg), run: exportPng },
    ];
  }, [
    activeHistory,
    backupWorkspace,
    exportPng,
    exportSource,
    exportSvg,
    newDocument,
    openDocument,
    openProjectInspector,
    openResourcePanel,
    redo,
    restoreWorkspace,
    result?.svg,
    saveDocument,
    saveDocumentAs,
    undo,
    update,
    workspace.zoom,
    workspace.diagramKind,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const editingOutsideCodeEditor =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (target?.isContentEditable && !target.closest(".cm-editor"));
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !editing) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !editingOutsideCodeEditor &&
        !event.repeat
      ) {
        const creation =
          event.code === "KeyT"
            ? "t"
            : event.code === "KeyM"
              ? "m"
              : event.code === "KeyD"
                ? "d"
                : event.code === "KeyP"
                  ? "p"
                  : event.code === "KeyN"
                    ? "n"
                    : "";
        if (workspace.diagramKind === "wbs" && creation === "n") {
          event.preventDefault();
          setAddWbsNodeOpen(true);
          return;
        }
        if (workspace.diagramKind === "sequence" && (creation === "p" || creation === "m")) {
          event.preventDefault();
          if (creation === "p") setAddSequenceParticipantOpen(true);
          else setAddSequenceMessageOpen(true);
          return;
        }
        if (workspace.diagramKind === "gantt" && (creation === "t" || creation === "m" || creation === "d")) {
          event.preventDefault();
          if (creation === "t") setAddTaskOpen(true);
          else if (creation === "m") setAddMilestoneOpen(true);
          else setAddDividerOpen(true);
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        newDocument();
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDocument();
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openDocument();
        return;
      }
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeTab(tabs.activeId);
        return;
      }
      const mode = event.key === "1" ? "code" : event.key === "2" ? "split" : event.key === "3" ? "diagram" : undefined;
      if (mode) {
        event.preventDefault();
        update("viewMode", mode);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeTab, newDocument, openDocument, redo, saveDocument, tabs.activeId, undo, update, workspace.diagramKind]);

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (workspace.viewMode !== "split") return;
    const root = event.currentTarget.parentElement;
    if (!root) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      update("splitPercent", Math.min(80, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100)));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  const restorePreviousFocus = useCallback((preferred?: HTMLElement | SVGElement) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const remembered = lastDiagramFocusSelector.current
          ? document.querySelector<HTMLElement | SVGElement>(lastDiagramFocusSelector.current)
          : undefined;
        const target = preferred?.isConnected ? preferred : (remembered ?? lastDiagramFocus.current);
        if (target?.isConnected) target.focus({ preventScroll: true });
        else workspaceElement.current?.focus({ preventScroll: true });
      }),
    );
  }, []);
  const restoreRenamedDiagramFocus = useCallback(
    (kind: SemanticSymbolOccurrence["kind"], key: string | undefined) => {
      if (!key || !renameReturnFocus.current?.closest(".diagram")) {
        restorePreviousFocus(renameReturnFocus.current);
        return;
      }
      const attribute =
        kind === "task"
          ? "data-task-id"
          : kind === "participant"
            ? "data-sequence-participant-id"
            : kind === "actor" || kind === "usecase" || kind === "usecase-package"
              ? "data-usecase-object-id"
              : kind === "class-entity" || kind === "class-package"
                ? "data-class-object-id"
                : kind === "activity-action" || kind === "activity-partition"
                  ? "data-activity-object-id"
                  : kind === "wbs-node"
                    ? "data-wbs-node-id"
                    : undefined;
      const selector = attribute
        ? `[${attribute}="${CSS.escape(key)}"][tabindex], [${attribute}="${CSS.escape(key)}"] [tabindex]`
        : undefined;
      pendingDiagramFocusSelector.current = selector;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          const target = selector ? document.querySelector<HTMLElement | SVGElement>(selector) : undefined;
          if (target) {
            pendingDiagramFocusSelector.current = undefined;
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = selector;
            target.focus({ preventScroll: true });
          } else restorePreviousFocus();
        }),
      );
    },
    [restorePreviousFocus],
  );

  const sideInspectorOpen = Boolean(
    selectedTask ||
    selectedDependency ||
    selectedSequenceParticipant ||
    selectedSequenceMessage ||
    selectedSequenceStructure ||
    selectedUseCaseObjectId ||
    selectedClassObjectId ||
    selectedActivityObjectId ||
    selectedWbsNodeId ||
    selectedWbsRelationshipId ||
    sequenceSettingsOpen ||
    useCaseSettingsOpen ||
    classSettingsOpen ||
    activitySettingsOpen ||
    wbsSettingsOpen ||
    resourcePanelOpen ||
    unsupportedOpen ||
    problemsOpen,
  );

  return (
    <div
      className={`app${sideInspectorOpen ? " has-side-inspector" : ""}${projectInspectorOpen ? " has-project-inspector" : ""}`}
      data-theme={workspace.theme}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        const close = event.target.closest<HTMLButtonElement>(".task-inspector > header button");
        if (close) restorePreviousFocus(lastDiagramFocus.current);
      }}
    >
      <header className="toolbar">
        <strong>PlantUML Ultimate</strong>
        <div className="file-tools" aria-label="File controls">
          <FileMenu
            canExport={Boolean(result?.svg)}
            onNew={newDocument}
            onOpen={() => void openDocument()}
            onSave={() => void saveDocument()}
            onSaveAs={() => void saveDocumentAs()}
            onVersionHistory={() => void openVersionHistory()}
            onBackup={backupWorkspace}
            onRestore={() => void restoreWorkspace()}
            onExportSource={exportSource}
            onExportSvg={exportSvg}
            onExportPng={() => void exportPng()}
          />
          <AddMenu
            diagramKind={workspace.diagramKind}
            onTask={() => setAddTaskOpen(true)}
            onMilestone={() => setAddMilestoneOpen(true)}
            onDivider={() => setAddDividerOpen(true)}
            onParticipant={() => setAddSequenceParticipantOpen(true)}
            onMessage={() => setAddSequenceMessageOpen(true)}
            onFragment={() => setAddSequenceStructureKind("fragment")}
            onActivation={() => setAddSequenceStructureKind("activation")}
            onNote={() => setAddSequenceStructureKind("note")}
            onSequenceSpacing={() => setAddSequenceStructureKind("separator")}
            onReference={() => setAddSequenceStructureKind("reference")}
            onParticipantBox={() => setAddSequenceStructureKind("box")}
            onUseCaseActor={() => setAddUseCaseElementKind("actor")}
            onUseCase={() => setAddUseCaseElementKind("usecase")}
            onUseCaseRelationship={() => setAddUseCaseRelationshipOpen(true)}
            onUseCasePackage={() => setAddUseCasePackageOpen(true)}
            onUseCaseNote={() => setAddUseCaseNoteOpen(true)}
            onClassEntity={() => setAddClassEntityOpen(true)}
            onClassRelationship={() => setAddClassRelationshipOpen(true)}
            onClassPackage={() => setAddClassPackageOpen(true)}
            onClassNote={() => setAddClassNoteOpen(true)}
            onActivityAction={() => setAddActivityActionOpen(true)}
            onActivityPartition={() => setAddActivityPartitionOpen(true)}
            onActivityNote={() => setAddActivityNoteOpen(true)}
            onActivityStructure={() => setAddActivityStructureOpen(true)}
            onActivityTerminal={() => setAddActivityTerminalOpen(true)}
            onActivityArrow={() => setAddActivityArrowOpen(true)}
            onWbsNode={() => setAddWbsNodeOpen(true)}
          />
          {workspace.diagramKind === "gantt" && (
            <>
              <button data-inspector-trigger onClick={openProjectInspector}>
                Project
              </button>
              <button data-inspector-trigger onClick={openResourcePanel}>
                Resources
              </button>
            </>
          )}
          {workspace.diagramKind === "sequence" && (
            <button data-inspector-trigger onClick={() => setSequenceSettingsOpen(true)}>
              Sequence
            </button>
          )}
          {workspace.diagramKind === "usecase" && (
            <button
              data-inspector-trigger
              onClick={() => {
                setSelectedUseCaseObjectId(undefined);
                setUseCaseSettingsOpen(true);
              }}
            >
              Use Case
            </button>
          )}
          {workspace.diagramKind === "class" && (
            <button
              data-inspector-trigger
              onClick={() => {
                setSelectedClassObjectId(undefined);
                setClassSettingsOpen(true);
              }}
            >
              Class
            </button>
          )}
          {workspace.diagramKind === "activity" && (
            <button
              data-inspector-trigger
              onClick={() => {
                setSelectedActivityObjectId(undefined);
                setActivitySettingsOpen(true);
              }}
            >
              Activity
            </button>
          )}
          {workspace.diagramKind === "wbs" && (
            <button
              data-inspector-trigger
              onClick={() => {
                setSelectedWbsNodeId(undefined);
                setWbsSettingsOpen(true);
              }}
            >
              WBS
            </button>
          )}
          <button onClick={() => setPaletteOpen(true)} title="Command palette (Cmd/Ctrl+Shift+P)">
            ⌘
          </button>
          <button onClick={() => setHelpOpen(true)}>Help</button>
        </div>
        <nav aria-label="View mode">
          {(["code", "split", "diagram"] as ViewMode[]).map((mode, index) => (
            <button
              className={workspace.viewMode === mode ? "active" : ""}
              onClick={() => update("viewMode", mode)}
              key={mode}
            >
              {index + 1} · {mode}
            </button>
          ))}
        </nav>
        <div className="history-tools" aria-label="History controls">
          <button onClick={undo} disabled={!activeHistory.canUndo} aria-label="Undo">
            ↶
          </button>
          <button onClick={redo} disabled={!activeHistory.canRedo} aria-label="Redo">
            ↷
          </button>
        </div>
        {workspace.diagramKind === "gantt" && (
          <label className="resource-filter">
            Resource{" "}
            <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}>
              <option value="">All</option>
              {resourceNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        {workspace.diagramKind === "gantt" && (
          <label className="schedule-mode">
            Schedule{" "}
            <select
              value={scheduleMode}
              onChange={(event) => setScheduleMode(event.target.value as typeof scheduleMode)}
            >
              <option value="ask">Always ask</option>
              <option value="single">Only task</option>
              <option value="cascade">Include dependents</option>
            </select>
          </label>
        )}
        <label>
          Theme{" "}
          <select value={workspace.theme} onChange={(event) => update("theme", event.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <nav className="document-tabs" aria-label="Open documents">
        {tabs.documents.map((document) => (
          <button
            key={document.id}
            draggable
            className={`${document.id === tabs.activeId ? "active" : ""}${document.id === draggedTabId ? " dragging" : ""}`}
            onClick={() => activateTab(document.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setTabMenu({ id: document.id, x: event.clientX, y: event.clientY });
            }}
            onDragStart={(event) => {
              setDraggedTabId(document.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", document.id);
            }}
            onDragEnd={() => setDraggedTabId(undefined)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain") || draggedTabId;
              if (id) tabs.reorderDocument(id, document.id);
              setDraggedTabId(undefined);
            }}
            title={`${document.fileName}${document.dirty ? " — unsaved changes" : ""}`}
          >
            <span className="tab-label">
              <span className={`dirty-dot${document.dirty ? " visible" : ""}`} aria-hidden="true">
                ●
              </span>
              {tabLabels.get(document.id)}
            </span>
            <span
              className="tab-close"
              role="button"
              aria-label={`Close ${document.fileName}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(document.id);
              }}
            >
              ×
            </span>
          </button>
        ))}
        <button className="new-tab" onClick={newDocument} aria-label="New document tab">
          +
        </button>
      </nav>
      {tabMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Tab actions"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button role="menuitem" onClick={() => duplicateTab(tabMenu.id)}>
            Duplicate
          </button>
          <button role="menuitem" disabled={tabs.documents.length < 2} onClick={() => closeOtherTabs(tabMenu.id)}>
            Close other tabs
          </button>
          <button
            role="menuitem"
            onClick={() => {
              closeTab(tabMenu.id);
              setTabMenu(undefined);
            }}
          >
            Close
          </button>
        </div>
      )}
      <main
        ref={workspaceElement}
        tabIndex={-1}
        className={`workspace mode-${workspace.viewMode}`}
        onPointerDownCapture={(event) => {
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
            workspace.viewMode === "split"
              ? `min(${workspace.splitPercent}${sideInspectorOpen || projectInspectorOpen ? "vw" : "%"}, calc(100% - 205px)) 5px minmax(0, 1fr)`
              : undefined,
        }}
      >
        {workspace.viewMode !== "diagram" && (
          <CodeEditor
            diagramKind={workspace.diagramKind}
            value={workspace.source}
            onChange={(source) => commitSource(source, "Edit source", false)}
            selectedRange={selectionRequest}
            symbolHighlights={symbolHighlights}
            onRenameRequest={
              workspace.diagramKind === "gantt" ||
              workspace.diagramKind === "sequence" ||
              workspace.diagramKind === "usecase" ||
              workspace.diagramKind === "class" ||
              workspace.diagramKind === "activity" ||
              workspace.diagramKind === "wbs"
                ? requestSymbolRename
                : undefined
            }
            onSymbolContextMenu={
              workspace.diagramKind === "gantt" ||
              workspace.diagramKind === "sequence" ||
              workspace.diagramKind === "usecase" ||
              workspace.diagramKind === "class" ||
              workspace.diagramKind === "activity" ||
              workspace.diagramKind === "wbs"
                ? (position, x, y) => {
                    if (!symbolAt(position)) return false;
                    setSymbolMenu({ position, x, y });
                    return true;
                  }
                : undefined
            }
            onCursorChange={(line, column, position) => {
              update("cursor", { line, column });
              if (workspace.diagramKind === "gantt") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedTaskId(
                  occurrence?.kind === "task" ? occurrence.key : findTaskAt(parseResult.document, position)?.id,
                );
              } else if (workspace.diagramKind === "sequence") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedSequenceParticipantId(occurrence?.key);
                const object = findSequenceObjectAt(sequenceDocument, position);
                if (
                  object &&
                  sequenceDocument.participants.includes(object as (typeof sequenceDocument.participants)[number])
                )
                  selectSequenceParticipant(object.id, false);
                else if (object && "from" in object) selectSequenceMessage(object.id, false);
                else if (object) selectSequenceStructure(object.id, false);
                else if (!occurrence) {
                  setSelectedSequenceParticipantId(undefined);
                  setSelectedSequenceMessageId(undefined);
                  setSelectedSequenceStructureId(undefined);
                }
              } else if (workspace.diagramKind === "usecase") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedUseCaseId(occurrence?.key);
                if (!occurrence) setSelectedUseCaseObjectId(findUseCaseObjectAt(useCaseDocument, position)?.id);
              } else if (workspace.diagramKind === "class") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                const member = classDocument.entities
                  .flatMap((entity) => entity.members.map((item) => ({ entity, item })))
                  .find(({ item }) => position >= item.sourceRange.from && position <= item.sourceRange.to);
                setSourceHighlightedClassMemberId(member?.item.id);
                setSourceHighlightedClassEntityId(occurrence?.key ?? member?.entity.id);
                if (!occurrence && !member) setSelectedClassObjectId(findClassObjectAt(classDocument, position)?.id);
              } else if (workspace.diagramKind === "activity") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedActivityId(occurrence?.key);
                if (!occurrence) setSelectedActivityObjectId(findActivityObjectAt(activityDocument, position)?.id);
              } else {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedWbsNodeId(occurrence?.key);
                setWbsSettingsOpen(false);
                if (!occurrence) setSelectedWbsNodeId(findWbsNodeAt(wbsDocument, position)?.id);
              }
            }}
          />
        )}
        {workspace.viewMode === "split" && (
          <div className="divider" onPointerDown={resize} role="separator" aria-orientation="vertical" />
        )}
        {workspace.viewMode !== "code" &&
          (workspace.diagramKind === "gantt" ? (
            <DiagramPreview
              svg={result?.svg}
              tasks={parseResult.document.tasks}
              dependencies={parseResult.document.dependencies}
              dividers={parseResult.document.dividers}
              verticalSeparators={parseResult.document.verticalSeparators}
              source={workspace.source}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              selectedTaskId={selectedTaskId}
              highlightedTaskId={sourceHighlightedTaskId}
              onTaskSelect={selectTask}
              onNoteSelect={(taskId) => {
                selectTask(taskId);
                setFocusNoteTaskId(taskId);
              }}
              onBackgroundSelect={() => {
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setFocusNoteTaskId(undefined);
              }}
              onTaskMove={moveTask}
              onTaskReorder={reorderDiagramTask}
              onDividerReorder={reorderDiagramDivider}
              onVerticalSeparatorMove={(index, days) => {
                const separator = parseResult.document.verticalSeparators[index];
                if (!separator) return;
                const operation = moveVerticalSeparatorByDays(workspace.source, separator, days);
                if (operation.unavailableReason) {
                  setInteractionMessage(operation.unavailableReason);
                  return;
                }
                if (
                  commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Move vertical separator")
                )
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
              onTaskResize={resizeTask}
              onDependencyCreate={connectTasks}
              selectedDependencyIndex={selectedDependencyIndex}
              onDependencySelect={setSelectedDependencyIndex}
              onDependencyDelete={deleteDependency}
              onInteractionMessage={setInteractionMessage}
              resourceFilter={resourceFilter}
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
              onClearBaseline={() => {
                tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
                setBaselineVersion(undefined);
                setInteractionMessage("Baseline cleared");
              }}
            />
          ) : workspace.diagramKind === "sequence" ? (
            <SequenceDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              participants={sequenceDocument.participants}
              messages={sequenceDocument.messages}
              structures={sequenceStructures}
              selectedParticipantId={sourceHighlightedSequenceParticipantId ?? selectedSequenceParticipantId}
              selectedMessageId={selectedSequenceMessageId}
              selectedStructureId={selectedSequenceStructureId}
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
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={useCaseDocument}
              selectedId={selectedUseCaseObjectId ?? sourceHighlightedUseCaseId}
              onSelect={(id) => {
                setUseCaseSettingsOpen(false);
                setSelectedUseCaseObjectId(id);
                const object = [
                  ...useCaseDocument.elements,
                  ...useCaseDocument.packages,
                  ...useCaseDocument.notes,
                ].find((item) => item.id === id);
                if (object) setSelectionRequest({ ...object.sourceRange });
              }}
              onRelationshipCreate={createUseCaseRelationshipByDrag}
              onRelationshipReconnect={reconnectUseCaseRelationshipByDrag}
              onMoveToPackage={moveUseCaseElementByDrag}
              onReorder={reorderUseCaseElementByDrag}
            />
          ) : workspace.diagramKind === "class" ? (
            <ClassDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={classDocument}
              selectedId={
                selectedClassRelationship
                  ? selectedClassObjectId
                  : (sourceHighlightedClassEntityId ?? selectedClassObjectId)
              }
              highlightedMemberId={sourceHighlightedClassMemberId}
              onSelect={(id) => {
                setClassSettingsOpen(false);
                setSourceHighlightedClassMemberId(undefined);
                setSelectedClassObjectId(id);
                const x = [
                  ...classDocument.entities,
                  ...classDocument.packages,
                  ...classDocument.relationships,
                  ...classDocument.notes,
                ].find((x) => x.id === id);
                if (x) setSelectionRequest({ ...x.sourceRange });
              }}
              onMemberSelect={(entityId, memberId) => {
                setClassSettingsOpen(false);
                setSelectedClassObjectId(entityId);
                setSourceHighlightedClassMemberId(memberId);
                const member = classDocument.entities
                  .find((item) => item.id === entityId)
                  ?.members.find((item) => item.id === memberId);
                if (member) setSelectionRequest({ ...member.sourceRange });
              }}
              onBackgroundSelect={() => {
                setSelectedClassObjectId(undefined);
                setClassSettingsOpen(false);
              }}
              onRelationshipCreate={createClassRelationshipByDrag}
              onRelationshipReconnect={reconnectClassRelationshipByDrag}
              onMoveToPackage={moveClassEntityByDrag}
              onReorder={reorderClassEntityByDrag}
            />
          ) : workspace.diagramKind === "activity" ? (
            <ActivityDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={activityDocument}
              selectedId={sourceHighlightedActivityId ?? selectedActivityObjectId}
              onSelect={(id) => {
                setSelectedActivityObjectId(id);
                const object = [
                  ...activityDocument.nodes,
                  ...activityDocument.controls,
                  ...activityDocument.partitions,
                  ...activityDocument.notes,
                  ...activityDocument.arrows,
                ].find((item) => item.id === id);
                if (object) setSelectionRequest({ ...object.sourceRange });
              }}
              onBackgroundSelect={() => setSelectedActivityObjectId(undefined)}
              onReorder={reorderActivityActionByDrag}
            />
          ) : (
            <WbsDiagramPreview
              svg={result?.svg}
              document={wbsDocument}
              selectedId={sourceHighlightedWbsNodeId ?? selectedWbsNodeId}
              selectedRelationshipId={selectedWbsRelationshipId}
              zoom={workspace.zoom}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              onZoomChange={(zoom) => update("zoom", zoom)}
              onSelect={(id) => {
                setWbsSettingsOpen(false);
                setSelectedWbsNodeId(id);
                if (id) setSelectedWbsRelationshipId(undefined);
                const node = wbsDocument.nodes.find((item) => item.id === id);
                if (node) setSelectionRequest({ ...node.sourceRange });
              }}
              onRelationshipSelect={(id) => {
                setWbsSettingsOpen(false);
                setSelectedWbsRelationshipId(id);
                if (id) setSelectedWbsNodeId(undefined);
                const relationship = wbsDocument.relationships.find((item) => item.id === id);
                if (relationship) setSelectionRequest({ ...relationship.sourceRange });
              }}
              onMove={moveWbsNode}
              onRelationshipCreate={createWbsRelationship}
              onRelationshipReconnect={reconnectWbsArrow}
            />
          ))}
      </main>
      <footer className="statusbar">
        <span role="status" aria-live="polite">
          {interactionMessage ??
            (result?.error ? `⚠ ${result.error}` : diagnosticCount ? "Source has problems" : "✓ Valid")}
        </span>
        {diagnosticCount > 0 && (
          <button
            type="button"
            className="problem-count"
            onClick={() => {
              setProblemsOpen(true);
              setUnsupportedOpen(false);
            }}
          >
            ⚠ {diagnosticCount} problem{diagnosticCount === 1 ? "" : "s"}
          </button>
        )}
        {unsupportedCount > 0 && (
          <button
            type="button"
            className="unsupported-count"
            onClick={() => {
              setUnsupportedOpen(true);
              setSelectedTaskId(undefined);
              setSelectedDependencyIndex(undefined);
              setProjectInspectorOpen(false);
              setResourcePanelOpen(false);
            }}
          >
            {unsupportedCount} preserved line{unsupportedCount === 1 ? "" : "s"}
          </button>
        )}
        <span>
          {workspace.diagramKind === "sequence"
            ? "Sequence"
            : workspace.diagramKind === "usecase"
              ? "Use Case"
              : workspace.diagramKind === "class"
                ? "Class"
                : workspace.diagramKind === "activity"
                  ? "Activity"
                  : workspace.diagramKind === "wbs"
                    ? "WBS"
                    : "Gantt"}
        </span>
        <span>
          {workspace.viewMode === "code"
            ? "Preview paused"
            : status === "rendering"
              ? "Rendering…"
              : `Render ${Math.round(result?.durationMs ?? 0)} ms`}
        </span>
        <span>
          Ln {workspace.cursor.line}, Col {workspace.cursor.column}
        </span>
        <span>{hydrated ? "IndexedDB" : "Restoring…"}</span>
      </footer>
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {newDocumentOpen && <NewDocumentDialog onChoose={createDocument} onClose={() => setNewDocumentOpen(false)} />}
      {addWbsNodeOpen && (
        <AddWbsNodeDialog
          selected={selectedWbsNode}
          hasRoot={wbsDocument.roots.length > 0}
          onAdd={addWbsNode}
          onClose={() => setAddWbsNodeOpen(false)}
        />
      )}
      {wbsSettingsOpen && (
        <WbsSettingsInspector
          source={workspace.source}
          onApply={applyWbsSettings}
          onClose={() => setWbsSettingsOpen(false)}
        />
      )}
      {selectedWbsNode && (
        <WbsNodeInspector
          key={`${selectedWbsNode.id}:${selectedWbsNode.sourceRange.to}`}
          node={selectedWbsNode}
          onApply={applyWbsNode}
          onDelete={removeWbsNode}
          onAddChild={() => setAddWbsNodeOpen(true)}
          onClose={() => setSelectedWbsNodeId(undefined)}
        />
      )}
      {selectedWbsRelationship && (
        <WbsRelationshipInspector
          key={`${selectedWbsRelationship.id}:${selectedWbsRelationship.sourceRange.to}`}
          relationship={selectedWbsRelationship}
          document={wbsDocument}
          onApply={applyWbsRelationshipColor}
          onDelete={removeWbsRelationship}
          onClose={() => setSelectedWbsRelationshipId(undefined)}
        />
      )}
      {addActivityActionOpen && (
        <AddActivityActionDialog
          document={activityDocument}
          onAdd={addActivityAction}
          onClose={() => setAddActivityActionOpen(false)}
        />
      )}
      {addActivityPartitionOpen && (
        <AddActivityPartitionDialog
          document={activityDocument}
          onAdd={addActivityPartition}
          onClose={() => setAddActivityPartitionOpen(false)}
        />
      )}
      {addActivityNoteOpen && (
        <AddActivityNoteDialog
          document={activityDocument}
          onAdd={addActivityNote}
          onClose={() => setAddActivityNoteOpen(false)}
        />
      )}
      {addActivityStructureOpen && (
        <AddActivityStructureDialog
          document={activityDocument}
          onAdd={addActivityStructure}
          onClose={() => setAddActivityStructureOpen(false)}
        />
      )}
      {addActivityTerminalOpen && (
        <AddActivityTerminalDialog onAdd={addActivityTerminal} onClose={() => setAddActivityTerminalOpen(false)} />
      )}
      {addActivityArrowOpen && (
        <AddActivityArrowDialog
          document={activityDocument}
          onAdd={addActivityArrow}
          onClose={() => setAddActivityArrowOpen(false)}
        />
      )}
      {addSequenceParticipantOpen && (
        <AddSequenceParticipantDialog
          onAdd={addSequenceParticipant}
          onClose={() => setAddSequenceParticipantOpen(false)}
        />
      )}
      {addUseCaseElementKind && (
        <AddUseCaseElementDialog
          initialKind={addUseCaseElementKind}
          onAdd={addUseCaseElement}
          onClose={() => setAddUseCaseElementKind(undefined)}
        />
      )}
      {addUseCaseRelationshipOpen && (
        <AddUseCaseRelationshipDialog
          elements={useCaseDocument.elements}
          onAdd={addUseCaseRelationship}
          onClose={() => setAddUseCaseRelationshipOpen(false)}
        />
      )}
      {addUseCasePackageOpen && (
        <AddUseCasePackageDialog onAdd={addUseCasePackage} onClose={() => setAddUseCasePackageOpen(false)} />
      )}
      {addUseCaseNoteOpen && (
        <AddUseCaseNoteDialog
          elements={useCaseDocument.elements}
          onAdd={addUseCaseNote}
          onClose={() => setAddUseCaseNoteOpen(false)}
        />
      )}
      {addSequenceMessageOpen && (
        <AddSequenceMessageDialog
          participants={sequenceDocument.participants.map((participant) => participant.alias ?? participant.label)}
          onAdd={addSequenceMessage}
          onClose={() => setAddSequenceMessageOpen(false)}
        />
      )}
      {addSequenceStructureKind && (
        <AddSequenceStructureDialog
          initialKind={addSequenceStructureKind}
          participants={sequenceParticipantNames}
          anchors={sequenceDocument.messages.flatMap((message) => (message.anchor ? [message.anchor] : []))}
          onAdd={addSequenceStructure}
          onClose={() => setAddSequenceStructureKind(undefined)}
        />
      )}
      {addTaskOpen && (
        <AddTaskDialog
          taskLabels={parseResult.document.tasks.map((task) => task.label)}
          defaultStartDate={
            parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
          }
          onAdd={addTask}
          onClose={() => setAddTaskOpen(false)}
        />
      )}
      {addDividerOpen && (
        <AddDividerDialog
          tasks={parseResult.document.tasks}
          onAdd={addDivider}
          onClose={() => setAddDividerOpen(false)}
        />
      )}
      {addMilestoneOpen && (
        <AddMilestoneDialog
          taskLabels={parseResult.document.tasks.map((task) => task.label)}
          onAdd={addMilestone}
          onClose={() => setAddMilestoneOpen(false)}
        />
      )}
      {projectInspectorOpen && (
        <ProjectInspector
          settings={parseProjectSettings(workspace.source)}
          onApply={applyProjectSettings}
          onClose={() => setProjectInspectorOpen(false)}
        />
      )}
      {sequenceSettingsOpen && (
        <SequenceSettingsInspector
          settings={parseSequenceSettings(workspace.source)}
          onApply={applySequenceSettings}
          onClose={() => setSequenceSettingsOpen(false)}
        />
      )}
      {useCaseSettingsOpen && (
        <UseCaseSettingsInspector
          settings={parseUseCaseSettings(workspace.source)}
          onChange={applyUseCaseSettings}
          onClose={() => setUseCaseSettingsOpen(false)}
        />
      )}
      {activitySettingsOpen && (
        <ActivitySettingsInspector
          settings={parseActivitySettings(workspace.source)}
          onChange={applyActivitySettings}
          onClose={() => setActivitySettingsOpen(false)}
        />
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
            await recordDocumentVersion("manual", label || "Manual version");
            setInteractionMessage("Created document version");
          }}
          onRestore={restoreDocumentVersion}
          onUpdate={editDocumentVersion}
          onDelete={removeDocumentVersion}
          baselineVersionId={activeDocument.baselineVersionId}
          onSetBaseline={async (version) => {
            if (version) await updateDocumentVersion(version.id, { pinned: true });
            tabs.setDocumentBaselineVersionId(tabs.activeId, version?.id);
            setBaselineVersion(version ? { ...version, pinned: true } : undefined);
            setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
            setInteractionMessage(version ? "Baseline version selected" : "Baseline cleared");
          }}
          onClose={() => setVersionHistoryOpen(false)}
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
      {selectedSequenceParticipant && (
        <SequenceParticipantInspector
          key={`${selectedSequenceParticipant.id}:${selectedSequenceParticipant.sourceRange.to}`}
          participant={selectedSequenceParticipant}
          onApply={applySequenceParticipant}
          onDelete={removeSequenceParticipant}
          onClose={() => setSelectedSequenceParticipantId(undefined)}
        />
      )}
      {selectedUseCaseElement && (
        <UseCaseElementInspector
          key={`${selectedUseCaseElement.id}:${selectedUseCaseElement.sourceRange.to}`}
          element={selectedUseCaseElement}
          onChange={applyUseCaseElement}
          onDelete={removeUseCaseElement}
          onClose={() => setSelectedUseCaseObjectId(undefined)}
          packages={useCaseDocument.packages}
          onPackageChange={moveSelectedUseCaseElementToPackage}
        />
      )}
      {selectedUseCaseRelationship && (
        <UseCaseRelationshipInspector
          key={`${selectedUseCaseRelationship.id}:${selectedUseCaseRelationship.sourceRange.to}`}
          relationship={selectedUseCaseRelationship}
          elements={useCaseDocument.elements}
          onChange={applyUseCaseRelationship}
          onDelete={removeUseCaseRelationship}
          onClose={() => setSelectedUseCaseObjectId(undefined)}
        />
      )}
      {selectedUseCasePackage && (
        <UseCasePackageInspector
          key={`${selectedUseCasePackage.id}:${selectedUseCasePackage.sourceRange.to}`}
          item={selectedUseCasePackage}
          onChange={applyUseCasePackage}
          onDelete={removeUseCasePackage}
          onClose={() => setSelectedUseCaseObjectId(undefined)}
        />
      )}
      {selectedUseCaseNote && (
        <UseCaseNoteInspector
          key={`${selectedUseCaseNote.id}:${selectedUseCaseNote.sourceRange.to}`}
          note={selectedUseCaseNote}
          elements={useCaseDocument.elements}
          onChange={applyUseCaseNote}
          onDelete={removeUseCaseNote}
          onClose={() => setSelectedUseCaseObjectId(undefined)}
        />
      )}
      {selectedClassEntity && (
        <ClassEntityInspector
          entity={selectedClassEntity}
          entities={classDocument.entities}
          packages={classDocument.packages}
          onChange={applyClassEntity}
          onPackageChange={moveSelectedClassEntity}
          onDelete={removeClassEntity}
          onMemberAdd={addClassMember}
          onMemberChange={applyClassMember}
          onMemberDelete={removeClassMember}
          onMemberMove={moveClassMember}
          onMemberReveal={(member) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...member.sourceRange });
          }}
          onClose={() => setSelectedClassObjectId(undefined)}
        />
      )}
      {selectedActivityAction && (
        <ActivityActionInspector
          item={selectedActivityAction}
          document={activityDocument}
          onChange={applyActivityAction}
          onPartitionChange={moveActivityActionPartition}
          onDelete={removeActivityAction}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedActivityControl && (
        <ActivityControlInspector
          item={selectedActivityControl}
          onChange={applyActivityControl}
          onDelete={removeActivityControl}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedActivityTerminal && (
        <ActivityTerminalInspector
          item={selectedActivityTerminal}
          onDelete={removeActivityTerminal}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedActivityArrow && (
        <ActivityArrowInspector
          item={selectedActivityArrow}
          onChange={applyActivityArrow}
          onDelete={removeActivityArrow}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedActivityPartition && (
        <ActivityPartitionInspector
          item={selectedActivityPartition}
          document={activityDocument}
          onChange={applyActivityPartition}
          onParentChange={moveSelectedActivityPartition}
          onDelete={removeActivityPartition}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedActivityNote && (
        <ActivityNoteInspector
          item={selectedActivityNote}
          document={activityDocument}
          onChange={applyActivityNote}
          onDelete={removeActivityNote}
          onClose={() => setSelectedActivityObjectId(undefined)}
        />
      )}
      {selectedClassRelationship && (
        <ClassRelationshipInspector
          item={selectedClassRelationship}
          document={classDocument}
          onChange={applyClassRelationship}
          onDelete={removeClassRelationship}
          onClose={() => setSelectedClassObjectId(undefined)}
        />
      )}
      {selectedClassPackage && (
        <ClassPackageInspector
          item={selectedClassPackage}
          packages={classDocument.packages}
          onChange={applyClassPackage}
          onParentChange={moveSelectedClassPackage}
          onDelete={removeClassPackage}
          onClose={() => setSelectedClassObjectId(undefined)}
        />
      )}
      {addClassEntityOpen && (
        <AddClassEntityDialog onAdd={addClassEntity} onClose={() => setAddClassEntityOpen(false)} />
      )}
      {addClassRelationshipOpen && (
        <AddClassRelationshipDialog
          document={classDocument}
          onAdd={addClassRelationship}
          onClose={() => setAddClassRelationshipOpen(false)}
        />
      )}
      {addClassPackageOpen && (
        <AddClassPackageDialog
          document={classDocument}
          onAdd={addClassPackage}
          onClose={() => setAddClassPackageOpen(false)}
        />
      )}
      {classSettingsOpen && (
        <ClassSettingsInspector
          settings={parseClassSettings(workspace.source)}
          onChange={applyClassSettings}
          onClose={() => setClassSettingsOpen(false)}
        />
      )}
      {selectedClassNote && (
        <ClassNoteInspector
          item={selectedClassNote}
          document={classDocument}
          onChange={applyClassNote}
          onDelete={removeClassNote}
          onClose={() => setSelectedClassObjectId(undefined)}
        />
      )}{" "}
      {addClassNoteOpen && (
        <AddClassNoteDialog document={classDocument} onAdd={addClassNote} onClose={() => setAddClassNoteOpen(false)} />
      )}
      {selectedSequenceMessage && (
        <SequenceMessageInspector
          key={`${selectedSequenceMessage.id}:${selectedSequenceMessage.sourceRange.to}`}
          message={selectedSequenceMessage}
          participants={sequenceParticipantNames}
          onApply={applySequenceMessage}
          onDelete={removeSequenceMessage}
          onClose={() => setSelectedSequenceMessageId(undefined)}
        />
      )}
      {selectedSequenceStructure && (
        <SequenceStructureInspector
          key={`${selectedSequenceStructure.id}:${selectedSequenceStructure.sourceRange.to}`}
          structure={selectedSequenceStructure}
          participants={sequenceParticipantNames}
          anchors={sequenceDocument.messages.flatMap((message) => (message.anchor ? [message.anchor] : []))}
          onApply={applySequenceStructure}
          onDelete={removeSequenceStructure}
          onClose={() => setSelectedSequenceStructureId(undefined)}
        />
      )}
      {selectedTask?.milestone && (
        <MilestoneInspector
          key={`${selectedTask.id}:${selectedTask.sourceRange.to}:${selectedTaskDependency?.predecessorTaskId ?? ""}:${selectedTaskDependency?.relation ?? ""}`}
          milestone={selectedTask}
          tasks={parseResult.document.tasks}
          relativeAnchor={
            workspace.source
              .slice(
                selectedTask.declarations.find((item) => item.kind === "milestone")?.range.from ?? 0,
                selectedTask.declarations.find((item) => item.kind === "milestone")?.range.to ?? 0,
              )
              .match(/'s\s+(start|end)/i)?.[1]
              ?.toLowerCase() === "start"
              ? "start"
              : "end"
          }
          onApply={applyMilestoneInspector}
          onDelete={deleteSelectedTask}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
      {selectedTask && !selectedTask.milestone && (
        <TaskInspector
          key={selectedTask.id}
          task={selectedTask}
          tasks={parseResult.document.tasks}
          predecessorId={selectedPredecessorId}
          dependencyRelation={selectedTaskDependency?.relation ?? "start-after-end"}
          effectiveStart={resolvedTaskDates.get(selectedTask.id)?.start ?? ""}
          effectiveEnd={resolvedTaskDates.get(selectedTask.id)?.end ?? ""}
          calendar={ganttCalendar}
          resourceNames={resourceNames}
          conflicts={selectedResourceConflicts}
          focusNote={focusNoteTaskId === selectedTask.id}
          onApply={applyTaskInspector}
          onDelete={deleteSelectedTask}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
      {selectedDependency && (
        <DependencyInspector
          key={`${selectedDependency.sourceRange.from}:${selectedDependency.sourceRange.to}`}
          dependency={selectedDependency}
          tasks={parseResult.document.tasks}
          onApply={applyDependencyInspector}
          onDelete={deleteDependency}
          onClose={() => setSelectedDependencyIndex(undefined)}
        />
      )}
      {selectedDividerIndex !== undefined && parseResult.document.dividers[selectedDividerIndex] && (
        <DividerInspector
          divider={parseResult.document.dividers[selectedDividerIndex]!}
          onApply={applyDividerInspector}
          onDelete={deleteSelectedDivider}
          onClose={() => setSelectedDividerIndex(undefined)}
        />
      )}
      {selectedVerticalSeparatorIndex !== undefined &&
        parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex] && (
          <VerticalSeparatorInspector
            separator={parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex]!}
            tasks={parseResult.document.tasks}
            onApply={(value: VerticalSeparatorValue) => {
              const separator = parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];
              if (!separator) return;
              const operation = updateVerticalSeparator(separator, value);
              if (operation.unavailableReason) {
                setInteractionMessage(operation.unavailableReason);
                return;
              }
              if (
                commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Update vertical separator")
              )
                setInteractionMessage("Updated vertical separator");
            }}
            onDelete={() => {
              const separator = parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];
              if (!separator || !window.confirm("Delete this vertical separator?")) return;
              if (
                commitGeneratedSource(
                  applySourceEdits(workspace.source, deleteVerticalSeparator(workspace.source, separator).edits),
                  "Delete vertical separator",
                )
              ) {
                setSelectedVerticalSeparatorIndex(undefined);
                setInteractionMessage("Deleted vertical separator");
              }
            }}
            onClose={() => setSelectedVerticalSeparatorIndex(undefined)}
          />
        )}
      {legendInspectorOpen && (
        <LegendInspector
          entries={legendEntries}
          focusColor={legendFocusColor}
          onApply={(entries) => {
            const labels = new Map(entries.map((entry) => [entry.color.toLowerCase(), entry.label]));
            const source = synchronizeLegend(workspace.source, parseResult.document.tasks, labels);
            if (commitGeneratedSource(source, "Update legend labels")) {
              setLegendInspectorOpen(false);
              setLegendFocusColor(undefined);
              setInteractionMessage("Updated legend labels");
            }
          }}
          onClose={() => {
            setLegendInspectorOpen(false);
            setLegendFocusColor(undefined);
          }}
        />
      )}
      {resourcePanelOpen && (
        <ResourceWorkloadPanel
          tasks={parseResult.document.tasks}
          resolvedDates={resolvedTaskDates}
          calendar={ganttCalendar}
          capacities={resourceCapacities}
          onCapacityChange={(name, capacity) =>
            updateResourceCapacities((current) => ({
              ...current,
              [name]: Math.max(1, Number.isFinite(capacity) ? capacity : 100),
            }))
          }
          onRename={(currentName, nextName) => {
            const operation = renameResource(parseResult.document, currentName, nextName, workspace.source);
            if (operation.unavailableReason) {
              setInteractionMessage(operation.unavailableReason);
              return;
            }
            if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Rename ${currentName}`))
              return;
            renameCapacity(currentName, nextName);
            setResourceFilter((current) => (current === currentName ? nextName : current));
            setInteractionMessage(`Renamed ${currentName} to ${nextName}`);
          }}
          onFilter={(name) => setResourceFilter(name)}
          onTaskSelect={(id) => {
            setResourcePanelOpen(false);
            selectTask(id);
          }}
          onClose={() => setResourcePanelOpen(false)}
        />
      )}
      {unsupportedOpen && (
        <UnsupportedSyntaxPanel
          items={workspace.diagramKind === "wbs" ? wbsDocument.unknown : parseResult.document.unknown}
          onReveal={(item) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...item.range });
            setUnsupportedOpen(false);
          }}
          onClose={() => setUnsupportedOpen(false)}
        />
      )}
      {problemsOpen && (
        <ProblemsPanel
          source={problemPreview?.source ?? workspace.source}
          diagnostics={problemPreview?.diagnostics ?? activeDiagnostics}
          quickFixes={problemPreview ? [] : activeQuickFixes}
          notice={problemPreview?.message}
          onReveal={(diagnostic) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ from: diagnostic.from, to: diagnostic.to });
          }}
          onApplyFix={(fix) => {
            const source = `${workspace.source.slice(0, fix.from)}${fix.replacement}${workspace.source.slice(fix.to)}`;
            commitSource(source, fix.message);
            setInteractionMessage(fix.message);
          }}
          onClose={() => {
            setProblemsOpen(false);
            setProblemPreview(undefined);
          }}
        />
      )}
      {schedulePreview && (
        <SchedulePreviewDialog
          preview={schedulePreview}
          onChoose={(cascade) => {
            if (
              commitGeneratedSource(
                cascade ? schedulePreview.cascadeSource : schedulePreview.singleSource,
                `${schedulePreview.action} ${schedulePreview.taskLabel}${cascade ? " with dependents" : ""}`,
              )
            )
              setSchedulePreview(undefined);
          }}
          onClose={() => setSchedulePreview(undefined)}
        />
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {classMemberMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Class member actions"
          style={{ left: classMemberMenu.x, top: classMemberMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") setClassMemberMenu(undefined);
          }}
        >
          <button
            autoFocus
            role="menuitem"
            onClick={() => {
              setSelectedClassObjectId(classMemberMenu.entityId);
              setClassMemberMenu(undefined);
            }}
          >
            Edit member
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const member = classDocument.entities
                .find((item) => item.id === classMemberMenu.entityId)
                ?.members.find((item) => item.id === classMemberMenu.memberId);
              if (member) {
                if (workspace.viewMode === "diagram") update("viewMode", "split");
                setSelectionRequest({ ...member.sourceRange });
              }
              setClassMemberMenu(undefined);
            }}
          >
            Reveal in code
          </button>
        </div>
      )}
      {symbolMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Symbol actions"
          style={{ left: symbolMenu.x, top: symbolMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSymbolMenu(undefined);
          }}
        >
          <button
            autoFocus
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              const request = occurrence ? symbolProvider.renameRequest(occurrence) : undefined;
              if (request) setRenameSymbol(request);
              setSymbolMenu(undefined);
            }}
          >
            Rename…
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence)
                setReferenceSymbol({ kind: occurrence.kind, key: occurrence.key, label: occurrence.value });
              setSymbolMenu(undefined);
            }}
          >
            Find references
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              const declaration = occurrence
                ? (occurrencesFor(occurrence).find((item) => item.role === "declaration") ?? occurrence)
                : undefined;
              if (declaration) {
                if (workspace.viewMode === "diagram") update("viewMode", "split");
                setSelectionRequest({ ...declaration.range });
              }
              setSymbolMenu(undefined);
            }}
          >
            Reveal declaration
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence) navigateOccurrence(occurrence, -1);
              setSymbolMenu(undefined);
            }}
          >
            Previous reference
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence) navigateOccurrence(occurrence, 1);
              setSymbolMenu(undefined);
            }}
          >
            Next reference
          </button>
        </div>
      )}
      {referenceSymbol && (
        <SymbolReferencesPanel
          label={referenceSymbol.label}
          source={workspace.source}
          occurrences={occurrencesFor(referenceSymbol)}
          onSelect={(occurrence) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...occurrence.range });
          }}
          onClose={() => setReferenceSymbol(undefined)}
        />
      )}
      {renameSymbol && (
        <RenameSymbolDialog
          kind={renameSymbol.mode}
          value={renameSymbol.occurrence.value}
          validate={(value) => symbolProvider.validateRename(renameSymbol, value)}
          occurrenceCount={symbolProvider.renameOccurrenceCount(renameSymbol)}
          occurrences={symbolProvider.renameOccurrences(renameSymbol)}
          source={workspace.source}
          onRename={(nextValue) => {
            const target = renameSymbol;
            const result = symbolProvider.rename(target, nextValue);
            if (result.error || !result.source) {
              setInteractionMessage(result.error ?? "Rename made no changes");
              return;
            }
            if (result.validateGenerated) {
              if (!commitGeneratedSource(result.source, `Rename ${target.mode}`)) return;
            } else commitSource(result.source, `Rename ${target.mode}`);
            if (result.personRename) {
              renameCapacity(result.personRename.from, result.personRename.to);
              setResourceFilter((current) =>
                current.toLocaleLowerCase() === result.personRename!.from.toLocaleLowerCase()
                  ? result.personRename!.to
                  : current,
              );
            }
            if (result.nextKey) {
              if (target.occurrence.kind === "participant") setSourceHighlightedSequenceParticipantId(result.nextKey);
              else if (target.occurrence.kind === "actor" || target.occurrence.kind === "usecase")
                setSourceHighlightedUseCaseId(result.nextKey);
              else if (target.occurrence.kind === "class-entity") setSourceHighlightedClassEntityId(result.nextKey);
              else if (target.occurrence.kind === "activity-action" || target.occurrence.kind === "activity-partition")
                setSourceHighlightedActivityId(result.nextKey);
              else if (target.occurrence.kind === "wbs-node") setSourceHighlightedWbsNodeId(result.nextKey);
            }
            if (referenceSymbol?.kind === target.occurrence.kind && referenceSymbol.key === target.occurrence.key)
              setReferenceSymbol({
                kind: target.occurrence.kind,
                key: result.nextKey ?? target.occurrence.key,
                label: nextValue.trim(),
              });
            setRenameSymbol(undefined);
            setInteractionMessage(`Renamed ${target.occurrence.value} to ${nextValue.trim()}`);
            restoreRenamedDiagramFocus(target.occurrence.kind, result.nextKey);
          }}
          onClose={() => {
            setRenameSymbol(undefined);
            restorePreviousFocus(renameReturnFocus.current);
          }}
        />
      )}
    </div>
  );
}

function findResourceConflicts(
  task: import("@plantuml-studio/diagram-gantt").GanttTask,
  tasks: readonly import("@plantuml-studio/diagram-gantt").GanttTask[],
): string[] {
  if (!task.start?.resolved || !task.duration || !task.resources?.length) return [];
  const start = Date.parse(`${task.start.value}T00:00:00Z`);
  const end =
    start +
    task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1) * 86_400_000;
  const names = new Set(task.resources.map((item) => item.value.toLocaleLowerCase()));
  return tasks
    .filter(
      (other) =>
        other.id !== task.id &&
        other.start?.resolved &&
        other.duration &&
        other.resources?.some((item) => names.has(item.value.toLocaleLowerCase())),
    )
    .filter((other) => {
      const otherStart = Date.parse(`${other.start!.value}T00:00:00Z`);
      const otherEnd =
        otherStart +
        other.duration!.value *
          (other.duration!.unit === "month" ? 30 : other.duration!.unit === "week" ? 7 : 1) *
          86_400_000;
      return start < otherEnd && otherStart < end;
    })
    .map((other) => other.label);
}
