import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

it("offers alternative task references without changing dependency dates", () => {
  const source =
    "@startgantt\n[Build] lasts 2 days\n[Built] lasts 3 days\n[Release] lasts 1 day\n[Release] starts 5 days after [Buil]'s end\n@endgantt";
  const fixes = quickFixesForDiagram("gantt", source).filter((item) => item.label?.startsWith("Use task"));
  expect(fixes.map((item) => item.replacement)).toEqual(["Build", "Built"]);
  for (const fix of fixes) {
    const result = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
    expect(result).toContain("starts 5 days after");
    expect(result).toContain("'s end");
  }
});

for (const newline of ["\n", "\r\n"])
  it(`withholds an ambiguous class closer with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
    const source = ["@startuml", "class Order {", "  +id: UUID", "class Customer", "@enduml"].join(newline);
    expect(quickFixesForDiagram("class", source)).toEqual([]);
    expect(diagnosticsForDiagram("class", source)).toEqual([
      expect.objectContaining({ message: "Order is missing }", severity: "error" }),
    ]);
  });

it("ignores declaration examples inside comments when locating a closing position", () => {
  const source = "@startuml\nclass Order {\n/'\nclass Example\n'/\n  +id: UUID\n@enduml";
  expect(quickFixesForDiagram("class", source).filter((item) => item.choiceGroup)).toEqual([]);
});
