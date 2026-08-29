import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

export function RenameSymbolDialog({
  kind,
  value,
  occurrenceCount,
  occurrences,
  source,
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
    | "sequence anchor"
    | "actor"
    | "actor alias"
    | "use case"
    | "use case alias"
    | "use case package"
    | "use case package alias"
    | "class entity"
    | "class entity alias"
    | "class package"
    | "class package alias"
    | "activity action"
    | "activity partition"
    | "WBS node"
    | "WBS node alias";
  value: string;
  occurrenceCount: number;
  occurrences: Array<{ range: { from: number; to: number }; role: "declaration" | "reference" }>;
  source: string;
  validate?(value: string): string | undefined;
  onRename(value: string): void;
  onClose(): void;
}) {
  const [nextValue, setNextValue] = useState(value);
  const validationMessage = validate?.(nextValue);
  const dialog = useRef<HTMLFormElement>(null);
  const preview = occurrences.map((occurrence) => {
    const before = source.slice(0, occurrence.range.from);
    const line = before.split("\n").length;
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineEnd = source.indexOf("\n", occurrence.range.to);
    const originalLine = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    const from = occurrence.range.from - lineStart;
    const to = occurrence.range.to - lineStart;
    return {
      line,
      role: occurrence.role,
      before: originalLine,
      after: `${originalLine.slice(0, from)}${nextValue.trim()}${originalLine.slice(to)}`,
    };
  });
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
        <details className="rename-preview">
          <summary>
            Preview {preview.length} edit{preview.length === 1 ? "" : "s"}
          </summary>
          <ol>
            {preview.map((item, index) => (
              <li key={`${item.line}-${index}`}>
                <span>
                  Line {item.line} · {item.role}
                </span>
                <code>{item.before}</code>
                <code>{item.after}</code>
              </li>
            ))}
          </ol>
        </details>
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
