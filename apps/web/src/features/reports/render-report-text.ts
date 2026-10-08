import type { ReportMessage, ReportRow, ReportSnapshot } from "./report-model";
import { reportDate, safeReportUrl } from "./report-format";
export function taskLines(row: ReportRow, snapshot: ReportSnapshot): string[] {
  const alias = row.task.alias?.value.trim();
  const aliasSuffix =
    alias && alias.toLocaleLowerCase() !== row.task.label.trim().toLocaleLowerCase() ? ` [${alias}]` : "";
  const lines = [
    `${row.task.label}${aliasSuffix}${row.task.milestone ? " · Milestone" : ""}`,
    `Recorded progress: ${row.completion === null ? "Not reported" : `${row.completion}%`}`,
    `Planned: ${reportDate(row.start, snapshot.options.locale)} – ${reportDate(row.end, snapshot.options.locale)}`,
    row.status,
  ];
  if (row.issue) lines.push(`Data issue: ${row.issue}`);
  if (row.shared.length) lines.push(`Shared with ${row.shared.join(", ")}`);
  if (snapshot.options.combined)
    lines.push(`Assigned resources: ${row.task.resources?.map((a) => a.value).join(", ") || "Unassigned"}`);
  if (snapshot.options.notes) for (const note of row.task.notes ?? []) lines.push(`Note: ${note.text}`);
  if (snapshot.options.links)
    for (const link of row.task.links ?? []) {
      const url = safeReportUrl(link.url);
      if (url) lines.push(`${link.label ?? "Task link"}: ${url}`);
    }
  return lines;
}
export const replyPrompt =
  "Confirm: On track / At risk / Blocked / Complete\nUpdated progress: ___   Expected finish: ___\nBlockers or support needed: ___";
export function reportIntro(snapshot: ReportSnapshot, message: ReportMessage): string[] {
  return [
    snapshot.diagramName,
    `Document: ${snapshot.documentName}`,
    `Task check-in · ${message.recipient} · As of ${reportDate(snapshot.options.asOf, snapshot.options.locale)} (${snapshot.options.timeZone})`,
    `${message.rows.length} tasks to review · ${message.rows.filter((row) => row.attention).length} needing attention`,
    ...(snapshot.options.combined
      ? [
          "Contains all selected people's tasks",
          `Audience: ${
            snapshot.recipients
              .filter((p) => snapshot.options.people.includes(p.id))
              .map((p) => p.name)
              .join(", ") || "Coordinator (unassigned work)"
          }`,
        ]
      : [`Hi ${message.recipient},`]),
    snapshot.options.introduction,
    ...(snapshot.options.replyBy
      ? [`Please reply by ${reportDate(snapshot.options.replyBy, snapshot.options.locale)}.`]
      : []),
    `Uses current recorded progress evaluated against ${reportDate(snapshot.options.asOf, snapshot.options.locale)}.`,
  ];
}
export function renderReportText(snapshot: ReportSnapshot, message: ReportMessage): string {
  const lines = reportIntro(snapshot, message);
  let section = "";
  for (const row of message.rows) {
    if (section !== row.section) {
      section = row.section;
      lines.push(section);
    }
    lines.push(taskLines(row, snapshot).join("\n"));
    if (!snapshot.options.compact) lines.push(replyPrompt);
  }
  if (snapshot.options.compact) lines.push(replyPrompt);
  lines.push(
    snapshot.options.signOff,
    `Snapshot of the current plan as of ${reportDate(snapshot.options.asOf, snapshot.options.locale)}. Please correct any information that is out of date.`,
  );
  return lines.join("\n\n");
}
