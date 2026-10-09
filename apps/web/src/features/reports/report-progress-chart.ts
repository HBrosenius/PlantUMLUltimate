import { svgToPngBlob } from "../../file-service";
import { escapeHtml } from "./report-format";
import type { ReportMessage } from "./report-model";
import type { ReportChartPanel } from "./render-report-html";

export function progressChartSvg(message: ReportMessage): string {
  const series = message.series?.filter((line) => line.points.length) ?? [];
  const points = series.flatMap((line) => line.points);
  if (!points.length) throw new Error("No comparable progress observations to chart. Continue without chart.");
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
  const min = Math.min(...points.map((point) => day(point.date))) - 1;
  const max = Math.max(...points.map((point) => day(point.date))) + 1;
  const top = Math.max(1, ...points.map((point) => point.high));
  const x = (date: string) => 60 + ((day(date) - min) / (max - min)) * 550;
  const y = (value: number) => 275 - (value / top) * 220;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440"><rect width="640" height="440" fill="white"/><style>text{font:12px Arial;fill:#172b3a}</style><text x="15" y="22">Task equivalents · planned / recorded · unknown ranges</text><path d="M60 50V275H615" stroke="#172b3a" fill="none"/>`;
  for (let tick = 0; tick <= 4; tick++) {
    const value = (top * tick) / 4;
    svg += `<text x="8" y="${y(value) + 4}">${Number(value.toFixed(2))}</text><path d="M60 ${y(value)}H615" stroke="#e2e8ef"/>`;
  }
  const labels = [...new Set(points.map((point) => point.date))].sort();
  const stride = Math.max(1, Math.ceil(labels.length / 4));
  labels
    .filter((_, index) => index % stride === 0)
    .forEach((date) => {
      svg += `<text x="${Math.min(545, x(date))}" y="295">${escapeHtml(date)}</text>`;
    });
  series.forEach((line, index) => {
    const color = ["#386a91", "#a94734", "#367449", "#6c5394"][index % 4]!;
    const path = (field: "low" | "high") =>
      line.points
        .map((point, i) =>
          i === 0
            ? `M${x(point.date)} ${y(point[field])}`
            : `${line.step ? `H${x(point.date)}V${y(point[field])}` : `M${x(point.date)} ${y(point[field])}`}`,
        )
        .join(" ");
    svg += `<path d="${path("low")}" fill="none" stroke="${color}" stroke-width="2"/><path d="${path("high")}" fill="none" stroke="${color}" stroke-dasharray="4 3"/>`;
    for (let i = 0; i < line.points.length; i++) {
      const point = line.points[i]!;
      const next = line.points[i + 1];
      if (line.step && next && point.high > point.low)
        svg += `<rect x="${x(point.date)}" y="${y(point.high)}" width="${Math.max(0, x(next.date) - x(point.date))}" height="${y(point.low) - y(point.high)}" fill="${color}" opacity=".15"/>`;
      svg += `<path d="M${x(point.date)} ${y(point.low)}V${y(point.high)}" stroke="${color}" stroke-width="3"/><circle cx="${x(point.date)}" cy="${y(point.low)}" r="4" fill="${color}"/>`;
    }
    svg += `<path d="M15 ${320 + index * 22}h25" stroke="${color}" stroke-width="3"/><text x="48" y="${324 + index * 22}">${escapeHtml(line.label)}</text>`;
  });
  return (
    svg +
    '<text x="15" y="428">Dots: observations · steps: last recorded value · dashed upper bound: unknown progress</text></svg>'
  );
}

export async function renderProgressChart(message: ReportMessage): Promise<ReportChartPanel[]> {
  const blob = await svgToPngBlob(progressChartSvg(message), 2);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return [
    {
      blob,
      dataUrl,
      caption:
        "Task equivalents. Planned finish-date staircase or last recorded observations; shaded/dashed ranges represent unknown completion. Steps across gaps do not establish when progress occurred. Equivalent values and scope events appear in report text.",
    },
  ];
}
