import { describe, expect, it } from "vitest";
import { applySourceEdits, type GanttVisualOperation } from "@plantuml-studio/diagram-gantt";
import type { WbsVisualOperation } from "@plantuml-studio/diagram-wbs";
import { detectPlantUmlDiagramType } from "@plantuml-studio/language-plantuml";
import {
  applicationDiagramAdapterRegistry,
  applicationGanttAdapter,
  applicationWbsAdapter,
  getApplicationDiagramAdapter,
  sourceSupportsDiagramCapability,
} from "./diagram-adapters";

describe("diagram adapter architecture", () => {
  it("detects supported PlantUML start directives", () => {
    expect(detectPlantUmlDiagramType("@startgantt\n@endgantt")).toBe("gantt");
    expect(detectPlantUmlDiagramType("@startuml\n@enduml")).toBe("uml");
    expect(detectPlantUmlDiagramType("@startmindmap\n@endmindmap")).toBe("mindmap");
    expect(detectPlantUmlDiagramType("@startwbs\n@endwbs")).toBe("wbs");
    expect(detectPlantUmlDiagramType("plain text")).toBe("unknown");
  });

  it("registers WBS and exposes hierarchy objects", () => {
    const source = "@startwbs\n* Project\n** Delivery\n@endwbs";
    expect(applicationDiagramAdapterRegistry.detect(source)?.id).toBe("wbs");
    const adapter = getApplicationDiagramAdapter("wbs");
    const parsed = adapter.parse(source);
    expect(adapter.interactiveObjects(parsed.document)).toEqual([
      expect.objectContaining({ kind: "wbs-node", label: "Project" }),
      expect.objectContaining({ kind: "wbs-node", label: "Delivery" }),
    ]);
  });

  it("routes WBS subtree moves through source-preserving adapter edits", () => {
    const source =
      "@startwbs\n*(project) Project\n' keep this comment\n**(plan) Plan\n*** Detail\nfoo bar baz\n**(deliver) Deliver\n@endwbs";
    const parsed = applicationWbsAdapter.parse(source);
    const operation = applicationWbsAdapter.applyVisualOperation(
      { kind: "move-subtree", nodeId: "wbs-1", parentId: "wbs-3" },
      parsed.document,
      source,
    );
    const next = applySourceEdits(source, operation.edits);
    expect(next).toContain("' keep this comment");
    expect(next).toContain("foo bar baz");
    expect(next).toContain("**(deliver) Deliver\n***(plan) Plan\n**** Detail");
    expect(operation.edits).not.toEqual([{ range: { from: 0, to: source.length }, text: next }]);
  });

  it("rejects invalid and unsupported WBS adapter targets without edits", () => {
    const source = "@startwbs\n*(project) Project\n**(plan) Plan\n@endwbs";
    const parsed = applicationWbsAdapter.parse(source);
    expect(
      applicationWbsAdapter.applyVisualOperation(
        { kind: "move-subtree", nodeId: "wbs-1", parentId: "missing" },
        parsed.document,
        source,
      ),
    ).toEqual({ edits: [], unavailableReason: "WBS parent node not found" });
    expect(
      applicationWbsAdapter.applyVisualOperation(
        { kind: "unknown-operation", nodeId: "wbs-1" } as unknown as WbsVisualOperation,
        parsed.document,
        source,
      ),
    ).toEqual({ edits: [], unavailableReason: "Unsupported WBS operation: unknown-operation" });
  });

  it("registers and selects the Gantt adapter", () => {
    expect(applicationDiagramAdapterRegistry.detect("@startgantt\n[A] lasts 1 day\n@endgantt")?.id).toBe("gantt");
    expect(applicationDiagramAdapterRegistry.detect("@startuml\nAlice -> Bob\n@enduml")).toBeUndefined();
  });

  it("exposes Gantt capabilities and source-mapped interactive objects", () => {
    const parsed = applicationGanttAdapter.parse("@startgantt\n[A] lasts 1 day\n-- Delivery --\n@endgantt");
    expect(applicationGanttAdapter.capabilities).toMatchObject({
      visualMove: true,
      visualResize: true,
      visualDependencies: true,
    });
    expect(applicationGanttAdapter.interactiveObjects(parsed.document)).toEqual([
      expect.objectContaining({ id: "a", kind: "task", label: "A" }),
      expect.objectContaining({ kind: "divider", label: "Delivery" }),
    ]);
  });

  it("applies typed visual operations as source edits", () => {
    const source =
      "@startgantt\n[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-05\n[B] lasts 2 days\n@endgantt";
    const parsed = applicationGanttAdapter.parse(source);
    const moved = applicationGanttAdapter.applyVisualOperation(
      { kind: "move-task", taskId: "a", days: 1 },
      parsed.document,
      source,
    );
    expect(moved.edits).toEqual([expect.objectContaining({ text: "2026-09-02" })]);
    const connected = applicationGanttAdapter.applyVisualOperation(
      { kind: "create-dependency", predecessorTaskId: "a", successorTaskId: "b" },
      parsed.document,
      source,
    );
    expect(connected.edits.some((edit) => edit.text.includes("[B] starts at [A]'s end"))).toBe(true);
  });

  it("preserves comments and unknown syntax around a visual edit", () => {
    const source = "@startgantt\n' keep this comment\n[A] starts 2026-09-01\n[A] lasts 2 days\nfoo bar baz\n@endgantt";
    const parsed = applicationGanttAdapter.parse(source);
    const operation = applicationGanttAdapter.applyVisualOperation(
      { kind: "move-task", taskId: "a", days: 1 },
      parsed.document,
      source,
    );
    expect(applySourceEdits(source, operation.edits)).toBe(
      "@startgantt\n' keep this comment\n[A] starts 2026-09-02\n[A] lasts 2 days\nfoo bar baz\n@endgantt",
    );
  });

  it("reports unsupported capabilities when no application adapter matches", () => {
    expect(sourceSupportsDiagramCapability("@startgantt\n@endgantt", "visualMove")).toBe(true);
    expect(sourceSupportsDiagramCapability("@startuml\nclass Example\n@enduml", "visualMove")).toBe(false);
  });

  it("rejects unsupported visual operations without editing source", () => {
    const source = "@startgantt\n[A] lasts 1 day\n@endgantt";
    const parsed = applicationGanttAdapter.parse(source);
    const result = applicationGanttAdapter.applyVisualOperation(
      { kind: "unknown-operation" } as GanttVisualOperation,
      parsed.document,
      source,
    );
    expect(result).toEqual({ edits: [], unavailableReason: "Unsupported Gantt operation: unknown-operation" });
  });
});
