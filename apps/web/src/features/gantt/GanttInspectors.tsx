import type { GanttDependency, GanttDivider, GanttTask, GanttVerticalSeparator } from "@plantuml-studio/diagram-gantt";
import { DependencyInspector, type DependencyInspectorValue } from "../../DependencyInspector";
import { DividerInspector } from "../../DividerInspector";
import { LegendInspector } from "../../LegendInspector";
import { MilestoneInspector, type MilestoneInspectorValue } from "../../MilestoneInspector";
import { TaskInspector, type TaskInspectorValue } from "../../TaskInspector";
import { VerticalSeparatorInspector, type VerticalSeparatorValue } from "../../VerticalSeparatorInspector";
import type { GanttCalendar } from "../../gantt-calendar";
import type { LegendEntry } from "../../legend";

interface GanttInspectorsProps {
  selectedTask: GanttTask | undefined;
  linkedWbsLabel?: string | undefined;
  onOpenLinkedWbs?(): void;
  selectedDependency: GanttDependency | undefined;
  selectedDivider: GanttDivider | undefined;
  selectedVerticalSeparator: GanttVerticalSeparator | undefined;
  tasks: readonly GanttTask[];
  relativeMilestoneAnchor: "start" | "end";
  predecessorId: string;
  dependencyRelation: GanttDependency["relation"];
  effectiveStart: string;
  effectiveEnd: string;
  calendar: GanttCalendar;
  resourceNames: readonly string[];
  resourceConflicts: readonly string[];
  jiraStatus: { issueKey: string; fields: readonly string[] } | undefined;
  focusTaskNote: boolean;
  legendOpen: boolean;
  legendEntries: readonly LegendEntry[];
  legendFocusColor: string | undefined;
  onMilestoneApply(value: MilestoneInspectorValue): void;
  onTaskApply(value: TaskInspectorValue): void;
  onTaskDelete(): void;
  onDependencyApply(value: DependencyInspectorValue): void;
  onDependencyDelete(): void;
  onDividerApply(label: string): void;
  onDividerDelete(): void;
  onVerticalSeparatorApply(value: VerticalSeparatorValue): void;
  onVerticalSeparatorDelete(): void;
  onLegendApply(entries: readonly LegendEntry[]): void;
  onCloseTask(): void;
  onCloseDependency(): void;
  onCloseDivider(): void;
  onCloseVerticalSeparator(): void;
  onCloseLegend(): void;
}

export function GanttInspectors(props: GanttInspectorsProps) {
  const {
    selectedTask,
    selectedDependency,
    selectedDivider,
    selectedVerticalSeparator,
    tasks,
    relativeMilestoneAnchor,
    predecessorId,
    dependencyRelation,
    effectiveStart,
    effectiveEnd,
    calendar,
    resourceNames,
    resourceConflicts,
    jiraStatus,
    focusTaskNote,
    legendOpen,
    legendEntries,
    legendFocusColor,
  } = props;
  return (
    <>
      {selectedTask?.milestone && (
        <MilestoneInspector
          key={`${selectedTask.id}:${selectedTask.sourceRange.to}:${predecessorId}:${dependencyRelation}`}
          milestone={selectedTask}
          tasks={tasks}
          relativeAnchor={relativeMilestoneAnchor}
          onApply={props.onMilestoneApply}
          onDelete={props.onTaskDelete}
          onClose={props.onCloseTask}
          linkedWbsLabel={props.linkedWbsLabel}
          onOpenLinkedWbs={props.onOpenLinkedWbs}
        />
      )}
      {selectedTask && !selectedTask.milestone && (
        <TaskInspector
          key={selectedTask.id}
          task={selectedTask}
          tasks={tasks}
          predecessorId={predecessorId}
          dependencyRelation={dependencyRelation}
          effectiveStart={effectiveStart}
          effectiveEnd={effectiveEnd}
          calendar={calendar}
          resourceNames={resourceNames}
          conflicts={resourceConflicts}
          jiraStatus={jiraStatus}
          focusNote={focusTaskNote}
          onApply={props.onTaskApply}
          onDelete={props.onTaskDelete}
          onClose={props.onCloseTask}
          linkedWbsLabel={props.linkedWbsLabel}
          onOpenLinkedWbs={props.onOpenLinkedWbs}
        />
      )}
      {selectedDependency && (
        <DependencyInspector
          key={`${selectedDependency.sourceRange.from}:${selectedDependency.sourceRange.to}`}
          dependency={selectedDependency}
          tasks={tasks}
          onApply={props.onDependencyApply}
          onDelete={props.onDependencyDelete}
          onClose={props.onCloseDependency}
        />
      )}
      {selectedDivider && (
        <DividerInspector
          divider={selectedDivider}
          onApply={props.onDividerApply}
          onDelete={props.onDividerDelete}
          onClose={props.onCloseDivider}
        />
      )}
      {selectedVerticalSeparator && (
        <VerticalSeparatorInspector
          separator={selectedVerticalSeparator}
          tasks={tasks}
          onApply={props.onVerticalSeparatorApply}
          onDelete={props.onVerticalSeparatorDelete}
          onClose={props.onCloseVerticalSeparator}
        />
      )}
      {legendOpen && (
        <LegendInspector
          entries={legendEntries}
          focusColor={legendFocusColor}
          onApply={props.onLegendApply}
          onClose={props.onCloseLegend}
        />
      )}
    </>
  );
}
