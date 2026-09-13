import { useRef, useState } from "react";
import { useDialogFocus } from "../use-dialog-focus";

export function ProjectNameDialog({
  title,
  initialValue,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initialValue: string;
  submitLabel: string;
  onSubmit(value: string): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(initialValue);
  const form = useRef<HTMLFormElement>(null);
  useDialogFocus(form, onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        ref={form}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-name-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <h2 id="project-name-dialog-title">{title}</h2>
        <label>
          Name
          <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} required />
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!value.trim()}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
