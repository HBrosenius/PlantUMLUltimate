import { useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { forecastWorkingDaysBetween, type ProgressForecast } from "./gantt-progress-forecast";
import type { GanttCalendar } from "./gantt-calendar";

interface Props {
  tasks: readonly GanttTask[];
  forecast: ProgressForecast;
  calendar: GanttCalendar;
  asOf: string;
  projectStart?: string | undefined;
  selectedTaskId?: string | undefined;
  onTaskSelect(id: string): void;
  onEditTask(id: string): void;
  onRemainingChange(id: string, days?: number): void;
  display?: "timeline" | "details";
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const shortDate = (date?: string) =>
  date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
    : "—";

function causeChain(id: string, forecast: ProgressForecast, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const predecessors = forecast.tasks.get(id)?.causeTaskIds ?? [];
  return [...new Set([...predecessors.flatMap((parent) => causeChain(parent, forecast, seen)), id])];
}

export function GanttForecastView({
  tasks,
  forecast,
  calendar,
  asOf,
  projectStart,
  selectedTaskId,
  onTaskSelect,
  onEditTask,
  onRemainingChange,
  display = "timeline",
}: Props) {
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const allDates = [...forecast.tasks.values()]
    .flatMap((item) => [item.plannedStart, item.plannedEnd, item.start, item.end])
    .filter((value): value is string => Boolean(value));
  const first = allDates.sort()[0] ?? asOf;
  const last = allDates.at(-1) ?? asOf;
  const leftDay = Math.min(dayNumber(first), dayNumber(asOf));
  const rightDay = Math.max(dayNumber(last), dayNumber(asOf)) + 1;
  const span = Math.max(1, rightDay - leftDay);
  const position = (date: string) => `${((dayNumber(date) - leftDay) / span) * 100}%`;
  const width = (start: string, end: string) =>
    `${Math.max(0.7, ((dayNumber(end) - dayNumber(start) + 1) / span) * 100)}%`;
  const ticks = Array.from({ length: Math.min(8, Math.floor(span / 7) + 1) }, (_, index) => {
    const day = leftDay + Math.round((index / Math.max(1, Math.min(8, Math.floor(span / 7) + 1) - 1)) * (span - 1));
    return new Date(day * 86_400_000).toISOString().slice(0, 10);
  });
  const selected = forecast.tasks.get(selectedTaskId ?? "");
  const manualEstimates = [...forecast.tasks.values()].filter((item) => item.manualEstimate).length;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const selectedLabel = selectedTask?.label;
  const causeLabels = selected?.causeTaskIds.map((id) => tasks.find((task) => task.id === id)?.label ?? id) ?? [];
  const selectedChain = selected ? causeChain(selected.taskId, forecast) : [];
  const selectedChainLabels = selectedChain.map((id) => tasks.find((task) => task.id === id)?.label ?? id);
  const finishRoots = new Set(
    tasks
      .filter((task) => forecast.tasks.get(task.id)?.end === forecast.forecastFinish)
      .flatMap((task) => causeChain(task.id, forecast))
      .filter((id) => {
        const item = forecast.tasks.get(id);
        return item && !item.causeTaskIds.length && item.plannedEnd && item.end && item.end > item.plannedEnd;
      }),
  );
  const releaseShift =
    forecast.plannedFinish && forecast.forecastFinish
      ? forecastWorkingDaysBetween(forecast.plannedFinish, forecast.forecastFinish, calendar)
      : undefined;
  const earlyExplicitStarts = projectStart
    ? tasks.filter((task) => task.start?.resolved && task.start.value < projectStart)
    : [];

  return (
    <div className="gantt-forecast-view" data-display={display} data-inspector-trigger>
      <div className="gantt-forecast-summary" aria-live="polite">
        <strong>Projected finish {shortDate(forecast.forecastFinish)}</strong>
        {releaseShift !== undefined && (
          <span className="gantt-forecast-shift" data-shift={releaseShift === 0 ? "on-plan" : "delayed"}>
            +{releaseShift} working day{releaseShift === 1 ? "" : "s"} from plan
          </span>
        )}
        {forecast.missingProgress > 0 && (
          <button
            type="button"
            className="gantt-forecast-filter"
            aria-pressed={showMissingOnly}
            onClick={() => setShowMissingOnly((value) => !value)}
          >
            {forecast.missingProgress} missing progress{showMissingOnly ? " · Show all" : ""}
          </button>
        )}
        <span>
          {finishRoots.size} root cause{finishRoots.size === 1 ? "" : "s"} affecting finish
        </span>
        {manualEstimates > 0 && (
          <span className="gantt-forecast-warning">
            {manualEstimates} manual remaining-work estimate{manualEstimates === 1 ? "" : "s"}
          </span>
        )}
        {forecast.unavailable > 0 && (
          <span className="gantt-forecast-warning">{forecast.unavailable} cannot forecast</span>
        )}
        {display === "details" && (
          <span className="gantt-forecast-inline-legend">
            <i className="plan" /> Plan <i className="forecast" /> Forecast <i className="overdue" /> Past planned
            finish
          </span>
        )}
      </div>
      {projectStart && earlyExplicitStarts.length > 0 && (
        <p className="gantt-forecast-start-conflict" role="status">
          <strong>Start-date conflict.</strong> Project starts {projectStart}, but{" "}
          {earlyExplicitStarts.map((task) => `${task.label} explicitly starts ${task.start!.value}`).join("; ")}. Linked
          tasks follow the earlier task date.
        </p>
      )}
      <div className="gantt-forecast-layout" data-display={display}>
        {display === "timeline" ? (
          <div className="gantt-forecast-chart" role="group" aria-label="Planned and forecast task dates">
            <div className="gantt-forecast-heading">
              <span>Task</span>
              <div>
                {ticks.map((date) => (
                  <span key={date} style={{ left: position(date) }}>
                    {shortDate(date)}
                  </span>
                ))}
              </div>
            </div>
            {tasks
              .filter(
                (task) =>
                  !showMissingOnly || forecast.missingProgress === 0 || forecast.tasks.get(task.id)?.missingCompletion,
              )
              .map((task) => {
                const item = forecast.tasks.get(task.id);
                if (!item) return null;
                const moved = Boolean(item.plannedEnd && item.end && item.end > item.plannedEnd);
                const overdue = Boolean(item.plannedEnd && item.plannedEnd < asOf && item.completion < 100);
                return (
                  <button
                    className="gantt-forecast-row"
                    data-selected={selectedTaskId === task.id}
                    data-cause-chain={selectedChain.includes(task.id)}
                    key={task.id}
                    type="button"
                    onClick={() => onTaskSelect(task.id)}
                    aria-label={`Inspect ${task.label} forecast`}
                  >
                    <span className="gantt-forecast-task">
                      <strong>{task.label}</strong>
                      <small>
                        {item.missingCompletion
                          ? "Progress not reported"
                          : task.completion === undefined
                            ? "Not started · 0% assumed"
                            : `${item.completion}% complete`}
                        {item.manualEstimate ? " · Manual remaining-work estimate" : ""}
                        {item.issue ? ` · ${item.issue}` : ""}
                      </small>
                    </span>
                    <span className="gantt-forecast-track">
                      {item.plannedStart && item.plannedEnd && (
                        <span
                          className="gantt-forecast-plan-bar"
                          style={{
                            left: position(item.plannedStart),
                            width: width(item.plannedStart, item.plannedEnd),
                          }}
                          title={`Plan ${item.plannedStart} to ${item.plannedEnd}`}
                        />
                      )}
                      {item.start && item.end && (
                        <span
                          className={`gantt-forecast-result-bar${overdue ? " overdue" : ""}`}
                          style={{ left: position(item.start), width: width(item.start, item.end) }}
                          title={`Forecast ${item.start} to ${item.end}`}
                        />
                      )}
                      {moved && item.plannedEnd && (
                        <span
                          className="gantt-forecast-missed"
                          style={{ left: position(item.plannedEnd) }}
                          title={`Planned finish ${item.plannedEnd} missed`}
                        />
                      )}
                      <span className="gantt-forecast-asof-line" style={{ left: position(asOf) }} />
                    </span>
                  </button>
                );
              })}
            <div className="gantt-forecast-legend">
              <span>
                <i className="plan" />
                Plan
              </span>
              <span>
                <i className="forecast" />
                Forecast
              </span>
              <span>
                <i className="overdue" />
                Overdue remaining work
              </span>
            </div>
          </div>
        ) : (
          <nav className="gantt-forecast-task-list" aria-label="Forecast tasks">
            {tasks
              .filter(
                (task) =>
                  !showMissingOnly || forecast.missingProgress === 0 || forecast.tasks.get(task.id)?.missingCompletion,
              )
              .map((task) => {
                const item = forecast.tasks.get(task.id);
                if (!item) return null;
                return (
                  <button
                    key={task.id}
                    type="button"
                    data-selected={selectedTaskId === task.id}
                    data-cause-chain={selectedChain.includes(task.id)}
                    onClick={() => onTaskSelect(task.id)}
                  >
                    <strong>{task.label}</strong>
                    <span>
                      {item.issue
                        ? "Cannot forecast"
                        : item.missingCompletion
                          ? "Progress not reported"
                          : item.plannedEnd && item.end && item.end > item.plannedEnd
                            ? `Forecast ends ${shortDate(item.end)}`
                            : "On plan"}
                    </span>
                  </button>
                );
              })}
          </nav>
        )}
        <aside className="gantt-forecast-inspector" aria-live="polite">
          {selected ? (
            <>
              <small>WHY DID THIS MOVE?</small>
              <h3>{selectedLabel}</h3>
              {selected.issue ? (
                <p className="gantt-forecast-warning">Cannot forecast: {selected.issue}</p>
              ) : (
                <>
                  <div className="gantt-forecast-dates">
                    <span>
                      <small>Current plan</small>
                      {shortDate(selected.plannedStart)} – {shortDate(selected.plannedEnd)}
                    </span>
                    <span>
                      <small>Forecast</small>
                      {shortDate(selected.start)} – {shortDate(selected.end)}
                    </span>
                  </div>
                  {selected.plannedEnd && selected.end && selected.end > selected.plannedEnd && (
                    <p className="gantt-forecast-warning">
                      {selectedTask?.end?.resolved ? "Explicit finish" : "Planned finish"} missed by{" "}
                      {forecastWorkingDaysBetween(selected.plannedEnd, selected.end, calendar)} working days.
                    </p>
                  )}
                  {selectedTask?.start?.resolved &&
                    selected.plannedStart &&
                    selected.start &&
                    selected.start > selected.plannedStart && (
                      <p className="gantt-forecast-warning">
                        Explicit start {shortDate(selected.plannedStart)} missed; forecast starts{" "}
                        {shortDate(selected.start)}.
                      </p>
                    )}
                  <p>
                    {selected.missingCompletion
                      ? "Complete is not reported, so the forecast assumes 0%. "
                      : selectedTask?.completion === undefined
                        ? "No progress expected yet; the forecast assumes 0%. "
                        : `${selected.completion}% complete. `}
                    {selected.remainingDays === 0
                      ? "No work remains."
                      : `${selected.remainingDays} working day${selected.remainingDays === 1 ? "" : "s"} remain.`}
                  </p>
                  {selected.manualEstimate && (
                    <p className="gantt-forecast-warning" role="status">
                      Manual remaining-work estimate is active. The forecast uses {selected.remainingDays} working day
                      {selected.remainingDays === 1 ? "" : "s"} instead of{" "}
                      {selected.automaticRemainingDays === undefined
                        ? "an automatic estimate, which is unavailable for this task"
                        : `the automatic ${selected.automaticRemainingDays}-day estimate from Complete`}
                      . Use automatic below to recalculate from {selected.completion}%.
                    </p>
                  )}
                  <p>
                    {causeLabels.length
                      ? `Moved by ${causeLabels.join(" and ")}. Only linked successors inherit this delay.`
                      : selected.plannedEnd && selected.end && selected.end > selected.plannedEnd
                        ? "This task's remaining work extends beyond its planned finish."
                        : "This task does not delay its planned finish."}
                  </p>
                  {selectedChain.length > 1 && (
                    <p className="gantt-forecast-chain">
                      <small>DEPENDENCY CHAIN</small>
                      {selectedChainLabels.join(" → ")}
                    </p>
                  )}
                  <button type="button" className="gantt-forecast-edit" onClick={() => onEditTask(selected.taskId)}>
                    {selected.missingCompletion ? "Add Complete value" : "Edit task"}
                  </button>
                  {selected.remainingDays !== 0 && (
                    <label className="gantt-forecast-override">
                      Remaining work · working days
                      <input
                        key={`${selected.taskId}-${selected.manualEstimate}`}
                        type="number"
                        min="1"
                        max="10000"
                        defaultValue={selected.manualEstimate ? selected.remainingDays : undefined}
                        placeholder={String(selected.remainingDays ?? "")}
                        onBlur={(event) => {
                          const days = Number(event.target.value);
                          if (Number.isInteger(days) && days >= 1 && days <= 10_000)
                            onRemainingChange(selected.taskId, days);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                      {selected.manualEstimate && (
                        <button type="button" onClick={() => onRemainingChange(selected.taskId)}>
                          Use automatic
                        </button>
                      )}
                    </label>
                  )}
                </>
              )}
            </>
          ) : (
            <p>Select a task to see its planned dates, forecast, and cause of any delay.</p>
          )}
        </aside>
      </div>
      <p className="gantt-forecast-note">
        What-if using current progress · Source dates remain unchanged · Portable/project saves preserve forecast
        settings; plain .puml does not · Resource capacity is analysed separately
      </p>
    </div>
  );
}
