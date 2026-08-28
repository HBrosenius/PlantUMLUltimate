import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export function RenameSymbolDialog({
  kind,
  value,
  occurrenceCount,
  onRename,
  onClose,
}: {
  kind: "task" | "task alias" | "person" | "participant" | "participant alias";
  value: string;
  occurrenceCount: number;
  onRename(value: string): void;
  onClose(): void;
}) {
  const [nextValue, setNextValue] = useState(value);
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
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-symbol-title"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(nextValue);
        }}
      >
        <h2 id="rename-symbol-title">Rename {kind}</h2>
        <p>
          {occurrenceCount} semantic occurrence{occurrenceCount === 1 ? "" : "s"} will be updated. Comments and notes
          are left unchanged.
        </p>
        <label>
          New name
          <input autoFocus required value={nextValue} onChange={(event) => setNextValue(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Rename</button>
        </div>
      </form>
    </div>
  );
}
