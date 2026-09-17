import { useState } from "react";
import type { WbsDocument, WbsNode, WbsNodeInput, WbsRelationship } from "@plantuml-studio/diagram-wbs";
import { ColorField } from "../../ColorField";
import { IconField } from "../../IconField";

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
  // Not user-editable here (dropped from the inspector as unnecessary complexity) — carried
  // through unchanged so applying an unrelated field doesn't erase a stereotype set via source.
  const stereotype = node.stereotype ?? "";
  const [link, setLink] = useState(node.link ?? "");
  const [icon, setIcon] = useState(node.icon ?? "");
  const [side, setSide] = useState<"left" | "right">(node.side === "left" ? "left" : "right");
  const labelMissing = !label.trim();
  const iconTrimmed = icon.trim();
  const iconInvalid = iconTrimmed.length > 0 && !/^[$&][\w-]+$/.test(iconTrimmed);
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
        <textarea
          required
          rows={label.includes("\n") ? Math.min(8, label.split("\n").length + 1) : 2}
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
        Link URL
        <input
          type="url"
          placeholder="https://example.com"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
      </label>
      <label>
        Icon
        <IconField value={icon} onChange={setIcon} invalid={iconInvalid} {...(iconInvalid ? { describedBy: "wbs-icon-error" } : {})} />
      </label>
      {iconInvalid && (
        <span id="wbs-icon-error" className="field-error" role="alert">
          Start with <code>&amp;</code> for a built-in icon (e.g. <code>&amp;home</code>) or <code>$</code> for a
          custom sprite (e.g. <code>$my-sprite</code>).
        </span>
      )}
      <div className="inspector-actions">
        <button onClick={onAddChild}>Add child…</button>
        <button
          disabled={labelMissing || iconInvalid}
          onClick={() => onApply({ label, color, textColor, stereotype, link, icon, side })}
        >
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
