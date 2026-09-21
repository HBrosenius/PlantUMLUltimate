import { useMemo, useRef, useState } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import type { ResourceCapacity } from "./ResourceWorkloadPanel";
import { compareDeliveryScenarios } from "./delivery-scenario";
import { addCanonicalGanttOverlay } from "./render/canonical-gantt-overlay";
import { useRenderer } from "./render/use-renderer";
import { useDialogFocus } from "./use-dialog-focus";
import { diffVersionSources } from "./version-diff";

function signed(value: number | undefined): string {
  if (value === undefined) return "Changed";
  return `${value > 0 ? "+" : ""}${value} day${Math.abs(value) === 1 ? "" : "s"}`;
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
  const comparison = useMemo(
    () => compareDeliveryScenarios(currentSource, scenarioSource, capacities),
    [capacities, currentSource, scenarioSource],
  );
  useDialogFocus(dialog, onClose);
  const changed = scenarioSource !== currentSource;
  const currentRender = useRenderer(currentSource, view === "preview", "native");
  const scenarioRender = useRenderer(scenarioSource, view === "preview", "native");
  const currentSvg = useMemo(() => {
    if (!currentRender.result?.svg) return undefined;
    const document = parseGantt(currentSource).document;
    return addCanonicalGanttOverlay(currentRender.result.svg, document.tasks, document.dependencies);
  }, [currentRender.result?.svg, currentSource]);
  const scenarioSvg = useMemo(() => {
    if (!scenarioRender.result?.svg) return undefined;
    const document = parseGantt(scenarioSource).document;
    return addCanonicalGanttOverlay(scenarioRender.result.svg, document.tasks, document.dependencies);
  }, [scenarioRender.result?.svg, scenarioSource]);
  const diff = useMemo(() => diffVersionSources(currentSource, scenarioSource), [currentSource, scenarioSource]);

  return (
    <div
      className="modal-backdrop scenario-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
          <button type="button" aria-label="Close scenario lab" onClick={onClose}>
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

        {view === "edit" && (
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
                onChange={(event) => setScenarioSource(event.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
        )}

        {view === "preview" && (
          <div className="scenario-rendered" aria-label="Scenario rendered comparison">
            {[
              { title: "Current plan", state: currentRender, svg: currentSvg },
              { title: "Scenario", state: scenarioRender, svg: scenarioSvg },
            ].map(({ title, state, svg }) => (
              <section key={title} aria-label={`${title} preview`}>
                <h3>{title}</h3>
                <div className="scenario-render-canvas">
                  {state.status === "rendering" && !svg && <p>Rendering…</p>}
                  {state.result?.error && <p className="scenario-render-error">{state.result.error}</p>}
                  {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
                </div>
              </section>
            ))}
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

        <div className="dialog-actions">
          <button type="button" disabled={!changed} onClick={() => setScenarioSource(currentSource)}>
            Reset scenario
          </button>
          {view === "review" && (
            <button
              type="button"
              className="primary"
              disabled={!changed || comparison.issues.length > 0}
              onClick={() => onApply(scenarioSource)}
            >
              Apply scenario
            </button>
          )}
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
