import { svgToPngBlob } from "../../file-service";
import { isWorkingDate, parseGanttCalendar, taskPauses } from "../../gantt-calendar";
import { escapeHtml, reportDate } from "./report-format";
import type { ReportMessage, ReportSnapshot } from "./report-model";
import type { ReportChartPanel } from "./render-report-html";
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export async function renderReportCharts(
  snapshot: ReportSnapshot,
  message: ReportMessage,
  source: string,
): Promise<ReportChartPanel[]> {
  const rows = message.rows.filter((row) => row.start && row.end && !row.issue);
  if (!rows.length) throw new Error("No tasks have usable dates. Continue without chart or clarify the schedule.");
  if (rows.length > 240)
    throw new Error("Chart limit is 240 scheduled tasks. Narrow the selection or continue without chart.");
  const min = Math.min(...rows.map((row) => day(row.start!))) - 1;
  const max = Math.max(...rows.map((row) => day(row.end!))) + 1;
  if (max - min > 10000)
    throw new Error("Chart span exceeds 10,000 days. Narrow the selection or continue without chart.");
  const calendar = parseGanttCalendar(source);
  const x = (date: number) => 240 + ((date - min) / (max - min + 1)) * 380;
  const panels: ReportChartPanel[] = [];
  for (let offset = 0; offset < rows.length; offset += 24) {
    const panel = rows.slice(offset, offset + 24);
    const height = 95 + panel.length * 42;
    let drawing = `<rect width="640" height="${height}" fill="white"/><style>text{font:12px Arial;fill:#172b3a}</style>`;
    const step = max - min <= 21 ? 1 : max - min <= 120 ? 7 : Math.ceil((max - min) / 8);
    for (let d = min; d <= max; d += step)
      drawing += `<path d="M${x(d)} 35V${height - 35}" stroke="#e2e8ef"/><text x="${x(d)}" y="24">${escapeHtml(new Intl.DateTimeFormat(snapshot.options.locale, { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(d * 86400000)))}</text>`;
    panel.forEach((row, index) => {
      const y = 45 + index * 42;
      const start = day(row.start!),
        end = day(row.end!);
      const width = Math.max(2, x(end + 1) - x(start));
      drawing += `<text x="8" y="${y + 12}">${escapeHtml(row.task.label.slice(0, 30))}${row.task.label.length > 30 ? "…" : ""}</text><text x="8" y="${y + 28}">${row.completion === null ? "Not reported" : `${row.completion}%`} · ${escapeHtml(reportDate(row.start, snapshot.options.locale))} – ${escapeHtml(reportDate(row.end, snapshot.options.locale))}</text>`;
      if (row.task.milestone) drawing += `<path d="M${x(start)} ${y}l6 8 -6 8 -6 -8Z" fill="#386a91"/>`;
      else {
        drawing += `<rect x="${x(start)}" y="${y}" width="${width}" height="16" fill="${row.completion === null ? "#ffffff" : "#cedce9"}" stroke="#386a91" ${row.completion === null ? 'stroke-dasharray="3 2"' : ""}/>`;
        if (row.completion !== null)
          drawing += `<rect x="${x(start)}" y="${y}" width="${(width * row.completion) / 100}" height="16" fill="#386a91"/>`;
        const pauses = taskPauses(row.task);
        for (let d = start; d <= end; d++) {
          const date = new Date(d * 86400000).toISOString().slice(0, 10);
          if (pauses.has(date) || !isWorkingDate(date, calendar))
            drawing += `<rect x="${x(d)}" y="${y}" width="${Math.max(1, x(d + 1) - x(d))}" height="16" fill="#ffffff" opacity=".8"/>`;
        }
      }
    });
    const asOf = day(snapshot.options.asOf);
    if (asOf >= min && asOf <= max)
      drawing += `<path d="M${x(asOf)} 32V${height - 35}" stroke="#a94734" stroke-dasharray="4 3"/>`;
    drawing += `<text x="8" y="${height - 12}">Planned dates · dashed bars: progress not reported · red marker: as of</text>`;
    const blob = await svgToPngBlob(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${height}">${drawing}</svg>`,
      2,
    );
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const missing = message.rows.filter((row) => !row.start || !row.end || row.issue);
    panels.push({
      blob,
      dataUrl,
      caption: `Planned timeline · panel ${panels.length + 1} · as of ${reportDate(snapshot.options.asOf, snapshot.options.locale)}. Dates include dependencies outside this report. ${missing.length ? `Not plotted — dates unresolved (${missing.length}): ${missing.map((row) => `${row.task.label}: ${row.issue ?? "Unknown dates"}`).join("; ")}.` : ""}`,
    });
  }
  return panels;
}
