import { describe, expect, it } from "vitest";
import { detectDiagramKind, normalizeDiagramKind } from "./diagram-kind";

describe("diagram kind detection", () => {
  it("detects Gantt, Sequence, Use Case, and Class sources", () => {
    expect(detectDiagramKind("@startgantt\n@endgantt")).toBe("gantt");
    expect(detectDiagramKind("@startuml\nactor User\nUser -> API: Request\n@enduml")).toBe("sequence");
    expect(detectDiagramKind("@startuml\nactor User\nusecase Login\nUser --> Login\n@enduml")).toBe("usecase");
    expect(detectDiagramKind("@startuml\n:User: --> (Log in)\n@enduml")).toBe("usecase");
    expect(detectDiagramKind("@startuml\nclass User\ninterface Repository\n@enduml")).toBe("class");
    expect(detectDiagramKind("@startuml\nstart\n:Validate order;\nstop\n@enduml")).toBe("activity");
    expect(detectDiagramKind("@startuml\nclass Job {\n+start(): void\n}\n@enduml")).toBe("class");
  });

  it("preserves an explicit hint for ambiguous @startuml documents", () => {
    expect(normalizeDiagramKind("sequence", "@startuml\n@enduml")).toBe("sequence");
    expect(normalizeDiagramKind("usecase", "@startuml\nactor User\n@enduml")).toBe("usecase");
    expect(normalizeDiagramKind("class", "@startuml\n@enduml")).toBe("class");
    expect(normalizeDiagramKind("activity", "@startuml\n@enduml")).toBe("activity");
  });
});
