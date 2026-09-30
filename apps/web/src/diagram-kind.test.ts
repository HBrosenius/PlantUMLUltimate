import { describe, expect, it } from "vitest";
import { detectDiagramKind, normalizeDiagramKind } from "./diagram-kind";

describe("diagram kind detection", () => {
  it("detects all supported diagram sources", () => {
    expect(detectDiagramKind("@startgantt\n@endgantt")).toBe("gantt");
    expect(detectDiagramKind("@startwbs\n* Project\n@endwbs")).toBe("wbs");
    expect(detectDiagramKind("@startuml\nactor User\nUser -> API: Request\n@enduml")).toBe("sequence");
    expect(detectDiagramKind("@startuml\nactor User\nusecase Login\nUser --> Login\n@enduml")).toBe("usecase");
    expect(detectDiagramKind("@startuml\n:User: --> (Log in)\n@enduml")).toBe("usecase");
    expect(detectDiagramKind("@startuml\nclass User\ninterface Repository\n@enduml")).toBe("class");
    expect(detectDiagramKind('@startuml\ncomponent "Web app" as Web\ndatabase Orders\nWeb --> Orders\n@enduml')).toBe(
      "component",
    );
    expect(detectDiagramKind("@startuml\ndatabase DB\nAPI -> DB: Query\n@enduml")).toBe("sequence");
    expect(detectDiagramKind("@startuml\nstart\n:Validate order;\nstop\n@enduml")).toBe("activity");
    expect(detectDiagramKind("@startuml\nclass Job {\n+start(): void\n}\n@enduml")).toBe("class");
  });

  it("does not mistake sequence blocks or use-case rectangles for other kinds", () => {
    expect(
      detectDiagramKind("@startuml\nA -> B : try\nalt ok\nB --> A : done\nelse failed\nB --> A : error\nend\n@enduml"),
    ).toBe("sequence");
    expect(detectDiagramKind("@startuml\ngroup Login\nA -> B : credentials\nend\n@enduml")).toBe("sequence");
    expect(
      detectDiagramKind(
        "@startuml\nactor Customer\nrectangle Shop {\n  (Checkout)\n}\nCustomer --> (Checkout)\n@enduml",
      ),
    ).toBe("usecase");
    expect(detectDiagramKind("@startuml\nrectangle Backend\nrectangle Frontend\nFrontend --> Backend\n@enduml")).toBe(
      "component",
    );
    expect(
      detectDiagramKind("@startuml\nstart\nif (valid?) then (yes)\n:Ship;\nelse (no)\n:Reject;\nendif\nend\n@enduml"),
    ).toBe("activity");
  });

  it("preserves an explicit hint for ambiguous @startuml documents", () => {
    expect(normalizeDiagramKind("sequence", "@startuml\n@enduml")).toBe("sequence");
    expect(normalizeDiagramKind("usecase", "@startuml\nactor User\n@enduml")).toBe("usecase");
    expect(normalizeDiagramKind("class", "@startuml\n@enduml")).toBe("class");
    expect(normalizeDiagramKind("component", "@startuml\n@enduml")).toBe("component");
    expect(normalizeDiagramKind("activity", "@startuml\n@enduml")).toBe("activity");
    expect(normalizeDiagramKind("wbs", "@startwbs\n@endwbs")).toBe("wbs");
  });
});
