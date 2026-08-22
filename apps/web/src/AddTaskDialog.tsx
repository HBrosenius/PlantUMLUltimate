import { useId, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

export interface AddTaskValue {
  label: string;
  durationDays: number;
  startDate?: string;
  predecessorLabel?: string;
  color?: string;
}

export function AddTaskDialog({
  taskLabels,
  defaultStartDate,
  onAdd,
  onClose,
}: {
  taskLabels: string[];
  defaultStartDate?: string | undefined;
  onAdd(value: AddTaskValue): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState("1");
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [predecessor, setPredecessor] = useState("");
  const [color, setColor] = useState("");
  const colorListId = useId();
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
            ...(color.trim() ? { color: color.trim() } : {}),
          });
        }}
      >
        <h2>Add task</h2>
        <label>
          Name
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            placeholder="Start typing a PlantUML color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <datalist id={colorListId}>
            {PLANTUML_COLOR_NAMES.map((name) => <option key={name} value={name} />)}
          </datalist>
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
            required={!predecessor}
            disabled={Boolean(predecessor)}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <p className="dialog-hint">
          Standalone tasks need a start date so they can be moved. A dependency takes precedence over it.
        </p>
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
