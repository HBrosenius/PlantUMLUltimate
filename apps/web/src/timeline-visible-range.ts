export function timelineScreenColumns(svg: SVGSVGElement | null): Array<{ date: string; center: number }> {
  if (!svg) return [];
  return [...svg.querySelectorAll<SVGGraphicsElement>('[data-timeline-header="top"][data-timeline-date]')].flatMap(
    (element) => {
      const date = element.getAttribute("data-timeline-date");
      const rect = element.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      return date && Number.isFinite(center) ? [{ date, center }] : [];
    },
  );
}

/** First and last timeline header dates whose column centre is inside the given screen rectangle. */
export function timelineDateRangeOnScreen(
  svg: SVGSVGElement | null,
  bounds: { left: number; right: number },
): { from: string; to: string } | undefined {
  const dates = timelineScreenColumns(svg)
    .filter((column) => column.center >= bounds.left && column.center <= bounds.right)
    .map((column) => column.date)
    .sort();
  const from = dates[0];
  const to = dates.at(-1);
  return from && to ? { from, to } : undefined;
}

export function formatTimelineDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
