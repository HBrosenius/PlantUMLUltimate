// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import type { DiagramKind } from "../../model";
import { useActivityController } from "./use-activity-controller";

const document = parseActivity("@startuml\nstart\n:Check order;\nif (Ready?) then (yes)\n:Ship;\nendif\n@enduml");

describe("useActivityController", () => {
  it("coordinates object, settings, and source selections", () => {
    const { result } = renderHook(() => useActivityController("activity", document));
    const action = document.nodes.find((item) => item.kind === "action")!;

    act(() => result.current.selectObject(action.id));
    expect(result.current.selectedAction?.label).toBe("Check order");

    act(() => result.current.openSettingsFromToolbar());
    expect(result.current.selectedAction).toBeUndefined();
    expect(result.current.settingsOpen).toBe(true);

    act(() => result.current.selectFromSource(action.id));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedId).toBe(action.id);
  });

  it("clears Activity inspectors when leaving the diagram while preserving the source highlight", () => {
    const action = document.nodes.find((item) => item.kind === "action")!;
    const { result, rerender } = renderHook(
      ({ kind }: { kind: DiagramKind }) => useActivityController(kind, document),
      { initialProps: { kind: "activity" as DiagramKind } },
    );
    act(() => {
      result.current.selectObject(action.id);
      result.current.setSourceHighlightedId(action.id);
    });

    rerender({ kind: "gantt" });

    expect(result.current.selectedAction).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedId).toBe(action.id);
  });
});
