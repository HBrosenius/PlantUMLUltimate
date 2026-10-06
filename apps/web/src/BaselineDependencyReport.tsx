import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import type { DependencyChange } from "./schedule-baseline-comparison";
import { dependencyDescription } from "./schedule-baseline-comparison";

export function BaselineDependencyReport({
  changes,
  tasks,
  baselineTasks,
  onTaskSelect,
  onDependencySelect,
}: {
  changes: readonly DependencyChange[];
  tasks: readonly GanttTask[];
  baselineTasks: readonly GanttTask[];
  onTaskSelect(id: string): void;
  onDependencySelect(index: number): void;
}) {
  const taskLink = (id: string) => {
    const current = tasks.find((task) => task.id === id);
    const label = current?.label ?? baselineTasks.find((task) => task.id === id)?.label ?? id;
    return current ? (
      <button type="button" onClick={() => onTaskSelect(id)}>
        {label}
      </button>
    ) : (
      <span>{label} (removed)</span>
    );
  };
  const describe = (dependency?: GanttDependency) => (dependency ? dependencyDescription(dependency) : "—");
  return (
    <section className="baseline-dependency-report" aria-label="Baseline dependency changes">
      <h4>Dependency changes</h4>
      {!changes.length ? (
        <p>No dependency changes.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tasks</th>
              <th>Change</th>
              <th>Baseline</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, index) => {
              const dependency = change.after ?? change.before!;
              return (
                <tr key={index}>
                  <th>
                    {taskLink(dependency.predecessorTaskId)} → {taskLink(dependency.successorTaskId)}
                  </th>
                  <td>
                    {change.kind === "changed" ? "Changed" : change.kind === "added" ? "Added" : "Removed"}
                    {change.currentIndex !== undefined && (
                      <button type="button" onClick={() => onDependencySelect(change.currentIndex!)}>
                        Reveal dependency
                      </button>
                    )}
                  </td>
                  <td>{describe(change.before)}</td>
                  <td>{describe(change.after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
