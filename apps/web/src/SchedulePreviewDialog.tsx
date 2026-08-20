export interface SchedulePreview {
  taskLabel: string;
  days: number;
  action: "Move" | "Resize";
  singleSource: string;
  cascadeSource: string;
  affected: Array<{ id: string; label: string; oldDate: string; newDate: string }>;
  conflicts: string[];
}

export function SchedulePreviewDialog({
  preview,
  onChoose,
  onClose,
}: {
  preview: SchedulePreview;
  onChoose(cascade: boolean): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="task-dialog schedule-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-preview-title"
      >
        <h2 id="schedule-preview-title">Update dependent schedule?</h2>
        <p>
          {preview.action} <strong>{preview.taskLabel}</strong> by {preview.days > 0 ? "+" : ""}
          {preview.days} day{Math.abs(preview.days) === 1 ? "" : "s"}.
        </p>
        <p className="schedule-chain">
          This also affects {preview.affected.length} downstream task{preview.affected.length === 1 ? "" : "s"}:
        </p>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Current</th>
              <th>Proposed</th>
            </tr>
          </thead>
          <tbody>
            {preview.affected.map((task) => (
              <tr key={task.id}>
                <td>{task.label}</td>
                <td>{task.oldDate || "Relative"}</td>
                <td>{task.newDate || "Relative"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.conflicts.length > 0 && (
          <p className="schedule-warning">⚠ Proposed resource conflicts: {preview.conflicts.join(", ")}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onChoose(false)}>
            Only {preview.taskLabel}
          </button>
          <button type="button" className="primary" onClick={() => onChoose(true)}>
            Include dependents
          </button>
        </div>
      </section>
    </div>
  );
}
import { useRef } from "react";
import { useDialogFocus } from "./use-dialog-focus";
