import { describe, expect, it } from "vitest";
import { validateGeneratedSource } from "./generated-source-validation";

describe("generated source validation", () => {
  it("rejects a new parser error", () => {
    const before = "@startgantt\n[A] lasts 2 days\n@endgantt";
    const after = "@startgantt\n[A] [A] lasts 2 days\n@endgantt";
    expect(validateGeneratedSource("gantt", before, after)).toMatchObject({
      valid: false,
      introduced: [{ message: expect.stringContaining("repeated") }],
    });
  });

  it("allows an operation when the user's existing unrelated error remains", () => {
    const before = "@startgantt\n[Broken] lasts nope\n[A] starts 2026-09-01\n@endgantt";
    const after = "@startgantt\n[Broken] lasts nope\n[A] starts 2026-09-02\n@endgantt";
    expect(validateGeneratedSource("gantt", before, after).valid).toBe(true);
  });

  it("allows an operation that fixes an existing error and rejects missing markers", () => {
    expect(
      validateGeneratedSource(
        "gantt",
        "@startgantt\n[A] lasts nope\n@endgantt",
        "@startgantt\n[A] lasts 1 day\n@endgantt",
      ).valid,
    ).toBe(true);
    expect(validateGeneratedSource("gantt", "@startgantt\n[A] lasts 1 day\n@endgantt", "[A] lasts 1 day").valid).toBe(
      false,
    );
  });

  it("rejects generated edits that change unsupported syntax", () => {
    const before = "@startgantt\nskinparam handwritten true\n[A] lasts 1 day\n@endgantt";
    const after = "@startgantt\n[A] lasts 1 day\n@endgantt";
    expect(validateGeneratedSource("gantt", before, after).message).toContain("not visually editable");
  });

  it("allows a quick fix that turns preserved text back into recognized syntax", () => {
    const before = "@startuml\nclass Order {\n  +id: UUID\n@enduml";
    const after = "@startuml\nclass Order {\n  +id: UUID\n}\n@enduml";
    expect(validateGeneratedSource("class", before, after).valid).toBe(true);
  });

  it.each([
    ["sequence", "@startuml\nalt Ready\nend\n@enduml", "@startuml\nalt Ready\n@enduml"],
    ["usecase", "@startuml\npackage System {\n}\n@enduml", "@startuml\npackage System {\n@enduml"],
    ["class", "@startuml\nclass Order\n@enduml", "@startuml\nclass Order {\n@enduml"],
    ["activity", "@startuml\nstart\nstop\n@enduml", "@startuml\nwhile (More?)\n:Work;\n@enduml"],
    ["wbs", "@startwbs\n* Root\n@endwbs", "@startwbs\n*** Orphan\n@endwbs"],
  ] as const)("rejects newly introduced %s parser errors", (kind, before, after) => {
    expect(validateGeneratedSource(kind, before, after).valid).toBe(false);
  });

  it("allows edits beside an existing Class error", () => {
    const before = "@startuml\nclass Broken {\nclass A\n@enduml";
    const after = "@startuml\nclass Broken {\nclass B\n@enduml";
    expect(validateGeneratedSource("class", before, after).valid).toBe(true);
  });
});
