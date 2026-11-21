import { useEffect, useRef, useState } from "react";
import {
  MINDMAP_OFFERED_DIRECTIONS,
  type MindmapDirection,
  type MindmapDocument,
  type MindmapNode,
  type MindmapNodeInput,
} from "@plantuml-studio/diagram-mindmap";
import { ColorField } from "../../ColorField";
import { IconField } from "../../IconField";
import { InspectorPanel } from "../../InspectorPanel";
import { mergeChangedFields } from "../../inspector-sync";
import type { MindmapSettings } from "./use-mindmap-actions";

const ICON_PATTERN = /^[$&][\w-]+$/;

export function MindmapNodeInspector({
  node,
  sidesApply,
  deleteBlocker,
  onApply,
  onToggleBoxless,
  onSideChange,
  onDelete,
  onAddChild,
  onAddSibling,
  onConvert,
  onClose,
}: {
  node: MindmapNode;
  /** False in right-to-left documents, where a branch has no side. */
  sidesApply: boolean;
  /** Why the node cannot be deleted (it is the only root), or undefined. */
  deleteBlocker?: string | undefined;
  onApply(value: MindmapNodeInput): void;
  onToggleBoxless(boxless: boolean): void;
  onSideChange(side: "left" | "right"): void;
  onDelete(): void;
  onAddChild(): void;
  onAddSibling(): void;
  onConvert(): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState(node.label);
  const [color, setColor] = useState(node.color ?? "");
  const [textColor, setTextColor] = useState(node.textColor ?? "");
  const [styleClass, setStyleClass] = useState(node.stereotype ?? "");
  const [link, setLink] = useState(node.link ?? "");
  const [icon, setIcon] = useState(node.icon ?? "");
  // Only take fields the source changed, so committing one field does not wipe what was just typed
  // into the next one when the re-parsed node arrives.
  const sourceValues = {
    label: node.label,
    color: node.color ?? "",
    textColor: node.textColor ?? "",
    styleClass: node.stereotype ?? "",
    link: node.link ?? "",
    icon: node.icon ?? "",
  };
  const previousSource = useRef(sourceValues);
  useEffect(() => {
    const previous = previousSource.current;
    previousSource.current = sourceValues;
    const local = { label, color, textColor, styleClass, link, icon };
    const merged = mergeChangedFields(local, previous, sourceValues);
    if (merged === local) return;
    setLabel(merged.label);
    setColor(merged.color);
    setTextColor(merged.textColor);
    setStyleClass(merged.styleClass);
    setLink(merged.link);
    setIcon(merged.icon);
    // Runs only when the node's own values change; local edits are read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.label, node.color, node.textColor, node.stereotype, node.link, node.icon]);
  const sourceOnly = node.markdown !== undefined;
  const labelMissing = !label.trim();
  const iconTrimmed = icon.trim();
  const iconInvalid = iconTrimmed.length > 0 && !ICON_PATTERN.test(iconTrimmed);
  const styleClassInvalid = /[<>\s]/.test(styleClass.trim());
  const commit = (override: Partial<typeof sourceValues> = {}) => {
    const next = { label, color, textColor, styleClass, link, icon, ...override };
    if (sourceOnly || !next.label.trim() || styleClassInvalid) return;
    if (next.icon.trim() && !ICON_PATTERN.test(next.icon.trim())) return;
    if (
      next.label === sourceValues.label &&
      next.color === sourceValues.color &&
      next.textColor === sourceValues.textColor &&
      next.styleClass === sourceValues.styleClass &&
      next.link === sourceValues.link &&
      next.icon === sourceValues.icon
    )
      return;
    onApply({
      label: next.label,
      color: next.color,
      textColor: next.textColor,
      stereotype: next.styleClass.trim(),
      link: next.link,
      icon: next.icon,
    });
  };
  const side = node.side === "left" ? "left" : "right";
  return (
    <InspectorPanel className="task-inspector mindmap-node-inspector" aria-label="Mindmap node inspector">
      <header>
        <h2>Mindmap node</h2>
        <button onClick={onClose} aria-label="Close mindmap node inspector">
          ×
        </button>
      </header>
      {sourceOnly && (
        <section className="mindmap-markdown-notice" aria-label="Markdown form">
          <p role="status" className="calculated-hint">
            This mindmap is written in Markdown form, which is edited as text. Convert it to * markers to edit it here.
          </p>
          <button type="button" onClick={onConvert}>
            Convert to * markers
          </button>
        </section>
      )}
      {sourceOnly ? (
        <p className="inspector-summary">{node.label}</p>
      ) : (
        <>
          <label>
            Label
            <textarea
              required
              rows={label.includes("\n") ? Math.min(8, label.split("\n").length + 1) : 2}
              aria-invalid={labelMissing}
              aria-describedby={labelMissing ? "mindmap-label-error" : undefined}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={() => commit()}
            />
            {labelMissing && (
              <span id="mindmap-label-error" className="field-error" role="alert">
                Enter a node label.
              </span>
            )}
          </label>
          {node.depth === 2 && sidesApply && (
            <label>
              Branch side
              <select value={side} onChange={(event) => onSideChange(event.target.value as "left" | "right")}>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          )}
          <ColorField label="Background color" value={color} onChange={setColor} onBlur={() => commit()} />
          <ColorField label="Text color" value={textColor} onChange={setTextColor} onBlur={() => commit()} />
          <label>
            Style class
            <input
              placeholder="myStyle"
              aria-invalid={styleClassInvalid}
              value={styleClass}
              onChange={(event) => setStyleClass(event.target.value)}
              onBlur={() => commit()}
            />
            {styleClassInvalid && (
              <span className="field-error" role="alert">
                A style class is one word without spaces or angle brackets.
              </span>
            )}
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={node.boxless === true}
              onChange={(event) => onToggleBoxless(event.target.checked)}
            />
            Draw without a box
          </label>
          <label>
            Link URL
            <input
              type="url"
              placeholder="https://example.com"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onBlur={() => commit()}
            />
          </label>
          <label>
            Icon
            <IconField
              value={icon}
              onChange={setIcon}
              onBlur={() => commit()}
              onPick={(next) => commit({ icon: next })}
              invalid={iconInvalid}
              {...(iconInvalid ? { describedBy: "mindmap-icon-error" } : {})}
            />
          </label>
          {iconInvalid && (
            <span id="mindmap-icon-error" className="field-error" role="alert">
              Start with <code>&amp;</code> for a built-in icon (e.g. <code>&amp;home</code>) or <code>$</code> for a
              custom sprite (e.g. <code>$my-sprite</code>).
            </span>
          )}
        </>
      )}
      <p className="calculated-hint">Changes are saved when you leave a field.</p>
      {deleteBlocker && (
        <p role="status" className="calculated-hint" data-testid="mindmap-delete-blocker">
          {deleteBlocker}
        </p>
      )}
      <div className="inspector-actions mindmap-node-actions">
        <button type="button" disabled={sourceOnly} onClick={onAddChild}>
          Add child…
        </button>
        {node.depth > 1 && (
          <button type="button" disabled={sourceOnly} onClick={onAddSibling}>
            Add sibling…
          </button>
        )}
        <button
          type="button"
          className="danger"
          disabled={Boolean(deleteBlocker)}
          title={deleteBlocker}
          onClick={onDelete}
        >
          Delete subtree
        </button>
      </div>
    </InspectorPanel>
  );
}

const DIRECTION_LABELS: Record<MindmapDirection, string> = {
  "left-to-right": "Left to right",
  "top-to-bottom": "Top to bottom",
  "right-to-left": "Right to left",
  "bottom-to-top": "Bottom to top (drawn like right to left)",
};

export function MindmapSettingsInspector({
  document,
  initial,
  onApply,
  onConvert,
  onClose,
}: {
  document: MindmapDocument;
  initial: MindmapSettings;
  onApply(value: MindmapSettings): void;
  /** Rewrites a Markdown-form document to `*` markers. */
  onConvert?(): void;
  onClose(): void;
}) {
  const [direction, setDirection] = useState<MindmapDirection | "">(initial.direction ?? "");
  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [header, setHeader] = useState(initial.header);
  const [footer, setFooter] = useState(initial.footer);
  const [legend, setLegend] = useState(initial.legend);
  // A document can already use the direction the app does not offer; keep it selectable so it is not lost.
  const directions: readonly MindmapDirection[] =
    document.direction && !MINDMAP_OFFERED_DIRECTIONS.includes(document.direction.value)
      ? [...MINDMAP_OFFERED_DIRECTIONS, document.direction.value]
      : MINDMAP_OFFERED_DIRECTIONS;
  return (
    <InspectorPanel className="task-inspector mindmap-settings-inspector" aria-label="Mindmap settings">
      <header>
        <h2>Mindmap settings</h2>
        <button onClick={onClose} aria-label="Close mindmap settings">
          ×
        </button>
      </header>
      {onConvert && document.nodes.some((node) => node.markdown) && (
        <section className="mindmap-markdown-notice" aria-label="Markdown form">
          <p role="status" className="calculated-hint">
            Part of this mindmap is written in Markdown form, which is edited as text. Convert it to * markers to edit
            every node here.
          </p>
          <button type="button" onClick={onConvert}>
            Convert to * markers
          </button>
        </section>
      )}
      <label>
        Direction
        <select value={direction} onChange={(event) => setDirection(event.target.value as MindmapDirection | "")}>
          <option value="">Default (left to right)</option>
          {directions.map((value) => (
            <option key={value} value={value}>
              {DIRECTION_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Diagram title
        <textarea rows={2} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Caption
        <input value={caption} onChange={(event) => setCaption(event.target.value)} />
      </label>
      <label>
        Header
        <textarea rows={2} value={header} onChange={(event) => setHeader(event.target.value)} />
      </label>
      <label>
        Footer
        <textarea rows={2} value={footer} onChange={(event) => setFooter(event.target.value)} />
      </label>
      <label>
        Legend
        <textarea rows={3} value={legend} onChange={(event) => setLegend(event.target.value)} />
      </label>
      <div className="inspector-actions">
        <button
          onClick={() =>
            onApply({ direction: direction === "" ? undefined : direction, title, caption, header, footer, legend })
          }
        >
          Apply
        </button>
      </div>
    </InspectorPanel>
  );
}
