import { describe, expect, it } from "vitest";
import { detectDiagramKind, normalizeDiagramKind } from "./diagram-kind";

describe("diagram kind detection", () => {
  it("detects Gantt and Sequence sources", () => {
    expect(detectDiagramKind("@startgantt\n@endgantt")).toBe("gantt");
    expect(detectDiagramKind("@startuml\nactor User\nUser -> API: Request\n@enduml")).toBe("sequence");
  });

  it("preserves an explicit hint for ambiguous @startuml documents", () => {
    expect(normalizeDiagramKind("sequence", "@startuml\n@enduml")).toBe("sequence");
    expect(detectDiagramKind("@startuml\nclass User\n@enduml")).toBeUndefined();
  });
});
