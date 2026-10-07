import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

for (const [kind, body] of [
  ["class", "class Order {\n  +id: int\n  +save()\n}"],
  ["component", "package Services {\n  component API\n}"],
  ["usecase", "rectangle System {\n  usecase Login\n}"],
] as const) {
  const valid = "@startuml\n" + body + "\n@enduml";
  for (const [name, mutated] of [
    ["missing opening", body.replace(" {", "")],
    ["duplicated opening", body.slice(0, body.indexOf("{")) + "{" + body.slice(body.indexOf("{"))],
    ["duplicated closing", body.slice(0, body.indexOf("}")) + "}" + body.slice(body.indexOf("}"))],
  ])
    it(`repairs ${kind} ${name} brace without changing content`, () => {
      const source = "@startuml\n" + mutated + "\n@enduml";
      expect(diagnosticsForDiagram(kind, source).some((item) => item.severity === "error")).toBe(true);
      expect(
        quickFixesForDiagram(kind, source).some(
          (fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === valid,
        ),
      ).toBe(true);
      expect(diagnosticsForDiagram(kind, valid).filter((item) => item.severity === "error")).toEqual([]);
    });
  it(`repairs existing missing closing brace for ${kind}`, () => {
    const source = valid.replace("}\n@enduml", "@enduml");
    expect(
      quickFixesForDiagram(kind, source).some(
        (fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === valid,
      ),
    ).toBe(true);
  });
}

it("preserves nested groups and members", () => {
  const source = "@startuml\npackage Outer {\n  package Inner {\n    class A {\n      +id: int\n    }\n  }\n}\n@enduml";
  expect(quickFixesForDiagram("class", source)).toEqual([]);
});

it("repairs a missing nested group opening brace", () => {
  const source = "@startuml\npackage Outer {\n  package Inner\n    class A\n  }\n}\n@enduml";
  const fix = quickFixesForDiagram("class", source).find((item) => item.label === "Add missing opening brace")!;
  expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(
    source.replace("package Inner", "package Inner {"),
  );
});

it("ignores quoted braces, notes, comments and member modifiers", () => {
  const source =
    '@startuml\nclass "Order {{ }}" as O {\n  {static} +save()\n}\n\' package Example {{\nnote left\nrectangle Example {{\n}}\nend note\n@enduml';
  expect(quickFixesForDiagram("class", source).filter((item) => item.label?.includes("brace"))).toEqual([]);
});

it("does not infer a missing opening brace when several declarations could own it", () => {
  const source = "@startuml\nclass A\nclass B\n+id: int\n}\n@enduml";
  expect(quickFixesForDiagram("class", source).filter((item) => item.label === "Add missing opening brace")).toEqual(
    [],
  );
});

it("preserves comments and CRLF during an opening brace fix", () => {
  const source = "@startuml\r\nclass A ' Header\r\n  +id: int\r\n}\r\n@enduml";
  const fix = quickFixesForDiagram("class", source).find((item) => item.label === "Add missing opening brace")!;
  expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(
    source.replace("class A '", "class A { '"),
  );
});

it("removes a duplicated opening brace on the next line", () => {
  const source = "@startuml\nclass A {\n{\n  +id: int\n}\n@enduml";
  expect(
    quickFixesForDiagram("class", source).some(
      (fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === source.replace("{\n{", "{"),
    ),
  ).toBe(true);
});

it("inserts the opening brace after a quoted name", () => {
  const source = '@startuml\nclass "Order { label"\n  +id: int\n}\n@enduml';
  expect(
    quickFixesForDiagram("class", source).some(
      (fix) =>
        source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) ===
        source.replace('"Order { label"', '"Order { label" {'),
    ),
  ).toBe(true);
});

it("does not remove braces from unsupported blocks", () => {
  const source = "@startuml\nskinparam class {\n  BackgroundColor Red\n}}\n@enduml";
  expect(
    quickFixesForDiagram("class", source).filter((item) => item.label === "Remove duplicated closing brace"),
  ).toEqual([]);
});
