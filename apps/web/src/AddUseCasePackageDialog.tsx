import { useRef, useState } from "react";
import type { UseCasePackageInput } from "@plantuml-studio/diagram-usecase";
import { ColorField } from "./ColorField";
import { useDialogFocus } from "./use-dialog-focus";

export function AddUseCasePackageDialog({
  onAdd,
  onClose,
}: {
  onAdd(value: UseCasePackageInput): void;
  onClose(): void;
}) {
  const [kind, setKind] = useState<UseCasePackageInput["kind"]>("rectangle");
  const [label, setLabel] = useState("");
  const [alias, setAlias] = useState("");
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add Use Case package"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({
            kind,
            label,
            ...(alias.trim() ? { alias } : {}),
            ...(color.trim() ? { color } : {}),
            ...(stereotype.trim() ? { stereotype } : {}),
          });
        }}
      >
        <h2>Add package or system boundary</h2>
        <label>
          Container type
          <select value={kind} onChange={(event) => setKind(event.target.value as UseCasePackageInput["kind"])}>
            <option value="rectangle">System boundary</option>
            <option value="package">Package</option>
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
        <ColorField value={color} onChange={setColor} placeholder="#LightBlue" namePrefix="#" />
        <label>
          Stereotype
          <input value={stereotype} onChange={(event) => setStereotype(event.target.value)} />
        </label>
        <p className="field-hint">
          A new empty container is added. Objects can be moved into it from source now; visual containment comes with
          drag and drop.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Add container
          </button>
        </div>
      </form>
    </div>
  );
}
