import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { classCompletions, classDiagnostics, classQuickFixes } from "./class-language";

describe("Class language support", () => {
  it("completes declared relationship endpoints", () => {
    const source = "@startuml\nclass Order\nclass Customer\nOrder --> Cus\n@enduml";
    const position = source.indexOf("Cus\n") + 3;
    const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Customer" })]));
  });

  it.each(["+owner: Cus|", "+load(customer: Cus|): void", "+load(): List<Cus|", "class Batch<T extends Cus|"])(
    "completes Class identities in the type context %s",
    (authored) => {
      const marked = `@startuml\nclass "Customer account" as Customer\nclass Service {\n  ${authored}\n}\n@enduml`;
      const position = marked.indexOf("|");
      const source = `${marked.slice(0, position)}${marked.slice(position + 1)}`;
      const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
      expect(result).toMatchObject({ from: position - 3 });
      expect(result?.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Customer account",
            apply: "Customer",
            filterText: "Customer account Customer",
            detail: "class · alias Customer",
          }),
        ]),
      );
    },
  );

  it("does not offer Class type completions in relationship labels", () => {
    const source = "@startuml\nclass Customer\nclass Order\nOrder --> Customer : Cus\n@enduml";
    const position = source.indexOf("Cus\n") + 3;
    const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "class" })]));
  });

  it("completes PlantUML colors and exposes parser diagnostics", () => {
    const source = "@startuml\nclass Order #Lig\n@enduml";
    const position = source.indexOf("Lig") + 3;
    const result = classCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).toEqual(expect.arrayContaining([expect.objectContaining({ label: "LightBlue" })]));
    expect(classDiagnostics("@startuml\nclass Order {\n@enduml")).toEqual([
      expect.objectContaining({ message: expect.stringContaining("missing }") }),
    ]);
    expect(classQuickFixes("@startuml\nclass Order {\n@enduml")).toEqual([
      expect.objectContaining({ replacement: "}\n", message: "Close class member block" }),
    ]);
  });
});
