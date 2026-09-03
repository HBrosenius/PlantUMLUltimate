import { useRef, useState } from "react";
import type { UseCaseNoteInput } from "@plantuml-studio/diagram-usecase";
import { ColorField } from "./ColorField";
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
  const [alias, setAlias] = useState("Note");
  const [placement, setPlacement] = useState<UseCaseNoteInput["placement"]>("right");
  const [text, setText] = useState("");
  const [color, setColor] = useState("");
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
          onAdd({
            ...(targetId ? { targetId } : { alias }),
            placement,
            text,
            ...(color.trim() ? { color } : {}),
          });
        }}
      >
        <h2>Add note</h2>
        <label>
          Attached to
          <select
            aria-label="Attached to"
            autoFocus
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Floating note</option>
            {elements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!targetId && (
          <label>
            Alias
            <input required value={alias} onChange={(event) => setAlias(event.target.value)} />
          </label>
        )}
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
        <ColorField value={color} onChange={setColor} placeholder="#LightYellow" namePrefix="#" />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={!text.trim() || (!targetId && !alias.trim())}>
            Add note
          </button>
        </div>
      </form>
    </div>
  );
}
