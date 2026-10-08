// @vitest-environment jsdom

import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { describe, expect, it } from "vitest";
import { parseGanttCalendar } from "../gantt-calendar";
import { addCanonicalGanttOverlay, dayColumnBounds, timelineColumnWidth } from "./canonical-gantt-overlay";

describe("shared timeline column geometry", () => {
  it.each([8, 16, 23.5, 31.25])("derives stable day width at %s SVG units", (width) => {
    const centers = Array.from({ length: 31 }, (_, index) => 100 + index * width);
    expect(timelineColumnWidth(centers)).toBeCloseTo(width);
  });

  it("keeps adjacent Friday, weekend, and Monday boundaries exact", () => {
    const width = 16;
    const friday = dayColumnBounds(100, width);
    const saturday = dayColumnBounds(116, width);
    const sunday = dayColumnBounds(132, width);
    const monday = dayColumnBounds(148, width);
    expect(saturday.left).toBe(friday.right);
    expect(saturday.right).toBe(sunday.left);
    expect(sunday.right).toBe(monday.left);
  });

  it("is invariant under zoom and horizontal scrolling", () => {
    const bounds = dayColumnBounds(412.75, 17.5);
    for (const zoom of [0.5, 0.8, 1, 1.35, 2, 3]) {
      const scroll = 137;
      const screenLeft = bounds.left * zoom - scroll;
      const screenRight = bounds.right * zoom - scroll;
      expect(screenRight - screenLeft).toBeCloseTo(17.5 * zoom);
    }
  });

  it.each([28, 29, 30, 31])("keeps exact boundaries across a %s-day month", (days) => {
    const width = 13.25;
    const centers = Array.from({ length: days + 2 }, (_, index) => 50 + index * width);
    const derived = timelineColumnWidth(centers)!;
    centers.slice(1).forEach((center, index) => {
      expect(dayColumnBounds(centers[index]!, derived).right).toBeCloseTo(dayColumnBounds(center, derived).left);
    });
  });
});

describe("addCanonicalGanttOverlay with themed rounded-rect bars", () => {
  const tasks = parseGantt("@startgantt\n[Backend] lasts 4 days\n@endgantt").document.tasks;

  it("makes a task selectable when its bar is a filled rounded-rect <path> (weekend-split themed bars)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<text x="10" y="30" font-size="12">Backend</text>' +
      '<path d="M50,20 L150,20 A4,4 0 0 1 154,24 L154,36 A4,4 0 0 1 150,40 L50,40 A4,4 0 0 1 46,36 L46,24 A4,4 0 0 1 50,20" fill="#4DABF5" stroke="#2196F3"/>' +
      "</svg>";
    const result = addCanonicalGanttOverlay(svg, tasks);
    expect(result).toContain(`data-task-id="${tasks[0]!.id}"`);
    expect(result).toContain(`data-visual-task-id="${tasks[0]!.id}"`);
  });

  it("makes a task selectable when its bar is an unfilled outline <path> (outline themes)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<text x="10" y="30" font-size="12">Backend</text>' +
      '<path d="M50,20 L150,20 A4,4 0 0 1 154,24 L154,36 A4,4 0 0 1 150,40 L50,40 A4,4 0 0 1 46,36 L46,24 A4,4 0 0 1 50,20" fill="#00000000" stroke="#2196F3"/>' +
      "</svg>";
    const result = addCanonicalGanttOverlay(svg, tasks);
    expect(result).toContain(`data-task-id="${tasks[0]!.id}"`);
    expect(result).toContain(`data-visual-task-id="${tasks[0]!.id}"`);
  });
});

describe("Gantt task completion", () => {
  it("marks 100% tasks and fills only the completed portion of partial tasks", () => {
    const tasks = parseGantt(`@startgantt
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] lasts 4 days
[Backend] is 50% completed
[Frontend] lasts 4 days
[Frontend] is 0% completed
[Testing] lasts 4 days
@endgantt`).document.tasks;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text x="10" y="30">Architecture</text>
      <rect x="120" y="20" width="100" height="13" fill="#aaa" />
      <text x="10" y="60">Backend</text>
      <rect x="120" y="50" width="40" height="13" fill="#123456" />
      <rect x="180" y="50" width="40" height="13" fill="#123456" />
      <text x="10" y="90">Frontend</text>
      <rect x="120" y="80" width="100" height="13" fill="#aaa" />
      <text x="10" y="120">Testing</text>
      <rect x="120" y="110" width="100" height="13" fill="#aaa" />
    </svg>`;
    const result = new DOMParser().parseFromString(addCanonicalGanttOverlay(svg, tasks), "image/svg+xml");
    expect(result.querySelector(`[data-visual-task-id="${tasks[0]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "100% ✓ Done",
    );
    expect(result.querySelector(`[data-completion-marker="${tasks[0]!.id}"]`)).not.toBeNull();
    expect(result.querySelector(`[data-visual-task-id="${tasks[1]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "50%",
    );
    expect(result.querySelector(`[data-completion-marker="${tasks[1]!.id}"]`)).toBeNull();
    expect(result.querySelector(`[data-visual-task-id="${tasks[2]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "0%",
    );
    expect(result.querySelector(`[data-visual-task-id="${tasks[3]!.id}"] .gantt-completion-label`)).toBeNull();
    const progress = result.querySelector(`[data-progress-task-id="${tasks[1]!.id}"]`);
    expect(progress?.getAttribute("x")).toBe("120");
    expect(progress?.getAttribute("width")).toBe("50");
    expect(progress?.getAttribute("fill")).toBe("#ffffff");
    expect(result.querySelectorAll("clipPath rect")).toHaveLength(2);
    expect(result.querySelector(`[data-task-id="${tasks[1]!.id}"]`)?.getAttribute("aria-label")).toBe(
      "Select Backend, 50% complete",
    );
    const second = new DOMParser().parseFromString(addCanonicalGanttOverlay(svg, tasks), "image/svg+xml");
    expect(second.querySelector(`[data-progress-task-id="${tasks[1]!.id}"]`)?.getAttribute("clip-path")).not.toBe(
      progress?.getAttribute("clip-path"),
    );
    expect(result.querySelector(`[data-progress-task-id="${tasks[0]!.id}"]`)).toBeNull();
    expect(result.querySelector(`[data-progress-task-id="${tasks[2]!.id}"]`)).toBeNull();
  });
});

describe("Gantt timeline month boundaries", () => {
  it.each([
    ["Sep", "October 2026", [29, 30, 1, 2], ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]],
    ["Dec", "January 2027", [30, 31, 1, 2], ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]],
    ["Feb", "March 2024", [28, 29, 1, 2], ["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"]],
  ])("dates the abbreviated %s header before %s correctly", (shortMonth, nextMonth, days, dates) => {
    const tasks = parseGantt("@startgantt\n[A] lasts 1 day\n@endgantt").document.tasks;
    const columns = (days as number[])
      .map(
        (day, index) =>
          `<text x="${20 + index * 16}" y="30">${day}</text><text x="${20 + index * 16}" y="150">${day}</text>`,
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="10">${shortMonth}</text>
      <text x="52" y="10">${nextMonth}</text>${columns}
      <text x="10" y="60">A</text><rect x="20" y="50" width="12" height="13" fill="#aaa"/></svg>`;
    const result = new DOMParser().parseFromString(addCanonicalGanttOverlay(svg, tasks), "image/svg+xml");
    expect(
      [...result.querySelectorAll('[data-timeline-header="top"]')].map((element) =>
        element.getAttribute("data-timeline-date"),
      ),
    ).toEqual(dates);
  });
});

it("keeps a unique-row task selectable when renderer offset dates differ from the schedule model", () => {
  const source =
    "@startgantt\nProject starts 2026-10-01\n[A] lasts 2 days\n[B] lasts 2 days\n[B] starts 3 days after [A]'s end\n@endgantt";
  const { document } = parseGantt(source);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="18" y="10">October 2026</text>
    ${[1, 2, 3, 4, 5, 6, 7].map((day, index) => `<text x="${5 + index * 16}" y="30">${day}</text>`).join("")}
    <text x="6" y="51">A</text><rect x="2" y="41" width="28" height="12" fill="#aaa"/>
    <text x="86" y="67">B</text><rect x="82" y="57" width="28" height="12" fill="#aaa"/></svg>`;
  const result = new DOMParser().parseFromString(
    addCanonicalGanttOverlay(
      svg,
      document.tasks,
      document.dependencies,
      [],
      "",
      undefined,
      "2026-10-01",
      parseGanttCalendar(source),
    ),
    "image/svg+xml",
  );
  expect(result.querySelector('[data-task-id="b"] .bar')?.getAttribute("x")).toBe("82");
});

it("keeps same-row task hitboxes separate across a shortened month header", () => {
  const source =
    "@startgantt\nProject starts 2026-09-29\nsaturday are closed\nsunday are closed\n[Architecture] starts 2026-09-29\n[Architecture] lasts 4 days\n[New task] starts at [Architecture]'s end\n[New task] lasts 1 day\n[New task] displays on same row as [Architecture]\n@endgantt";
  const { document } = parseGantt(source);
  const columns = [29, 30, 1, 2, 3, 4, 5, 6]
    .map(
      (day, index) =>
        `<text x="${100 + index * 20}" y="30">${day}</text><text x="${100 + index * 20}" y="150">${day}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="100" y="10">Sep</text>
    <text x="160" y="10">October 2026</text>${columns}
    <text x="0" y="70">Architecture</text><rect x="100" y="60" width="76" height="13" fill="#aaa"/>
    <polygon points="174,63 220,67 174,71 174,63" fill="#181818" stroke="#181818"/>
    <text x="200" y="70">New task</text><rect x="220" y="60" width="16" height="13" fill="#aaa"/></svg>`;
  const result = new DOMParser().parseFromString(
    addCanonicalGanttOverlay(
      svg,
      document.tasks,
      document.dependencies,
      [],
      "",
      undefined,
      "2026-09-29",
      parseGanttCalendar(source),
    ),
    "image/svg+xml",
  );
  const owner = result.querySelector('[data-task-id="architecture"] .bar');
  const added = result.querySelector('[data-task-id="new task"] .bar');
  expect(owner?.getAttribute("x")).toBe("100");
  expect(owner?.getAttribute("width")).toBe("76");
  expect(added?.getAttribute("x")).toBe("220");
  expect(added?.getAttribute("width")).toBe("16");
});
