import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { getUseCaseQuickFixes, useCaseCompletions, useCaseDiagnostics } from "./usecase-language";

describe("Use Case language support", () => {
  it("completes declared relationship endpoints", () => {
    const source = "@startuml\nactor Customer\nusecase Login\nCustomer --> Lo\n@enduml";
    const position = source.indexOf("Lo\n") + 2;
    const result = useCaseCompletions(new CompletionContext(EditorState.create({ doc: source }), position, false));
    expect(result?.options).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Login" })]));
  });

  it("exposes parser diagnostics and package quick fixes", () => {
    const source = "@startuml\npackage System {\nusecase Login\n@enduml";
    expect(useCaseDiagnostics(source)).toEqual([
      expect.objectContaining({ message: expect.stringContaining("missing }") }),
    ]);
    expect(getUseCaseQuickFixes(source)).toEqual([expect.objectContaining({ replacement: "}\n" })]);
  });
});
