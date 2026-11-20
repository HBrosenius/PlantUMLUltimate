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
    [new Date(2026, 9, 6, 12), "2026-09-29", "2026-10-05", "2026-10-12"],
    [new Date(2026, 0, 3, 23, 59), "2025-12-29", "2025-12-31", "2026-01-08"],
    [new Date(2024, 2, 5, 0, 1), "2024-02-27", "2024-03-04", "2024-03-11"],
  ])(
    "uses calendar offsets across month and year boundaries, moving weekend dates to Monday, for %s",
    (today, start, parallel, testing) => {
      const source = createDefaultGanttSource(today);
      expect(source).toContain(`Project starts ${start}`);
      expect(source).toContain(`[Architecture] starts ${start}`);
      expect(source).toContain(`[Backend] starts ${parallel}`);
      expect(source).toContain(`[Frontend] starts ${parallel}`);
      expect(source).toContain(`[Testing] starts ${testing}`);
      expect(source).toContain("today is colored in #AAF");
      expect(source).toContain("saturday are closed\nsunday are closed");
    },
  );

  it("never starts a sample task on a closed weekend day", () => {
    for (let day = 1; day <= 14; day += 1) {
      const source = createDefaultGanttSource(new Date(2026, 10, day, 12));
      for (const [, date] of source.matchAll(/starts (\d{4}-\d{2}-\d{2})/g)) {
        expect([1, 2, 3, 4, 5]).toContain(new Date(`${date}T00:00:00Z`).getUTCDay());
      }
    }
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
