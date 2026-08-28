import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export function RenameSymbolDialog({
  kind,
  value,
  occurrenceCount,
  validate,
  onRename,
  onClose,
}: {
  kind:
    | "task"
    | "task alias"
    | "person"
    | "participant"
    | "participant alias"
    | "actor"
    | "actor alias"
    | "use case"
    | "use case alias"
    | "class entity"
    | "class entity alias"
    | "activity action"
    | "activity partition"
    | "WBS node"
    | "WBS node alias";
  value: string;
  occurrenceCount: number;
  validate?(value: string): string | undefined;
  onRename(value: string): void;
  onClose(): void;
}) {
  const [nextValue, setNextValue] = useState(value);
  const validationMessage = validate?.(nextValue);
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
          if (validationMessage) return;
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
          <input
            autoFocus
            required
            value={nextValue}
            aria-invalid={Boolean(validationMessage)}
            aria-describedby={validationMessage ? "rename-symbol-error" : undefined}
            onChange={(event) => setNextValue(event.target.value)}
          />
        </label>
        {validationMessage && (
          <p id="rename-symbol-error" className="field-error" role="alert">
            {validationMessage}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={Boolean(validationMessage)}>
            Rename
          </button>
        </div>
      </form>
    </div>
  );
}
