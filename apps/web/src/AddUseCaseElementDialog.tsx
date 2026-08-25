import { useId, useRef, useState } from "react";
import type { UseCaseElementInput, UseCaseElementKind } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";
import { useDialogFocus } from "./use-dialog-focus";

export function AddUseCaseElementDialog({
  initialKind,
  onAdd,
  onClose,
}: {
  initialKind: UseCaseElementKind;
  onAdd(value: UseCaseElementInput): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [label, setLabel] = useState("");
  const [alias, setAlias] = useState("");
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const [business, setBusiness] = useState(false);
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
        aria-label="Add Use Case object"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            kind,
            label,
            business,
            ...(alias.trim() ? { alias } : {}),
            ...(color.trim() ? { color } : {}),
            ...(stereotype.trim() ? { stereotype } : {}),
          });
        }}
      >
        <h2>Add Use Case object</h2>
        <label>
          Type
          <select value={kind} onChange={(event) => setKind(event.target.value as UseCaseElementKind)}>
            <option value="actor">Actor</option>
            <option value="usecase">Use case</option>
          </select>
        </label>
        <label>
          Name
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Alias
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Optional source identifier"
          />
        </label>
        <label>
          Color
          <input
            list={colorListId}
            autoComplete="off"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="#LightBlue"
          />
        </label>
        <datalist id={colorListId}>
          {PLANTUML_COLOR_NAMES.map((name) => (
            <option key={name} value={`#${name}`} />
          ))}
        </datalist>
        <label>
          Stereotype
          <input value={stereotype} onChange={(event) => setStereotype(event.target.value)} placeholder="Primary" />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={business} onChange={(event) => setBusiness(event.target.checked)} /> Business{" "}
          {kind === "actor" ? "actor" : "use case"}
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add {kind === "actor" ? "actor" : "use case"}
          </button>
        </div>
      </form>
    </div>
  );
}
