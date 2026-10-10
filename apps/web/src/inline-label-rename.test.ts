import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import type { DiagramKind } from "./model";
import { createSemanticSymbolProvider } from "./semantic-symbol-provider";
import { inlineLabelRenameRequest } from "./inline-label-rename";

function provider(kind: DiagramKind, source: string) {
  return createSemanticSymbolProvider({
    diagramKind: kind,
    source,
    gantt: parseGantt(source).document,
    sequence: parseSequence(source),
    useCase: parseUseCase(source),
    classDiagram: parseClassDiagram(source),
    activity: parseActivity(source),
    wbs: parseWbs(source),
  });
}
describe("inline label targets", () => {
  for (const [kind, declaration] of [
    ["class", 'class "Order" as O'],
    ["component", 'component "Order" as O'],
    ["usecase", 'usecase "Order" as O'],
  ] as const) {
    it(`edits the ${kind} label while preserving aliases, references and unrelated syntax`, () => {
      const source = `@startuml\n${declaration}\nO --> Other : Order prose\n' untouched comment\n@enduml`;
      const symbols = provider(kind, source);
      const request = inlineLabelRenameRequest(symbols, kind, "o")!;
      expect(request).toBeDefined();
      expect(request.mode).not.toContain("alias");
      const result = symbols.rename(request, "Purchase");
      expect(result.error).toBeUndefined();
      expect(result.source).toContain('"Purchase" as O');
      expect(result.source).toContain("O --> Other : Order prose\n' untouched comment");
    });
  }
  it("updates identity references for an unaliased entity", () => {
    const symbols = provider("class", "@startuml\nclass Order\nclass Customer\nOrder --> Customer\n@enduml");
    const request = inlineLabelRenameRequest(symbols, "class", "order")!;
    expect(symbols.rename(request, "Purchase").source).toContain("Purchase --> Customer");
    expect(symbols.validateRename(request, "Customer")).toBeDefined();
  });
  it("does not infer a rendered identity from repeated Activity labels", () => {
    const symbols = provider("activity", "@startuml\n:Review;\n:Review;\n@enduml");
    for (const action of symbols.occurrences.filter((item) => item.kind === "activity-action"))
      expect(inlineLabelRenameRequest(symbols, "activity", action.key)).toBeUndefined();
  });
  it("validates the syntax of a unique Activity label", () => {
    const symbols = provider("activity", "@startuml\n:Review;\n@enduml");
    const action = symbols.occurrences.find((item) => item.kind === "activity-action")!;
    expect(
      symbols.validateRename(inlineLabelRenameRequest(symbols, "activity", action.key)!, "Break; syntax"),
    ).toBeDefined();
  });
  for (const [kind, source, expected] of [
    ["class", '@startuml\npackage "Sales" as sales {\nclass Order\n}\n@enduml', 'package "Commerce" as sales'],
    ["usecase", '@startuml\nactor "User" as user\n@enduml', 'actor "Commerce" as user'],
    ["usecase", '@startuml\npackage "Sales" as sales {\nusecase Order\n}\n@enduml', 'package "Commerce" as sales'],
    ["activity", '@startuml\npartition "Operations" {\n:Review;\n}\n@enduml', 'partition "Commerce"'],
  ] as const)
    it(`supports ${kind} container or actor labels`, () => {
      const symbols = provider(kind, source);
      const occurrence = symbols.occurrences.find((item) => item.role === "declaration")!;
      const request = inlineLabelRenameRequest(symbols, kind, occurrence.key)!;
      expect(symbols.rename(request, "Commerce").source).toContain(expected);
    });
  it("rejects non-label targets and other diagram families", () => {
    const symbols = provider("sequence", "@startuml\nparticipant User\n@enduml");
    expect(inlineLabelRenameRequest(symbols, "sequence", "user")).toBeUndefined();
    expect(
      inlineLabelRenameRequest(provider("activity", "@startuml\nstart\nstop\n@enduml"), "activity", "start"),
    ).toBeUndefined();
  });
});
