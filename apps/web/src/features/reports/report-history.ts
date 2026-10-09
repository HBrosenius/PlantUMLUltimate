import { hashSource, type ReportingObservation } from "@plantuml-studio/document-format";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { buildTaskCheckIn } from "./build-task-check-in";
import { resourceIdentity } from "../../resource-identity";
import { shiftDate } from "../../gantt-calendar";
import type { ReportOptions, ReportRow, ReportMessage } from "./report-model";

export async function recordProgressObservation(
  source: string,
  options: ReportOptions,
  history: readonly ReportingObservation[],
): Promise<ReportingObservation> {
  if (history.length >= 100)
    throw new Error(
      "Reporting history has 100 pinned observations. Export a copy before removing observations; no observations are automatically evicted.",
    );
  const tasks = parseGantt(source).document.tasks;
  if (tasks.some((task) => !task.alias) || new Set(tasks.map((task) => task.alias?.value)).size !== tasks.length)
    throw new Error(
      "Progress snapshots require a unique stable alias for every task and milestone. Keep aliases unchanged when renaming tasks.",
    );
  // Validate dates and source before committing anything.
  buildTaskCheckIn(source, "capture", "", "", { ...options, filter: "All tasks", milestones: true });
  if (
    new TextEncoder().encode(source).byteLength +
      history.reduce((sum, observation) => sum + new TextEncoder().encode(observation.source).byteLength, 0) >
    16 * 1024 * 1024
  )
    throw new Error("Reporting history exceeds its 16 MiB retention budget. Existing observations are preserved.");
  return {
    version: 1,
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    effectiveDate: options.asOf,
    timeZone: options.timeZone,
    sourceHash: await hashSource(source),
    source,
    provenance: "explicit",
  };
}

const n = (value: number) => Number(value.toFixed(4));
const key = (row: ReportRow) => row.task.alias!.value;
export function historicalSummary(
  history: readonly ReportingObservation[],
  options: ReportOptions,
  recipient: string,
  series: NonNullable<ReportMessage["series"]> = [],
) {
  const ordered = [...history].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.capturedAt.localeCompare(b.capturedAt),
  );
  const baselineIndex = Math.max(
    0,
    ordered.findIndex((o) => o.id === options.baselineSnapshotId),
  );
  const segment = ordered.slice(baselineIndex);
  if (segment.length < 2)
    return ["Historical burndown/burnup unavailable: at least two comparable explicit observations are required."];
  const points = segment.map((observation) => {
    const rows = buildTaskCheckIn(observation.source, observation.sourceHash, "", "", {
      ...options,
      asOf: observation.effectiveDate,
      timeZone: observation.timeZone,
      filter: "All tasks",
      milestones: false,
      excluded: [],
      combined: true,
      unassigned: true,
      people: [
        ...new Set(
          parseGantt(observation.source).document.tasks.flatMap((task) =>
            (task.resources ?? []).map((a) => resourceIdentity(a.value)),
          ),
        ),
      ],
    }).candidates;
    if (rows.some((row) => !row.task.alias))
      throw new Error("Historical observation lacks stable task aliases; trend unavailable.");
    return { observation, rows };
  });
  const selected = (row: ReportRow) =>
    !options.excluded.includes(row.task.id) &&
    (row.task.resources?.some((a) =>
      recipient === "combined"
        ? options.people.includes(resourceIdentity(a.value))
        : resourceIdentity(a.value) === recipient,
    ) ||
      (recipient === "combined" && options.unassigned && !row.task.resources?.length));
  const baseline = new Map(points[0]!.rows.filter(selected).map((row) => [key(row), row]));
  const lines = [
    `Baseline observation: ${segment[0]!.id} · ${segment[0]!.effectiveDate}. Earlier observations preserved; this is a labeled reference segment.`,
    `Scope mode: ${options.historyScope === "dynamic" ? "Current scope over time; assignment changes affect audience membership" : "Fixed baseline scope and baseline audience membership"}. Fixed weight: 1 task equivalent per normal task; milestones excluded.`,
    "Burndown: recorded remaining range. Burnup: recorded completed range versus total scope. Unknown completion is not zero; removed baseline members become unknown, not complete.",
    "Last recorded progress: step observations only. Gaps do not establish when work occurred. Capture times differ from effective reporting dates; backdated entries are labeled.",
    "Frozen planned baseline staircase:",
    ...[...new Set([...baseline.values()].flatMap((row) => (row.end ? [row.end] : [])))]
      .sort()
      .map(
        (date) =>
          `${date}: ${[...baseline.values()].filter((row) => row.end && row.end > date).length} planned task equivalents remaining`,
      ),
    `Baseline dated coverage: ${[...baseline.values()].filter((row) => row.end).length}/${baseline.size}.`,
  ];
  let previous = baseline;
  const remainingSeries = {
    label: "Last recorded remaining (unknown band)",
    step: true,
    points: [] as Array<{ date: string; low: number; high: number }>,
  };
  const completedSeries = {
    label: "Last recorded completed (unknown band)",
    step: true,
    points: [] as Array<{ date: string; low: number; high: number }>,
  };
  const scopeSeries = {
    label: "Total scope",
    step: true,
    points: [] as Array<{ date: string; low: number; high: number }>,
  };
  series.push(remainingSeries, completedSeries, scopeSeries);
  const plannedDates = [...new Set([...baseline.values()].flatMap((row) => (row.end ? [row.end] : [])))].sort();
  const datedCount = [...baseline.values()].filter((row) => row.end).length;
  series.push({
    label: "Frozen baseline plan (dated coverage)",
    step: true,
    points: [
      ...(plannedDates[0] ? [{ date: shiftDate(plannedDates[0], -1)!, low: datedCount, high: datedCount }] : []),
      ...plannedDates.map((date) => {
        const value = [...baseline.values()].filter((row) => row.end && row.end > date).length;
        return { date, low: value, high: value };
      }),
    ],
  });
  for (const point of points) {
    const all = new Map(point.rows.map((row) => [key(row), row]));
    const audience = new Map(point.rows.filter(selected).map((row) => [key(row), row]));
    const members =
      options.historyScope === "dynamic" ? audience : new Map([...baseline.keys()].map((id) => [id, all.get(id)]));
    let completed = 0,
      remaining = 0,
      unknown = 0;
    for (const row of members.values()) {
      if (!row || row.completion === null) unknown++;
      else {
        completed += row.completion / 100;
        remaining += 1 - row.completion / 100;
      }
    }
    remainingSeries.points.push({ date: point.observation.effectiveDate, low: remaining, high: remaining + unknown });
    completedSeries.points.push({ date: point.observation.effectiveDate, low: completed, high: completed + unknown });
    scopeSeries.points.push({ date: point.observation.effectiveDate, low: members.size, high: members.size });
    const actualDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: point.observation.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(point.observation.capturedAt));
    lines.push(
      `${point.observation.effectiveDate} · observed ${point.observation.capturedAt} · ${point.observation.id}${actualDate !== point.observation.effectiveDate ? " · Effective date differs from capture date (backdated/future-dated)" : ""}: scope ${members.size}; remaining ${n(remaining)}–${n(remaining + unknown)}; completed ${n(completed)}–${n(completed + unknown)} task equivalents; ${unknown} unknown.`,
    );
    for (const [id, row] of audience) {
      const old = previous.get(id);
      if (!old)
        lines.push(
          `Scope addition or assignment into audience: ${row.task.label}. Outside baseline totals in fixed mode.`,
        );
      else {
        if (old.completion !== row.completion)
          lines.push(
            `Recorded progress change/correction: ${row.task.label}: ${old.completion ?? "unknown"}% → ${row.completion ?? "unknown"}%. No actual work date inferred.`,
          );
        if (old.task.label !== row.task.label)
          lines.push(`Renamed stable alias ${id}: ${old.task.label} → ${row.task.label}.`);
        if (old.start !== row.start || old.end !== row.end)
          lines.push(`Schedule/re-estimation: ${row.task.label}; fixed task-equivalent weight unchanged.`);
        if (
          JSON.stringify(old.task.resources?.map((a) => resourceIdentity(a.value))) !==
          JSON.stringify(row.task.resources?.map((a) => resourceIdentity(a.value)))
        )
          lines.push(`Assignment changed: ${row.task.label}. This is not completed work.`);
      }
    }
    for (const [id, row] of previous)
      if (!audience.has(id))
        lines.push(`Removed from scope or reassigned: ${row.task.label}. No completion fabricated.`);
    previous = audience;
  }
  return lines;
}
