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
    ["component", "@startuml\ncomponent API\n@enduml", "@startuml\npackage System {\ncomponent API\n@enduml"],
    ["activity", "@startuml\nstart\nstop\n@enduml", "@startuml\nwhile (More?)\n:Work;\n@enduml"],
    ["wbs", "@startwbs\n* Root\n@endwbs", "@startwbs\n*** Orphan\n@endwbs"],
  ] as const)("rejects newly introduced %s parser errors", (kind, before, after) => {
    expect(validateGeneratedSource(kind, before, after).valid).toBe(false);
  });

  describe("C4", () => {
    const before = [
      "@startuml",
      "!include <C4/C4_Container>",
      'Person(user, "Customer")',
      'Container(web, "Web", "React")',
      'Rel(user, web, "Uses")',
      "@enduml",
    ].join("\n");

    it("accepts an edit that keeps the includes and writes valid macro calls", () => {
      const after = before.replace('"Web", "React")', '"Web app", "React", "The UI")');
      expect(validateGeneratedSource("c4", before, after).valid).toBe(true);
      expect(
        validateGeneratedSource("c4", before, `${before.replace("@enduml", "")}Person(ops, "Ops")\n@enduml`).valid,
      ).toBe(true);
    });

    it("rejects an edit that drops or changes the include", () => {
      const dropped = before.replace("!include <C4/C4_Container>\n", "");
      expect(validateGeneratedSource("c4", before, dropped)).toMatchObject({ valid: false });
      const changed = before.replace("C4_Container", "C4_Context");
      expect(validateGeneratedSource("c4", before, changed)).toMatchObject({
        valid: false,
        message: expect.stringContaining("preserved"),
      });
    });

    it("rejects invalid macro calls, an escaped quote and a dotted alias", () => {
      for (const [after, message] of [
        [before.replace('Container(web, "Web", "React")', 'Contaner(web, "Web", "React")'), "unknown macro"],
        [before.replace('"Web", "React")', '"Web", "React"'), "closing parenthesis"],
        [before.replace('"Web"', '"The \\"Web\\""'), "escaped quote"],
        [before.replace("Container(web,", "Container(web.app,"), "dot"],
        [before.replace('Person(user, "Customer")', "Person(user)"), "missing label"],
        [before.replace('"Customer")', '"Customer'), "unmatched quote"],
      ] as const) {
        const result = validateGeneratedSource("c4", before, after);
        expect(result.valid, message).toBe(false);
        expect(result.message?.toLowerCase(), message).toContain(message);
      }
    });

    it("keeps an existing problem from blocking an unrelated edit", () => {
      const broken = before.replace('Container(web, "Web", "React")', 'Contaner(web, "Web", "React")');
      expect(validateGeneratedSource("c4", broken, broken.replace('"Customer"', '"Client"')).valid).toBe(true);
    });
  });

  it("allows edits beside an existing Class error", () => {
    const before = "@startuml\nclass Broken {\nclass A\n@enduml";
    const after = "@startuml\nclass Broken {\nclass B\n@enduml";
    expect(validateGeneratedSource("class", before, after).valid).toBe(true);
  });
});
