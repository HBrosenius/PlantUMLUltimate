import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export interface AddTaskValue {
  label: string;
  durationDays: number;
  startDate?: string;
  predecessorLabel?: string;
}

export function AddTaskDialog({
  taskLabels,
  onAdd,
  onClose,
}: {
  taskLabels: string[];
  onAdd(value: AddTaskValue): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [predecessor, setPredecessor] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add task"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            label,
            durationDays: Number(duration),
            ...(predecessor ? { predecessorLabel: predecessor } : startDate ? { startDate } : {}),
          });
        }}
      >
        <h2>Add task</h2>
        <label>
          Name
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Duration (days)
          <input
            required
            type="number"
            min="1"
            step="1"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label>
          Starts after
          <select value={predecessor} onChange={(event) => setPredecessor(event.target.value)}>
            <option value="">No dependency</option>
            {taskLabels.map((task) => (
              <option key={task} value={task}>
                {task}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start date
          <input
            type="date"
            disabled={Boolean(predecessor)}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <p className="dialog-hint">A dependency takes precedence over an explicit start date.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Add task
          </button>
        </div>
      </form>
    </div>
  );
}
