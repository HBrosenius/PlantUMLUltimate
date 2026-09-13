import { useRef, useState } from "react";
import { useDialogFocus } from "../use-dialog-focus";

export function ProjectUnlockDialog({
  fileName,
  onUnlock,
  onClose,
}: {
  fileName: string;
  onUnlock(password: string): void;
  onClose(): void;
}) {
  const [password, setPassword] = useState("");
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
        aria-labelledby="project-unlock-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (password) onUnlock(password);
        }}
      >
        <h2 id="project-unlock-title">Unlock file</h2>
        <p>{fileName} is encrypted. Enter its password to open it.</p>
        <label>
          Password
          <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!password}>
            Unlock
          </button>
        </footer>
      </form>
    </div>
  );
}
