// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { DiagramKind } from "../../model";
import { useGanttController } from "./use-gantt-controller";

describe("useGanttController", () => {
  beforeEach(() => localStorage.clear());

  it("owns Gantt panels and resets transient state when leaving Gantt", () => {
    const { result, rerender } = renderHook(({ kind }: { kind: DiagramKind }) => useGanttController(kind), {
      initialProps: { kind: "gantt" as DiagramKind },
    });
    act(() => {
      result.current.setProjectInspectorOpen(true);
      result.current.setLegendInspectorOpen(true);
      result.current.setHighlightDate("2026-09-18");
      result.current.setResourceFilter("Backend");
      result.current.setResourcePanelOpen(true);
    });
    rerender({ kind: "class" });
    expect(result.current.projectInspectorOpen).toBe(false);
    expect(result.current.legendInspectorOpen).toBe(false);
    expect(result.current.highlightDate).toBeUndefined();
    expect(result.current.resourceFilter).toBe("");
    expect(result.current.resourcePanelOpen).toBe(false);
  });

  it("persists the chosen schedule mode", () => {
    const { result } = renderHook(() => useGanttController("gantt"));
    act(() => result.current.setScheduleMode("cascade"));
    expect(localStorage.getItem("plantuml-studio.schedule-mode")).toBe("cascade");
  });
});
