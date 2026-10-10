import { expect, it } from "vitest";
import { importedDiagramKind } from "./import-source";
it("identifies supported diagrams and preserves minimal UML imports", () => {
  expect(importedDiagramKind("@startwbs\n* Project\n@endwbs")).toBe("wbs");
  expect(importedDiagramKind("@startuml\n@enduml")).toBe("sequence");
  expect(importedDiagramKind("@startuml\nclass Order\n@enduml")).toBe("class");
});
it("rejects missing, mismatched and multiple envelopes before adding tabs", () => {
  for (const source of [
    "hello",
    "@startuml\nclass A",
    "@startgantt\n@enduml",
    "@endwbs\n@startwbs",
    "@startwbs\n@endwbs\n@startuml\n@enduml",
  ])
    expect(() => importedDiagramKind(source)).toThrow();
  expect(() => importedDiagramKind(`@startuml\n${"x".repeat(500000)}\n@enduml`)).toThrow(/500 kB/);
});
