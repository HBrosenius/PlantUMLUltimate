// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { svgToPngBlob } from "../../file-service";
import { buildTaskCheckIn } from "./build-task-check-in";
import { renderReportCharts } from "./report-gantt-chart";
import { defaultIntroduction, defaultSignOff, type ReportOptions } from "./report-model";
vi.mock("../../file-service", () => ({
  svgToPngBlob: vi.fn().mockImplementation(async () => new Blob(["png"], { type: "image/png" })),
}));
const options: ReportOptions = {
  locale: "sv-SE",
  asOf: "2026-10-08",
  timeZone: "UTC",
  filter: "All tasks",
  people: ["alice"],
  excluded: [],
  unresolved: true,
  milestones: false,
  combined: false,
  unassigned: false,
  notes: false,
  links: false,
  compact: false,
  chart: true,
  replyBy: "",
  introduction: defaultIntroduction,
  signOff: defaultSignOff,
};
describe("report charts", () => {
  it("uses dates resolved through outside dependencies without exposing outside rows", async () => {
    const source =
      "@startgantt\n[Private predecessor] on {Bob} starts 2026-10-01\n[Private predecessor] lasts 3 days\n[Selected] on {Alice} lasts 2 days\n[Selected] starts at [Private predecessor]'s end\n@endgantt";
    const snapshot = buildTaskCheckIn(source, "doc", "Doc", "Diagram", options);
    const message = snapshot.messages[0]!;
    const panels = await renderReportCharts(snapshot, message, source);
    expect(panels[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
    const svg = vi.mocked(svgToPngBlob).mock.calls.at(-1)![0];
    expect(svg).toContain("Selected");
    expect(svg).not.toContain("Private predecessor");
    expect(svg).toContain(message.rows[0]!.start!);
    expect(svg).toContain("Not reported");
  });
  it("returns an explicit unavailable error for a wholly unresolved chart", async () => {
    const source = "@startgantt\n[Unknown] on {Alice} starts $unknown\n[Unknown] lasts 2 days\n@endgantt";
    const snapshot = buildTaskCheckIn(source, "doc", "Doc", "Diagram", options);
    await expect(renderReportCharts(snapshot, snapshot.messages[0]!, source)).rejects.toThrow(
      "No tasks have usable dates",
    );
  });
});
