import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export function HighlightDateDialog({
  date,
  initialColor = "#ef4444",
  canClear = false,
  onApply,
  onClear,
  onClose,
}: {
  date: string;
  initialColor?: string | undefined;
  canClear?: boolean;
  onApply(color: string): void;
  onClear(): void;
  onClose(): void;
}) {
  const [color, setColor] = useState(/^#[0-9a-f]{6}$/i.test(initialColor) ? initialColor : "#ef4444");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);

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
        className="task-dialog highlight-date-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="highlight-date-title"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(color);
        }}
      >
        <h2 id="highlight-date-title">Highlight {date}</h2>
        <p className="highlight-date-help">
          Highlighting marks an important date. It does not close the day or affect task scheduling.
        </p>
        <label>
          Color
          <input autoFocus type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <span>
            {canClear && (
              <button type="button" className="danger" onClick={onClear}>
                Clear highlight
              </button>
            )}
          </span>
          <span>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Highlight
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}
