import { useId, useState } from "react";
import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

export interface DependencyInspectorValue {
  predecessorId: string;
  successorId: string;
  relation: GanttDependency["relation"];
  offset: number;
  direction: "after" | "before";
  color: string;
  lineStyle: "solid" | "dotted" | "dashed" | "bold";
  note: string;
  notePosition: "bottom" | "top" | "left" | "right";
}

export function DependencyInspector({
  dependency,
  tasks,
  onApply,
  onDelete,
  onClose,
}: {
  dependency: GanttDependency;
  tasks: readonly GanttTask[];
  onApply(value: DependencyInspectorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const initial = (): DependencyInspectorValue => ({
    predecessorId: dependency.predecessorTaskId,
    successorId: dependency.successorTaskId,
    relation: dependency.relation,
    offset: dependency.offset?.value ?? 0,
    direction: dependency.direction ?? "after",
    color: dependency.color?.value ?? "",
    lineStyle: dependency.lineStyle?.value ?? "solid",
    note: dependency.notes?.[0]?.text ?? "",
    notePosition: dependency.notes?.[0]?.position ?? "bottom",
  });
  const [value, setValue] = useState(initial);
  const colorListId = useId();
  const update = <K extends keyof DependencyInspectorValue>(key: K, next: DependencyInspectorValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  return (
    <aside className="task-inspector dependency-inspector" aria-label="Dependency inspector">
      <header>
        <strong>Dependency inspector</strong>
        <button onClick={onClose} aria-label="Close dependency inspector">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <label>
          Predecessor
          <select value={value.predecessorId} onChange={(event) => update("predecessorId", event.target.value)}>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Successor
          <select value={value.successorId} onChange={(event) => update("successorId", event.target.value)}>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            value={value.relation}
            onChange={(event) => update("relation", event.target.value as GanttDependency["relation"])}
          >
            <option value="start-after-end">End → Start</option>
            <option value="start-after-start">Start → Start</option>
            <option value="end-after-end">End → End</option>
            <option value="end-after-start">Start → End</option>
          </select>
        </label>
        <label>
          Direction
          <select
            value={value.direction}
            onChange={(event) => update("direction", event.target.value as "after" | "before")}
          >
            <option value="after">After</option>
            <option value="before">Before</option>
          </select>
        </label>
        <label>
          Offset (days)
          <input
            type="number"
            min="0"
            step="1"
            value={value.offset}
            onChange={(event) => update("offset", Number(event.target.value))}
          />
        </label>
        <label>
          Line style
          <select
            value={value.lineStyle}
            onChange={(event) => update("lineStyle", event.target.value as DependencyInspectorValue["lineStyle"])}
          >
            <option value="solid">Solid</option>
            <option value="dotted">Dotted</option>
            <option value="dashed">Dashed</option>
            <option value="bold">Bold</option>
          </select>
        </label>
        <label>
          Line color
          <input
            list={colorListId}
            placeholder="Blue or #2563eb"
            value={value.color}
            onChange={(event) => update("color", event.target.value)}
          />
          <datalist id={colorListId}>
            {PLANTUML_COLOR_NAMES.map((color) => <option key={color} value={color} />)}
          </datalist>
        </label>
        <label className="inspector-note-field">
          <span className="inspector-field-heading">
            Note
            <button type="button" disabled={!value.note} onClick={() => update("note", "")}>
              Remove note
            </button>
          </span>
          <textarea
            rows={4}
            placeholder="Explain this dependency"
            value={value.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete link
          </button>
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
