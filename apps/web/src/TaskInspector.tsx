import { useEffect, useId, useRef, useState } from "react";
import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { workingDayDuration, workingEndDate, type GanttCalendar } from "./gantt-calendar";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

export interface TaskInspectorValue {
  label: string;
  startDate: string;
  endDate: string;
  duration: string;
  durationUnit: "day" | "week" | "month";
  scheduleMode: "duration" | "end";
  completion: string;
  color: string;
  pauses: Array<{ id: string; value: string }>;
  links: Array<{ id: string; url: string; label: string }>;
  sameRowTaskId: string;
  predecessorId: string;
  dependencyRelation: GanttDependency["relation"];
  resources: Array<{ id: string; name: string; allocation: string }>;
  note: string;
  notePosition: "bottom" | "top" | "left" | "right";
}

export function TaskInspector({
  task,
  tasks,
  predecessorId,
  dependencyRelation,
  effectiveStart,
  effectiveEnd,
  calendar,
  resourceNames,
  conflicts,
  jiraStatus,
  onApply,
  onDelete,
  onClose,
  focusNote = false,
}: {
  task: GanttTask;
  tasks: readonly GanttTask[];
  predecessorId: string;
  dependencyRelation: GanttDependency["relation"];
  effectiveStart: string;
  effectiveEnd: string;
  calendar: GanttCalendar;
  resourceNames: readonly string[];
  conflicts: readonly string[];
  jiraStatus?: { issueKey: string; fields: readonly string[] } | undefined;
  onApply(value: TaskInspectorValue): void;
  onDelete(): void;
  onClose(): void;
  focusNote?: boolean;
}) {
  const resourceListId = useId();
  const colorListId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const initial = (): TaskInspectorValue => ({
    label: task.label,
    startDate: task.start?.value ?? effectiveStart,
    endDate: task.end?.value ?? (dependencyRelation.startsWith("end-") ? effectiveEnd : ""),
    duration: task.duration ? String(task.duration.value) : "",
    durationUnit: task.duration?.unit ?? "day",
    scheduleMode: task.end || dependencyRelation.startsWith("end-") ? "end" : "duration",
    completion: task.completion ? String(task.completion.value) : "",
    color: task.color?.value ?? "",
    pauses: (task.pauses ?? []).map((pause, index) => ({ id: `pause-${index}`, value: pause.value })),
    links: (task.links ?? []).map((link, index) => ({ id: `link-${index}`, url: link.url, label: link.label ?? "" })),
    sameRowTaskId: task.sameRowTaskId ?? "",
    predecessorId,
    dependencyRelation,
    resources: (task.resources ?? []).map((item, index) => ({
      id: `${task.id}-${index}`,
      name: item.value,
      allocation: String(item.allocation ?? 100),
    })),
    note: task.notes?.[0]?.text ?? "",
    notePosition: "bottom",
  });
  const [value, setValue] = useState(initial);
  const parsedStartDate = task.start?.value ?? effectiveStart;
  const parsedEndDate = task.end?.value ?? (dependencyRelation.startsWith("end-") ? effectiveEnd : "");
  const parsedDuration = task.duration ? String(task.duration.value) : "";
  const parsedDurationUnit = task.duration?.unit ?? "day";
  const parsedScheduleMode = task.end || dependencyRelation.startsWith("end-") ? "end" : "duration";
  useEffect(() => {
    setValue((current) => ({
      ...current,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      duration: parsedDuration,
      durationUnit: parsedDurationUnit,
      scheduleMode: parsedScheduleMode,
    }));
  }, [parsedDuration, parsedDurationUnit, parsedEndDate, parsedScheduleMode, parsedStartDate]);
  useEffect(() => {
    if (!focusNote) return;
    const note = noteRef.current;
    if (!note) return;
    note.focus();
    note.setSelectionRange(note.value.length, note.value.length);
  }, [focusNote]);
  const lastAppliedValue = useRef(JSON.stringify(value));
  const apply = (next = value) => {
    const serialized = JSON.stringify(next);
    if (serialized === lastAppliedValue.current) return;
    const duration = next.scheduleMode === "duration" && next.duration !== "" ? Number(next.duration) : undefined;
    const completion = next.completion === "" ? undefined : Number(next.completion);
    const validResources = next.resources.every((resource) => {
      const allocation = Number(resource.allocation);
      return resource.name.trim() && Number.isInteger(allocation) && allocation >= 1 && allocation <= 100;
    });
    if (
      !next.label.trim() ||
      (duration !== undefined && (!Number.isInteger(duration) || duration < 1)) ||
      (completion !== undefined && (!Number.isInteger(completion) || completion < 0 || completion > 100)) ||
      !validResources
    )
      return;
    lastAppliedValue.current = serialized;
    onApply(next);
  };
  const update = <K extends keyof TaskInspectorValue>(key: K, next: TaskInspectorValue[K], applyNow = false) => {
    const updated = { ...value, [key]: next };
    setValue(updated);
    if (applyNow) apply(updated);
  };
  const conversionStart = value.startDate || effectiveStart;
  const convertedDuration = value.endDate ? workingDayDuration(conversionStart, value.endDate, calendar) : undefined;
  const durationMultiplier = value.durationUnit === "month" ? 30 : value.durationUnit === "week" ? 7 : 1;
  const durationDays = Number(value.duration) * durationMultiplier;
  const convertedEnd =
    value.duration && Number.isInteger(durationDays)
      ? workingEndDate(conversionStart, durationDays, calendar)
      : undefined;
  const endDisplayValue = value.scheduleMode === "duration" ? (convertedEnd ?? "") : value.endDate;
  const durationDisplayValue = value.scheduleMode === "end" ? String(convertedDuration ?? "") : value.duration;
  const labelMissing = !value.label.trim();
  return (
    <aside className="task-inspector" aria-label="Task inspector">
      <header>
        <strong>Task inspector</strong>
        <button onClick={onClose} aria-label="Close task inspector">
          ×
        </button>
      </header>
      {jiraStatus && (
        <p className="jira-task-status" data-status={jiraStatus.fields.length ? "local-changes" : "synchronized"}>
          <strong>{jiraStatus.issueKey}</strong>
          <span>
            {jiraStatus.fields.length ? `Local changes: ${jiraStatus.fields.join(", ")}` : "Synchronized with Jira"}
          </span>
        </p>
      )}
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          Name
          <input
            required
            aria-invalid={labelMissing}
            aria-describedby={labelMissing ? "task-name-error" : undefined}
            value={value.label}
            onChange={(event) => update("label", event.target.value)}
            onBlur={() => apply()}
          />
          {labelMissing && (
            <span id="task-name-error" className="field-error" role="alert">
              Enter a task name.
            </span>
          )}
        </label>
        <label>
          Linked task
          <select
            aria-label="Linked task"
            value={value.predecessorId}
            onChange={(event) => update("predecessorId", event.target.value, true)}
          >
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
          Relationship
          <select
            aria-label="Relationship"
            value={value.dependencyRelation}
            onChange={(event) =>
              update(
                "dependencyRelation",
                event.target.value as GanttDependency["relation"],
                Boolean(value.predecessorId),
              )
            }
          >
            <option value="start-after-end">Starts at linked task's end</option>
            <option value="start-after-start">Starts at linked task's start</option>
            <option value="end-after-end">Ends at linked task's end</option>
            <option value="end-after-start">Ends at linked task's start</option>
          </select>
        </label>
        <label>
          Start
          <input
            type="date"
            value={value.startDate}
            onChange={(event) => update("startDate", event.target.value)}
            onBlur={() => apply()}
          />
        </label>
        {value.predecessorId && value.startDate === effectiveStart && (
          <p className="calculated-hint">Calculated from dependency. Edit the date to override it.</p>
        )}
        <label className={value.scheduleMode === "duration" ? "derived-schedule-field" : undefined}>
          End
          <input
            type="date"
            readOnly={value.scheduleMode === "duration"}
            aria-readonly={value.scheduleMode === "duration"}
            value={endDisplayValue}
            onChange={(event) => update("endDate", event.target.value)}
            onBlur={() => apply()}
          />
        </label>
        {value.predecessorId && value.dependencyRelation.startsWith("end-") && value.endDate === effectiveEnd && (
          <p className="calculated-hint">Calculated from dependency. Edit the date to override it.</p>
        )}
        <div className="schedule-conversion" role="group" aria-label="Convert task schedule">
          <button
            type="button"
            disabled={value.scheduleMode === "end" ? !convertedDuration : !convertedEnd}
            onClick={() => {
              const next =
                value.scheduleMode === "end"
                  ? ({
                      ...value,
                      scheduleMode: "duration",
                      duration: String(convertedDuration),
                      durationUnit: "day",
                    } satisfies TaskInspectorValue)
                  : ({
                      ...value,
                      scheduleMode: "end",
                      endDate: convertedEnd ?? "",
                    } satisfies TaskInspectorValue);
              setValue(next);
              apply(next);
            }}
          >
            {value.scheduleMode === "end" ? "Switch to duration ⇄" : "Switch to end date ⇄"}
          </button>
        </div>
        <label className={value.scheduleMode === "end" ? "derived-schedule-field" : undefined}>
          Duration
          <span className="compound">
            <input
              type="number"
              min="1"
              step="1"
              readOnly={value.scheduleMode === "end"}
              aria-readonly={value.scheduleMode === "end"}
              value={durationDisplayValue}
              onChange={(event) => update("duration", event.target.value)}
              onBlur={() => apply()}
            />
            <select
              disabled={value.scheduleMode === "end"}
              value={value.scheduleMode === "end" ? "day" : value.durationUnit}
              onChange={(event) => update("durationUnit", event.target.value as "day" | "week" | "month", true)}
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
            onBlur={() => apply()}
          />
        </label>
        <label>
          Color
          <input
            aria-label="Color"
            list={colorListId}
            autoComplete="off"
            placeholder="Orange or #f97316"
            value={value.color}
            onChange={(event) => update("color", event.target.value)}
            onBlur={() => apply()}
          />
          <datalist id={colorListId}>
            {PLANTUML_COLOR_NAMES.map((color) => (
              <option key={color} value={color} />
            ))}
          </datalist>
        </label>
        <fieldset className="structured-rows">
          <legend>Pauses</legend>
          <p className="fieldset-help">Use a date or weekday supported by PlantUML.</p>
          {value.pauses.map((pause) => (
            <div className="structured-row" key={pause.id}>
              <input
                aria-label="Pause date or weekday"
                placeholder="2026-09-08 or monday"
                value={pause.value}
                onChange={(event) =>
                  update(
                    "pauses",
                    value.pauses.map((item) => (item.id === pause.id ? { ...item, value: event.target.value } : item)),
                  )
                }
                onBlur={() => apply()}
              />
              <button
                type="button"
                aria-label="Remove pause"
                onClick={() =>
                  update(
                    "pauses",
                    value.pauses.filter((item) => item.id !== pause.id),
                    true,
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("pauses", [...value.pauses, { id: `pause-${Date.now()}`, value: "" }])}
          >
            + Add pause
          </button>
        </fieldset>
        <fieldset className="structured-rows">
          <legend>Links</legend>
          {value.links.map((link) => (
            <div className="structured-row link-row" key={link.id}>
              <input
                aria-label="Link URL"
                type="url"
                placeholder="https://example.com"
                value={link.url}
                onChange={(event) =>
                  update(
                    "links",
                    value.links.map((item) => (item.id === link.id ? { ...item, url: event.target.value } : item)),
                  )
                }
                onBlur={() => apply()}
              />
              <input
                aria-label="Link label"
                placeholder="Optional label"
                value={link.label}
                onChange={(event) =>
                  update(
                    "links",
                    value.links.map((item) => (item.id === link.id ? { ...item, label: event.target.value } : item)),
                  )
                }
                onBlur={() => apply()}
              />
              <button
                type="button"
                aria-label="Remove link"
                onClick={() =>
                  update(
                    "links",
                    value.links.filter((item) => item.id !== link.id),
                    true,
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update("links", [...value.links, { id: `link-${Date.now()}`, url: "", label: "" }])}
          >
            + Add link
          </button>
        </fieldset>
        <label>
          Display on same row as
          <select value={value.sameRowTaskId} onChange={(event) => update("sameRowTaskId", event.target.value, true)}>
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
        <label className="inspector-note-field">
          <span className="inspector-field-heading">
            Note
            <button type="button" disabled={!value.note} onClick={() => update("note", "", true)}>
              Remove note
            </button>
          </span>
          <textarea
            ref={noteRef}
            rows={4}
            placeholder="Add context for this task"
            value={value.note}
            onChange={(event) => update("note", event.target.value)}
            onBlur={() => apply()}
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
                onBlur={() => apply()}
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
                  onBlur={() => apply()}
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
                    true,
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
        <p className="calculated-hint">Text and number fields are saved when you leave the field.</p>
        <div className="inspector-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </form>
    </aside>
  );
}
