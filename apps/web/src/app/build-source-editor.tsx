import { CodeEditor, type SourceRepairRequest } from "../CodeEditor";
import { SOURCE_EDIT_DESCRIPTION, type SourceProblemPreview } from "../features/documents/use-source-commands";
import { findTaskAt, parseGantt } from "@plantuml-studio/diagram-gantt";
import { findSequenceObjectAt } from "@plantuml-studio/diagram-sequence";
import { findUseCaseObjectAt } from "@plantuml-studio/diagram-usecase";
import { findClassObjectAt } from "@plantuml-studio/diagram-class";
import { findActivityObjectAt } from "@plantuml-studio/diagram-activity";
import { findWbsNodeAt } from "@plantuml-studio/diagram-wbs";
import type { CollaborationParticipant } from "../collaboration";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type { DiagramAnalysis } from "../diagram-diagnostics";
import type { DiagramKind } from "../model";
import type { ClassDocument } from "../../../../packages/diagram-class/src/model";
import type { ActiveCollaboration, RemoteEditFlash } from "../use-collaboration-lifecycle";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { RepairCategory } from "../remaining-repair-summary";
import type { SequenceDocument } from "../../../../packages/diagram-sequence/src/index";
import type { Dispatch, SetStateAction } from "react";
import type { SemanticSymbolOccurrence } from "../semantic-symbol-provider";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";
import type { WbsDocument } from "../../../../packages/diagram-wbs/src/model";

export interface buildSourceEditorInputs {
  activeParticipants: CollaborationParticipant[];
  activityDocument: ActivityDocument;
  analyzeSource: (kind: DiagramKind, source: string, initialParse?: ReturnType<typeof parseGantt>) => DiagramAnalysis;
  classDocument: ClassDocument;
  clearSequenceSelection: () => void;
  collaboration: ActiveCollaboration | undefined;
  collaborationAppliesToActiveDiagram: boolean;
  commitSource: (
    source: string,
    description: string,
    validate?: boolean,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  openFormatSource: () => void;
  parseResult: DiagramParseResult<GanttDocument>;
  problemsOpen: boolean;
  projectInspectorOpen: boolean;
  remoteEditFlash: RemoteEditFlash | undefined;
  repairCategoryFilter: { source: string; documentId: string; category: RepairCategory } | undefined;
  repairHost: HTMLDivElement | null;
  repairRequest: SourceRepairRequest | undefined;
  requestSymbolRename: (position: number) => boolean;
  resourcePanelOpen: boolean;
  selectActivityFromSource: (highlightedId: string | undefined, fallbackObjectId?: string) => void;
  selectClassFromSource: (
    highlightedEntityId: string | undefined,
    highlightedMemberId: string | undefined,
    fallbackObjectId?: string,
  ) => void;
  selectSequenceMessage: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceParticipant: (id: string | undefined, reveal?: boolean) => void;
  selectSequenceStructure: (id: string | undefined, reveal?: boolean) => void;
  selectUseCaseFromSource: (highlightedId: string | undefined, fallbackObjectId?: string) => void;
  selectWbsFromSource: (highlightedId: string | undefined, fallbackNodeId?: string) => void;
  selectionRequest: { from: number; to: number } | undefined;
  sequenceDocument: SequenceDocument;
  setProblemPreview: Dispatch<SetStateAction<SourceProblemPreview | undefined>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setRepairCategoryFilter: Dispatch<
    SetStateAction<{ source: string; documentId: string; category: RepairCategory } | undefined>
  >;
  setRepairRequest: Dispatch<SetStateAction<SourceRepairRequest | undefined>>;
  setSourceHighlightedSequenceParticipantId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSourceSymbol: Dispatch<SetStateAction<Pick<SemanticSymbolOccurrence, "kind" | "key"> | undefined>>;
  setSourceSymbolPosition: Dispatch<SetStateAction<number | undefined>>;
  setSymbolMenu: Dispatch<
    SetStateAction<{ position?: number; occurrence?: SemanticSymbolOccurrence; x: number; y: number } | undefined>
  >;
  setUnsupportedOpen: (value: SetStateAction<boolean>) => void;
  symbolAt: (position: number) => SemanticSymbolOccurrence | undefined;
  symbolHighlights: (
    | { active: boolean; from: number; to: number }
    | { active: boolean; from: number; to: number }
    | { active: boolean; from: number; to: number }
  )[];
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
  unsupportedOpen: boolean;
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  updateCollaborationSelection: (line: number, column: number, anchor: number, head: number) => void;
  useCaseDocument: UseCaseDocument;
  wbsDocument: WbsDocument;
  workspace: WorkspaceSnapshot;
}

export function buildSourceEditor({
  activeParticipants,
  activityDocument,
  analyzeSource,
  classDocument,
  clearSequenceSelection,
  collaboration,
  collaborationAppliesToActiveDiagram,
  commitSource,
  openFormatSource,
  parseResult,
  problemsOpen,
  projectInspectorOpen,
  remoteEditFlash,
  repairCategoryFilter,
  repairHost,
  repairRequest,
  requestSymbolRename,
  resourcePanelOpen,
  selectActivityFromSource,
  selectClassFromSource,
  selectSequenceMessage,
  selectSequenceParticipant,
  selectSequenceStructure,
  selectUseCaseFromSource,
  selectWbsFromSource,
  selectionRequest,
  sequenceDocument,
  setProblemPreview,
  setProblemsOpen,
  setRepairCategoryFilter,
  setRepairRequest,
  setSourceHighlightedSequenceParticipantId,
  setSourceHighlightedTaskId,
  setSourceSymbol,
  setSourceSymbolPosition,
  setSymbolMenu,
  setUnsupportedOpen,
  symbolAt,
  symbolHighlights,
  tabs,
  unsupportedOpen,
  update,
  updateCollaborationSelection,
  useCaseDocument,
  wbsDocument,
  workspace,
}: buildSourceEditorInputs) {
  const renderSourceEditor = (lens?: {
    visibleRange?: { from: number; to: number } | undefined;
    revealWithoutFocus?: boolean | undefined;
  }) => (
    <CodeEditor
      analyzeSource={analyzeSource}
      documentId={tabs.activeId}
      diagramKind={workspace.diagramKind}
      value={workspace.source}
      readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
      onFormatSource={openFormatSource}
      onChange={(source) => commitSource(source, SOURCE_EDIT_DESCRIPTION, false)}
      onApplyFix={(source, label) => {
        setRepairCategoryFilter((current) => (current ? { ...current, source } : undefined));
        commitSource(source, `Apply fix: ${label}`, false);
      }}
      selectedRange={selectionRequest}
      visibleRange={lens?.visibleRange}
      revealWithoutFocus={lens?.revealWithoutFocus}
      repairHost={repairHost}
      repairWorkspaceOpen={problemsOpen}
      repairCategoryFilter={
        repairCategoryFilter?.source === workspace.source && repairCategoryFilter.documentId === tabs.activeId
          ? repairCategoryFilter.category
          : undefined
      }
      onFilterRepairCategory={(category) =>
        setRepairCategoryFilter({ source: workspace.source, documentId: tabs.activeId, category })
      }
      onOpenRepairWorkspace={() => {
        setProblemPreview(undefined);
        setProblemsOpen(true);
      }}
      onCloseRepairWorkspace={() => {
        setProblemsOpen(false);
        setUnsupportedOpen(false);
        setProblemPreview(undefined);
      }}
      repairRequest={repairRequest}
      onRepairRequestHandled={() => setRepairRequest(undefined)}
      symbolHighlights={symbolHighlights}
      remoteParticipants={collaborationAppliesToActiveDiagram ? activeParticipants : []}
      remoteEditFlash={collaborationAppliesToActiveDiagram ? remoteEditFlash : undefined}
      onRenameRequest={
        workspace.diagramKind === "gantt" ||
        workspace.diagramKind === "sequence" ||
        workspace.diagramKind === "usecase" ||
        workspace.diagramKind === "class" ||
        workspace.diagramKind === "component" ||
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
        workspace.diagramKind === "component" ||
        workspace.diagramKind === "activity" ||
        workspace.diagramKind === "wbs"
          ? (position, x, y) => {
              if (!symbolAt(position)) return false;
              setSymbolMenu({ position, x, y });
              return true;
            }
          : undefined
      }
      onCursorChange={(line, column, position, anchor, head, sourceChanged) => {
        update("cursor", { line, column });
        if (collaborationAppliesToActiveDiagram) updateCollaborationSelection(line, column, anchor, head);
        // Cursor navigation in a utility panel must not replace it with object properties.
        if (problemsOpen || unsupportedOpen || projectInspectorOpen || resourcePanelOpen) return;
        if (workspace.diagramKind === "gantt") {
          const occurrence = symbolAt(position);
          setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
          setSourceSymbolPosition(occurrence ? position : undefined);
          setSourceHighlightedTaskId(
            occurrence?.kind === "task" ? occurrence.key : findTaskAt(parseResult.document, position)?.id,
          );
        } else if (workspace.diagramKind === "sequence") {
          // A source transaction reports its cursor before React has parsed the
          // new source. Let the controller reconcile selection instead of
          // looking up the new offset in the previous document.
          if (sourceChanged) return;
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
          else if (!occurrence) clearSequenceSelection();
        } else if (workspace.diagramKind === "usecase") {
          const occurrence = symbolAt(position);
          setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
          setSourceSymbolPosition(occurrence ? position : undefined);
          selectUseCaseFromSource(occurrence?.key, findUseCaseObjectAt(useCaseDocument, position)?.id);
        } else if (workspace.diagramKind === "class" || workspace.diagramKind === "component") {
          const occurrence = symbolAt(position);
          setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
          setSourceSymbolPosition(occurrence ? position : undefined);
          const member = classDocument.entities
            .flatMap((entity) => entity.members.map((item) => ({ entity, item })))
            .find(({ item }) => position >= item.sourceRange.from && position <= item.sourceRange.to);
          selectClassFromSource(
            occurrence?.key ?? member?.entity.id,
            member?.item.id,
            findClassObjectAt(classDocument, position)?.id,
          );
        } else if (workspace.diagramKind === "activity") {
          const occurrence = symbolAt(position);
          setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
          setSourceSymbolPosition(occurrence ? position : undefined);
          selectActivityFromSource(occurrence?.key, findActivityObjectAt(activityDocument, position)?.id);
        } else {
          const occurrence = symbolAt(position);
          setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
          setSourceSymbolPosition(occurrence ? position : undefined);
          selectWbsFromSource(occurrence?.key, findWbsNodeAt(wbsDocument, position)?.id);
        }
      }}
    />
  );

  return { renderSourceEditor };
}
