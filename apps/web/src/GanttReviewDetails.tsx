import { useMemo, useState } from "react";
import { parseGantt, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { applyReviewGroups, type ReviewGroup } from "./semantic-review";

function fields(task: GanttTask | undefined): Record<string, string> {
  if (!task) return {};
  return {
    Label: task.label,
    Type: task.milestone ? "Milestone" : "Task",
    Duration: task.duration
      ? `${task.duration.value} ${task.duration.unit}${task.duration.value === 1 ? "" : "s"}`
      : "Not set",
    Start: task.start?.value ?? "Not set",
    End: task.end?.value ?? "Not set",
    "Progress (%)": task.completion ? String(task.completion.value) : "Not set",
    Resources:
      task.resources
        ?.map((resource) =>
          resource.allocation === undefined ? resource.value : `${resource.value} (${resource.allocation}%)`,
        )
        .join(", ") || "None",
  };
}

export function GanttReviewDetails({ group, before }: { group: ReviewGroup; before: string }) {
  const [expanded, setExpanded] = useState(false);
  const details = useMemo(() => {
    if (!expanded) return [];
    const after = applyReviewGroups(before, [group], new Set([group.id]));
    const left = parseGantt(before).document.tasks;
    const right = parseGantt(after).document.tasks;
    const ids = new Set(
      [...group.leftTargets, ...group.rightTargets].flatMap((target) =>
        target.kind === "gantt-task" ? [target.id] : [],
      ),
    );
    return [...ids].map((id) => {
      const oldTask = left.find((task) => task.id === id),
        newTask = right.find((task) => task.id === id);
      const oldFields = fields(oldTask),
        newFields = fields(newTask);
      return {
        id,
        label: newTask?.label ?? oldTask?.label ?? id,
        rows: [...new Set([...Object.keys(oldFields), ...Object.keys(newFields)])]
          .filter((field) => oldFields[field] !== newFields[field])
          .map((field) => ({ field, before: oldFields[field] ?? "Absent", after: newFields[field] ?? "Absent" })),
      };
    });
  }, [before, expanded, group]);
  if (![...group.leftTargets, ...group.rightTargets].some((target) => target.kind === "gantt-task")) return null;
  return (
    <details className="semantic-object-details" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Review task fields</summary>
      {details
        .filter((item) => item.rows.length)
        .map((item) => (
          <table key={item.id} aria-label={`Changed fields for ${item.label}`}>
            <caption>{item.label}</caption>
            <thead>
              <tr>
                <th>Field</th>
                <th>Before</th>
                <th>After this group</th>
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row) => (
                <tr key={row.field}>
                  <th>{row.field}</th>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      {expanded && !details.some((item) => item.rows.length) && (
        <p>No supported task-field difference. Inspect the source for dependencies or other changes.</p>
      )}
    </details>
  );
}
