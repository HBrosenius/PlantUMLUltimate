import { describe, expect, it } from "vitest";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

describe("shared diagram diagnostics", () => {
  const cases: Array<{ kind: DiagramKind; source: string; fix: boolean }> = [
    { kind: "gantt", source: "@startgantt\n[A] lasts 2\n@endgantt", fix: true },
    { kind: "sequence", source: "@startuml\nalt Ready\n@enduml", fix: true },
    { kind: "usecase", source: "@startuml\npackage System {\nusecase Login\n@enduml", fix: true },
    { kind: "class", source: "@startuml\nclass Order {\n@enduml", fix: true },
    { kind: "activity", source: "@startuml\nwhile (More?)\n:Work;\n@enduml", fix: true },
    { kind: "wbs", source: "*** Orphan", fix: true },
  ];

  for (const item of cases)
    it(`reports ${item.kind} diagnostics and safe fixes`, () => {
      expect(diagnosticsForDiagram(item.kind, item.source).length).toBeGreaterThan(0);
      expect(quickFixesForDiagram(item.kind, item.source).length > 0).toBe(item.fix);
    });

  it("keeps preserved Gantt syntax out of the Problems list", () => {
    expect(diagnosticsForDiagram("gantt", "@startgantt\ncustom preserved command\n@endgantt")).toEqual([]);
  });
});
