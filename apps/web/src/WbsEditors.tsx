import { useRef, useState, type FormEvent } from "react";
import type { WbsDocument, WbsNode, WbsNodeInput, WbsRelationship } from "@plantuml-studio/diagram-wbs";
import { useDialogFocus } from "./use-dialog-focus";
import { ColorField } from "./ClassEditors";

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

export function WbsNodeInspector({
  node,
  onApply,
  onDelete,
  onAddChild,
  onClose,
}: {
  node: WbsNode;
  onApply(value: WbsNodeInput): void;
  onDelete(): void;
  onAddChild(): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState(node.label);
  const [color, setColor] = useState(node.color ?? "");
  const [textColor, setTextColor] = useState(node.textColor ?? "");
  const [stereotype, setStereotype] = useState(node.stereotype ?? "");
  const [side, setSide] = useState<"left" | "right">(node.side === "left" ? "left" : "right");
  const labelMissing = !label.trim();
  return (
    <aside className="task-inspector wbs-node-inspector" aria-label="WBS node inspector">
      <header>
        <h2>WBS node</h2>
        <button onClick={onClose} aria-label="Close WBS node inspector">
          ×
        </button>
      </header>
      <label>
        Label
        <input
          required
          aria-invalid={labelMissing}
          aria-describedby={labelMissing ? "wbs-label-error" : undefined}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        {labelMissing && (
          <span id="wbs-label-error" className="field-error" role="alert">
            Enter a node label.
          </span>
        )}
      </label>
      <label>
        Branch side
        <select
          value={side}
          disabled={node.depth === 1}
          onChange={(event) => setSide(event.target.value as "left" | "right")}
        >
          <option value="right">Right</option>
          <option value="left">Left</option>
        </select>
      </label>
      <ColorField label="Background color" value={color} onChange={setColor} />
      <ColorField label="Text color" value={textColor} onChange={setTextColor} />
      <label>
        Stereotype
        <input placeholder="phase" value={stereotype} onChange={(event) => setStereotype(event.target.value)} />
      </label>
      <div className="inspector-actions">
        <button onClick={onAddChild}>Add child…</button>
        <button disabled={labelMissing} onClick={() => onApply({ label, color, textColor, stereotype, side })}>
          Apply
        </button>
        <button className="danger" onClick={onDelete}>
          Delete subtree
        </button>
      </div>
    </aside>
  );
}

export function WbsSettingsInspector({
  source,
  onApply,
  onClose,
}: {
  source: string;
  onApply(value: { title: string }): void;
  onClose(): void;
}) {
  const [title, setTitle] = useState(source.match(/^\s*title\s+(.+)$/im)?.[1] ?? "");
  return (
    <aside className="task-inspector" aria-label="WBS settings">
      <header>
        <h2>WBS settings</h2>
        <button onClick={onClose} aria-label="Close WBS settings">
          ×
        </button>
      </header>
      <label>
        Diagram title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="inspector-actions">
        <button onClick={() => onApply({ title })}>Apply</button>
      </div>
    </aside>
  );
}

export function WbsRelationshipInspector({
  relationship,
  document,
  onApply,
  onDelete,
  onClose,
}: {
  relationship: WbsRelationship;
  document: WbsDocument;
  onApply(color: string): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [color, setColor] = useState(relationship.color ?? "");
  const from = document.nodes.find((node) => node.alias === relationship.from)?.label ?? relationship.from;
  const to = document.nodes.find((node) => node.alias === relationship.to)?.label ?? relationship.to;
  return (
    <aside className="task-inspector" aria-label="WBS arrow inspector">
      <header>
        <h2>WBS arrow</h2>
        <button onClick={onClose} aria-label="Close WBS arrow inspector">
          ×
        </button>
      </header>
      <p className="inspector-summary">
        {from} → {to}
      </p>
      <ColorField label="Arrow color" value={color} onChange={setColor} />
      <div className="inspector-actions">
        <button onClick={() => onApply(color)}>Apply</button>
        <button className="danger" onClick={onDelete}>
          Delete arrow
        </button>
      </div>
    </aside>
  );
}
