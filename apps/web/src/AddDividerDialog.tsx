import { useEffect, useRef, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { useDialogFocus } from "./use-dialog-focus";

export type AddSeparatorValue =
  | { kind: "horizontal"; label: string; beforeTaskId: string }
  | { kind: "vertical"; taskLabel: string; anchor: "start" | "end"; offset: number; direction: "after" | "before" };

export function AddDividerDialog({
  tasks,
  onAdd,
  onClose,
}: {
  tasks: readonly GanttTask[];
  onAdd(value: AddSeparatorValue): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [beforeTaskId, setBeforeTaskId] = useState("");
  const [kind, setKind] = useState<"horizontal" | "vertical">("horizontal");
  const [taskLabel, setTaskLabel] = useState(tasks[0]?.alias?.value ?? tasks[0]?.label ?? "");
  const [anchor, setAnchor] = useState<"start" | "end">("end");
  const [offset, setOffset] = useState("0");
  const [direction, setDirection] = useState<"after" | "before">("after");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  useEffect(() => setLabel(""), []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="divider-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(
            kind === "horizontal"
              ? { kind, label, beforeTaskId }
              : { kind, taskLabel, anchor, offset: Number(offset), direction },
          );
        }}
      >
        <h2 id="divider-dialog-title">Add separator</h2>
        <label>
          Separator type
          <select autoFocus value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="horizontal">Horizontal task section</option>
            <option value="vertical">Vertical timeline marker</option>
          </select>
        </label>
        {kind === "horizontal" ? (
          <>
            <label>
              Name
              <input
                required
                placeholder="Phase two"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label>
              Position
              <select value={beforeTaskId} onChange={(event) => setBeforeTaskId(event.target.value)}>
                <option value="">At the end</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    Before {task.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="dialog-hint">Creates a named horizontal section between task rows.</p>
          </>
        ) : (
          <>
            <label>
              Relative to task
              <select required value={taskLabel} onChange={(event) => setTaskLabel(event.target.value)}>
                {tasks.map((task) => (
                  <option key={task.id} value={task.alias?.value ?? task.label}>
                    {task.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task boundary
              <select value={anchor} onChange={(event) => setAnchor(event.target.value as typeof anchor)}>
                <option value="start">Start</option>
                <option value="end">End</option>
              </select>
            </label>
            <label>
              Offset (days)
              <input
                type="number"
                min="0"
                step="1"
                value={offset}
                onChange={(event) => setOffset(event.target.value)}
              />
            </label>
            {Number(offset) > 0 && (
              <label>
                Direction
                <select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
                  <option value="after">After</option>
                  <option value="before">Before</option>
                </select>
              </label>
            )}
            <p className="dialog-hint">Creates a vertical marker across the timeline relative to a task boundary.</p>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add separator
          </button>
        </div>
      </form>
    </div>
  );
}
