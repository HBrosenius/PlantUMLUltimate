import { useRef } from "react";
import { useDialogFocus } from "../use-dialog-focus";
import type { ProjectLeaveChoice } from "./use-unsaved-project-guard";

export function UnsavedProjectDialog({
  projectName,
  action,
  onChoice,
}: {
  projectName: string;
  action: string;
  onChoice(choice: ProjectLeaveChoice): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = () => onChoice("cancel");
  useDialogFocus(dialog, cancel);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && cancel()}
    >
      <div ref={dialog} className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-project-title">
        <h2 id="unsaved-project-title">Save document changes?</h2>
        <p>
          {projectName} has unsaved changes to its diagrams or connections. Save before you {action}?
        </p>
        <footer>
          <button type="button" autoFocus onClick={cancel}>
            Cancel
          </button>
          <button type="button" onClick={() => onChoice("discard")}>
            Discard changes
          </button>
          <button type="button" onClick={() => onChoice("save")}>
            Save and continue
          </button>
        </footer>
      </div>
    </div>
  );
}
