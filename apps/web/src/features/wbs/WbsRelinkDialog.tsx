import { useRef } from "react";
import { useDialogFocus } from "../../use-dialog-focus";

export function WbsRelinkDialog({
  nodeLabel,
  oldTaskLabel,
  newTaskLabel,
  onChoose,
  onClose,
}: {
  nodeLabel: string;
  oldTaskLabel: string;
  newTaskLabel: string;
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
      <div ref={dialog} className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="wbs-relink-title">
        <h2 id="wbs-relink-title">Change linked Gantt task?</h2>
        <p>
          Link WBS node “{nodeLabel}” to “{newTaskLabel}” instead of “{oldTaskLabel}”.
        </p>
        <p>
          Choose what happens to “{oldTaskLabel}”. Keeping it preserves its dates, assignments, and dependencies as
          unlinked Gantt work.
        </p>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onChoose("keep")}>
            Keep old task unlinked
          </button>
          <button type="button" className="danger" onClick={() => onChoose("delete")}>
            Remove old task
          </button>
        </footer>
      </div>
    </div>
  );
}
