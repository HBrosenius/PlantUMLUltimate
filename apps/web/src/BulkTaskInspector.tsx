import { InspectorPanel } from "./InspectorPanel";
import { useId, useState } from "react";
import { ColorField } from "./ColorField";

/** Edits several selected Gantt tasks at once; each action is a single undo step. */
export function BulkTaskInspector({
  labels,
  resourceNames,
  onMove,
  onColor,
  onCompletion,
  onResource,
  onDuplicate,
  onCopy,
  onDelete,
  onClose,
}: {
  labels: readonly string[];
  resourceNames: readonly string[];
  onMove(days: number): void;
  onColor(color: string): void;
  onCompletion(completion: number | undefined): void;
  onResource(resource: string): void;
  onDuplicate(): void;
  onCopy(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [days, setDays] = useState("1");
  const [color, setColor] = useState("");
  const [completion, setCompletion] = useState("");
  const [resource, setResource] = useState("");
  const resourceListId = useId();
  const dayCount = Number(days);
  const completionValue = completion.trim() === "" ? undefined : Number(completion);
  const completionValid =
    completionValue === undefined ||
    (Number.isInteger(completionValue) && completionValue >= 0 && completionValue <= 100);

  return (
    <InspectorPanel className="task-inspector bulk-task-inspector" aria-label="Selected tasks inspector">
      <header>
        <strong>{labels.length} tasks selected</strong>
        <button onClick={onClose} aria-label="Clear task selection">
          ×
        </button>
      </header>
      <p className="bulk-task-names">{labels.join(", ")}</p>
      <p className="fieldset-help">Shift- or Ctrl/⌘-click tasks in the diagram to add or remove them.</p>
      <p className="inspector-note">
        Changes apply when you leave a field. Invalid values stay in this panel until corrected or discarded.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
        <div className="bulk-task-row">
          <label>
            Shift dates by days
            <input type="number" step={1} value={days} onChange={(event) => setDays(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={!Number.isInteger(dayCount) || dayCount === 0}
            onClick={() => onMove(dayCount)}
          >
            Move
          </button>
        </div>
        <div className="bulk-task-row">
          <ColorField value={color} onChange={setColor} />
          <button type="button" onClick={() => onColor(color)}>
            {color.trim() ? "Apply colour" : "Clear colour"}
          </button>
        </div>
        <div className="bulk-task-row">
          <label>
            Completion %
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Not tracked"
              value={completion}
              aria-invalid={!completionValid}
              onChange={(event) => setCompletion(event.target.value)}
            />
          </label>
          <button type="button" disabled={!completionValid} onClick={() => onCompletion(completionValue)}>
            {completionValue === undefined ? "Clear completion" : "Set completion"}
          </button>
        </div>
        <div className="bulk-task-row">
          <label>
            Resource
            <input
              list={resourceListId}
              placeholder="No resource"
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            />
          </label>
          <datalist id={resourceListId}>
            {resourceNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button type="button" onClick={() => onResource(resource)}>
            {resource.trim() ? "Assign" : "Clear resources"}
          </button>
        </div>
        <div className="inspector-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" onClick={onCopy}>
            Copy
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete {labels.length} tasks
          </button>
        </div>
      </form>
    </InspectorPanel>
  );
}
