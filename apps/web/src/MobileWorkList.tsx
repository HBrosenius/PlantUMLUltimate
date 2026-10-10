import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseGantt, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { parseWbs, type WbsNode } from "@plantuml-studio/diagram-wbs";
import { editTaskRow, taskRowValue, type TaskRowDraft } from "./gantt-task-table";

export function MobileWorkList({
  kind,
  source,
  readOnly,
  onApply,
  onDiagram,
  onSheetChange,
}: {
  kind: "gantt" | "wbs";
  source: string;
  readOnly: boolean;
  onApply(draft: TaskRowDraft): string | undefined;
  onDiagram(id: string): void;
  onSheetChange(open: boolean): void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(100);
  const [selection, setSelection] = useState<{ id: string; source: string }>();
  const opener = useRef<HTMLElement | null>(null);
  const tasks = useMemo(() => (kind === "gantt" ? parseGantt(source).document.tasks : []), [kind, source]);
  const nodes = useMemo(() => (kind === "wbs" ? parseWbs(source).nodes : []), [kind, source]);
  const matchingTasks = tasks.filter(
    (task) =>
      `${task.label} ${(task.resources ?? []).map((r) => r.value).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter !== "incomplete" || (task.completion?.value ?? 0) < 100) &&
      (filter !== "unassigned" || !task.resources?.length),
  );
  const matchingNodes = nodes.filter((node) => node.label.toLowerCase().includes(query.toLowerCase()));
  const open = (id: string, element: HTMLElement) => {
    opener.current = element;
    onSheetChange(true);
    setSelection({ id, source });
  };
  const close = () => {
    onSheetChange(false);
    setSelection(undefined);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else document.querySelector<HTMLElement>(".workspace")?.focus({ preventScroll: true });
    });
  };
  useEffect(() => () => onSheetChange(false), [onSheetChange]);
  const item =
    selection &&
    (kind === "gantt"
      ? tasks.find((task) => task.id === selection.id)
      : nodes.find((node) => node.id === selection.id));
  return (
    <section className="mobile-work-list" aria-label={kind === "gantt" ? "Mobile task list" : "Mobile WBS list"}>
      <header>
        <h2>{kind === "gantt" ? "Task check-in" : "Work breakdown"}</h2>
        <p>
          {kind === "gantt"
            ? "Choose a task to update progress and resources."
            : "Browse work packages and their hierarchy."}
        </p>
      </header>
      <label>
        Find {kind === "gantt" ? "tasks or resources" : "work packages"}
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(100);
          }}
        />
      </label>
      {kind === "gantt" && (
        <label>
          Task scope
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setLimit(100);
            }}
          >
            <option value="all">All tasks</option>
            <option value="incomplete">Incomplete tasks</option>
            <option value="unassigned">Unassigned tasks</option>
          </select>
        </label>
      )}
      {readOnly && <p role="status">Viewing only. Check-in editing is unavailable.</p>}
      <ul>
        {kind === "gantt"
          ? matchingTasks.slice(0, limit).map((task) => (
              <li key={task.id}>
                <button
                  className="mobile-work-item"
                  onClick={(event) => open(task.id, event.currentTarget)}
                  aria-label={`Open task ${task.label}`}
                >
                  <strong>{task.label}</strong>
                  <span>
                    {task.milestone
                      ? "Milestone"
                      : task.duration
                        ? `${task.duration.value} ${task.duration.unit}${task.duration.value === 1 ? "" : "s"}`
                        : "Duration not set"}{" "}
                    · {task.completion ? `${task.completion.value}% complete` : "Progress not set"}
                  </span>
                  <span>{task.resources?.map((r) => r.value).join(", ") || "Unassigned"}</span>
                </button>
              </li>
            ))
          : matchingNodes.slice(0, limit).map((node) => (
              <li key={node.id} style={{ marginInlineStart: `${Math.min(node.depth - 1, 5) * 12}px` }}>
                <button
                  className="mobile-work-item"
                  onClick={(event) => open(node.id, event.currentTarget)}
                  aria-label={`Open work package ${node.label}`}
                >
                  <strong>{node.label}</strong>
                  <span>
                    Level {node.depth}
                    {node.parentId
                      ? ` · ${nodes.find((parent) => parent.id === node.parentId)?.label ?? "Parent"}`
                      : " · Root"}
                  </span>
                </button>
              </li>
            ))}
      </ul>
      {!(kind === "gantt" ? matchingTasks : matchingNodes).length && (
        <p>No matching {kind === "gantt" ? "tasks" : "work packages"}.</p>
      )}
      {(kind === "gantt" ? matchingTasks : matchingNodes).length > limit && (
        <button onClick={() => setLimit((value) => value + 100)}>Show more</button>
      )}
      {selection && (
        <MobileProperties
          key={`${selection.id}:${selection.source}`}
          source={source}
          snapshot={selection.source}
          item={item || undefined}
          kind={kind}
          nodes={nodes}
          readOnly={readOnly}
          onApply={onApply}
          onClose={close}
          onNavigate={(id) => setSelection({ id, source })}
          onDiagram={() => {
            const id = selection.id;
            close();
            onDiagram(id);
          }}
        />
      )}
    </section>
  );
}

function MobileProperties({
  source,
  snapshot,
  item,
  kind,
  nodes,
  readOnly,
  onApply,
  onClose,
  onNavigate,
  onDiagram,
}: {
  source: string;
  snapshot: string;
  item: GanttTask | WbsNode | undefined;
  kind: "gantt" | "wbs";
  nodes: WbsNode[];
  readOnly: boolean;
  onApply(draft: TaskRowDraft): string | undefined;
  onClose(): void;
  onNavigate(id: string): void;
  onDiagram(): void;
}) {
  const task = kind === "gantt" ? (item as GanttTask | undefined) : undefined;
  const [value, setValue] = useState(() => (task ? taskRowValue(task) : undefined));
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const stale = snapshot !== source;
  const draft = task && value ? { taskId: task.id, source: snapshot, value } : undefined;
  const validation = draft ? editTaskRow(source, draft) : undefined;
  const invalid = validation && "error" in validation ? validation.error : undefined;
  const changed = !!task && !!value && JSON.stringify(value) !== JSON.stringify(taskRowValue(task));
  const editable = !!task && !task.milestone && !readOnly && !stale;
  useEffect(() => {
    title.current?.focus();
    const viewport = window.visualViewport;
    const resize = () => {
      root.current?.style.setProperty("--sheet-top", `${viewport?.offsetTop ?? 0}px`);
      root.current?.style.setProperty("--sheet-height", `${viewport?.height ?? window.innerHeight}px`);
      root.current?.style.setProperty("--sheet-width", `${viewport?.width ?? window.innerWidth}px`);
      root.current?.style.setProperty("--sheet-left", `${viewport?.offsetLeft ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const app = document.querySelector(".app");
    if (app && root.current) {
      const style = getComputedStyle(app);
      for (const name of ["--bg", "--panel", "--text", "--line", "--muted", "--accent"])
        root.current.style.setProperty(name, style.getPropertyValue(name));
    }
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && ["n", "o", "s", "w", "1", "2", "3"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Tab") {
        const controls = [
          ...root.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
          ),
        ];
        if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === title.current)) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
          event.preventDefault();
          controls[0]?.focus();
        }
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);
  return createPortal(
    <div
      ref={root}
      className="mobile-properties-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`${kind === "gantt" ? "Task check-in" : "Work package"}: ${item?.label ?? "Unavailable"}`}
    >
      <header>
        <h2 ref={title} tabIndex={-1}>
          {item?.label ?? "Item unavailable"}
        </h2>
        <button onClick={onClose}>Cancel</button>
      </header>
      <div className="mobile-properties-body">
        {stale && <p role="alert">Diagram source changed. Cancel and reopen this item before editing.</p>}
        {!item && <p role="alert">This item no longer exists.</p>}
        {readOnly && <p role="status">Viewing only. No changes can be applied.</p>}
        {task?.milestone && <p>Milestone properties are available in the diagram inspector.</p>}
        {value && (
          <>
            <label>
              Progress (%)
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={!editable}
                value={value.completion}
                onChange={(event) => {
                  setValue({ ...value, completion: event.target.value });
                  setError("");
                }}
              />
            </label>
            <p>Enter 0–100. Blank removes progress.</p>
            <h3>Resources</h3>
            {value.resources.map((resource, index) => (
              <fieldset key={index}>
                <legend>Resource {index + 1}</legend>
                <label>
                  Name
                  <input
                    disabled={!editable}
                    value={resource.name}
                    autoComplete="off"
                    onChange={(event) =>
                      setValue({
                        ...value,
                        resources: value.resources.map((r, i) =>
                          i === index ? { ...r, name: event.target.value } : r,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Allocation (%)
                  <input
                    disabled={!editable}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={resource.allocation}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        resources: value.resources.map((r, i) =>
                          i === index ? { ...r, allocation: event.target.value } : r,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  disabled={!editable}
                  onClick={() => setValue({ ...value, resources: value.resources.filter((_, i) => i !== index) })}
                >
                  Remove resource {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              disabled={!editable}
              onClick={() => {
                setValue({ ...value, resources: [...value.resources, { name: "", allocation: "" }] });
                requestAnimationFrame(() =>
                  root.current?.querySelector("fieldset:last-of-type")?.scrollIntoView({ block: "nearest" }),
                );
              }}
            >
              Add resource
            </button>
            <p>Allocation is 1–100; blank uses the default.</p>
            <p>Progress and resources apply together as one Undo step.</p>
          </>
        )}
        {kind === "wbs" && item && (
          <>
            <p>Level {(item as WbsNode).depth}</p>
            {(item as WbsNode).parentId && (
              <button onClick={() => onNavigate((item as WbsNode).parentId!)}>
                Parent: {nodes.find((n) => n.id === (item as WbsNode).parentId)?.label}
              </button>
            )}
            <h3>Children</h3>
            {nodes
              .filter((n) => n.parentId === item.id)
              .map((node) => (
                <button key={node.id} onClick={() => onNavigate(node.id)}>
                  {node.label}
                </button>
              ))}
            {!nodes.some((n) => n.parentId === item.id) && <p>No child work packages.</p>}
          </>
        )}
        {invalid && changed && !stale && <p role="alert">{invalid}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer>
        <button disabled={!item || stale} onClick={onDiagram}>
          View on diagram
        </button>
        {kind === "gantt" && (
          <button
            disabled={!editable || !changed || !!invalid}
            onClick={() => {
              if (!draft || !editable || invalid) return;
              const failure = onApply(draft);
              if (failure) setError(failure);
              else onClose();
            }}
          >
            Apply check-in
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
