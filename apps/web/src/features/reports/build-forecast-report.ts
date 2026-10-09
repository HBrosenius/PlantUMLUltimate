import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import type { GanttCalendar } from "../../gantt-calendar";
import type { ResolvedTaskDates } from "../../gantt-schedule";
import { forecastWorkingDaysBetween, type ProgressForecast } from "../../gantt-progress-forecast";
import { summarizeFinishCauses } from "../../gantt-forecast-causes";
import { compareForecastResourceConflicts } from "../../gantt-forecast-resource-conflicts";
import { resourceIdentity } from "../../resource-identity";
import { reportDate } from "./report-format";
import type { ReportMessage, ReportOptions } from "./report-model";

export function populateForecastReport(
  message: ReportMessage,
  tasks: readonly GanttTask[],
  forecast: ProgressForecast,
  dates: ReadonlyMap<string, ResolvedTaskDates>,
  calendar: GanttCalendar,
  options: ReportOptions,
  capacities: Record<string, number>,
) {
  const date = (value?: string) => (value ? reportDate(value, options.locale) : "Unavailable");
  const visible = new Map(message.rows.map((row) => [row.task.id, row.task.label]));
  const causes = summarizeFinishCauses(tasks, forecast).causes;
  const shift =
    forecast.plannedFinish && forecast.forecastFinish
      ? forecastWorkingDaysBetween(forecast.plannedFinish, forecast.forecastFinish, calendar)
      : undefined;
  message.summary = [
    options.introduction,
    `Project planned finish: ${date(forecast.plannedFinish)}`,
    `Project projected finish: ${date(forecast.forecastFinish)}`,
    `Project finish movement: ${shift === undefined ? "Unavailable" : `+${shift} working days`}`,
    "Project dates use the full dependency graph. Task details and counts cover the selected audience only. Forecasting does not move the plan or resolve resource contention.",
    "Uses the Forecast engine: current recorded completion, saved remaining-work estimates, working calendar, pauses, dependencies and milestones. Missing progress assumes 0%; completed tasks retain planned dates. Source ‘today’ uses today's date in the document time zone.",
    `Finish drivers: ${causes.length ? causes.map((cause) => visible.get(cause.taskId) ?? "Outside selected scope").join(", ") : "None identified"}`,
    ...(forecast.unavailable
      ? ["Project forecast is partial: some tasks cannot be forecast; projected finish covers available tasks only."]
      : []),
  ];
  for (const row of message.rows) {
    const item = forecast.tasks.get(row.task.id);
    row.start = item?.plannedStart;
    row.end = item?.plannedEnd;
    row.forecast = { start: item?.start, end: item?.end, issue: item?.issue };
    const delayed = !!(item?.end && item.plannedEnd && item.end > item.plannedEnd);
    row.status = item?.issue
      ? "Forecast unavailable"
      : row.completion === 100
        ? "Recorded complete"
        : delayed
          ? "Forecast past planned finish"
          : "Forecast on plan";
    row.section = item?.issue ? "Forecast needs clarification" : delayed ? "Forecast delays" : "Forecast outlook";
    row.attention = !!item?.issue || delayed || !!item?.missingCompletion;
    row.metrics = [
      `Forecast dates: ${date(item?.start)} – ${date(item?.end)}`,
      `Remaining work: ${item?.remainingDays === undefined ? "Unavailable" : `${item.remainingDays} working days`} (${item?.manualEstimate ? "saved estimate" : "automatic"})`,
      ...(delayed
        ? [
            `Finish delay: ${Math.round((Date.parse(item!.end!) - Date.parse(item!.plannedEnd!)) / 86400000)} calendar days; ${forecastWorkingDaysBetween(item!.plannedEnd!, item!.end!, calendar)} working days`,
          ]
        : []),
      ...(item?.missingCompletion ? ["Progress assumption: not reported; assumes 0% completion"] : []),
      ...(item?.issue ? [`Forecast issue: ${item.issue}`] : []),
      ...(item?.causeTaskIds.length
        ? [`Driven by: ${item.causeTaskIds.map((id) => visible.get(id) ?? "Outside selected scope").join(", ")}`]
        : []),
    ];
  }
  message.summary.push(
    `Selected tasks delayed: ${message.rows.filter((row) => row.status === "Forecast past planned finish").length}`,
    `Selected tasks missing progress: ${message.rows.filter((row) => forecast.tasks.get(row.task.id)?.missingCompletion).length}`,
    `Selected tasks unavailable: ${message.rows.filter((row) => row.forecast?.issue).length}`,
  );
  const comparison = compareForecastResourceConflicts(tasks, forecast, dates, calendar, capacities, options.asOf);
  const conflicts = comparison.conflicts.filter(
    (conflict) =>
      (message.id === "combined"
        ? options.people.includes(resourceIdentity(conflict.resource))
        : resourceIdentity(conflict.resource) === message.id) && conflict.tasks.some((task) => visible.has(task.id)),
  );
  message.summary.push(
    comparison.unavailable
      ? "Resource comparison: unavailable because assigned work cannot be forecast"
      : `Resource conflicts in selected scope: ${conflicts.filter((c) => c.kind === "new").length} new; ${conflicts.filter((c) => c.kind === "existing").length} already in plan`,
    ...conflicts.map(
      (conflict) =>
        `Resource conflict: ${conflict.resource} · ${date(conflict.date)} · ${conflict.forecastAllocation}% forecast / ${conflict.capacity}% capacity (${conflict.kind}); ${conflict.tasks.map((task) => visible.get(task.id) ?? "Outside selected scope").join(", ")}`,
    ),
  );
}
