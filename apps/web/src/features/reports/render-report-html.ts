import type { ReportSnapshot, ReportMessage } from "./report-model";
import { escapeHtml, reportDate } from "./report-format";
import { reportIntro, taskLines, replyPrompt } from "./render-report-text";
import { reportTypes } from "./build-report";
export interface ReportChartPanel {
  dataUrl: string;
  caption: string;
  blob: Blob;
}
const text = (value: string) => escapeHtml(value).replaceAll("\n", "<br>");
const taskField = (value: string) =>
  value
    .split("\n")
    .map((line) => {
      const field = /^([^:]+:)(\s+.*)$/.exec(line);
      if (field) return `<strong>${escapeHtml(field[1]!)}</strong>${escapeHtml(field[2]!)}`;
      if (line.startsWith("Shared with ")) return `<strong>Shared with</strong> ${escapeHtml(line.slice(12))}`;
      return escapeHtml(line);
    })
    .join("<br>");
const replyFields = () => taskField(replyPrompt).replace("Expected finish:", "<strong>Expected finish:</strong>");
export function renderReportHtml(
  snapshot: ReportSnapshot,
  message: ReportMessage,
  charts: ReportChartPanel[] = [],
): string {
  const intro = reportIntro(snapshot, message)
    .map((line, index) => {
      if (index === 0) return `<h1 style="font-size:22px;color:#183b56">${text(line)}</h1>`;
      let content = text(line);
      if (index === 2)
        content = `${text(reportTypes[snapshot.options.reportType ?? "check-in"])} · <strong>${text(message.recipient)}</strong> · As of <strong>${text(reportDate(snapshot.options.asOf, snapshot.options.locale))}</strong> (${text(snapshot.options.timeZone)})`;
      if (index === 3)
        content = `<strong>${message.rows.length}</strong> tasks to review · <strong>${message.rows.filter((row) => row.attention).length}</strong> needing attention`;
      return `<p style="margin:12px 0">${content}</p>`;
    })
    .join("");
  let section = "";
  const body = message.rows
    .map((row) => {
      const heading = section !== row.section ? `<h2 style="font-size:18px">${text(row.section)}</h2>` : "";
      section = row.section;
      const [title, ...lines] = taskLines(row, snapshot);
      const background = row.attention ? "#fff1f0" : "#f4f6f8";
      const border = row.attention ? "#f3c7c3" : "#ccd6df";
      const fields = lines
        .map(
          (line, index) =>
            `<p style="margin:6px 0">${index === 2 ? `<strong>${text(row.status)}</strong>` : taskField(line)}</p>`,
        )
        .join("");
      return `${heading}<table role="presentation" width="100%" bgcolor="${background}" style="border-collapse:collapse;margin:16px 0;background:${background};color:#172b3a"><tr><td bgcolor="${background}" style="padding:16px;background:${background};border-top:1px solid ${border}"><h3 style="font-size:16px;margin:0 0 12px">${text(title!)}</h3>${fields}${snapshot.options.compact || message.summary ? "" : `<p style="margin:16px 0 0">${replyFields()}</p>`}</td></tr></table>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(message.subject)}</title></head><body style="margin:0;background:#ffffff;color:#172b3a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5"><main style="max-width:640px;margin:0 auto;padding:20px">${intro}${charts.map((panel) => `<p><img src="${panel.dataUrl}" width="640" style="width:100%;height:auto" alt="${escapeHtml(panel.caption)}"><br>${text(panel.caption)}</p>`).join("")}${body}${snapshot.options.compact && !message.summary ? `<p>${replyFields()}</p>` : ""}<p>${text(snapshot.options.signOff)}</p><p style="font-size:12px">Snapshot of the current plan as of ${escapeHtml(reportDate(snapshot.options.asOf, snapshot.options.locale))}. Please correct any information that is out of date.</p></main></body></html>`;
}
