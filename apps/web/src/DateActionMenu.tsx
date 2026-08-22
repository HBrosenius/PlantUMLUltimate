import { useRef } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export type DateActionMenuState = "none" | "highlighted" | "closed" | "opened";

export function DateActionMenu({
  date,
  state,
  onHighlight,
  onMarkClosed,
  onClear,
  onClose,
}: {
  date: string;
  state: DateActionMenuState;
  onHighlight(): void;
  onMarkClosed(): void;
  onClear(): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);

  const stateLabel =
    state === "highlighted"
      ? "Currently highlighted"
      : state === "closed"
        ? "Currently marked as a closed day"
        : state === "opened"
          ? "Currently marked as an opened day"
          : "No date setting";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="task-dialog date-action-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-action-menu-title"
      >
        <h2 id="date-action-menu-title">{date}</h2>
        <p className="date-action-menu-state">{stateLabel}</p>
        <div className="date-action-menu-actions">
          <button type="button" onClick={onHighlight}>
            {state === "highlighted" ? "Change highlight" : "Highlight date"}
          </button>
          <button type="button" onClick={onMarkClosed} disabled={state === "closed"}>
            {state === "closed" ? "Already a closed day" : "Mark as closed day"}
          </button>
          <button type="button" className="danger" onClick={onClear} disabled={state === "none"}>
            Clear date setting
          </button>
        </div>
        <div className="dialog-actions">
          <span />
          <span>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
