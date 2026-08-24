import { describe, expect, it } from "vitest";
import { ganttAdapter, applySourceEdits, parseGantt } from "@plantuml-studio/diagram-gantt";
import { buildResourceOverAllocations, buildResourceWorkloads } from "./ResourceWorkloadPanel";
import { resolveTaskDates } from "./gantt-schedule";
import { parseGanttCalendar } from "./gantt-calendar";

describe("buildResourceWorkloads", () => {
  it("totals concurrent allocations per person and date", () => {
    const source =
      "@startgantt\n[A] on {Alice:60%} starts 2026-09-01\n[A] lasts 2 days\n[B] on {Alice:50%} starts 2026-09-02\n[B] lasts 2 days\n@endgantt";
    const workload = buildResourceWorkloads(parseGantt(source).document.tasks)[0]!;
    expect(workload.name).toBe("Alice");
    expect(workload.days.map((item) => [item.date, item.allocation])).toEqual([
      ["2026-09-01", 60],
      ["2026-09-02", 110],
      ["2026-09-03", 110],
      ["2026-09-04", 110],
      ["2026-09-05", 50],
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
      { name: "Alice", capacity: 100, peak: 110, days: 3, tasks: [{ label: "A" }, { label: "B" }] },
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

  it("uses the project working calendar when detecting overlap across closed weekends", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[A] on {Kalle:100%} starts 2026-09-04\n[A] lasts 2 days\n[B] on {Kalle:100%} starts 2026-09-07\n[B] lasts 2 days\n@endgantt";
    const parsed = parseGantt(source);
    const calendar = parseGanttCalendar(source);
    const resolved = resolveTaskDates(parsed.document.tasks, parsed.document.dependencies, undefined, calendar);

    expect(buildResourceOverAllocations(parsed.document.tasks, {}, resolved, calendar)).toMatchObject([
      { name: "Kalle", peak: 200, days: 1, tasks: [{ label: "A" }, { label: "B" }] },
    ]);
  });

  it("shares task workload across multiple assigned people", () => {
    const source =
      "@startgantt\n[Backend] on {Kalle:100%} {Tyra:100%} starts 2026-09-07\n[Backend] lasts 8 days\n[Testing] on {Tyra:100%} starts 2026-09-14\n[Testing] lasts 5 days\n@endgantt";
    const tasks = parseGantt(source).document.tasks;

    expect(buildResourceWorkloads(tasks).find((item) => item.name === "Tyra")?.days).toMatchObject([
      { date: "2026-09-07", allocation: 100 },
      { date: "2026-09-08", allocation: 100 },
      { date: "2026-09-09", allocation: 100 },
      { date: "2026-09-10", allocation: 100 },
      { date: "2026-09-14", allocation: 100 },
      { date: "2026-09-15", allocation: 100 },
      { date: "2026-09-16", allocation: 100 },
      { date: "2026-09-17", allocation: 100 },
      { date: "2026-09-18", allocation: 100 },
    ]);
    expect(buildResourceOverAllocations(tasks, {})).toEqual([]);
  });

  it("recalculates over-allocation from the post-drag source, not the pre-drag dates", () => {
    const source = `@startgantt
project starts 2026-09-01
[Backend] starts 2026-09-07
[Backend] lasts 10 days
[Backend] on {Kalle:100%}
[Testing] starts 2026-09-14
[Testing] lasts 1 days
[Testing] on {Kalle:100%}
@endgantt`;

    const computeAllocations = (value: string) => {
      const parsed = parseGantt(value);
      const calendar = parseGanttCalendar(value);
      const resolved = resolveTaskDates(
        parsed.document.tasks,
        parsed.document.dependencies,
        parsed.document.projectStart?.resolved ? parsed.document.projectStart.value : undefined,
        calendar,
      );
      return buildResourceOverAllocations(parsed.document.tasks, {}, resolved);
    };

    // 1-2: overlapping tasks assigned to the same resource are reported as over-allocated.
    expect(computeAllocations(source).some((item) => item.name === "Kalle")).toBe(true);

    // 3: drag Testing far enough away that it no longer overlaps Backend.
    const parsed = ganttAdapter.parse(source);
    const testing = [...parsed.document.symbols.tasks.values()].find((task) => task.label === "Testing")!;
    const moved = ganttAdapter.applyVisualOperation(
      { kind: "move-task", taskId: testing.id, days: 10 },
      parsed.document,
      source,
    );
    const nextSource = applySourceEdits(source, moved.edits);

    // 4: the PlantUML source reflects the new date.
    expect(nextSource).toContain("[Testing] starts 2026-09-24");

    // 5-6: resource allocation is recalculated from the updated source and the warning clears immediately.
    expect(computeAllocations(nextSource)).toEqual([]);
  });

  it("clears over-allocation when parallel tasks are connected into a sequence", () => {
    const source = `@startgantt
project starts 2026-09-01
[Backend] on {Kalle:100%} starts 2026-09-01
[Backend] lasts 3 days
[Frontend] on {Kalle:100%} starts 2026-09-01
[Frontend] lasts 3 days
@endgantt`;
    const computeAllocations = (value: string) => {
      const parsed = parseGantt(value);
      const calendar = parseGanttCalendar(value);
      const resolved = resolveTaskDates(
        parsed.document.tasks,
        parsed.document.dependencies,
        parsed.document.projectStart?.resolved ? parsed.document.projectStart.value : undefined,
        calendar,
      );
      return buildResourceOverAllocations(parsed.document.tasks, {}, resolved, calendar);
    };
    expect(computeAllocations(source)).toHaveLength(1);

    const parsed = parseGantt(source);
    const nextSource = applySourceEdits(
      source,
      ganttAdapter.applyVisualOperation(
        { kind: "create-dependency", predecessorTaskId: "backend", successorTaskId: "frontend" },
        parsed.document,
        source,
      ).edits,
    );

    expect(nextSource).toContain("[Frontend] on {Kalle:100%} starts at [Backend]'s end");
    expect(computeAllocations(nextSource)).toEqual([]);
  });
});
