import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { AddDividerDialog, type AddSeparatorValue } from "../../AddDividerDialog";
import { AddMilestoneDialog, type AddMilestoneValue } from "../../AddMilestoneDialog";
import { AddTaskDialog, type AddTaskValue } from "../../AddTaskDialog";

export type GanttDialogKind = "task" | "divider" | "milestone";

interface GanttDialogsProps {
  active: GanttDialogKind | undefined;
  tasks: GanttTask[];
  defaultStartDate: string | undefined;
  onAddTask(value: AddTaskValue): void;
  onAddDivider(value: AddSeparatorValue): void;
  onAddMilestone(value: AddMilestoneValue): void;
  onClose(): void;
}

export function GanttDialogs({
  active,
  tasks,
  defaultStartDate,
  onAddTask,
  onAddDivider,
  onAddMilestone,
  onClose,
}: GanttDialogsProps) {
  const taskLabels = tasks.map((task) => task.label);
  if (active === "task")
    return (
      <AddTaskDialog taskLabels={taskLabels} defaultStartDate={defaultStartDate} onAdd={onAddTask} onClose={onClose} />
    );
  if (active === "divider") return <AddDividerDialog tasks={tasks} onAdd={onAddDivider} onClose={onClose} />;
  if (active === "milestone")
    return <AddMilestoneDialog taskLabels={taskLabels} onAdd={onAddMilestone} onClose={onClose} />;
  return null;
}
