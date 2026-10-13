// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import type { DiagramKind } from "../../model";
import { useActivityController } from "./use-activity-controller";

const document = parseActivity("@startuml\nstart\n:Check order;\nif (Ready?) then (yes)\n:Ship;\nendif\n@enduml");

describe("useActivityController", () => {
  it("clears ambiguous action identity instead of following an index to a different action", () => {
    const original = parseActivity("@startuml\n:Same;\n:Same;\n:Other;\n@enduml");
    const { result, rerender } = renderHook(({ document }) => useActivityController("activity", document), {
      initialProps: { document: original },
    });
    act(() => result.current.selectObject(original.nodes[1]!.id));
    rerender({ document: parseActivity("@startuml\n:Same;\n:Other;\n:Same;\n@enduml") });
    expect(result.current.selectedAction).toBeUndefined();
  });
  it("does not retain action selection when changing documents", () => {
    const { result, rerender } = renderHook(({ id }) => useActivityController("activity", document, id), {
      initialProps: { id: "a" },
    });
    act(() => result.current.selectObject(document.nodes.find((item) => item.kind === "action")!.id));
    rerender({ id: "b" });
    expect(result.current.selectedAction).toBeUndefined();
  });
  it("follows a unique action through moves, rename, Undo/Redo and deletion", () => {
    const original = parseActivity("@startuml\n:First;\n:Second;\n@enduml");
    const moved = parseActivity("@startuml\n:Second;\n:First;\n@enduml");
    const { result, rerender } = renderHook(({ document }) => useActivityController("activity", document), {
      initialProps: { document: original },
    });
    act(() => result.current.selectObject(original.nodes[1]!.id));
    rerender({ document: moved });
    expect(result.current.selectedAction?.label).toBe("Second");
    rerender({ document: original });
    expect(result.current.selectedAction?.label).toBe("Second");
    rerender({ document: moved });
    expect(result.current.selectedAction?.label).toBe("Second");
    rerender({ document: parseActivity("@startuml\n:Renamed;\n:First;\n@enduml") });
    expect(result.current.selectedAction?.label).toBe("Renamed");
    rerender({ document: parseActivity("@startuml\n:First;\n@enduml") });
    expect(result.current.selectedAction).toBeUndefined();
  });
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
