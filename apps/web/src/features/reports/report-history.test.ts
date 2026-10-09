import { describe, expect, it } from "vitest";
import { decodeDocument, encodeDocument } from "@plantuml-studio/document-format";
import { assemblePortableDocument } from "../../document-format/portable-document";
import { historicalSummary, recordProgressObservation } from "./report-history";
import { buildReport } from "./build-report";
import { progressChartSvg } from "./report-progress-chart";
import type { ReportOptions } from "./report-model";

const options: ReportOptions = {
  reportType: "history",
  asOf: "2026-10-08",
  timeZone: "Europe/Stockholm",
  filter: "All tasks",
  people: ["alice"],
  excluded: [],
  unresolved: true,
  milestones: true,
  combined: true,
  unassigned: true,
  notes: false,
  links: false,
  compact: false,
  chart: false,
  replyBy: "",
  introduction: "",
  signOff: "",
};
const source = (percent?: number, label = "A") => `@startgantt
[${label}] as [stable] on {Alice} starts 2026-10-01
[stable] lasts 10 days
${percent === undefined ? "" : `[stable] is ${percent}% completed`}
@endgantt`;
describe("explicit reporting history", () => {
  it("requires stable aliases and never manufactures a historical line from one point", async () => {
    await expect(recordProgressObservation("@startgantt\n[A] lasts 2 days\n@endgantt", options, [])).rejects.toThrow(
      "stable alias",
    );
    const point = await recordProgressObservation(source(60), options, []);
    expect(point.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(historicalSummary([point], options, "combined")[0]).toContain("at least two");
    const report = buildReport(source(60), "doc", "Project", "Gantt", options, { history: [point] });
    expect(report.messages[0]!.series).toEqual([]);
  });
  it("reconciles completion ranges and tracks aliases across renames", async () => {
    const first = await recordProgressObservation(source(20), options, []);
    const second = await recordProgressObservation(source(60, "Renamed"), { ...options, asOf: "2026-10-09" }, [first]);
    const report = buildReport(source(60, "Renamed"), "doc", "Project", "Gantt", options, { history: [first, second] });
    const message = report.messages[0]!;
    expect(message.summary!.join("\n")).toContain("Renamed stable alias stable: A → Renamed");
    expect(message.series![0]!.points.map((p) => p.low)).toEqual([0.8, 0.4]);
    expect(message.series![1]!.points.map((p) => p.low)).toEqual([0.2, 0.6]);
    expect(progressChartSvg(message)).toContain("Last recorded remaining");
  });
  it("treats removed baseline work as unknown and additions as scope events", async () => {
    const first = await recordProgressObservation(source(20), options, []);
    const replacement = source(100).replaceAll("stable", "new-task");
    const second = await recordProgressObservation(replacement, { ...options, asOf: "2026-10-09" }, [first]);
    const fixed = buildReport(replacement, "doc", "Project", "Gantt", options, { history: [first, second] })
      .messages[0]!;
    expect(fixed.series![0]!.points[1]).toMatchObject({ low: 0, high: 1 });
    expect(fixed.series![1]!.points[1]).toMatchObject({ low: 0, high: 1 });
    expect(fixed.summary!.join("\n")).toContain("Outside baseline totals");
    const dynamic = buildReport(
      replacement,
      "doc",
      "Project",
      "Gantt",
      { ...options, historyScope: "dynamic" },
      { history: [first, second] },
    ).messages[0]!;
    expect(dynamic.series![1]!.points[1]).toMatchObject({ low: 1, high: 1 });
    expect(dynamic.summary!.join("\n")).toContain("No completion fabricated");
  });
  it("preserves observations in compressed and encrypted portable files", async () => {
    const observation = await recordProgressObservation(source(), options, []);
    const portable = await assemblePortableDocument(
      {
        id: "tab",
        historyId: "h",
        source: source(),
        fileName: "plan.pumlu",
        diagramKind: "gantt",
        dirty: true,
        zoom: 1,
        cursor: { line: 1, column: 1 },
        reportingHistory: [observation],
      },
      [],
    );
    const plain = await decodeDocument((await encodeDocument(portable)).bytes);
    expect(plain.document.settings.reportingHistory).toEqual([observation]);
    const corrupted = structuredClone(portable);
    corrupted.settings.reportingHistory![0]!.source = source(100);
    await expect(encodeDocument(corrupted)).rejects.toThrow("Reporting observation source hash does not match");
    const encrypted = await encodeDocument(portable, { password: "test password" });
    const unlocked = await decodeDocument(encrypted.bytes, { password: "test password" });
    expect(unlocked.document.settings.reportingHistory).toEqual([observation]);
  });
  it("does not evict pinned observations at the retention limit", async () => {
    const point = await recordProgressObservation(source(0), options, []);
    await expect(recordProgressObservation(source(100), options, Array(100).fill(point))).rejects.toThrow("100 pinned");
  });
});
