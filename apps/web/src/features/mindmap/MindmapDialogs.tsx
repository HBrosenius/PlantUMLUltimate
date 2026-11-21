import { useRef, useState, type FormEvent } from "react";
import type { MindmapNode, MindmapNodeInput } from "@plantuml-studio/diagram-mindmap";
import { ColorField } from "../../ColorField";
import { useDialogFocus } from "../../use-dialog-focus";

export type MindmapInsertPosition = "root" | "child" | "sibling";

export function AddMindmapNodeDialog({
  selected,
  hasRoot,
  sidesApply,
  blocker,
  onAdd,
  onClose,
  initialPosition,
}: {
  selected: MindmapNode | undefined;
  hasRoot: boolean;
  /** False in right-to-left documents, where a branch has no side. */
  sidesApply: boolean;
  /** Why nothing can be added around the selected node (Markdown form), or undefined. */
  blocker?: string | undefined;
  /** Which position is preselected when a node is selected. */
  initialPosition?: "child" | "sibling" | undefined;
  onAdd(value: MindmapNodeInput, position: MindmapInsertPosition): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose);
  const [label, setLabel] = useState("");
  const [position, setPosition] = useState<MindmapInsertPosition>(selected ? (initialPosition ?? "child") : "root");
  const [side, setSide] = useState<"" | "left" | "right">("");
  const [color, setColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const resultDepth =
    position === "root" ? 1 : position === "child" ? (selected?.depth ?? 0) + 1 : (selected?.depth ?? 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || blocker) return;
    onAdd(
      {
        label: label.trim(),
        color,
        textColor,
        ...(resultDepth === 2 && sidesApply && side ? { side } : {}),
      },
      position,
    );
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        ref={dialog}
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add mindmap node"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>Add mindmap node</h2>
        {blocker && (
          <p role="alert" className="field-error">
            {blocker}
          </p>
        )}
        <label>
          Label
          <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <ColorField label="Background color" value={color} onChange={setColor} />
        <ColorField label="Text color" value={textColor} onChange={setTextColor} />
        <label>
          Position
          <select value={position} onChange={(event) => setPosition(event.target.value as MindmapInsertPosition)}>
            {!hasRoot && <option value="root">Root</option>}
            {selected && (
              <>
                <option value="child">Child of selected node</option>
                {selected.depth > 1 && <option value="sibling">Sibling after selected node</option>}
              </>
            )}
          </select>
        </label>
        {resultDepth === 2 && sidesApply && (
          <label>
            Branch side
            <select value={side} onChange={(event) => setSide(event.target.value as "" | "left" | "right")}>
              <option value="">Automatic</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={Boolean(blocker)}>
            Add node
          </button>
        </div>
      </form>
    </div>
  );
}
