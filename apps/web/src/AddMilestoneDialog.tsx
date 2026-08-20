import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export interface AddMilestoneValue {
  label: string;
  mode: "fixed" | "relative";
  date?: string;
  referenceLabel?: string;
  referenceAnchor?: "start" | "end";
}

export function AddMilestoneDialog({
  taskLabels,
  onAdd,
  onClose,
}: {
  taskLabels: readonly string[];
  onAdd(value: AddMilestoneValue): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"fixed" | "relative">("fixed");
  const [date, setDate] = useState("");
  const [referenceLabel, setReferenceLabel] = useState(taskLabels[0] ?? "");
  const [referenceAnchor, setReferenceAnchor] = useState<"start" | "end">("end");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add milestone"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            label,
            mode,
            ...(mode === "fixed" ? { date } : { referenceLabel, referenceAnchor }),
          });
        }}
      >
        <h2>Add milestone</h2>
        <label>
          Name
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Date type
          <select value={mode} onChange={(event) => setMode(event.target.value as "fixed" | "relative")}>
            <option value="fixed">Set date</option>
            <option value="relative">Relative to task</option>
          </select>
        </label>
        {mode === "fixed" ? (
          <label>
            Date
            <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        ) : (
          <>
            <label>
              Relative to
              <select required value={referenceLabel} onChange={(event) => setReferenceLabel(event.target.value)}>
                <option value="" disabled>
                  Select a task or milestone
                </option>
                {taskLabels.map((task) => (
                  <option key={task} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            </label>
            <label>
              At its
              <select
                value={referenceAnchor}
                onChange={(event) => setReferenceAnchor(event.target.value as "start" | "end")}
              >
                <option value="end">End</option>
                <option value="start">Start</option>
              </select>
            </label>
          </>
        )}
        <p className="dialog-hint">
          {mode === "fixed"
            ? "The milestone stays on this calendar date."
            : "The milestone follows the selected object's calculated start or end."}
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Add milestone
          </button>
        </div>
      </form>
    </div>
  );
}
