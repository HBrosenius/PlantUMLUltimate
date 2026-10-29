import { useRef, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { useDialogFocus } from "./use-dialog-focus";

type Anchor = "start" | "end";
export function AddDependencyDialog({
  tasks,
  selectedTaskId,
  readOnly,
  onAdd,
  onClose,
}: {
  tasks: readonly GanttTask[];
  selectedTaskId: string | undefined;
  readOnly: boolean;
  onAdd(predecessor: string, successor: string, from: Anchor, to: Anchor): boolean;
  onClose(): void;
}) {
  const [predecessor, setPredecessor] = useState(selectedTaskId ?? tasks[0]?.id ?? "");
  const [successor, setSuccessor] = useState(
    tasks.find((task) => task.id !== (selectedTaskId ?? tasks[0]?.id))?.id ?? "",
  );
  const [from, setFrom] = useState<Anchor>("end");
  const [to, setTo] = useState<Anchor>("start");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useDialogFocus(root, onClose);
  const valid =
    !!predecessor &&
    predecessor !== successor &&
    tasks.some((task) => task.id === predecessor) &&
    tasks.some((task) => task.id === successor);
  return (
    <div className="modal-backdrop">
      <div ref={root} className="task-dialog" role="dialog" aria-modal="true" aria-label="Add dependency">
        <h2>Add dependency</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (readOnly || !valid) return;
            if (onAdd(predecessor, successor, from, to)) onClose();
            else setError("This dependency could not be added. Check for an existing link or a dependency cycle.");
          }}
        >
          <label>
            Predecessor
            <select
              aria-label="Predecessor"
              value={predecessor}
              onChange={(event) => {
                setPredecessor(event.target.value);
                setError("");
              }}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Successor
            <select
              aria-label="Successor"
              value={successor}
              onChange={(event) => {
                setSuccessor(event.target.value);
                setError("");
              }}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <select value={from} onChange={(event) => setFrom(event.target.value as Anchor)}>
              <option value="end">Predecessor end</option>
              <option value="start">Predecessor start</option>
            </select>
          </label>
          <label>
            To
            <select value={to} onChange={(event) => setTo(event.target.value as Anchor)}>
              <option value="start">Successor start</option>
              <option value="end">Successor end</option>
            </select>
          </label>
          {!valid && <p role="status">Choose two different tasks.</p>}
          {readOnly && <p role="status">Viewing only.</p>}
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={readOnly || !valid}>
              Add dependency
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
