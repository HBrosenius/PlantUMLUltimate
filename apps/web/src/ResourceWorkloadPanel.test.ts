import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { buildResourceOverAllocations, buildResourceWorkloads } from "./ResourceWorkloadPanel";

describe("buildResourceWorkloads", () => {
  it("totals concurrent allocations per person and date", () => {
    const source =
      "@startgantt\n[A] on {Alice:60%} starts 2026-09-01\n[A] lasts 2 days\n[B] on {Alice:50%} starts 2026-09-02\n[B] lasts 2 days\n@endgantt";
    const workload = buildResourceWorkloads(parseGantt(source).document.tasks)[0]!;
    expect(workload.name).toBe("Alice");
    expect(workload.days.map((item) => [item.date, item.allocation])).toEqual([
      ["2026-09-01", 60],
      ["2026-09-02", 110],
      ["2026-09-03", 50],
    ]);
  });

  it("counts dependency-scheduled tasks using their resolved start dates", () => {
    const source = "@startgantt\n[A] on {Kalle:100%} lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const workload = buildResourceWorkloads([task], new Map([[task.id, { start: "2026-09-04" }]]))[0]!;
    expect(workload.days.map((item) => [item.date, item.allocation])).toEqual([
      ["2026-09-04", 100],
      ["2026-09-05", 100],
    ]);
  });

  it("summarizes only allocations that exceed the document capacity", () => {
    const source =
      "@startgantt\n[A] on {Alice:60%} starts 2026-09-01\n[A] lasts 2 days\n[B] on {Alice:50%} starts 2026-09-02\n[B] lasts 2 days\n@endgantt";
    expect(buildResourceOverAllocations(parseGantt(source).document.tasks, { Alice: 100 })).toMatchObject([
      { name: "Alice", capacity: 100, peak: 110, days: 1, tasks: [{ label: "A" }, { label: "B" }] },
    ]);
    expect(buildResourceOverAllocations(parseGantt(source).document.tasks, { Alice: 120 })).toEqual([]);
  });

  it("does not allocate a person on a paused date and extends the work afterward", () => {
    const source =
      "@startgantt\n[A] on {Alice:100%} starts 2026-09-01\n[A] lasts 2 days\n[A] pauses on 2026-09-02\n@endgantt";
    expect(buildResourceWorkloads(parseGantt(source).document.tasks)[0]?.days.map((day) => day.date)).toEqual([
      "2026-09-01",
      "2026-09-03",
    ]);
  });
});
