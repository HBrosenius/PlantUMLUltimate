import { useRef, useState, type FormEvent } from "react";
import type { WbsNode, WbsNodeInput } from "@plantuml-studio/diagram-wbs";
import { ColorField } from "../../ColorField";
import { useDialogFocus } from "../../use-dialog-focus";

export type WbsInsertPosition = "root" | "child" | "sibling";

export function AddWbsNodeDialog({
  selected,
  hasRoot,
  onAdd,
  onClose,
}: {
  selected: WbsNode | undefined;
  hasRoot: boolean;
  onAdd(value: WbsNodeInput, position: WbsInsertPosition): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const [label, setLabel] = useState("");
  const [position, setPosition] = useState<WbsInsertPosition>(selected ? "child" : "root");
  const [side, setSide] = useState<"left" | "right">(selected?.side === "left" ? "left" : "right");
  const [color, setColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (label.trim()) onAdd({ label: label.trim(), side, color, textColor }, position);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add WBS node"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>Add WBS node</h2>
        <label>
          Label
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <ColorField label="Background color" value={color} onChange={setColor} />
        <ColorField label="Text color" value={textColor} onChange={setTextColor} />
        <label>
          Position
          <select value={position} onChange={(event) => setPosition(event.target.value as WbsInsertPosition)}>
            {!hasRoot && <option value="root">Root</option>}
            {selected && (
              <>
                <option value="child">Child of selected node</option>
                <option value="sibling">Sibling after selected node</option>
              </>
            )}
          </select>
        </label>
        <label>
          Branch side
          <select value={side} onChange={(event) => setSide(event.target.value as "left" | "right")}>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Add node</button>
        </div>
      </form>
    </div>
  );
}
