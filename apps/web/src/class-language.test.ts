import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { classCompletions, classDiagnostics } from "./class-language";

describe("Class language support", () => {
  it("completes declared relationship endpoints", () => {
    const source = "@startuml\nclass Order\nclass Customer\nOrder --> Cus\n@enduml";
    const position = source.indexOf("Cus\n") + 3;
    const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Customer" })]));
  });

  it("completes PlantUML colors and exposes parser diagnostics", () => {
    const source = "@startuml\nclass Order #Lig\n@enduml";
    const position = source.indexOf("Lig") + 3;
    const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).toEqual(expect.arrayContaining([expect.objectContaining({ label: "LightBlue" })]));
    expect(classDiagnostics("@startuml\nclass Order {\n@enduml")).toEqual([
      expect.objectContaining({ message: expect.stringContaining("missing }") }),
    ]);
  });
});
