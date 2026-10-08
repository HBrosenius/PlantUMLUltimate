import { parseGantt, validIsoDate } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar, taskPauses } from "../../gantt-calendar";
import { resolveDateExpression, resolveTaskDates } from "../../gantt-schedule";
import { resourceIdentity } from "../../resource-identity";
import { reportDate } from "./report-format";
import type { ReportOptions, ReportRow, ReportSnapshot } from "./report-model";

export function buildTaskCheckIn(
  source: string,
  sourceIdentity: string,
  documentName: string,
  diagramName: string,
  options: ReportOptions,
): ReportSnapshot {
  if (!validIsoDate(options.asOf) || (options.replyBy && !validIsoDate(options.replyBy)))
    throw new Error("Choose a valid as-of and reply-by date.");
  const parsed = parseGantt(source);
  const errors = parsed.diagnostics.filter((item) => item.severity === "error");
  if (errors.length)
    throw new Error(
      `Resolve source problems before generating reports: ${errors.map((item) => item.message).join("; ")}`,
    );
  const calendar = parseGanttCalendar(source);
  const projectStart = parsed.document.projectStart
    ? resolveDateExpression(parsed.document.projectStart.value, undefined, options.timeZone, options.asOf)
    : undefined;
  const dates = resolveTaskDates(
    parsed.document.tasks,
    parsed.document.dependencies,
    projectStart,
    calendar,
    options.timeZone,
    options.asOf,
  );
  const people = new Map<string, { id: string; name: string; count: number; variants: string[] }>();
  for (const task of parsed.document.tasks)
    for (const assignment of task.resources ?? []) {
      const id = resourceIdentity(assignment.value);
      if (!id) continue;
      const person = people.get(id) ?? { id, name: assignment.value.trim(), count: 0, variants: [] };
      if (!person.variants.includes(assignment.value)) person.variants.push(assignment.value);
      people.set(id, person);
    }
  let unresolvedExcluded = 0;
  const rows: ReportRow[] = [];
  for (const task of parsed.document.tasks) {
    if (task.milestone && !options.milestones) continue;
    const resolved = dates.get(task.id);
    const raw = task.completion?.value;
    const invalid = raw !== undefined && (!Number.isFinite(raw) || raw < 0 || raw > 100);
    const completion = raw === undefined || invalid ? null : raw;
    const issue = invalid
      ? "Invalid recorded completion"
      : (resolved?.issue ??
        (resolved?.start && resolved?.end && resolved.start > resolved.end
          ? "Planned finish precedes start"
          : !resolved?.start || !resolved?.end
            ? "Dates cannot be resolved"
            : undefined));
    const complete = completion === 100;
    const past = !!resolved?.end && resolved.end < options.asOf;
    const future = !!resolved?.start && resolved.start > options.asOf;
    const unknown = !!issue;
    const matches =
      options.filter === "All tasks" ||
      (options.filter === "Completed"
        ? complete
        : !complete &&
          (options.filter === "Ongoing"
            ? (!!resolved?.start && resolved.start <= options.asOf) || past || (completion ?? 0) > 0
            : options.filter === "Upcoming"
              ? future && !(completion && completion > 0)
              : past));
    if (!matches && !(unknown && !complete && options.unresolved && options.filter !== "Completed")) {
      if (unknown && !complete) unresolvedExcluded++;
      continue;
    }
    const status = complete
      ? "Recorded complete"
      : issue
        ? "Schedule needs clarification"
        : past
          ? `Past planned finish${completion === null ? " · progress not reported" : ""}`
          : resolved?.end === options.asOf
            ? "Due today"
            : future && (completion ?? 0) > 0
              ? "Progress recorded before planned start"
              : future
                ? "Future work"
                : "Planned to be ongoing";
    rows.push({
      task,
      start: resolved?.start,
      end: resolved?.end,
      completion,
      issue,
      status: `${status}${taskPauses(task).has(options.asOf) ? " · Paused" : ""}`,
      section: issue
        ? "Schedule needs clarification"
        : complete
          ? "Completed"
          : future && !(completion && completion > 0)
            ? "Future work"
            : "Tasks to review",
      attention: !complete && (past || unknown || resolved?.end === options.asOf),
      shared: [],
    });
  }
  const rank = (row: ReportRow) =>
    row.completion === 100
      ? 4
      : row.end && row.end < options.asOf
        ? 0
        : row.issue
          ? 1
          : row.end === options.asOf
            ? 2
            : 3;
  rows.sort((a, b) => rank(a) - rank(b) || (a.end ?? "9999").localeCompare(b.end ?? "9999"));
  const candidates = rows;
  const selected = rows.filter((row) => !options.excluded.includes(row.task.id));
  for (const person of people.values())
    person.count = selected.filter((row) =>
      row.task.resources?.some((a) => resourceIdentity(a.value) === person.id),
    ).length;
  const recipients = [...people.values()];
  const selectedPeople = recipients.filter((person) => options.people.includes(person.id) && person.count > 0);
  const assignedRows = selected.filter(
    (row) =>
      row.task.resources?.some((a) => options.people.includes(resourceIdentity(a.value))) ||
      (options.combined && options.unassigned && !row.task.resources?.length),
  );
  const subject = (recipient: string) =>
    `${diagramName} — task check-in for ${recipient} — ${reportDate(options.asOf, options.locale)}`;
  const messages = options.combined
    ? assignedRows.length
      ? [{ id: "combined", recipient: "Selected audience", subject: subject("selected audience"), rows: assignedRows }]
      : []
    : selectedPeople.map((person) => ({
        id: person.id,
        recipient: person.name,
        subject: subject(person.name),
        rows: selected
          .filter((row) => row.task.resources?.some((a) => resourceIdentity(a.value) === person.id))
          .map((row) => ({
            ...row,
            shared: [
              ...new Set(
                (row.task.resources ?? [])
                  .filter((a) => resourceIdentity(a.value) !== person.id)
                  .map((a) => a.value.trim()),
              ),
            ],
          })),
      }));
  return {
    version: 1,
    sourceIdentity,
    generatedAt: new Date().toISOString(),
    documentName,
    diagramName,
    options: { ...options, people: [...options.people], excluded: [...options.excluded] },
    messages,
    candidates,
    recipients,
    uniqueTasks: assignedRows.length,
    assignments: selectedPeople.reduce((sum, person) => sum + person.count, 0),
    unresolvedExcluded,
    warnings: recipients
      .filter((person) => person.variants.length > 1)
      .map(
        (person) =>
          `Resource name variants grouped as ${person.name}: ${person.variants.join(", ")}. Verify these labels refer to the same recipient.`,
      ),
  };
}
