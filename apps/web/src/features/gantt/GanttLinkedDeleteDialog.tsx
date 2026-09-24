import { useRef } from "react";
import { useDialogFocus } from "../../use-dialog-focus";

export function GanttLinkedDeleteDialog({
  taskLabel,
  nodeCount,
  taskCount,
  onChoose,
  onClose,
}: {
  taskLabel: string;
  nodeCount: number;
  taskCount: number;
  onChoose(policy: "keep" | "delete"): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gantt-linked-delete-title"
      >
        <h2 id="gantt-linked-delete-title">Delete linked Gantt work?</h2>
        <p>“{taskLabel}” is linked to a WBS node.</p>
        <p>
          Keep the WBS node and unlink this task, or delete the WBS subtree
          {nodeCount > 1 ? ` (${nodeCount} nodes)` : ""} and its {taskCount} linked Gantt
          {taskCount === 1 ? " task" : " tasks"}.
        </p>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onChoose("keep")}>
            Keep WBS node
          </button>
          <button type="button" className="danger" onClick={() => onChoose("delete")}>
            Delete in both diagrams
          </button>
        </footer>
      </div>
    </div>
  );
}
