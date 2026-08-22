import { useState } from "react";
import type { GanttTask, GanttVerticalSeparator } from "@plantuml-studio/diagram-gantt";

export interface VerticalSeparatorValue {
  taskLabel: string;
  anchor: "start" | "end";
  offset: number;
  direction: "after" | "before";
}

export function VerticalSeparatorInspector({ separator, tasks, onApply, onDelete, onClose }: {
  separator: GanttVerticalSeparator;
  tasks: readonly GanttTask[];
  onApply(value: VerticalSeparatorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [value, setValue] = useState<VerticalSeparatorValue>({
    taskLabel: separator.taskLabel,
    anchor: separator.anchor,
    offset: separator.offset,
    direction: separator.direction,
  });
  return <aside className="task-inspector vertical-separator-inspector" aria-label="Vertical separator inspector">
    <header><strong>Vertical separator</strong><button onClick={onClose} aria-label="Close vertical separator inspector">×</button></header>
    <form onSubmit={(event) => { event.preventDefault(); onApply(value); }}>
      <label>Relative to task<select value={value.taskLabel} onChange={(event) => setValue((current) => ({ ...current, taskLabel: event.target.value }))}>
        {tasks.map((task) => <option key={task.id} value={task.alias?.value ?? task.label}>{task.label}</option>)}
      </select></label>
      <label>Task boundary<select value={value.anchor} onChange={(event) => setValue((current) => ({ ...current, anchor: event.target.value as "start" | "end" }))}><option value="start">Start</option><option value="end">End</option></select></label>
      <label>Offset (days)<input type="number" min="0" step="1" value={value.offset} onChange={(event) => setValue((current) => ({ ...current, offset: Number(event.target.value) }))} /></label>
      {value.offset > 0 && <label>Direction<select value={value.direction} onChange={(event) => setValue((current) => ({ ...current, direction: event.target.value as "after" | "before" }))}><option value="after">After</option><option value="before">Before</option></select></label>}
      <div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete separator</button><button type="submit" className="primary">Apply</button></div>
    </form>
  </aside>;
}
