import { InspectorPanel } from "./InspectorPanel";
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
  onBoxless,
  onDelete,
  onClose,
}: {
  items: readonly DiagramBulkItem[];
  readOnly: boolean;
  onChange(mode: "color" | "stereotype", value: string): void;
  onCopy(): void;
  onDuplicate(): void;
  onPaste(): void;
  /** Mindmap only: draw the selected nodes without a box, or with one. */
  onBoxless?(boxless: boolean): void;
  /** Mindmap only: delete the selected nodes with their subtrees. */
  onDelete?(): void;
  onClose(): void;
}) {
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const colorCount = items.filter((item) => item.color).length;
  const stereotypeCount = items.filter((item) => item.stereotype).length;
  const boxlessCount = items.filter((item) => item.boxless).length;
  // Mindmap selections have no clipboard: copy, paste and duplicate only apply to the other kinds.
  const clipboard = !onBoxless;
  const styleLabel = onBoxless ? "Style class" : "Stereotype";
  return (
    <InspectorPanel className="task-inspector bulk-task-inspector" aria-label="Selected elements inspector">
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
                {styleLabel}
                <input value={stereotype} onChange={(event) => setStereotype(event.target.value)} />
              </label>
              <button type="button" onClick={() => onChange("stereotype", stereotype)}>
                {stereotype ? `Set ${styleLabel.toLowerCase()}` : `Clear ${styleLabel.toLowerCase()}`}
              </button>
              <small>
                {stereotypeCount} of {items.length} elements
              </small>
            </div>
          )}
          {onBoxless && boxlessCount > 0 && (
            <div className="bulk-task-row">
              <button type="button" onClick={() => onBoxless(true)}>
                Remove boxes
              </button>
              <button type="button" onClick={() => onBoxless(false)}>
                Add boxes
              </button>
              <small>
                {boxlessCount} of {items.length} nodes
              </small>
            </div>
          )}
        </fieldset>
        <div className="bulk-task-row">
          {clipboard && (
            <>
              <button type="button" onClick={onCopy}>
                Copy
              </button>
              <button type="button" disabled={readOnly} onClick={onPaste}>
                Paste
              </button>
              <button type="button" disabled={readOnly} onClick={onDuplicate}>
                Duplicate
              </button>
            </>
          )}
          {onDelete && (
            <button type="button" className="danger" disabled={readOnly} onClick={onDelete}>
              Delete selected
            </button>
          )}
        </div>
      </form>
      <p className="fieldset-help">
        {clipboard
          ? "Ctrl/⌘+C copies, Ctrl/⌘+V pastes, Ctrl/⌘+D duplicates. Each edit is one undo step. Paste into the same diagram type; WBS subtrees paste under the selected node."
          : "Each edit is one undo step. A node selected together with its parent is deleted with that parent, and at least one root stays."}
      </p>
    </InspectorPanel>
  );
}
