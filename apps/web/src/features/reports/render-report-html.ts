import type { ReportSnapshot, ReportMessage } from "./report-model";
import { escapeHtml, reportDate } from "./report-format";
import { reportIntro, taskLines, replyPrompt } from "./render-report-text";
export interface ReportChartPanel {
  dataUrl: string;
  caption: string;
  blob: Blob;
}
const text = (value: string) => escapeHtml(value).replaceAll("\n", "<br>");
export function renderReportHtml(
  snapshot: ReportSnapshot,
  message: ReportMessage,
  charts: ReportChartPanel[] = [],
): string {
  const intro = reportIntro(snapshot, message)
    .map((line, index) =>
      index === 0
        ? `<h1 style="font-size:22px;color:#183b56">${text(line)}</h1>`
        : `<p style="margin:12px 0">${text(line)}</p>`,
    )
    .join("");
  let section = "";
  const body = message.rows
    .map((row) => {
      const heading = section !== row.section ? `<h2 style="font-size:18px">${text(row.section)}</h2>` : "";
      section = row.section;
      const [title, ...lines] = taskLines(row, snapshot);
      return `${heading}<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;background:#f4f6f8;color:#172b3a"><tr><td style="padding:16px;border-top:1px solid #ccd6df"><h3 style="font-size:16px;margin:0 0 12px">${text(title!)}</h3>${lines.map((line) => `<p style="margin:6px 0">${text(line)}</p>`).join("")}${snapshot.options.compact ? "" : `<p style="margin:16px 0 0">${text(replyPrompt)}</p>`}</td></tr></table>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(message.subject)}</title></head><body style="margin:0;background:#ffffff;color:#172b3a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5"><main style="max-width:640px;margin:0 auto;padding:20px">${intro}${charts.map((panel) => `<p><img src="${panel.dataUrl}" width="640" style="width:100%;height:auto" alt="${escapeHtml(panel.caption)}"><br>${text(panel.caption)}</p>`).join("")}${body}${snapshot.options.compact ? `<p>${text(replyPrompt)}</p>` : ""}<p>${text(snapshot.options.signOff)}</p><p style="font-size:12px">Snapshot of the current plan as of ${escapeHtml(reportDate(snapshot.options.asOf, snapshot.options.locale))}. Please correct any information that is out of date.</p></main></body></html>`;
}
