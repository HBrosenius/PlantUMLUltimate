import { useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";

export interface MilestoneInspectorValue {
  label: string;
  mode: "fixed" | "relative";
  date: string;
  referenceLabel: string;
  referenceAnchor: "start" | "end";
  color: string;
  note: string;
  notePosition: "bottom" | "top" | "left" | "right";
}

export function MilestoneInspector({
  milestone,
  tasks,
  relativeAnchor,
  onApply,
  onDelete,
  onClose,
}: {
  milestone: GanttTask;
  tasks: readonly GanttTask[];
  relativeAnchor: "start" | "end";
  onApply(value: MilestoneInspectorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const initial = (): MilestoneInspectorValue => {
    const fixed = Boolean(milestone.milestone && "resolved" in milestone.milestone);
    return {
      label: milestone.label,
      mode: fixed ? "fixed" : "relative",
      date: fixed ? (milestone.milestone?.value ?? "") : "",
      referenceLabel: fixed ? "" : (milestone.milestone?.value ?? ""),
      referenceAnchor: relativeAnchor,
      color: milestone.color?.value ?? "",
      note: milestone.notes?.[0]?.text ?? "",
      notePosition: "bottom",
    };
  };
  const [value, setValue] = useState(initial);
  const labelMissing = !value.label.trim();
  const scheduleMissing = value.mode === "fixed" ? !value.date : !value.referenceLabel;
  const update = <K extends keyof MilestoneInspectorValue>(key: K, next: MilestoneInspectorValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));

  return (
    <aside className="task-inspector" aria-label="Milestone inspector">
      <header>
        <strong>Milestone inspector</strong>
        <button onClick={onClose} aria-label="Close milestone inspector">
          ×
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(value);
        }}
      >
        <label>
          Name
          <input
            required
            aria-invalid={labelMissing}
            aria-describedby={labelMissing ? "milestone-name-error" : undefined}
            value={value.label}
            onChange={(event) => update("label", event.target.value)}
          />
          {labelMissing && (
            <span id="milestone-name-error" className="field-error" role="alert">
              Enter a milestone name.
            </span>
          )}
        </label>
        <label>
          Date type
          <select value={value.mode} onChange={(event) => update("mode", event.target.value as "fixed" | "relative")}>
            <option value="fixed">Set date</option>
            <option value="relative">Relative to task</option>
          </select>
        </label>
        {value.mode === "fixed" ? (
          <label>
            Date
            <input
              required
              type="date"
              aria-invalid={!value.date}
              aria-describedby={!value.date ? "milestone-date-error" : undefined}
              value={value.date}
              onChange={(event) => update("date", event.target.value)}
            />
            {!value.date && (
              <span id="milestone-date-error" className="field-error" role="alert">
                Choose a milestone date.
              </span>
            )}
          </label>
        ) : (
          <>
            <label>
              Relative to
              <select
                required
                aria-invalid={!value.referenceLabel}
                aria-describedby={!value.referenceLabel ? "milestone-reference-error" : undefined}
                value={value.referenceLabel}
                onChange={(event) => update("referenceLabel", event.target.value)}
              >
                <option value="" disabled>
                  Select a task or milestone
                </option>
                {tasks
                  .filter((task) => task.id !== milestone.id)
                  .map((task) => (
                    <option key={task.id} value={task.label}>
                      {task.label}
                    </option>
                  ))}
              </select>
              {!value.referenceLabel && (
                <span id="milestone-reference-error" className="field-error" role="alert">
                  Choose a task or milestone.
                </span>
              )}
            </label>
            <label>
              At its
              <select
                value={value.referenceAnchor}
                onChange={(event) => update("referenceAnchor", event.target.value as "start" | "end")}
              >
                <option value="end">End</option>
                <option value="start">Start</option>
              </select>
            </label>
          </>
        )}
        <p className="calculated-hint">Relative milestones follow their anchor and can only be reordered vertically.</p>
        <label>
          Color
          <input
            placeholder="Orange or #f97316"
            value={value.color}
            onChange={(event) => update("color", event.target.value)}
          />
        </label>
        <label className="inspector-note-field">
          <span className="inspector-field-heading">
            Note
            <button type="button" disabled={!value.note} onClick={() => update("note", "")}>
              Remove note
            </button>
          </span>
          <textarea
            rows={4}
            placeholder="Add context for this milestone"
            value={value.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </label>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
          <button type="submit" className="primary" disabled={labelMissing || scheduleMissing}>
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
