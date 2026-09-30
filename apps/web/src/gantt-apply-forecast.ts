import { applySourceEdits, parseGantt, setTaskDeclaration, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { isWorkingDate, parseGanttCalendar, shiftDate } from "./gantt-calendar";
import { calculateProgressForecast, type ProgressForecast } from "./gantt-progress-forecast";
import { resolveTaskDates } from "./gantt-schedule";

export interface ForecastApplyRow {
  taskId: string;
  label: string;
  plannedStart: string;
  plannedEnd: string;
  proposedStart: string;
  proposedEnd: string;
  sourceAction?: string;
  before?: string;
  after?: string;
}

export interface ForecastApplyReview {
  sourceBefore: string;
  sourceAfter?: string;
  asOf: string;
  overridesBefore: Record<string, number>;
  overridesAfter: Record<string, number>;
  plannedFinish?: string | undefined;
  proposedFinish?: string | undefined;
  rows: ForecastApplyRow[];
  error?: string;
}

function availableDays(start: string, end: string, source: string, task: GanttTask): number | undefined {
  const calendar = parseGanttCalendar(source);
  const pauses = new Set((task.pauses ?? []).filter((pause) => pause.resolved).map((pause) => pause.value));
  let date = start;
  let days = 0;
  for (let step = 0; step < 10_000 && date <= end; step += 1) {
    if (isWorkingDate(date, calendar) && !pauses.has(date)) days += 1;
    date = shiftDate(date, 1)!;
  }
  return date > end && days > 0 ? days : undefined;
}

/** Makes a reviewed source candidate; never writes the document. */
export function prepareForecastApply(
  source: string,
  asOf: string,
  overrides: Readonly<Record<string, number>>,
): ForecastApplyReview {
  const original = parseGantt(source);
  const calendar = parseGanttCalendar(source);
  const projectStart = original.document.projectStart?.resolved ? original.document.projectStart.value : undefined;
  const plan = resolveTaskDates(original.document.tasks, original.document.dependencies, projectStart, calendar);
  const forecast: ProgressForecast = calculateProgressForecast(
    original.document.tasks,
    original.document.dependencies,
    plan,
    calendar,
    asOf,
    overrides,
  );
  const review: ForecastApplyReview = {
    sourceBefore: source,
    asOf,
    overridesBefore: { ...overrides },
    overridesAfter: { ...overrides },
    plannedFinish: forecast.plannedFinish,
    proposedFinish: forecast.forecastFinish,
    rows: [],
  };
  if (original.diagnostics.some((item) => item.severity === "error")) {
    review.error = "Fix Gantt source errors before applying the forecast.";
    return review;
  }
  if (forecast.unavailable || !forecast.forecastFinish || !forecast.plannedFinish) {
    review.error = "All task dates must be forecastable before applying.";
    return review;
  }
  if (forecast.forecastFinish <= forecast.plannedFinish) {
    review.error = "The project finish has no forecast delay to apply.";
    return review;
  }

  let candidate = source;
  const actions = new Map<string, { label: string; before: string; after: string }>();
  const fail = (message: string) => {
    review.error = message;
    return review;
  };
  // Reparse after each declaration change: source ranges are offsets into the current text.
  const change = (id: string, kind: "start" | "end" | "duration" | "milestone", statement: string) => {
    const parsed = parseGantt(candidate);
    const task = parsed.document.symbols.tasks.get(id);
    if (!task) return false;
    const operation = setTaskDeclaration(candidate, task, kind, statement);
    if (operation.unavailableReason) return false;
    const before = operation.edits.map((edit) => candidate.slice(edit.range.from, edit.range.to)).join("\n");
    candidate = applySourceEdits(candidate, operation.edits);
    const previous = actions.get(id);
    actions.set(id, {
      label: previous ? `${previous.label}; ${statement}` : statement,
      before: previous?.before ?? before,
      after: previous ? `${previous.after}\n${statement}` : statement,
    });
    return true;
  };

  // Repeated passes let a predecessor change move its linked successors before deciding
  // whether a successor needs its own declaration changed.
  for (let pass = 0; pass < original.document.tasks.length + 1; pass += 1) {
    let changed = false;
    for (const originalTask of original.document.tasks) {
      const wanted = forecast.tasks.get(originalTask.id);
      if (!wanted?.start || !wanted.end || !wanted.plannedStart || !wanted.plannedEnd) continue;
      const parsed = parseGantt(candidate);
      const task = parsed.document.symbols.tasks.get(originalTask.id);
      if (!task) return fail(`Task ${originalTask.label} changed identity while preparing the plan.`);
      const dates = resolveTaskDates(parsed.document.tasks, parsed.document.dependencies, projectStart, calendar).get(
        task.id,
      );
      if (!dates?.start || !dates.end) return fail(`Cannot resolve ${task.label} in the proposed plan.`);
      if (task.completion?.value === 100) continue;
      const isMilestone = Boolean(task.milestone && !task.duration);
      if (isMilestone) {
        if (dates.end < wanted.end) {
          if (task.milestone && "resolved" in task.milestone && task.milestone.resolved) {
            if (!change(task.id, "milestone", `happens ${wanted.end}`)) return fail(`Cannot move ${task.label}.`);
            changed = true;
          } else
            return fail(`The linked milestone ${task.label} cannot reach its forecast date through its current link.`);
        }
        continue;
      }
      // A started task retains its original start. Work not yet begun may move to its forecast start.
      const started = (task.completion?.value ?? 0) > 0;
      if (!started && dates.start < wanted.start) {
        if (task.start?.resolved || !parsed.document.dependencies.some((item) => item.successorTaskId === task.id)) {
          if (!change(task.id, "start", `starts ${wanted.start}`)) return fail(`Cannot move ${task.label}'s start.`);
          changed = true;
        } else return fail(`${task.label} needs a new start beyond its dependency. Review its link manually.`);
      }
      const refreshed = parseGantt(candidate);
      const currentTask = refreshed.document.symbols.tasks.get(task.id)!;
      const currentDates = resolveTaskDates(
        refreshed.document.tasks,
        refreshed.document.dependencies,
        projectStart,
        calendar,
      ).get(task.id)!;
      if (!currentDates.start || !currentDates.end || currentDates.end === wanted.end) continue;
      if (currentDates.start > wanted.end)
        return fail(`${task.label} starts after its forecast finish. Review its dependency or fixed date.`);
      if (currentTask.end?.resolved) {
        if (!change(task.id, "end", `ends ${wanted.end}`)) return fail(`Cannot move ${task.label}'s end.`);
      } else if (currentTask.duration) {
        if (currentTask.resources?.length)
          return fail(`${task.label} uses resource-adjusted duration. Edit its estimate before applying the plan.`);
        const days = availableDays(currentDates.start, wanted.end, source, currentTask);
        if (!days) return fail(`Cannot calculate a duration for ${task.label}.`);
        if (!change(task.id, "duration", `lasts ${days} ${days === 1 ? "day" : "days"}`))
          return fail(`Cannot resize ${task.label}.`);
        if (wanted.remainingDays !== undefined) review.overridesAfter[task.id] = wanted.remainingDays;
      } else if (
        !currentTask.end &&
        !refreshed.document.dependencies.some((item) => item.successorTaskId === task.id)
      ) {
        if (!change(task.id, "end", `ends ${wanted.end}`)) return fail(`Cannot set ${task.label}'s end.`);
      } else return fail(`${task.label} cannot reach its forecast finish while preserving its current links.`);
      changed = true;
    }
    if (!changed) break;
    if (pass === original.document.tasks.length)
      return fail("The proposed schedule did not settle after updating its causes.");
  }

  const proposed = parseGantt(candidate);
  if (proposed.diagnostics.some((item) => item.severity === "error"))
    return fail("The proposed source has a Gantt error. No change was applied.");
  const proposedPlan = resolveTaskDates(
    proposed.document.tasks,
    proposed.document.dependencies,
    projectStart,
    calendar,
  );
  for (const task of original.document.tasks) {
    const expected = forecast.tasks.get(task.id)!;
    const actual = proposedPlan.get(task.id);
    if (
      !expected.plannedStart ||
      !expected.plannedEnd ||
      !expected.start ||
      !expected.end ||
      !actual?.start ||
      !actual.end
    )
      return fail(`Cannot verify the proposed dates for ${task.label}.`);
    if (actual.end !== expected.end || ((task.completion?.value ?? 0) === 0 && actual.start !== expected.start))
      return fail(`The proposed dates for ${task.label} do not match the forecast. No change was applied.`);
    if (actual.start !== expected.plannedStart || actual.end !== expected.plannedEnd) {
      const action = actions.get(task.id);
      review.rows.push({
        taskId: task.id,
        label: task.label,
        plannedStart: expected.plannedStart,
        plannedEnd: expected.plannedEnd,
        proposedStart: actual.start,
        proposedEnd: actual.end,
        ...(action ? { sourceAction: action.label, before: action.before, after: action.after } : {}),
      });
    }
  }
  if (candidate === source) return fail("The forecast has no source change to apply.");
  review.sourceAfter = candidate;
  return review;
}
