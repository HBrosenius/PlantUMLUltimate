import { describe, expect, it, vi } from "vitest";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { resizeTaskFeedback, svgScreenScale, taskHoverDetails } from "./DiagramPreview";
import { trackWindowPointerDrag } from "./pointer-drag";

const task: GanttTask = {
  id: "build",
  label: "Build",
  labelRange: { from: 0, to: 5 },
  sourceRange: { from: 0, to: 20 },
  declarations: [],
  start: { value: "2026-09-03", range: { from: 0, to: 10 }, resolved: true },
  duration: { value: 4, unit: "day", range: { from: 0, to: 1 } },
};

describe("resizeTaskFeedback", () => {
  it("shows the resulting inclusive end date and duration", () => {
    expect(resizeTaskFeedback(task, 2)).toBe("Ends 2026-09-08 · 6 days (+2)");
    expect(resizeTaskFeedback(task, -1)).toBe("Ends 2026-09-05 · 3 days (-1)");
  });

  it("falls back to duration when no explicit ISO start exists", () => {
    const { start: _start, ...relativeTask } = task;
    expect(resizeTaskFeedback(relativeTask, 3)).toBe("Duration · 7 days (+3)");
  });
});

describe("svgScreenScale", () => {
  it("converts canonical SVG units to responsive screen pixels", () => {
    const svg = {
      getAttribute: () => "0 0 400 200",
      getBoundingClientRect: () => ({ width: 600 }),
    } as unknown as SVGSVGElement;
    expect(svgScreenScale(svg)).toBe(1.5);
  });

  it("uses the complete expanded viewBox when annotations widen the SVG", () => {
    const svg = {
      getAttribute: (name: string) =>
        name === "viewBox" ? "0 0 800 240" : name === "data-timeline-width" ? "400" : null,
      getBoundingClientRect: () => ({ width: 1200 }),
    } as unknown as SVGSVGElement;
    expect(svgScreenScale(svg)).toBe(1.5);
  });
});

describe("taskHoverDetails", () => {
  it.each([
    { derived: true, issue: "End date cannot be resolved: $unknown" },
    { derived: true, start: "2026-09-03" },
    { derived: false, start: "2026-09-03", end: "2026-09-06", issue: "Dependency conflict" },
  ])("does not invent hover dates for rejected or incomplete schedules: %j", (resolved) => {
    const details = taskHoverDetails(task, [], [task], resolved)!;
    expect(details.dates).toContain("Schedule unresolved:");
    expect(details.dates).toContain(resolved.issue ?? "Task dates cannot be resolved");
    expect(details.dates).not.toContain("→");
  });

  it("uses the resolved calendar span when dates are available", () => {
    expect(taskHoverDetails(task, [], [task], { start: "2026-09-07", end: "2026-09-14", derived: true })?.dates).toBe(
      "2026-09-07 → 2026-09-14",
    );
  });

  it("summarizes dates, allocation, and connected tasks", () => {
    const build = { ...task, resources: [{ value: "Alice", allocation: 50, range: { from: 0, to: 5 } }] };
    const testTask: GanttTask = {
      id: "test",
      label: "Test",
      labelRange: { from: 0, to: 4 },
      sourceRange: { from: 0, to: 10 },
      declarations: [],
    };
    const details = taskHoverDetails(
      build,
      [
        {
          predecessorTaskId: "build",
          successorTaskId: "test",
          predecessor: { value: "Build", range: { from: 0, to: 5 } },
          successor: { value: "Test", range: { from: 0, to: 4 } },
          relation: "start-after-end",
          sourceRange: { from: 0, to: 10 },
        },
      ],
      [build, testTask],
    );
    expect(details).toMatchObject({
      dates: "2026-09-03 → 2026-09-10",
      resources: "Alice 50%",
      successors: [{ id: "test", label: "Test" }],
    });
  });
});

describe("trackWindowPointerDrag", () => {
  const setup = (capture?: boolean) => {
    const target = new EventTarget();
    const handlers = { move: vi.fn(), end: vi.fn(), cancel: vi.fn(), capture: capture ?? false };
    const dispose = trackWindowPointerDrag(handlers, target as unknown as Window);
    return { target, handlers, dispose };
  };

  it("applies the gesture on pointerup and stops listening", () => {
    const { target, handlers } = setup(true);
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("pointercancel"));
    expect(handlers.move).toHaveBeenCalledTimes(1);
    expect(handlers.end).toHaveBeenCalledTimes(1);
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  it("aborts without applying on pointercancel so a later pointerup is ignored", () => {
    const { target, handlers } = setup();
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointercancel"));
    target.dispatchEvent(new Event("pointerup"));
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(handlers.end).not.toHaveBeenCalled();
  });

  it("disposing mid-drag (unmount) aborts and removes listeners", () => {
    const { target, handlers, dispose } = setup();
    dispose();
    dispose();
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("pointerup"));
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(handlers.move).not.toHaveBeenCalled();
    expect(handlers.end).not.toHaveBeenCalled();
  });
});
