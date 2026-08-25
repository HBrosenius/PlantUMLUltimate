import { useId, useRef, useState } from "react";
import type { UseCaseNoteInput } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";
import { useDialogFocus } from "./use-dialog-focus";

export function AddUseCaseNoteDialog({
  elements,
  onAdd,
  onClose,
}: {
  elements: Array<{ id: string; label: string }>;
  onAdd(value: UseCaseNoteInput): void;
  onClose(): void;
}) {
  const [targetId, setTargetId] = useState(elements[0]?.id ?? "");
  const [placement, setPlacement] = useState<UseCaseNoteInput["placement"]>("right");
  const [text, setText] = useState("");
  const [color, setColor] = useState("");
  const colorListId = useId();
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add Use Case note"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({ targetId, placement, text, ...(color.trim() ? { color } : {}) });
        }}
      >
        <h2>Add note</h2>
        <label>
          Attached to
          <select
            aria-label="Attached to"
            autoFocus
            required
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {elements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Position
          <select
            value={placement}
            onChange={(event) => setPlacement(event.target.value as UseCaseNoteInput["placement"])}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label>
          Text
          <textarea autoFocus required value={text} onChange={(event) => setText(event.target.value)} rows={5} />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="#LightYellow"
          />
        </label>
        <datalist id={colorListId}>
          {PLANTUML_COLOR_NAMES.map((name) => (
            <option key={name} value={`#${name}`} />
          ))}
        </datalist>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!targetId || !text.trim()}>
            Add note
          </button>
        </div>
      </form>
    </div>
  );
}
