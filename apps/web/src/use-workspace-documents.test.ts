import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_COMPONENT_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  createDefaultGanttSource,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_WBS_SOURCE,
} from "./model";
import { diagramKindDisplayName, starterSource } from "./use-workspace-documents";

describe("new workspace documents", () => {
  it("maps every diagram kind to its starter source", () => {
    expect(
      ["gantt", "sequence", "usecase", "class", "component", "activity", "wbs"].map((kind) =>
        starterSource(kind as Parameters<typeof starterSource>[0]),
      ),
    ).toEqual([
      createDefaultGanttSource(),
      DEFAULT_SEQUENCE_SOURCE,
      DEFAULT_USECASE_SOURCE,
      DEFAULT_CLASS_SOURCE,
      DEFAULT_COMPONENT_SOURCE,
      DEFAULT_ACTIVITY_SOURCE,
      DEFAULT_WBS_SOURCE,
    ]);
  });

  it("uses product-facing diagram names", () => {
    expect(diagramKindDisplayName("usecase")).toBe("Use Case");
    expect(diagramKindDisplayName("wbs")).toBe("WBS");
    expect(diagramKindDisplayName("gantt")).toBe("Gantt");
  });
});

describe("Gantt starter dates", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    [new Date(2026, 9, 6, 12), "2026-09-29", "2026-10-03", "2026-10-11"],
    [new Date(2026, 0, 3, 23, 59), "2025-12-27", "2025-12-31", "2026-01-08"],
    [new Date(2024, 2, 5, 0, 1), "2024-02-27", "2024-03-02", "2024-03-10"],
  ])("uses calendar offsets across month and year boundaries for %s", (today, start, parallel, testing) => {
    const source = createDefaultGanttSource(today);
    expect(source).toContain(`Project starts ${start}`);
    expect(source).toContain(`[Architecture] starts ${start}`);
    expect(source).toContain(`[Backend] starts ${parallel}`);
    expect(source).toContain(`[Frontend] starts ${parallel}`);
    expect(source).toContain(`[Testing] starts ${testing}`);
    expect(source).toContain("today is colored in #AAF");
    expect(source).toContain("saturday are closed\nsunday are closed");
  });

  it("uses the current date each time a Gantt diagram is created", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 23, 59));
    const first = starterSource("gantt");
    expect(first).toContain("Project starts 2026-09-29");
    vi.setSystemTime(new Date(2026, 9, 7, 0, 1));
    expect(starterSource("gantt")).toContain("Project starts 2026-09-30");
    expect(first).toContain("Project starts 2026-09-29");
  });
});
