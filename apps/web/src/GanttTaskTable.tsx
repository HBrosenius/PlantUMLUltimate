import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { editTaskRow, editTaskRows, taskRowValue, type TaskRowDraft, type TaskRowValue } from "./gantt-task-table";
export function GanttTaskTable({
  tasks,
  source,
  selectedTaskId,
  readOnly,
  drafts,
  onDraftChange,
  onSelect,
  onDetails,
  onApply,
}: {
  tasks: readonly GanttTask[];
  source: string;
  selectedTaskId: string | undefined;
  readOnly: boolean;
  drafts: readonly TaskRowDraft[];
  onDraftChange(drafts: TaskRowDraft[]): void;
  onSelect(id: string): boolean;
  onDetails(id: string): void;
  onApply(drafts: readonly TaskRowDraft[]): string | undefined;
}) {
  const [limit, setLimit] = useState(100),
    [error, setError] = useState("");
  const root = useRef<HTMLElement>(null),
    resourceList = useId();
  useEffect(() => {
    const index = tasks.findIndex((t) => t.id === selectedTaskId);
    if (index >= limit) setLimit(Math.ceil((index + 1) / 100) * 100);
    const frame = requestAnimationFrame(() =>
      root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [selectedTaskId, tasks, limit]);
  const stale = drafts.some((draft) => draft.source !== source);
  const validation = useMemo(() => editTaskRows(source, drafts), [source, drafts]);
  const invalid = "error" in validation ? validation.error : undefined;
  const rowErrors = useMemo(
    () =>
      new Map(
        drafts.flatMap((draft) => {
          const result = editTaskRow(source, draft);
          return "error" in result ? [[draft.taskId, result.error] as const] : [];
        }),
      ),
    [source, drafts],
  );
  const update = (draft: TaskRowDraft, value: TaskRowValue) => {
    const existing = drafts.find((row) => row.taskId === draft.taskId);
    const task = tasks.find((task) => task.id === draft.taskId);
    const remaining = drafts.filter((row) => row.taskId !== draft.taskId);
    const changed = !task || JSON.stringify(value) !== JSON.stringify(taskRowValue(task));
    onDraftChange(changed ? [...remaining, { ...(existing ?? draft), value }] : remaining);
    setError("");
  };
  const cancel = () => {
    onDraftChange([]);
    setError("");
  };
  const apply = () => {
    if (!drafts.length || readOnly || invalid) return;
    const failure = onApply(drafts);
    if (failure) setError(failure);
    else cancel();
  };
  const resources = Array.from(new Set(tasks.flatMap((t) => (t.resources ?? []).map((r) => r.value)))).sort();
  return (
    <section ref={root} className="gantt-task-table" aria-label="Gantt task table" data-inspector-trigger>
      <header>
        <h2>Tasks</h2>
        <p>
          Edit multiple rows, then Apply changes. All edits update together as one undo step. Blank progress removes it;
          blank allocation keeps the default.
        </p>
      </header>
      {readOnly && <p role="status">Viewing only. Task editing is unavailable.</p>}
      {drafts.length > 0 && (
        <div className="task-row-draft-status">
          <p>
            {drafts.length} staged task{drafts.length === 1 ? "" : "s"}. Apply changes together as one Undo step.
          </p>
          {stale && <p role="alert">Diagram source changed. Reload staged rows or discard changes.</p>}
          {invalid && !stale && <p role="alert">Correct the marked task rows before applying. {invalid}</p>}
          {error && <p role="alert">{error}</p>}
          {stale && (
            <button
              onClick={() => {
                onDraftChange(
                  drafts.flatMap((draft) => {
                    const task = tasks.find((task) => task.id === draft.taskId);
                    return task ? [{ taskId: task.id, source, value: taskRowValue(task) }] : [];
                  }),
                );
                setError("");
              }}
            >
              Reload staged rows from source
            </button>
          )}
          <button disabled={readOnly || !!invalid} onClick={apply}>
            Apply changes
          </button>
          <button onClick={cancel}>Discard changes</button>
        </div>
      )}
      <datalist id={resourceList}>
        {resources.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="task-table-scroll">
        <table>
          <caption>
            Tasks in source order. Focus a field to select its chart task; Details opens the full inspector.
          </caption>
          <thead>
            <tr>
              <th scope="col">Task name</th>
              <th scope="col">Duration</th>
              <th scope="col">Progress (%)</th>
              <th scope="col">Resources</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, limit).map((task) => {
              const staged = drafts.find((row) => row.taskId === task.id);
              const draft = staged ?? { taskId: task.id, source, value: taskRowValue(task) };
              const editing = !task.milestone && !!task.declarations.length;
              const rowError = stale
                ? undefined
                : (rowErrors.get(task.id) ??
                  ("error" in validation && validation.taskId === task.id ? validation.error : undefined));
              return (
                <tr
                  key={task.id}
                  aria-selected={selectedTaskId === task.id}
                  data-task-row={task.id}
                  onFocusCapture={() => {
                    if (selectedTaskId !== task.id) onSelect(task.id);
                  }}
                  onKeyDown={(e) => {
                    if (!editing) return;
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      onDraftChange(drafts.filter((row) => row.taskId !== task.id));
                    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target instanceof HTMLInputElement) {
                      e.preventDefault();
                      apply();
                    }
                  }}
                >
                  <th scope="row">
                    {editing ? (
                      <input
                        aria-label="Task name"
                        value={draft.value.label}
                        disabled={readOnly || stale}
                        onChange={(e) => update(draft, { ...draft.value, label: e.target.value })}
                      />
                    ) : (
                      <button
                        className="task-row-select"
                        aria-label={`Select task ${task.label}`}
                        onClick={() => onSelect(task.id)}
                        onKeyDown={(e) => {
                          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
                          e.preventDefault();
                          const index = tasks.indexOf(task);
                          const next =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? tasks.length - 1
                                : Math.max(0, Math.min(tasks.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
                          const target = tasks[next];
                          if (target) {
                            onSelect(target.id);
                            requestAnimationFrame(() =>
                              root.current
                                ?.querySelector<HTMLButtonElement>(`tr[aria-selected="true"] .task-row-select`)
                                ?.focus(),
                            );
                          }
                        }}
                      >
                        {task.label}
                        {task.milestone ? " (milestone)" : ""}
                      </button>
                    )}
                  </th>
                  <td>
                    {editing ? (
                      <div className="task-row-duration">
                        <input
                          aria-label="Duration"
                          inputMode="numeric"
                          value={draft.value.duration}
                          disabled={readOnly || stale}
                          aria-invalid={!!rowError}
                          onChange={(e) => update(draft, { ...draft.value, duration: e.target.value })}
                        />
                        <select
                          aria-label="Duration unit"
                          value={draft.value.durationUnit}
                          disabled={readOnly || stale}
                          onChange={(e) =>
                            update(draft, { ...draft.value, durationUnit: e.target.value as "day" | "week" | "month" })
                          }
                        >
                          <option value="day">Days</option>
                          <option value="week">Weeks</option>
                          <option value="month">Months</option>
                        </select>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        aria-label="Progress (%)"
                        inputMode="numeric"
                        value={draft.value.completion}
                        disabled={readOnly || stale}
                        aria-invalid={!!rowError}
                        onChange={(e) => update(draft, { ...draft.value, completion: e.target.value })}
                      />
                    ) : task.completion === undefined ? (
                      "—"
                    ) : (
                      `${task.completion.value}%`
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="task-row-resources">
                        {draft.value.resources.map((resource, index) => (
                          <div key={index}>
                            <input
                              list={resourceList}
                              aria-label={`Resource ${index + 1} name`}
                              value={resource.name}
                              disabled={readOnly || stale}
                              onChange={(e) =>
                                update(draft, {
                                  ...draft.value,
                                  resources: draft.value.resources.map((r, i) =>
                                    i === index ? { ...r, name: e.target.value } : r,
                                  ),
                                })
                              }
                            />
                            <input
                              aria-label={`Resource ${index + 1} allocation (%)`}
                              inputMode="numeric"
                              placeholder="Default"
                              value={resource.allocation}
                              disabled={readOnly || stale}
                              onChange={(e) =>
                                update(draft, {
                                  ...draft.value,
                                  resources: draft.value.resources.map((r, i) =>
                                    i === index ? { ...r, allocation: e.target.value } : r,
                                  ),
                                })
                              }
                            />
                            <button
                              aria-label={`Remove resource ${index + 1}`}
                              disabled={readOnly || stale}
                              onClick={() =>
                                update(draft, {
                                  ...draft.value,
                                  resources: draft.value.resources.filter((_, i) => i !== index),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          disabled={readOnly || stale}
                          onClick={() =>
                            update(draft, {
                              ...draft.value,
                              resources: [...draft.value.resources, { name: "", allocation: "" }],
                            })
                          }
                        >
                          Add resource
                        </button>
                      </div>
                    ) : (
                      (task.resources ?? [])
                        .map((r) => `${r.value}${r.allocation === undefined ? "" : ` (${r.allocation}%)`}`)
                        .join(", ") || "—"
                    )}
                  </td>
                  <td>
                    {rowError && <p role="alert">{rowError}</p>}
                    {staged && (
                      <button onClick={() => onDraftChange(drafts.filter((row) => row.taskId !== task.id))}>
                        Discard {task.label} edits
                      </button>
                    )}
                    <button onClick={() => onDetails(task.id)}>Details {task.label}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tasks.length && <p>No tasks yet. Use Add → Task to create one.</p>}
      {tasks.length > limit && (
        <button onClick={() => setLimit((n) => n + 100)}>
          Show more tasks ({Math.min(limit, tasks.length)} of {tasks.length})
        </button>
      )}
    </section>
  );
}
