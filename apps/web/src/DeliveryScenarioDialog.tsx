import { useMemo, useRef, useState } from "react";
import { parseGantt, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { buildResourceOverAllocations, type ResourceCapacity } from "./ResourceWorkloadPanel";
import { compareDeliveryScenarios } from "./delivery-scenario";
import { addCanonicalGanttOverlay } from "./render/canonical-gantt-overlay";
import { useRenderer } from "./render/use-renderer";
import { useDialogFocus } from "./use-dialog-focus";
import { diffVersionSources } from "./version-diff";
import { applyScenarioVisualOperation, updateScenarioTask, type ScenarioTaskInput } from "./delivery-scenario-edit";
import { DiagramPreview } from "./DiagramPreview";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

function signed(value: number | undefined): string {
  if (value === undefined) return "Changed";
  return `${value > 0 ? "+" : ""}${value} day${Math.abs(value) === 1 ? "" : "s"}`;
}

function ScenarioTaskEditor({
  task,
  dependencyDriven,
  error,
  onSave,
}: {
  task: GanttTask;
  dependencyDriven: boolean;
  error: string;
  onSave(input: ScenarioTaskInput): void;
}) {
  const [duration, setDuration] = useState(task.duration ? String(task.duration.value) : "");
  const [durationUnit, setDurationUnit] = useState<ScenarioTaskInput["durationUnit"]>(task.duration?.unit ?? "day");
  const [startDate, setStartDate] = useState(task.start?.resolved ? task.start.value : "");
  const [endDate, setEndDate] = useState(task.end?.resolved ? task.end.value : "");
  const [completion, setCompletion] = useState(task.completion ? String(task.completion.value) : "");
  const [resources, setResources] = useState<ScenarioTaskInput["resources"]>(
    (task.resources ?? []).map((resource) => ({
      name: resource.value,
      allocation: String(resource.allocation ?? 100),
    })),
  );
  const updateResource = (index: number, field: "name" | "allocation", value: string) =>
    setResources((current) =>
      current.map((resource, itemIndex) => (itemIndex === index ? { ...resource, [field]: value } : resource)),
    );

  return (
    <form
      className="scenario-task-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          duration,
          durationUnit,
          ...(dependencyDriven ? {} : { startDate }),
          endDate,
          completion,
          resources,
        });
      }}
    >
      <div className="scenario-task-fields">
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            disabled={dependencyDriven}
            onChange={(event) => setStartDate(event.target.value)}
          />
          {dependencyDriven && <small>Driven by a dependency. Use source mode to change the relationship.</small>}
        </label>
        <label>
          End date <small>optional</small>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          Duration
          <span className="scenario-duration-field">
            <input
              aria-label="Scenario duration"
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
            <select
              aria-label="Scenario duration unit"
              value={durationUnit}
              onChange={(event) => setDurationUnit(event.target.value as ScenarioTaskInput["durationUnit"])}
            >
              <option value="day">Days</option>
              <option value="week">Weeks</option>
              <option value="month">Months</option>
            </select>
          </span>
        </label>
        <label>
          Completion
          <span className="scenario-completion-field">
            <input
              aria-label="Scenario completion"
              inputMode="numeric"
              value={completion}
              onChange={(event) => setCompletion(event.target.value)}
            />
            <span>%</span>
          </span>
        </label>
      </div>
      <fieldset className="scenario-resources">
        <legend>Resources</legend>
        {resources.length === 0 && <p>No resources assigned.</p>}
        {resources.map((resource, index) => (
          <div key={index}>
            <input
              aria-label={`Resource ${index + 1} name`}
              placeholder="Name"
              value={resource.name}
              onChange={(event) => updateResource(index, "name", event.target.value)}
            />
            <input
              aria-label={`Resource ${index + 1} allocation`}
              inputMode="numeric"
              value={resource.allocation}
              onChange={(event) => updateResource(index, "allocation", event.target.value)}
            />
            <span>%</span>
            <button
              type="button"
              aria-label={`Remove resource ${index + 1}`}
              onClick={() => setResources((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setResources((current) => [...current, { name: "", allocation: "100" }])}>
          Add resource
        </button>
      </fieldset>
      {error && (
        <p className="scenario-task-error" role="alert">
          {error}
        </p>
      )}
      <div className="scenario-task-submit">
        <span>Updates only the scenario copy.</span>
        <button type="submit" className="primary">
          Update scenario
        </button>
      </div>
    </form>
  );
}

export function DeliveryScenarioDialog({
  currentSource,
  capacities,
  onApply,
  onClose,
}: {
  currentSource: string;
  capacities: ResourceCapacity;
  onApply(source: string): boolean;
  onClose(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [scenarioSource, setScenarioSource] = useState(currentSource);
  const [view, setView] = useState<"edit" | "preview" | "review">("edit");
  const [editorMode, setEditorMode] = useState<"structured" | "source">("structured");
  const [discardRequested, setDiscardRequested] = useState(false);
  const initialTaskId = useMemo(
    () => parseGantt(currentSource).document.tasks.find((task) => !task.milestone)?.id ?? "",
    [currentSource],
  );
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId);
  const [scenarioEditError, setScenarioEditError] = useState("");
  const [scenarioZoom, setScenarioZoom] = useState(1);
  const [scenarioVisualTaskId, setScenarioVisualTaskId] = useState<string>();
  const [scenarioDependencyIndex, setScenarioDependencyIndex] = useState<number>();
  const [scenarioInteractionMessage, setScenarioInteractionMessage] = useState<string>();
  const comparison = useMemo(
    () => compareDeliveryScenarios(currentSource, scenarioSource, capacities),
    [capacities, currentSource, scenarioSource],
  );
  const changed = scenarioSource !== currentSource;
  const requestClose = () => {
    if (changed) setDiscardRequested(true);
    else onClose();
  };
  useDialogFocus(dialog, requestClose);
  const currentRender = useRenderer(currentSource, view === "preview", "native");
  const scenarioRender = useRenderer(scenarioSource, view === "preview", "native");
  const currentSvg = useMemo(() => {
    if (!currentRender.result?.svg) return undefined;
    const document = parseGantt(currentSource).document;
    return addCanonicalGanttOverlay(currentRender.result.svg, document.tasks, document.dependencies);
  }, [currentRender.result?.svg, currentSource]);
  const diff = useMemo(() => diffVersionSources(currentSource, scenarioSource), [currentSource, scenarioSource]);
  const scenarioDocument = useMemo(() => parseGantt(scenarioSource).document, [scenarioSource]);
  const scenarioCalendar = useMemo(() => parseGanttCalendar(scenarioSource), [scenarioSource]);
  const scenarioResolvedDates = useMemo(
    () =>
      resolveTaskDates(
        scenarioDocument.tasks,
        scenarioDocument.dependencies,
        scenarioDocument.projectStart?.resolved ? scenarioDocument.projectStart.value : undefined,
        scenarioCalendar,
      ),
    [scenarioCalendar, scenarioDocument],
  );
  const scenarioResourceConflicts = useMemo(
    () => buildResourceOverAllocations(scenarioDocument.tasks, capacities, scenarioResolvedDates, scenarioCalendar),
    [capacities, scenarioCalendar, scenarioDocument.tasks, scenarioResolvedDates],
  );
  const scenarioTasks = scenarioDocument.tasks.filter((task) => !task.milestone);
  const selectedTask = scenarioTasks.find((task) => task.id === selectedTaskId) ?? scenarioTasks[0];
  const selectedTaskHasIncomingDependency = Boolean(
    selectedTask && scenarioDocument.dependencies.some((dependency) => dependency.successorTaskId === selectedTask.id),
  );
  const applyVisualChange = (operation: Parameters<typeof applyScenarioVisualOperation>[1]) => {
    const result = applyScenarioVisualOperation(scenarioSource, operation);
    if (result.error) return setScenarioInteractionMessage(result.error);
    setScenarioSource(result.source);
    setScenarioInteractionMessage(undefined);
    setDiscardRequested(false);
  };

  return (
    <div
      className="modal-backdrop scenario-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="task-dialog delivery-scenario-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-scenario-title"
      >
        <header>
          <div>
            <h2 id="delivery-scenario-title">Delivery Scenario Lab</h2>
            <p>Test schedule changes without modifying the current diagram.</p>
          </div>
          <button type="button" aria-label="Close scenario lab" onClick={requestClose}>
            ×
          </button>
        </header>

        <nav className="scenario-view-switch" aria-label="Scenario view">
          <button type="button" className={view === "edit" ? "active" : ""} onClick={() => setView("edit")}>
            Edit scenario
          </button>
          <button type="button" className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}>
            Rendered preview
          </button>
          <button
            type="button"
            className={view === "review" ? "active" : ""}
            disabled={!changed}
            onClick={() => setView("review")}
          >
            Review changes
          </button>
        </nav>

        <p className="scenario-apply-hint">
          Your current plan will not change until you review and apply this scenario.
        </p>

        {view === "edit" && (
          <div className="scenario-editor">
            <div className="scenario-editor-mode" aria-label="Scenario editor mode">
              <button
                type="button"
                className={editorMode === "structured" ? "active" : ""}
                onClick={() => setEditorMode("structured")}
              >
                Task controls
              </button>
              <button
                type="button"
                className={editorMode === "source" ? "active" : ""}
                onClick={() => setEditorMode("source")}
              >
                Edit PlantUML source
              </button>
            </div>
            {editorMode === "structured" && selectedTask && (
              <div className="scenario-structured-editor">
                <label className="scenario-task-picker">
                  Task
                  <select
                    aria-label="Scenario task"
                    value={selectedTask.id}
                    onChange={(event) => {
                      setSelectedTaskId(event.target.value);
                      setScenarioEditError("");
                    }}
                  >
                    {scenarioTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ScenarioTaskEditor
                  key={`${selectedTask.id}:${scenarioSource}`}
                  task={selectedTask}
                  dependencyDriven={selectedTaskHasIncomingDependency}
                  error={scenarioEditError}
                  onSave={(input) => {
                    const result = updateScenarioTask(scenarioSource, selectedTask.id, input);
                    if (result.error) return setScenarioEditError(result.error);
                    setScenarioEditError("");
                    setScenarioSource(result.source);
                    setDiscardRequested(false);
                  }}
                />
              </div>
            )}
            {editorMode === "structured" && !selectedTask && <p>No editable tasks in this Gantt diagram.</p>}
            {editorMode === "source" && (
              <div className="scenario-editors">
                <label>
                  <span>
                    Current plan <small>snapshot</small>
                  </span>
                  <textarea aria-label="Current plan source" value={currentSource} readOnly spellCheck={false} />
                </label>
                <label>
                  <span>
                    Scenario <small>{changed ? "modified" : "unchanged"}</small>
                  </span>
                  <textarea
                    aria-label="Scenario source"
                    autoFocus
                    value={scenarioSource}
                    onChange={(event) => {
                      setScenarioSource(event.target.value);
                      setDiscardRequested(false);
                    }}
                    spellCheck={false}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {view === "preview" && (
          <div className="scenario-rendered" aria-label="Scenario rendered comparison">
            <section aria-label="Current plan preview">
              <h3>
                Current plan <small>read only</small>
              </h3>
              <div className="version-render-canvas scenario-render-canvas">
                {currentRender.status === "rendering" && !currentSvg && <p>Rendering…</p>}
                {currentRender.result?.error && <p className="scenario-render-error">{currentRender.result.error}</p>}
                {currentSvg && <div dangerouslySetInnerHTML={{ __html: currentSvg }} />}
              </div>
            </section>
            <section aria-label="Scenario preview">
              <h3>
                Scenario <small>drag tasks to change the draft</small>
              </h3>
              <div className="scenario-interactive-canvas">
                <DiagramPreview
                  svg={scenarioRender.result?.svg}
                  tasks={scenarioDocument.tasks}
                  dependencies={scenarioDocument.dependencies}
                  dividers={scenarioDocument.dividers}
                  verticalSeparators={scenarioDocument.verticalSeparators}
                  source={scenarioSource}
                  zoom={scenarioZoom}
                  onZoomChange={setScenarioZoom}
                  selectedTaskId={scenarioVisualTaskId}
                  onTaskSelect={(taskId) => {
                    setScenarioVisualTaskId(taskId);
                    setSelectedTaskId(taskId);
                  }}
                  onNoteSelect={setScenarioVisualTaskId}
                  onBackgroundSelect={() => {
                    setScenarioVisualTaskId(undefined);
                    setScenarioDependencyIndex(undefined);
                  }}
                  onTaskMove={(taskId, days) => applyVisualChange({ kind: "move-task", taskId, days })}
                  onTaskReorder={(taskId, beforeTaskId) =>
                    applyVisualChange({
                      kind: "reorder-task",
                      taskId,
                      ...(beforeTaskId ? { beforeTaskId } : {}),
                    })
                  }
                  onDividerReorder={() => setScenarioInteractionMessage("Divider reordering is not available here.")}
                  onVerticalSeparatorMove={() =>
                    setScenarioInteractionMessage("Separator changes are not available here.")
                  }
                  onVerticalSeparatorSelect={() => setScenarioVisualTaskId(undefined)}
                  onDividerSelect={() => setScenarioVisualTaskId(undefined)}
                  onTaskResize={(taskId, durationDays) =>
                    applyVisualChange({ kind: "resize-task", taskId, days: durationDays })
                  }
                  onDependencyCreate={(predecessorTaskId, successorTaskId, predecessorAnchor, successorAnchor) =>
                    applyVisualChange({
                      kind: "create-dependency",
                      predecessorTaskId,
                      successorTaskId,
                      predecessorAnchor,
                      successorAnchor,
                    })
                  }
                  selectedDependencyIndex={scenarioDependencyIndex}
                  onDependencySelect={setScenarioDependencyIndex}
                  onDependencyDelete={() => {
                    if (scenarioDependencyIndex === undefined) return;
                    applyVisualChange({ kind: "remove-dependency", dependencyIndex: scenarioDependencyIndex });
                    setScenarioDependencyIndex(undefined);
                  }}
                  onInteractionMessage={setScenarioInteractionMessage}
                  resourceFilter=""
                  projectStart={
                    scenarioDocument.projectStart?.resolved ? scenarioDocument.projectStart.value : undefined
                  }
                  renderStatus={scenarioRender.status}
                  renderError={scenarioRender.result?.error}
                  onRenderRetry={scenarioRender.retry}
                  parseDurationMs={0}
                  openDocumentCount={1}
                  openSourceBytes={scenarioSource.length}
                  resourceOverAllocations={scenarioResourceConflicts}
                  onOpenResourceWorkload={() =>
                    setScenarioInteractionMessage("Resource workload is available after applying the scenario.")
                  }
                  onDateHighlightRequest={() =>
                    setScenarioInteractionMessage("Date highlighting is not available in the scenario preview.")
                  }
                  onLegendEditRequest={() =>
                    setScenarioInteractionMessage("Legend editing is not available in the scenario preview.")
                  }
                  onChangeBaseline={() =>
                    setScenarioInteractionMessage("Baselines are not available in the scenario preview.")
                  }
                  onClearBaseline={() => undefined}
                />
              </div>
              {scenarioInteractionMessage && (
                <p className="scenario-interaction-message" role="status">
                  {scenarioInteractionMessage}
                </p>
              )}
            </section>
          </div>
        )}

        {view === "review" && (
          <section className="scenario-review" aria-label="Scenario source patch">
            <header>
              <div>
                <h3>Review source patch</h3>
                <p>Only these lines will replace the current plan.</p>
              </div>
              <span>{diff.filter((line) => line.kind !== "equal").length} changed lines</span>
            </header>
            <div className="scenario-diff">
              {diff.map((line, index) => (
                <div className={line.kind} key={`${line.leftNumber ?? ""}-${line.rightNumber ?? ""}-${index}`}>
                  <span>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>
                  <code>{line.right ?? line.left ?? ""}</code>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="scenario-impact" aria-label="Scenario impact">
          <div className="scenario-summary">
            <span>
              <strong>{comparison.taskChanges.length}</strong> tasks changed
            </span>
            <span>
              <strong>{comparison.milestoneChanges.length}</strong> milestones moved
            </span>
            <span>
              <strong>{comparison.resourceConflictChanges.filter((item) => item.kind === "new").length}</strong> new
              conflicts
            </span>
            <span>
              <strong>{signed(comparison.criticalPath.durationDeltaDays)}</strong> project duration
            </span>
          </div>

          {comparison.issues.length > 0 && (
            <div className="scenario-issues" role="alert">
              <strong>Fix the scenario source to compare reliably</strong>
              <ul>
                {comparison.issues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {!changed && <p className="scenario-empty">Edit the scenario source to see delivery impact.</p>}
          {changed && comparison.issues.length === 0 && (
            <div className="scenario-results">
              <section>
                <h3>Milestones</h3>
                {comparison.milestoneChanges.length === 0 ? (
                  <p>No milestone movement.</p>
                ) : (
                  <ul>
                    {comparison.milestoneChanges.map((item) => (
                      <li key={item.taskId}>
                        <strong>{item.label}</strong> {item.before ?? "Unscheduled"} → {item.after ?? "Unscheduled"} (
                        {signed(item.deltaDays)})
                        {item.causes.length > 0 && (
                          <small>Because: {item.causes.map((cause) => cause.detail).join("; ")}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3>Schedule changes</h3>
                {comparison.taskChanges.length === 0 ? (
                  <p>No task date or input changes.</p>
                ) : (
                  <ul>
                    {comparison.taskChanges.map((item) => (
                      <li key={item.taskId}>
                        <strong>{item.label}</strong> · {item.kind} · {item.changedFields.join(", ") || "task"}
                        {(item.startDeltaDays !== undefined || item.endDeltaDays !== undefined) && (
                          <small>
                            Dates: start {signed(item.startDeltaDays)}, finish {signed(item.endDeltaDays)}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3>Dependencies & critical path</h3>
                <p>
                  {comparison.dependencyChanges.length} dependency changes · {comparison.criticalPath.added.length}{" "}
                  tasks joined and {comparison.criticalPath.removed.length} left the critical path.
                </p>
              </section>
              <section>
                <h3>Resource conflicts</h3>
                {comparison.resourceConflictChanges.length === 0 ? (
                  <p>No conflict changes.</p>
                ) : (
                  <ul>
                    {comparison.resourceConflictChanges.map((item) => (
                      <li key={item.resource}>
                        <strong>{item.resource}</strong> · {item.kind}
                        {item.after ? ` · peak ${item.after.peak}%` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </section>

        {discardRequested && (
          <div className="scenario-discard-confirmation" role="alert">
            <span>
              <strong>Discard this scenario?</strong> Your unapplied changes will be lost.
            </span>
            <button type="button" autoFocus onClick={() => setDiscardRequested(false)}>
              Keep editing
            </button>
            <button type="button" className="danger" onClick={onClose}>
              Discard changes
            </button>
          </div>
        )}

        <div className="dialog-actions scenario-actions">
          <button
            type="button"
            disabled={!changed}
            onClick={() => {
              setScenarioSource(currentSource);
              setView("edit");
              setDiscardRequested(false);
            }}
          >
            Reset scenario
          </button>
          <button type="button" onClick={requestClose}>
            Close
          </button>
          {view === "review" && (
            <>
              <button type="button" onClick={() => setView("edit")}>
                Back to editing
              </button>
              <button
                type="button"
                className="primary"
                disabled={!changed || comparison.issues.length > 0}
                onClick={() => onApply(scenarioSource)}
              >
                Apply scenario
              </button>
            </>
          )}
          {view !== "review" && (
            <button type="button" className="primary" disabled={!changed} onClick={() => setView("review")}>
              Review and apply…
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
