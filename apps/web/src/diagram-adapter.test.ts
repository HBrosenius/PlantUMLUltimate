import { describe, expect, it } from "vitest";
import { ganttAdapter } from "@plantuml-studio/diagram-gantt";
import { detectPlantUmlDiagramType, DiagramAdapterRegistry } from "@plantuml-studio/language-plantuml";

describe("diagram adapter architecture", () => {
  it("detects supported PlantUML start directives", () => {
    expect(detectPlantUmlDiagramType("@startgantt\n@endgantt")).toBe("gantt");
    expect(detectPlantUmlDiagramType("@startuml\n@enduml")).toBe("uml");
    expect(detectPlantUmlDiagramType("@startmindmap\n@endmindmap")).toBe("mindmap");
    expect(detectPlantUmlDiagramType("plain text")).toBe("unknown");
  });

  it("registers and selects the Gantt adapter", () => {
    const registry = new DiagramAdapterRegistry().register(ganttAdapter);
    expect(registry.detect("@startgantt\n[A] lasts 1 day\n@endgantt")?.id).toBe("gantt");
    expect(registry.detect("@startuml\nAlice -> Bob\n@enduml")).toBeUndefined();
  });

  it("exposes Gantt capabilities and source-mapped interactive objects", () => {
    const parsed = ganttAdapter.parse("@startgantt\n[A] lasts 1 day\n-- Delivery --\n@endgantt");
    expect(ganttAdapter.capabilities).toMatchObject({ visualMove: true, visualResize: true, visualDependencies: true });
    expect(ganttAdapter.interactiveObjects(parsed.document)).toEqual([
      expect.objectContaining({ id: "a", kind: "task", label: "A" }),
      expect.objectContaining({ kind: "divider", label: "Delivery" }),
    ]);
  });

  it("applies typed visual operations as source edits", () => {
    const source =
      "@startgantt\n[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-05\n[B] lasts 2 days\n@endgantt";
    const parsed = ganttAdapter.parse(source);
    const moved = ganttAdapter.applyVisualOperation(
      { kind: "move-task", taskId: "a", days: 1 },
      parsed.document,
      source,
    );
    expect(moved.edits).toEqual([expect.objectContaining({ text: "2026-09-02" })]);
    const connected = ganttAdapter.applyVisualOperation(
      { kind: "create-dependency", predecessorTaskId: "a", successorTaskId: "b" },
      parsed.document,
      source,
    );
    expect(connected.edits.some((edit) => edit.text.includes("[B] starts at [A]'s end"))).toBe(true);
  });
});
