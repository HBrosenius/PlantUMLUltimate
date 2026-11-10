import { ProblemsPanel } from "../ProblemsPanel";
import { SymbolReferencesPanel } from "../SymbolReferencesPanel";
import { InlineLabelEditor } from "../InlineLabelEditor";
import { RenameSymbolDialog } from "../RenameSymbolDialog";
import type { Diagnostic } from "@codemirror/lint";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { DiagramQuickFix, DiagramAnalysis } from "../diagram-diagnostics";
import type {
  SemanticRenameRequest,
  SemanticSymbolOccurrence,
  SemanticSymbolProvider,
} from "../semantic-symbol-provider";
import type { ClassDocument } from "../../../../packages/diagram-class/src/model";
import type { AppDialog } from "../use-app-dialog";
import type { ActiveCollaboration } from "../use-collaboration-lifecycle";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { GanttTask } from "../../../../packages/diagram-gantt/src/model";
import type { ResolvableDeclaration } from "../../../../packages/project-model/src/types";
import type { WbsNode } from "../../../../packages/diagram-wbs/src/model";
import type { PresentationDocument } from "../presentation-review";
import type { RefObject, Dispatch, SetStateAction, ComponentProps } from "react";
import type { TextRange } from "../../../../packages/language-core/src/index";
import type { SourceProblemPreview } from "../features/documents/use-source-commands";
import type { RepairCategory } from "../remaining-repair-summary";
import type { ResourceCapacity } from "../ResourceWorkloadPanel";
import type { SchedulePreview } from "../SchedulePreviewDialog";
import type { SourceRepairRequest } from "../CodeEditor";
import type { ViewMode } from "../model";
import { lazyFeature } from "../lazy-feature";

const SchedulePreviewDialog = lazyFeature<
  ComponentProps<typeof import("../SchedulePreviewDialog").SchedulePreviewDialog>
>(
  () => import("../SchedulePreviewDialog").then((module) => ({ default: module.SchedulePreviewDialog })),
  "the schedule preview",
);

const DeliveryScenarioDialog = lazyFeature<
  ComponentProps<typeof import("../DeliveryScenarioDialog").DeliveryScenarioDialog>
>(
  () => import("../DeliveryScenarioDialog").then((module) => ({ default: module.DeliveryScenarioDialog })),
  "the scenario lab",
);

const HelpDialog = lazyFeature<ComponentProps<typeof import("../HelpDialog").HelpDialog>>(
  () => import("../HelpDialog").then((module) => ({ default: module.HelpDialog })),
  "help",
);

const PresentationDialog = lazyFeature<ComponentProps<typeof import("../PresentationDialog").PresentationDialog>>(
  () => import("../PresentationDialog").then((module) => ({ default: module.PresentationDialog })),
  "the presentation",
);

export interface AppOverlaysProps {
  activeDiagnostics: Diagnostic[];
  activeDocument: DocumentSnapshot;
  activeQuickFixes: DiagramQuickFix[];
  applySemanticRename: (target: SemanticRenameRequest, nextValue: string) => boolean;
  canDuplicateMenuElement: boolean;
  classDocument: ClassDocument;
  classMemberMenu: { entityId: string; memberId: string; x: number; y: number } | undefined;
  closeDialog: (kind?: AppDialog["kind"]) => void;
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
  commitSource: (
    source: string,
    description: string,
    validate?: boolean,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  diagramAnalysis: DiagramAnalysis;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  dialog: AppDialog | undefined;
  duplicateTaskOccurrence: (occurrence: SemanticSymbolOccurrence) => void;
  inlineRename:
    | { request: SemanticRenameRequest; source: string; documentId: string; anchor: { left: number; bottom: number } }
    | undefined;
  linkedWbs: DocumentSnapshot | undefined;
  menuGanttTask: GanttTask | undefined;
  menuLinkedGantt: { wbsAlias: string; ganttAlias: string } | undefined;
  menuLinkedWbs: { wbsAlias: string; ganttAlias: string } | undefined;
  menuOccurrence: SemanticSymbolOccurrence | undefined;
  menuProjectWbsLinks: { linkId: string; documentId: string; path: string; declaration: ResolvableDeclaration }[];
  menuWbsNode: WbsNode | undefined;
  navigateOccurrence: (occurrence: SemanticSymbolOccurrence, direction: -1 | 1) => void;
  occurrencesFor: (symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">) => SemanticSymbolOccurrence[];
  openLinkedGanttTask: (alias: string) => void;
  openLinkedWbsNode: (taskId: string) => void;
  openProjectWbsNode: (link: {
    linkId: string;
    documentId: string;
    path: string;
    declaration: ResolvableDeclaration;
  }) => Promise<void>;
  presentationConnections: { from: string; to: string }[];
  presentationDocuments: PresentationDocument[];
  presentationOpen: boolean;
  presentationReturnFocus: RefObject<HTMLElement | null>;
  preservedSyntax: { text: string; range: TextRange }[];
  problemPreview: SourceProblemPreview | undefined;
  problemsOpen: boolean;
  referenceSymbol: { kind: SemanticSymbolOccurrence["kind"]; key: string; label: string } | undefined;
  renameReturnFocus: RefObject<HTMLElement | SVGElement | undefined>;
  renameSymbol: SemanticRenameRequest | undefined;
  repairCategoryFilter: { source: string; documentId: string; category: RepairCategory } | undefined;
  resourceCapacities: ResourceCapacity;
  resourceWarningsEnabled: boolean;
  restorePreviousFocus: (preferred?: HTMLElement | SVGElement) => void;
  schedulePreview: SchedulePreview | undefined;
  setClassMemberMenu: Dispatch<
    SetStateAction<{ entityId: string; memberId: string; x: number; y: number } | undefined>
  >;
  setInlineRename: Dispatch<
    SetStateAction<
      | { request: SemanticRenameRequest; source: string; documentId: string; anchor: { left: number; bottom: number } }
      | undefined
    >
  >;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setPresentationOpen: Dispatch<SetStateAction<boolean>>;
  setProblemPreview: Dispatch<SetStateAction<SourceProblemPreview | undefined>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setReferenceSymbol: Dispatch<
    SetStateAction<{ kind: SemanticSymbolOccurrence["kind"]; key: string; label: string } | undefined>
  >;
  setRenameSymbol: Dispatch<SetStateAction<SemanticRenameRequest | undefined>>;
  setRepairCategoryFilter: Dispatch<
    SetStateAction<{ source: string; documentId: string; category: RepairCategory } | undefined>
  >;
  setRepairHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setRepairRequest: Dispatch<SetStateAction<SourceRepairRequest | undefined>>;
  setSchedulePreview: Dispatch<SetStateAction<SchedulePreview | undefined>>;
  setSelectedClassObjectId: Dispatch<SetStateAction<string | undefined>>;
  setSelectionRequest: Dispatch<SetStateAction<{ from: number; to: number } | undefined>>;
  setSymbolMenu: Dispatch<
    SetStateAction<{ position?: number; occurrence?: SemanticSymbolOccurrence; x: number; y: number } | undefined>
  >;
  setUnsupportedOpen: (value: SetStateAction<boolean>) => void;
  symbolAt: (position: number) => SemanticSymbolOccurrence | undefined;
  symbolMenu: { position?: number; occurrence?: SemanticSymbolOccurrence; x: number; y: number } | undefined;
  symbolProvider: SemanticSymbolProvider;
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
  viewMode: ViewMode;
  workspace: WorkspaceSnapshot;
}

export function AppOverlays({
  activeDiagnostics,
  activeDocument,
  activeQuickFixes,
  applySemanticRename,
  canDuplicateMenuElement,
  classDocument,
  classMemberMenu,
  closeDialog,
  collaboration,
  collaborationAppliesToActiveDiagram,
  commandReadOnly,
  commitGeneratedSource,
  commitSource,
  diagramAnalysis,
  diagramMulti,
  dialog,
  duplicateTaskOccurrence,
  inlineRename,
  linkedWbs,
  menuGanttTask,
  menuLinkedGantt,
  menuLinkedWbs,
  menuOccurrence,
  menuProjectWbsLinks,
  menuWbsNode,
  navigateOccurrence,
  occurrencesFor,
  openLinkedGanttTask,
  openLinkedWbsNode,
  openProjectWbsNode,
  presentationConnections,
  presentationDocuments,
  presentationOpen,
  presentationReturnFocus,
  preservedSyntax,
  problemPreview,
  problemsOpen,
  referenceSymbol,
  renameReturnFocus,
  renameSymbol,
  repairCategoryFilter,
  resourceCapacities,
  resourceWarningsEnabled,
  restorePreviousFocus,
  schedulePreview,
  setClassMemberMenu,
  setInlineRename,
  setInteractionMessage,
  setPresentationOpen,
  setProblemPreview,
  setProblemsOpen,
  setReferenceSymbol,
  setRenameSymbol,
  setRepairCategoryFilter,
  setRepairHost,
  setRepairRequest,
  setSchedulePreview,
  setSelectedClassObjectId,
  setSelectionRequest,
  setSymbolMenu,
  setUnsupportedOpen,
  symbolAt,
  symbolMenu,
  symbolProvider,
  tabs,
  unsupportedOpen,
  update,
  viewMode,
  workspace,
}: AppOverlaysProps) {
  return (
    <>
      <ProblemsPanel
        categoryFilter={
          repairCategoryFilter?.source === workspace.source && repairCategoryFilter.documentId === tabs.activeId
            ? repairCategoryFilter.category
            : undefined
        }
        onClearCategoryFilter={() => setRepairCategoryFilter(undefined)}
        open={problemsOpen || unsupportedOpen}
        preserved={preservedSyntax}
        onRevealPreserved={(item) => {
          if (viewMode === "diagram") update("viewMode", "split");
          setSelectionRequest({ ...item.range });
        }}
        onRepairHost={setRepairHost}
        diagramKind={workspace.diagramKind}
        source={problemPreview?.source ?? diagramAnalysis.source}
        diagnostics={problemPreview?.diagnostics ?? activeDiagnostics}
        quickFixes={problemPreview ? [] : activeQuickFixes}
        readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
        notice={problemPreview?.message}
        onReveal={(diagnostic) => {
          if (viewMode === "diagram") update("viewMode", "split");
          if (problemPreview) {
            setSelectionRequest({ from: diagnostic.from, to: diagnostic.to });
            return;
          }
          setRepairRequest({
            documentId: tabs.activeId,
            kind: diagramAnalysis.kind,
            source: diagramAnalysis.source,
            diagnostic,
          });
        }}
        onPreviewDiagnostic={(diagnostic) => {
          if (viewMode === "diagram") update("viewMode", "split");
          setRepairRequest({
            documentId: tabs.activeId,
            kind: diagramAnalysis.kind,
            source: diagramAnalysis.source,
            diagnostic,
            previewFixes: true,
          });
        }}
        onPreviewFix={(fix) => {
          if (viewMode === "diagram") update("viewMode", "split");
          setRepairRequest({
            documentId: tabs.activeId,
            kind: diagramAnalysis.kind,
            source: diagramAnalysis.source,
            fix,
          });
        }}
        onClose={() => {
          setProblemsOpen(false);
          setUnsupportedOpen(false);
          setRepairCategoryFilter(undefined);
          setProblemPreview(undefined);
        }}
      />
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
      {dialog?.kind === "delivery-scenario" && (
        <DeliveryScenarioDialog
          key={activeDocument.historyId}
          documentId={activeDocument.historyId}
          scenarios={activeDocument.deliveryScenarios}
          onScenariosChange={(deliveryScenarios) => {
            const target = tabs.getDocument(activeDocument.id);
            if (target)
              tabs.updateDocumentFormat(target.id, {
                deliveryScenarios,
                dirty: true,
                revision: (target.revision ?? 0) + 1,
              });
          }}
          currentSource={workspace.source}
          capacities={resourceCapacities}
          showResourceOverAllocationWarnings={resourceWarningsEnabled}
          onApply={(source, expectedBase) => {
            if (workspace.source !== expectedBase) return false;
            if (!commitSource(source, "Apply delivery scenario")) return false;
            closeDialog("delivery-scenario");
            setInteractionMessage("Applied delivery scenario");
            return true;
          }}
          onClose={() => closeDialog("delivery-scenario")}
        />
      )}
      {dialog?.kind === "help" && <HelpDialog kind={workspace.diagramKind} onClose={() => closeDialog("help")} />}
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
                if (viewMode === "diagram") update("viewMode", "split");
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
          {canDuplicateMenuElement && menuOccurrence && (
            <button
              autoFocus
              role="menuitem"
              disabled={diagramMulti.readOnly}
              onClick={() => {
                diagramMulti.duplicateAt(menuOccurrence.range);
                setSymbolMenu(undefined);
              }}
            >
              Duplicate
            </button>
          )}
          {menuLinkedGantt && menuWbsNode?.alias && (
            <button
              role="menuitem"
              onClick={() => {
                openLinkedGanttTask(menuWbsNode.alias!);
                setSymbolMenu(undefined);
              }}
            >
              Open linked Gantt task
            </button>
          )}
          {menuProjectWbsLinks.map((link) => (
            <button
              key={link.linkId}
              role="menuitem"
              onClick={() => {
                void openProjectWbsNode(link);
                setSymbolMenu(undefined);
              }}
            >
              Open linked WBS node in {link.path}: {link.declaration.symbolKey}
            </button>
          ))}
          {menuLinkedWbs && linkedWbs && menuGanttTask && (
            <button
              role="menuitem"
              onClick={() => {
                openLinkedWbsNode(menuGanttTask.id);
                setSymbolMenu(undefined);
              }}
            >
              Open linked WBS node
            </button>
          )}
          {workspace.diagramKind === "gantt" &&
            (symbolMenu.occurrence ?? (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined))
              ?.kind === "task" && (
              <button
                autoFocus
                role="menuitem"
                onClick={() => {
                  const occurrence =
                    symbolMenu.occurrence ??
                    (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
                  if (occurrence) duplicateTaskOccurrence(occurrence);
                  setSymbolMenu(undefined);
                }}
              >
                Duplicate task
              </button>
            )}
          <button
            autoFocus={
              !canDuplicateMenuElement &&
              (workspace.diagramKind !== "gantt" ||
                (
                  symbolMenu.occurrence ??
                  (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined)
                )?.kind !== "task")
            }
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
                if (viewMode === "diagram") update("viewMode", "split");
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
            if (viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...occurrence.range });
          }}
          onClose={() => setReferenceSymbol(undefined)}
        />
      )}
      {inlineRename && inlineRename.documentId === tabs.activeId && viewMode !== "code" && (
        <InlineLabelEditor
          value={inlineRename.request.occurrence.value}
          anchor={inlineRename.anchor}
          current={!commandReadOnly && workspace.source === inlineRename.source && !diagramMulti.multiple}
          validate={(value) => symbolProvider.validateRename(inlineRename.request, value)}
          onApply={(value) => {
            if (
              commandReadOnly ||
              workspace.source !== inlineRename.source ||
              tabs.activeId !== inlineRename.documentId
            )
              return false;
            return applySemanticRename(inlineRename.request, value);
          }}
          onClose={() => {
            setInlineRename(undefined);
            restorePreviousFocus(renameReturnFocus.current);
          }}
        />
      )}
      {presentationOpen && (
        <PresentationDialog
          documents={presentationDocuments}
          connections={presentationConnections}
          initialId={activeDocument.historyId}
          onClose={() => {
            setPresentationOpen(false);
            requestAnimationFrame(() => presentationReturnFocus.current?.focus());
          }}
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
            if (applySemanticRename(renameSymbol, nextValue)) setRenameSymbol(undefined);
          }}
          onClose={() => {
            setRenameSymbol(undefined);
            restorePreviousFocus(renameReturnFocus.current);
          }}
        />
      )}
    </>
  );
}
