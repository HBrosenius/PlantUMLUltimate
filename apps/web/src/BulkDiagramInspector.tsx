import { useState } from "react";
import { ColorField } from "./ColorField";
import type { DiagramBulkItem } from "./diagram-bulk-operations";
export function BulkDiagramInspector({
  items,
  readOnly,
  onChange,
  onCopy,
  onDuplicate,
  onPaste,
  onClose,
}: {
  items: readonly DiagramBulkItem[];
  readOnly: boolean;
  onChange(mode: "color" | "stereotype", value: string): void;
  onCopy(): void;
  onDuplicate(): void;
  onPaste(): void;
  onClose(): void;
}) {
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const colorCount = items.filter((item) => item.color).length;
  const stereotypeCount = items.filter((item) => item.stereotype).length;
  return (
    <aside className="task-inspector bulk-task-inspector" aria-label="Selected elements inspector">
      <header>
        <strong>{items.length} elements selected</strong>
        <button onClick={onClose} aria-label="Clear element selection">
          ×
        </button>
      </header>
      <p className="bulk-task-names">{items.map((item) => item.label).join(", ")}</p>
      <p className="fieldset-help">
        Shift- or Ctrl/⌘-click to toggle elements. Ctrl/⌘+A selects all while the diagram has focus.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset disabled={readOnly}>
          {colorCount > 0 && (
            <div className="bulk-task-row">
              <ColorField value={color} onChange={setColor} />
              <button type="button" onClick={() => onChange("color", color)}>
                {color ? "Set color" : "Clear color"}
              </button>
              <small>
                {colorCount} of {items.length} elements
              </small>
            </div>
          )}
          {stereotypeCount > 0 && (
            <div className="bulk-task-row">
              <label>
                Stereotype
                <input value={stereotype} onChange={(event) => setStereotype(event.target.value)} />
              </label>
              <button type="button" onClick={() => onChange("stereotype", stereotype)}>
                {stereotype ? "Set stereotype" : "Clear stereotype"}
              </button>
              <small>
                {stereotypeCount} of {items.length} elements
              </small>
            </div>
          )}
        </fieldset>
        <div className="bulk-task-row">
          <button type="button" onClick={onCopy}>
            Copy
          </button>
          <button type="button" disabled={readOnly} onClick={onPaste}>
            Paste
          </button>
          <button type="button" disabled={readOnly} onClick={onDuplicate}>
            Duplicate
          </button>
        </div>
      </form>
      <p className="fieldset-help">
        Ctrl/⌘+C copies, Ctrl/⌘+V pastes, Ctrl/⌘+D duplicates. Each edit is one undo step. Paste into the same diagram
        type; WBS subtrees paste under the selected node.
      </p>
    </aside>
  );
}
