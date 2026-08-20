import { useEffect, useRef, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { useDialogFocus } from "./use-dialog-focus";

export function AddDividerDialog({
  tasks,
  onAdd,
  onClose,
}: {
  tasks: readonly GanttTask[];
  onAdd(label: string, beforeTaskId: string): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [beforeTaskId, setBeforeTaskId] = useState("");
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
          onAdd(label, beforeTaskId);
        }}
      >
        <h2 id="divider-dialog-title">Add divider</h2>
        <label>
          Name
          <input
            autoFocus
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
        <p className="dialog-hint">Dividers create named horizontal sections in the Gantt diagram.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add divider
          </button>
        </div>
      </form>
    </div>
  );
}
