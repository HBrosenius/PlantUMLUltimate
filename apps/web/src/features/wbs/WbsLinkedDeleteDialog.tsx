import { useRef } from "react";
import { useDialogFocus } from "../../use-dialog-focus";

export function WbsLinkedDeleteDialog({
  label,
  nodeCount,
  taskCount,
  onChoose,
  onClose,
}: {
  label: string;
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
        aria-labelledby="wbs-linked-delete-title"
      >
        <h2 id="wbs-linked-delete-title">Delete linked WBS work?</h2>
        <p>
          Delete “{label}”{nodeCount > 1 ? ` and ${nodeCount - 1} descendant${nodeCount === 2 ? "" : "s"}` : ""} from
          the WBS.
          {` ${taskCount} linked Gantt ${taskCount === 1 ? "task is" : "tasks are"} affected.`}
        </p>
        <p>
          Choose whether to keep those tasks with their dates and assignments, or remove them from the Gantt chart too.
        </p>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onChoose("keep")}>
            Keep Gantt tasks
          </button>
          <button type="button" className="danger" onClick={() => onChoose("delete")}>
            Delete in both diagrams
          </button>
        </footer>
      </div>
    </div>
  );
}
