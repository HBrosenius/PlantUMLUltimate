import { GanttInspectors } from "../features/gantt/GanttInspectors";
import { parseWbs, updateWbsNode } from "@plantuml-studio/diagram-wbs";
import { ResourceWorkloadPanel, type ResourceCapacity } from "../ResourceWorkloadPanel";
import { renameResource, applySourceEdits } from "@plantuml-studio/diagram-gantt";
import type { DocumentSnapshot, DocumentVersion, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { DependencyInspectorValue } from "../DependencyInspector";
import type { MilestoneInspectorValue } from "../MilestoneInspector";
import type { TaskInspectorValue } from "../TaskInspector";
import type { VerticalSeparatorValue } from "../VerticalSeparatorInspector";
import type { GanttCalendar } from "../gantt-calendar";
import type { JiraMappedField } from "../../../../packages/jira-integration/src/types";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type {
  GanttDocument,
  GanttDependency,
  GanttDivider,
  GanttTask,
  GanttVerticalSeparator,
} from "../../../../packages/diagram-gantt/src/model";
import type { ResolvedTaskDates } from "../gantt-schedule";
import type { Dispatch, SetStateAction, ComponentProps } from "react";
import type { DiagramKind } from "../model";
import { lazyFeature } from "../lazy-feature";

const ReportsDialog = lazyFeature<ComponentProps<typeof import("../features/reports/ReportsDialog").ReportsDialog>>(
  () => import("../features/reports/ReportsDialog").then((module) => ({ default: module.ReportsDialog })),
  "reports",
);

export interface GanttSideInspectorsProps {
  activeDocument: DocumentSnapshot;
  applyDependencyInspector: (value: DependencyInspectorValue) => void;
  applyDividerInspector: (label: string) => void;
  applyGanttMilestoneInspector: (value: MilestoneInspectorValue) => void;
  applyGanttTaskInspector: (value: TaskInspectorValue) => void;
  applyLegendInspector: (entries: readonly { color: string; label: string }[]) => void;
  applyVerticalSeparatorInspector: (value: VerticalSeparatorValue) => void;
  baselineVersion: DocumentVersion | undefined;
  closeLegendInspector: () => void;
  commitGeneratedSource: (
    source: string,
    description: string,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  deleteDependency: () => void;
  deleteSelectedDivider: () => void;
  deleteSelectedTask: () => void;
  deleteSelectedVerticalSeparator: () => void;
  focusNoteTaskId: string | undefined;
  ganttCalendar: GanttCalendar;
  jiraTaskStatuses: Map<string, { issueKey: string; fields: JiraMappedField[] }>;
  legendEntries: { color: string; label: string }[];
  legendFocusColor: string | undefined;
  legendInspectorOpen: boolean;
  linkedWbs: DocumentSnapshot | undefined;
  multipleTasksSelected: boolean;
  openLinkedWbsNode: (taskId: string) => void;
  parseResult: DiagramParseResult<GanttDocument>;
  prepareUtilityPanel: () => boolean;
  renameCapacity: (currentName: string, nextName: string) => void;
  reportCoordinator: boolean;
  reportResource: string | undefined;
  reportsOpen: boolean;
  reportsSuspended: boolean;
  resolvedTaskDates: Map<string, ResolvedTaskDates>;
  resourceCapacities: ResourceCapacity;
  resourceNames: string[];
  resourcePanelOpen: boolean;
  restorePreviousFocus: (preferred?: HTMLElement | SVGElement) => void;
  selectTask: (taskId: string) => void;
  selectedDependency: GanttDependency | undefined;
  selectedDivider: GanttDivider | undefined;
  selectedPredecessorId: string;
  selectedResourceConflicts: string[];
  selectedTask: GanttTask | undefined;
  selectedTaskDependency: GanttDependency | undefined;
  selectedVerticalSeparator: GanttVerticalSeparator | undefined;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setPendingGanttDeleteTaskId: Dispatch<SetStateAction<string | undefined>>;
  setProblemsOpen: (value: SetStateAction<boolean>) => void;
  setReportCoordinator: Dispatch<SetStateAction<boolean>>;
  setReportResource: Dispatch<SetStateAction<string | undefined>>;
  setReportsOpen: Dispatch<SetStateAction<boolean>>;
  setReportsSuspended: Dispatch<SetStateAction<boolean>>;
  setResourceFilter: Dispatch<SetStateAction<string>>;
  setResourcePanelOpen: (value: SetStateAction<boolean>) => void;
  setSelectedDependencyIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedDividerIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  setSelectedVerticalSeparatorIndex: (value: SetStateAction<number | undefined>) => void;
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
  taskTableInspector: boolean;
  taskViewActive: boolean;
  updateLinkedSource: (
    document: { id: string; source: string },
    next: string,
    kind: DiagramKind,
    description: string,
  ) => void;
  updateResourceCapacities: (updater: (current: ResourceCapacity) => ResourceCapacity) => void;
  workspace: WorkspaceSnapshot;
}

export function GanttSideInspectors({
  activeDocument,
  applyDependencyInspector,
  applyDividerInspector,
  applyGanttMilestoneInspector,
  applyGanttTaskInspector,
  applyLegendInspector,
  applyVerticalSeparatorInspector,
  baselineVersion,
  closeLegendInspector,
  commitGeneratedSource,
  deleteDependency,
  deleteSelectedDivider,
  deleteSelectedTask,
  deleteSelectedVerticalSeparator,
  focusNoteTaskId,
  ganttCalendar,
  jiraTaskStatuses,
  legendEntries,
  legendFocusColor,
  legendInspectorOpen,
  linkedWbs,
  multipleTasksSelected,
  openLinkedWbsNode,
  parseResult,
  prepareUtilityPanel,
  renameCapacity,
  reportCoordinator,
  reportResource,
  reportsOpen,
  reportsSuspended,
  resolvedTaskDates,
  resourceCapacities,
  resourceNames,
  resourcePanelOpen,
  restorePreviousFocus,
  selectTask,
  selectedDependency,
  selectedDivider,
  selectedPredecessorId,
  selectedResourceConflicts,
  selectedTask,
  selectedTaskDependency,
  selectedVerticalSeparator,
  setInteractionMessage,
  setPendingGanttDeleteTaskId,
  setProblemsOpen,
  setReportCoordinator,
  setReportResource,
  setReportsOpen,
  setReportsSuspended,
  setResourceFilter,
  setResourcePanelOpen,
  setSelectedDependencyIndex,
  setSelectedDividerIndex,
  setSelectedTaskId,
  setSelectedVerticalSeparatorIndex,
  tabs,
  taskTableInspector,
  taskViewActive,
  updateLinkedSource,
  updateResourceCapacities,
  workspace,
}: GanttSideInspectorsProps) {
  return (
    <>
      <GanttInspectors
        selectedTask={multipleTasksSelected || (taskViewActive && !taskTableInspector) ? undefined : selectedTask}
        linkedWbsAlias={
          selectedTask
            ? activeDocument.wbsGanttLinks?.find((link) => link.ganttAlias.toLowerCase() === selectedTask.id)?.wbsAlias
            : undefined
        }
        wbsLinkStatus={
          selectedTask && linkedWbs
            ? (() => {
                const link = activeDocument.wbsGanttLinks?.find(
                  (item) => item.ganttAlias.toLowerCase() === selectedTask.id,
                );
                if (!link) return "Unlinked from WBS.";
                const node = parseWbs(linkedWbs.source).nodes.find((item) => item.alias === link.wbsAlias);
                return node ? `Linked to ${node.label}.` : `Missing WBS node (${link.wbsAlias}).`;
              })()
            : undefined
        }
        wbsTargets={
          linkedWbs
            ? parseWbs(linkedWbs.source)
                .nodes.filter(
                  (node) =>
                    node.alias &&
                    !activeDocument.wbsGanttLinks?.some(
                      (link) => link.wbsAlias === node.alias && link.ganttAlias.toLowerCase() !== selectedTask?.id,
                    ),
                )
                .map((node) => ({
                  key: node.alias!,
                  label: node.label,
                }))
            : []
        }
        onLinkWbsNode={(alias) => {
          if (!selectedTask || !linkedWbs || !alias) return;
          if (
            activeDocument.wbsGanttLinks?.some(
              (link) => link.wbsAlias === alias && link.ganttAlias.toLowerCase() !== selectedTask.id,
            )
          ) {
            setInteractionMessage("That WBS node is already linked to another Gantt task");
            return;
          }
          const ganttAlias = selectedTask.alias?.value ?? `wbs_link_${Date.now().toString(36)}`;
          if (!selectedTask.alias) {
            const at = selectedTask.labelRange.to + 1;
            updateLinkedSource(
              { id: tabs.activeId, source: workspace.source },
              `${workspace.source.slice(0, at)} as [${ganttAlias}]${workspace.source.slice(at)}`,
              "gantt",
              "Link task to WBS",
            );
          }
          const links = (activeDocument.wbsGanttLinks ?? []).filter(
            (item) => item.wbsAlias !== alias && item.ganttAlias !== ganttAlias,
          );
          tabs.updateDocumentFormat(tabs.activeId, {
            wbsGanttLinks: [...links, { wbsAlias: alias, ganttAlias }],
          });
          setInteractionMessage(`Linked ${selectedTask.label} to WBS node ${alias}`);
        }}
        linkedWbsLabel={
          selectedTask && linkedWbs
            ? (() => {
                const link = activeDocument.wbsGanttLinks?.find(
                  (item) => item.ganttAlias.toLowerCase() === selectedTask.id,
                );
                return link
                  ? parseWbs(linkedWbs.source).nodes.find((node) => node.alias === link.wbsAlias)?.label
                  : undefined;
              })()
            : undefined
        }
        onOpenLinkedWbs={() => selectedTask && openLinkedWbsNode(selectedTask.id)}
        selectedDependency={selectedDependency}
        selectedDivider={selectedDivider}
        selectedVerticalSeparator={selectedVerticalSeparator}
        tasks={parseResult.document.tasks}
        relativeMilestoneAnchor={
          selectedTask &&
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
        predecessorId={selectedPredecessorId}
        dependencyRelation={selectedTaskDependency?.relation ?? "start-after-end"}
        effectiveStart={selectedTask ? (resolvedTaskDates.get(selectedTask.id)?.start ?? "") : ""}
        effectiveEnd={selectedTask ? (resolvedTaskDates.get(selectedTask.id)?.end ?? "") : ""}
        calendar={ganttCalendar}
        resourceNames={resourceNames}
        resourceConflicts={selectedResourceConflicts}
        jiraStatus={selectedTask ? jiraTaskStatuses.get(selectedTask.id) : undefined}
        focusTaskNote={Boolean(selectedTask && focusNoteTaskId === selectedTask.id)}
        legendOpen={legendInspectorOpen}
        legendEntries={legendEntries}
        legendFocusColor={legendFocusColor}
        onMilestoneApply={applyGanttMilestoneInspector}
        onTaskApply={(value) => {
          applyGanttTaskInspector(value);
          if (!selectedTask || !linkedWbs || value.label.trim() === selectedTask.label.trim()) return;
          const link = activeDocument.wbsGanttLinks?.find((item) => item.ganttAlias.toLowerCase() === selectedTask.id);
          const document = parseWbs(linkedWbs.source);
          const node = link && document.nodes.find((item) => item.alias === link.wbsAlias);
          if (!node) return;
          updateLinkedSource(
            linkedWbs,
            updateWbsNode(linkedWbs.source, node, {
              label: value.label.replace(/^(?:↳\s*)+/, "").trim(),
              ...(node.color ? { color: node.color } : {}),
              ...(node.textColor ? { textColor: node.textColor } : {}),
              ...(node.stereotype ? { stereotype: node.stereotype } : {}),
              ...(node.link ? { link: node.link } : {}),
              ...(node.icon ? { icon: node.icon } : {}),
              side: node.side === "left" ? "left" : "right",
            }),
            "wbs",
            "Rename node from linked Gantt",
          );
        }}
        onTaskDelete={() => {
          if (
            selectedTask &&
            linkedWbs &&
            activeDocument.wbsGanttLinks?.some((item) => item.ganttAlias.toLowerCase() === selectedTask.id)
          )
            setPendingGanttDeleteTaskId(selectedTask.id);
          else deleteSelectedTask();
        }}
        onDependencyApply={applyDependencyInspector}
        onDependencyDelete={deleteDependency}
        onDividerApply={applyDividerInspector}
        onDividerDelete={deleteSelectedDivider}
        onVerticalSeparatorApply={applyVerticalSeparatorInspector}
        onVerticalSeparatorDelete={deleteSelectedVerticalSeparator}
        onLegendApply={applyLegendInspector}
        onCloseTask={() => {
          setSelectedTaskId(undefined);
          restorePreviousFocus();
        }}
        onCloseDependency={() => setSelectedDependencyIndex(undefined)}
        onCloseDivider={() => setSelectedDividerIndex(undefined)}
        onCloseVerticalSeparator={() => setSelectedVerticalSeparatorIndex(undefined)}
        onCloseLegend={closeLegendInspector}
      />
      {reportsOpen && (
        <ReportsDialog
          source={workspace.source}
          sourceIdentity={tabs.activeId}
          documentName={workspace.fileName}
          diagramName={workspace.source.match(/^\s*title\s+(.+)$/m)?.[1] ?? workspace.fileName}
          timeZone={activeDocument.progressForecast?.timeZone}
          forecastSettings={activeDocument.progressForecast}
          resource={reportResource}
          coordinator={reportCoordinator}
          baselineSource={baselineVersion?.source}
          baselineName={
            baselineVersion ? `${baselineVersion.label ?? "Baseline"} · ${baselineVersion.createdAt}` : undefined
          }
          capacities={resourceCapacities}
          history={activeDocument.reportingHistory}
          onRecordProgress={(observation) => {
            const target = tabs.getDocument(tabs.activeId);
            if (target)
              tabs.updateDocumentFormat(target.id, {
                reportingHistory: [...(target.reportingHistory ?? []), observation],
                dirty: true,
              });
          }}
          suspended={reportsSuspended}
          onOpenIssues={() => {
            if (!prepareUtilityPanel()) return;
            setProblemsOpen(true);
            setReportsSuspended(true);
          }}
          onClose={() => setReportsOpen(false)}
        />
      )}
      {resourcePanelOpen && (
        <ResourceWorkloadPanel
          onReport={(name, coordinator = false) => {
            setReportResource(name);
            setReportCoordinator(coordinator);
            setReportsSuspended(false);
            setReportsOpen(true);
          }}
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
    </>
  );
}
