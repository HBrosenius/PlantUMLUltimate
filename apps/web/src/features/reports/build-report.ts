import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar, shiftDate } from "../../gantt-calendar";
import { resolveDateExpression, resolveTaskDates } from "../../gantt-schedule";
import { analyzeCriticalPath } from "../../schedule-analysis";
import { resourceIdentity } from "../../resource-identity";
import { buildResourceWorkloads } from "../../ResourceWorkloadPanel";
import { buildTaskCheckIn } from "./build-task-check-in";
import type { ReportOptions, ReportRow } from "./report-model";
import type { ReportingObservation } from "@plantuml-studio/document-format";
import { historicalSummary } from "./report-history";
import { calculateProgressForecast } from "../../gantt-progress-forecast";
import { populateForecastReport } from "./build-forecast-report";

export const reportTypes = {
  "check-in": "Task check-in",
  "critical-path": "Critical path and schedule sensitivity",
  progress: "Progress and due-date outlook",
  milestones: "Milestone and delivery outlook",
  baseline: "Changes since baseline",
  workload: "Resource workload and assignment coverage",
  history: "Historical burndown and burnup",
  forecast: "Progress forecast",
} as const;

const number = (value: number) => Number(value.toFixed(4)).toString();

/** Equal task weights; milestones never contribute to project work. */
export function progressMetrics(rows: readonly ReportRow[], asOf: string) {
  const tasks = rows.filter((row) => !row.task.milestone);
  const known = tasks.reduce((sum, row) => sum + (row.completion === null ? 0 : 1 - row.completion / 100), 0);
  const unknown = tasks.filter((row) => row.completion === null).length;
  const scheduled = tasks.filter((row) => row.end && (!row.start || row.start <= row.end));
  const buckets = new Map<string, ReportRow[]>();
  for (const row of tasks) {
    const bucket = !scheduled.includes(row) ? "Unscheduled" : row.end! < asOf ? "Past due" : row.end!;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), row]);
  }
  return { tasks, known, unknown, scheduled, buckets };
}

export function buildReport(
  source: string,
  identity: string,
  document: string,
  diagram: string,
  options: ReportOptions,
  context: {
    baselineSource?: string | undefined;
    baselineName?: string | undefined;
    capacities?: Record<string, number> | undefined;
    history?: readonly ReportingObservation[] | undefined;
    remainingDays?: Readonly<Record<string, number>> | undefined;
  } = {},
) {
  if (!options.reportType || options.reportType === "check-in")
    return buildTaskCheckIn(source, identity, document, diagram, options);
  const type = options.reportType;
  const snapshot = buildTaskCheckIn(source, identity, document, diagram, {
    ...options,
    filter: "All tasks",
    unresolved: true,
    milestones: true,
  });
  snapshot.options = { ...snapshot.options, reportType: type };
  const parsed = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const start = parsed.projectStart
    ? resolveDateExpression(
        parsed.projectStart.value,
        undefined,
        options.timeZone,
        type === "forecast" ? undefined : options.asOf,
      )
    : undefined;
  const dates = resolveTaskDates(
    parsed.tasks,
    parsed.dependencies,
    start,
    calendar,
    options.timeZone,
    type === "forecast" ? undefined : options.asOf,
  );
  const forecast =
    type === "forecast"
      ? calculateProgressForecast(
          parsed.tasks,
          parsed.dependencies,
          dates,
          calendar,
          options.asOf,
          context.remainingDays,
        )
      : undefined;
  // Analyze before audience/exclusion filtering. Never use the engine's synthetic anchor.
  const analysis =
    type === "critical-path" || type === "milestones"
      ? analyzeCriticalPath(parsed.tasks, parsed.dependencies, dates, calendar)
      : undefined;
  const threshold = options.nearCriticalDays ?? 2;
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Near-critical threshold must be non-negative.");
  const finishes = [...dates.values()].flatMap((date) => (date.end ? [date.end] : [])).sort();
  const finish = finishes.at(-1);
  if (type === "baseline" && context.baselineSource) {
    const original = buildTaskCheckIn(context.baselineSource, identity, document, diagram, {
      ...snapshot.options,
      excluded: [],
    });
    snapshot.recipients = [
      ...new Map([...snapshot.recipients, ...original.recipients].map((person) => [person.id, person])).values(),
    ];
    for (const message of original.messages)
      if (!snapshot.messages.some((m) => m.id === message.id)) snapshot.messages.push({ ...message, rows: [] });
  }
  if (type === "history" && context.history?.length) {
    const reference =
      context.history.find((point) => point.id === options.baselineSnapshotId) ??
      [...context.history].sort(
        (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.capturedAt.localeCompare(b.capturedAt),
      )[0]!;
    const original = buildTaskCheckIn(reference.source, identity, document, diagram, {
      ...snapshot.options,
      excluded: [],
    });
    snapshot.recipients = [
      ...new Map([...snapshot.recipients, ...original.recipients].map((person) => [person.id, person])).values(),
    ];
    for (const message of original.messages)
      if (!snapshot.messages.some((m) => m.id === message.id)) snapshot.messages.push({ ...message, rows: [] });
  }
  for (const message of snapshot.messages) {
    // Recipient exports must not disclose excluded people through assignments or notes.
    message.rows = message.rows.map((row) => ({
      ...row,
      shared: [],
      task: {
        ...row.task,
        resources: (row.task.resources ?? []).filter((a) =>
          message.id === "combined"
            ? options.people.includes(resourceIdentity(a.value))
            : resourceIdentity(a.value) === message.id,
        ),
      },
    }));
    message.subject = `${diagram} — ${reportTypes[type]} — ${options.asOf}`;
    message.summary = [
      `Calculation version: 1 · Source snapshot: ${identity} · Generated: ${snapshot.generatedAt}`,
      type === "history"
        ? "Scope: selected audience in one Gantt diagram; explicitly recorded observations. Task details below describe the current plan."
        : "Scope: selected audience in one Gantt diagram; current recorded progress, not historical progress.",
    ];
    if (forecast) {
      populateForecastReport(message, parsed.tasks, forecast, dates, calendar, options, context.capacities ?? {});
    } else if (type === "history") {
      message.series = [];
      message.summary.push(...historicalSummary(context.history ?? [], options, message.id, message.series));
    } else if (type === "progress") {
      const metrics = progressMetrics(message.rows, options.asOf);
      message.rows = metrics.tasks;
      const planDates = [...new Set(metrics.scheduled.map((row) => row.end!))].sort();
      message.series = [
        {
          label: "Planned remaining (dated tasks only)",
          step: true,
          points: [
            ...(planDates[0]
              ? [{ date: shiftDate(planDates[0], -1)!, low: metrics.scheduled.length, high: metrics.scheduled.length }]
              : []),
            ...[...new Set(metrics.scheduled.map((row) => row.end!))].sort().map((date) => ({
              date,
              low: metrics.scheduled.filter((row) => row.end! > date).length,
              high: metrics.scheduled.filter((row) => row.end! > date).length,
            })),
          ],
        },
        {
          label: "Current recorded remaining (unknown band)",
          step: false,
          points: [{ date: options.asOf, low: metrics.known, high: metrics.known + metrics.unknown }],
        },
      ];
      message.summary.push(
        "Unit: task equivalents. Each normal task has weight 1; milestones excluded. Duration is not effort.",
        `Recorded completion coverage: ${metrics.tasks.length - metrics.unknown}/${metrics.tasks.length} tasks.`,
        `Next due date: ${planDates.find((date) => date >= options.asOf) ?? "None scheduled"}; planned scope finish: ${planDates.at(-1) ?? "Unresolved"}.`,
        `${number(metrics.known)} known remaining + up to ${metrics.unknown} unknown; range ${number(metrics.known)}–${number(metrics.known + metrics.unknown)} task equivalents.`,
        `Planned remaining at end of ${options.asOf}: ${metrics.scheduled.filter((row) => row.end! > options.asOf).length} task equivalents; dated plan coverage ${metrics.scheduled.length}/${metrics.tasks.length}.`,
        "Only a current observation exists. Due dates do not establish actual completion dates or historical progress.",
        "Planned end-date staircase (full task weight leaves at end of its finish date):",
        ...[...new Set(metrics.scheduled.map((row) => row.end!))]
          .sort()
          .map(
            (date) =>
              `${date}: ${metrics.scheduled.filter((row) => row.end! > date).length} planned task equivalents remaining`,
          ),
        "Current remaining work due (distribution, not historical trend):",
        ...[...metrics.buckets]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bucket, rows]) => {
            const m = progressMetrics(rows, options.asOf);
            return `${bucket}: ${number(m.known)} known + up to ${m.unknown} unknown task equivalents`;
          }),
      );
      for (const row of message.rows)
        row.metrics = [
          "Weight: 1 task equivalent",
          `Remaining contribution: ${row.completion === null ? "0–1 (unknown)" : number(1 - row.completion / 100)} task equivalents`,
        ];
    } else if (type === "milestones") {
      const visible = new Set(message.rows.map((row) => row.task.id));
      message.rows = message.rows.filter((row) => row.task.milestone);
      message.summary.push(
        "Passing a planned milestone date does not establish achievement. Forecast dates are unavailable in this report.",
      );
      for (const row of message.rows) {
        const ancestors = new Set<string>();
        const pending = [row.task.id];
        while (pending.length) {
          const id = pending.pop()!;
          for (const dependency of parsed.dependencies.filter((d) => d.successorTaskId === id)) {
            if (!ancestors.has(dependency.predecessorTaskId)) {
              ancestors.add(dependency.predecessorTaskId);
              pending.push(dependency.predecessorTaskId);
            }
          }
        }
        if (row.task.milestone && !("resolved" in row.task.milestone)) {
          const reference = row.task.milestone.value.replace(/^\[|\]$/g, "");
          const predecessor = parsed.tasks.find((task) => task.alias?.value === reference || task.label === reference);
          if (predecessor) ancestors.add(predecessor.id);
        }
        row.metrics = [
          "Forecast: unavailable",
          "Achievement: " + (row.completion === 100 ? "Recorded complete" : "Not established"),
          `Contributing critical tasks in selected audience: ${
            analysis?.blockers.length
              ? "Analysis unavailable"
              : parsed.tasks
                  .filter((task) => ancestors.has(task.id) && visible.has(task.id) && analysis?.taskIds.has(task.id))
                  .map((task) => task.label)
                  .join(", ") || "None identified"
          }`,
        ];
      }
    } else if (type === "workload") {
      message.summary.push(
        "Scheduled allocation is independent of completion. Capacity defaults to 100% unless configured; working calendar and task pauses apply. Shared tasks contribute per resource, once to project progress.",
      );
      const workloads = buildResourceWorkloads(
        message.rows.map((row) => row.task),
        dates,
        calendar,
      );
      for (const resource of workloads) {
        const capacity = context.capacities?.[resource.name] ?? 100;
        message.summary.push(`${resource.name}: configured capacity ${capacity}%.`);
        const conflicts = resource.days.filter((day) => day.allocation > capacity);
        message.summary.push(
          `${conflicts.length} days above capacity; ${resource.unscheduledTasks.length} tasks excluded from scheduled load.`,
          ...resource.unscheduledTasks.map(({ task, reason }) => `Excluded load: ${task.label}: ${reason}`),
        );
        for (const day of conflicts)
          message.summary.push(
            `${day.date}: ${day.allocation}% allocated against ${capacity}% capacity · ${day.tasks.map((task) => task.label).join(", ")}`,
          );
      }
      message.summary.push(
        `Unassigned work: ${message.rows.filter((row) => !parsed.tasks.find((task) => task.id === row.task.id)?.resources?.length).length} tasks.`,
      );
    } else if (type === "baseline") {
      if (!context.baselineSource) {
        message.summary.push("Baseline comparison unavailable: select a named baseline in History.");
      } else {
        const baseline = buildTaskCheckIn(context.baselineSource, identity, document, diagram, {
          ...snapshot.options,
          excluded: [],
        });
        const previous = baseline.messages.find((m) => m.id === message.id)?.rows ?? [];
        const byAlias = new Map(
          baseline.candidates.filter((row) => row.task.alias).map((row) => [row.task.alias!.value, row]),
        );
        message.summary.push(
          `Baseline: ${context.baselineName ?? "Selected History baseline"}. Identity matching requires explicit task aliases; unaliased matches are uncertain. Differences do not establish causes.`,
        );
        const previousFinishes = baseline.candidates.flatMap((row) => (row.end ? [row.end] : [])).sort();
        message.summary.push(
          `Project planned finish before: ${previousFinishes.at(-1) ?? "Unknown"}; after: ${finish ?? "Unknown"}.`,
        );
        for (const row of message.rows) {
          const old = row.task.alias ? byAlias.get(row.task.alias.value) : undefined;
          row.metrics = !row.task.alias
            ? ["Identity uncertain: add a stable alias before comparing versions."]
            : !old
              ? ["Added to selected scope (or newly assigned to selected audience)."]
              : [
                  `Planned dates before: ${old.start ?? "Unknown"} – ${old.end ?? "Unknown"}; after: ${row.start ?? "Unknown"} – ${row.end ?? "Unknown"}`,
                  `Recorded completion before: ${old.completion ?? "Not reported"}; after: ${row.completion ?? "Not reported"}`,
                  `Name before: ${old.task.label}; after: ${row.task.label}`,
                  `Schedule movement: ${old.end && row.end ? Math.round((Date.parse(row.end) - Date.parse(old.end)) / 86400000) + " calendar days at finish" : "Unknown"}`,
                  `Assignments before: ${
                    (old.task.resources ?? [])
                      .filter((a) =>
                        message.id === "combined"
                          ? options.people.includes(resourceIdentity(a.value))
                          : resourceIdentity(a.value) === message.id,
                      )
                      .map((a) => a.value)
                      .join(", ") || "None selected"
                  }`,
                ];
          if (old) {
            const oldDependencies = parseGantt(context.baselineSource).document.dependencies.filter(
              (d) => d.successorTaskId === old.task.id,
            );
            const newDependencies = parsed.dependencies.filter((d) => d.successorTaskId === row.task.id);
            const signature = (dependencies: typeof newDependencies) =>
              JSON.stringify(dependencies.map((d) => [d.predecessorTaskId, d.relation, d.offset?.value, d.direction]));
            row.metrics.push(
              signature(oldDependencies) === signature(newDependencies)
                ? "Dependencies unchanged"
                : "Dependencies changed; review full-plan dependency details in the editor.",
            );
          }
        }
        const currentAliases = new Set(message.rows.flatMap((row) => (row.task.alias ? [row.task.alias.value] : [])));
        const removed = previous.filter((row) => row.task.alias && !currentAliases.has(row.task.alias.value));
        message.summary.push(
          ...removed.map(
            (row) => `Removed from selected scope (or reassigned): ${row.task.label}. This is not completed work.`,
          ),
        );
      }
    } else if (analysis) {
      message.summary.push(
        `Project planned finish: ${finish ?? "Unresolved"}. Analysis scope: full project dependency graph.`,
        "Planned critical path; resource contention is not included. Review Workload for capacity conflicts.",
        "Total slack: delay relative to project finish. Free slack: delay before affecting a successor under engine scheduling rules. Units: task working days (calendar days for milestones), honoring closures and pauses.",
        `Near-critical threshold: ${threshold} days. Criticality is independent of recorded progress and overdue status.`,
        "Chains are representative continuations, not exhaustive branch enumeration. Cross-audience chain details omitted.",
      );
      if (analysis.blockers.length || parsed.dependencies.some((dependency) => dependency.relation === "other")) {
        message.summary.push(
          "Critical path unavailable: full-project analysis has unresolved dates or dependency cycles. Review Problems; no conclusion about absence of critical tasks is possible.",
        );
        for (const row of message.rows) {
          const blocker = analysis.blockers.find((b) => b.taskId === row.task.id);
          if (blocker) row.metrics = [`Analysis issue: ${blocker.reason}`];
        }
      } else {
        message.rows = message.rows.filter((row) => (analysis.slackByTask.get(row.task.id) ?? Infinity) <= threshold);
        const labels = new Map(message.rows.map((row) => [row.task.id, row.task.label]));
        const chains = [
          ...new Set(
            message.rows.flatMap((row) =>
              (analysis.chainsByTask.get(row.task.id) ?? []).map((chain) =>
                chain.map((id) => labels.get(id) ?? "[Outside selected scope]").join(" → "),
              ),
            ),
          ),
        ];
        message.summary.push(
          "Analysis available for the engine's supported schedule rules. Representative chains touching selected critical tasks:",
          ...chains.slice(0, 20),
        );
        if (chains.length > 20) message.summary.push("Chains summarized: first 20 representative continuations shown.");
        for (const row of message.rows) {
          row.section = analysis.taskIds.has(row.task.id)
            ? "Your tasks on the project critical path"
            : "Near-critical tasks";
          row.metrics = [
            `Total slack: ${analysis.slackByTask.get(row.task.id)} days; free slack: ${analysis.freeSlackByTask.get(row.task.id)} days`,
            `Latest allowable dates: ${analysis.latestDatesByTask.get(row.task.id)?.start ?? "Unavailable"} – ${analysis.latestDatesByTask.get(row.task.id)?.end ?? "Unavailable"}`,
          ];
        }
        if (!message.rows.length)
          message.summary.push("No selected audience tasks meet the critical/near-critical threshold.");
      }
    }
  }
  snapshot.uniqueTasks = new Set(snapshot.messages.flatMap((message) => message.rows.map((row) => row.task.id))).size;
  snapshot.assignments = options.combined
    ? snapshot.messages.reduce(
        (sum, message) =>
          sum +
          message.rows.reduce(
            (count, row) => count + new Set(row.task.resources?.map((a) => resourceIdentity(a.value))).size,
            0,
          ),
        0,
      )
    : snapshot.messages.reduce((sum, message) => sum + message.rows.length, 0);
  return snapshot;
}
