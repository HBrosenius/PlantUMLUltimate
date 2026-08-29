import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import type { DiagramKind } from "./model";
import { createSemanticSymbolProvider } from "./semantic-symbol-provider";

describe("semantic symbol provider contract", () => {
  const cases: Array<{ kind: DiagramKind; source: string; next: string }> = [
    { kind: "gantt", source: "@startgantt\n[Build] lasts 2 days\n@endgantt", next: "Compile" },
    { kind: "sequence", source: '@startuml\nparticipant "API User" as User\n@enduml', next: "Client" },
    {
      kind: "sequence",
      source: "@startuml\ncreate database Store\nAPI -> Store: Save\n@enduml",
      next: "Orders",
    },
    { kind: "usecase", source: '@startuml\nactor "Customer" as C\n@enduml', next: "Buyer" },
    { kind: "class", source: '@startuml\nclass "Order" as O\n@enduml', next: "Purchase" },
    { kind: "activity", source: "@startuml\n:Review order;\n@enduml", next: "Approve order" },
    { kind: "wbs", source: "@startwbs\n*(project) Project\n@endwbs", next: "initiative" },
    {
      kind: "sequence",
      source:
        "@startuml\n{request} Alice -> Bob: Call\n{request} <-> {response}: 1s\n{response} Bob --> Alice: Done\n@enduml",
      next: "call-start",
    },
    { kind: "usecase", source: '@startuml\npackage "Sales" as sales {\n}\n@enduml', next: "Commerce" },
    { kind: "class", source: '@startuml\nnamespace "Domain" as domain {\n}\n@enduml', next: "Core" },
  ];

  for (const item of cases)
    it(`provides navigation, validation, and rename for ${item.kind}`, () => {
      const provider = createSemanticSymbolProvider({
        diagramKind: item.kind,
        source: item.source,
        gantt: parseGantt(item.source).document,
        sequence: parseSequence(item.source),
        useCase: parseUseCase(item.source),
        classDiagram: parseClassDiagram(item.source),
        activity: parseActivity(item.source),
        wbs: parseWbs(item.source),
      });
      const occurrence = provider.occurrences[0]!;
      expect(provider.occurrenceAt(occurrence.range.from)).toBe(occurrence);
      expect(provider.occurrencesFor(occurrence).length).toBeGreaterThan(0);
      const request = provider.renameRequest(occurrence)!;
      expect(provider.renameOccurrenceCount(request)).toBeGreaterThan(0);
      expect(provider.validateRename(request, item.next)).toBeUndefined();
      expect(provider.rename(request, item.next).source).not.toBe(item.source);
    });
});
