import { useId, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { workingDayDuration, workingEndDate, type GanttCalendar } from "./gantt-calendar";

export interface TaskInspectorValue {
  label: string;
  startDate: string;
  endDate: string;
  duration: string;
  durationUnit: "day" | "week" | "month";
  completion: string;
  color: string;
  pauseDates: string;
  sameRowTaskId: string;
  predecessorId: string;
  resources: Array<{ id: string; name: string; allocation: string }>;
  note: string;
  notePosition: "bottom" | "top" | "left" | "right";
}

export function TaskInspector({
  task,
  tasks,
  predecessorId,
  effectiveStart,
  calendar,
  resourceNames,
  conflicts,
  onApply,
  onDelete,
  onClose,
}: {
  task: GanttTask;
  tasks: readonly GanttTask[];
  predecessorId: string;
  effectiveStart: string;
  calendar: GanttCalendar;
  resourceNames: readonly string[];
  conflicts: readonly string[];
  onApply(value: TaskInspectorValue): void;
  onDelete(): void;
  onClose(): void;
}) {
  const resourceListId = useId();
  const initial = (): TaskInspectorValue => ({
    label: task.label,
    startDate: task.start?.value ?? effectiveStart,
    endDate: task.end?.value ?? "",
    duration: task.duration ? String(task.duration.value) : "",
    durationUnit: task.duration?.unit ?? "day",
    completion: task.completion ? String(task.completion.value) : "",
    color: task.color?.value ?? "",
    pauseDates: (task.pauses ?? []).map((pause) => pause.value).join(", "),
    sameRowTaskId: task.sameRowTaskId ?? "",
    predecessorId,
    resources: (task.resources ?? []).map((item, index) => ({
      id: `${task.id}-${index}`,
      name: item.value,
      allocation: String(item.allocation ?? 100),
    })),
    note: task.notes?.[0]?.text ?? "",
    notePosition: task.notes?.[0]?.position ?? "bottom",
  });
  const [value, setValue] = useState(initial);
  const update = <K extends keyof TaskInspectorValue>(key: K, next: TaskInspectorValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const conversionStart = value.startDate || effectiveStart;
  const convertedDuration = value.endDate ? workingDayDuration(conversionStart, value.endDate, calendar) : undefined;
  const durationMultiplier = value.durationUnit === "month" ? 30 : value.durationUnit === "week" ? 7 : 1;
  const durationDays = Number(value.duration) * durationMultiplier;
  const convertedEnd =
    value.duration && Number.isInteger(durationDays)
      ? workingEndDate(conversionStart, durationDays, calendar)
      : undefined;
  return (
    <aside className="task-inspector" aria-label="Task inspector">
      <header>
        <strong>Task inspector</strong>
        <button onClick={onClose} aria-label="Close task inspector">
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
          <input required value={value.label} onChange={(event) => update("label", event.target.value)} />
        </label>
        <label>
          Starts after
          <select value={value.predecessorId} onChange={(event) => update("predecessorId", event.target.value)}>
            <option value="">No dependency</option>
            {tasks
              .filter((item) => item.id !== task.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Start
          <input type="date" value={value.startDate} onChange={(event) => update("startDate", event.target.value)} />
        </label>
        {value.predecessorId && value.startDate === effectiveStart && (
          <p className="calculated-hint">Calculated from dependency. Edit the date to override it.</p>
        )}
        <label>
          End
          <input type="date" value={value.endDate} onChange={(event) => update("endDate", event.target.value)} />
        </label>
        <div className="schedule-conversion" role="group" aria-label="Convert task schedule">
          <button
            type="button"
            disabled={!convertedDuration}
            onClick={() =>
              setValue((current) => ({
                ...current,
                endDate: "",
                duration: String(convertedDuration),
                durationUnit: "day",
              }))
            }
          >
            End → duration
          </button>
          <button
            type="button"
            disabled={!convertedEnd}
            onClick={() => setValue((current) => ({ ...current, endDate: convertedEnd ?? "", duration: "" }))}
          >
            Duration → end
          </button>
        </div>
        <label>
          Duration
          <span className="compound">
            <input
              type="number"
              min="1"
              step="1"
              value={value.duration}
              onChange={(event) => update("duration", event.target.value)}
            />
            <select
              value={value.durationUnit}
              onChange={(event) => update("durationUnit", event.target.value as "day" | "week" | "month")}
            >
              <option value="day">days</option>
              <option value="week">weeks</option>
              <option value="month">months</option>
            </select>
          </span>
        </label>
        <label>
          Complete
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0–100%"
            value={value.completion}
            onChange={(event) => update("completion", event.target.value)}
          />
        </label>
        <label>
          Color
          <input
            placeholder="Orange or #f97316"
            value={value.color}
            onChange={(event) => update("color", event.target.value)}
          />
        </label>
        <label>
          Paused dates
          <input
            placeholder="2026-09-08, 2026-09-09"
            value={value.pauseDates}
            onChange={(event) => update("pauseDates", event.target.value)}
          />
        </label>
        <label>
          Display on same row as
          <select value={value.sameRowTaskId} onChange={(event) => update("sameRowTaskId", event.target.value)}>
            <option value="">Own row</option>
            {tasks
              .filter((item) => item.id !== task.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.alias ? ` (${item.alias.value})` : ""}
                </option>
              ))}
          </select>
        </label>
        <label>
          Note
          <textarea
            rows={4}
            placeholder="Add context for this task"
            value={value.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </label>
        <fieldset className="resource-assignments">
          <legend>People</legend>
          <div className="resource-headings">
            <span>Name</span>
            <span>Allocation</span>
            <span />
          </div>
          {value.resources.map((resource) => (
            <div className="resource-row" key={resource.id}>
              <input
                aria-label="Person name"
                list={resourceListId}
                placeholder="Name"
                value={resource.name}
                onChange={(event) =>
                  update(
                    "resources",
                    value.resources.map((item) =>
                      item.id === resource.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <span className="allocation-input">
                <input
                  aria-label={`Allocation for ${resource.name || "person"}`}
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={resource.allocation}
                  onChange={(event) =>
                    update(
                      "resources",
                      value.resources.map((item) =>
                        item.id === resource.id ? { ...item, allocation: event.target.value } : item,
                      ),
                    )
                  }
                />
                <span>%</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${resource.name || "person"}`}
                onClick={() =>
                  update(
                    "resources",
                    value.resources.filter((item) => item.id !== resource.id),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <datalist id={resourceListId}>
            {resourceNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            className="add-resource"
            onClick={() =>
              update("resources", [...value.resources, { id: `resource-${Date.now()}`, name: "", allocation: "100" }])
            }
          >
            + Add person
          </button>
        </fieldset>
        <p className={`resource-status${conflicts.length ? " conflict" : ""}`}>
          {conflicts.length ? `⚠ Overlaps: ${conflicts.join(", ")}` : "No detected resource conflicts"}
        </p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
