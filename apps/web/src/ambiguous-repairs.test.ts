import { expect, it } from "vitest";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { quickFixesForDiagram } from "./diagram-diagnostics";

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
  it(`offers two class closing positions with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
    const source = ["@startuml", "class Order {", "  +id: UUID", "class Customer", "@enduml"].join(newline);
    const fixes = quickFixesForDiagram("class", source);
    expect(fixes).toHaveLength(2);
    expect(new Set(fixes.map((item) => item.choiceGroup)).size).toBe(1);
    const before = fixes.find((item) => item.label === "Close class before line 4")!;
    const after = source.slice(0, before.from) + before.replacement + source.slice(before.to);
    expect(parseClassDiagram(after).entities.map((entity) => entity.label)).toEqual(["Order", "Customer"]);
    expect(after).toContain("+id: UUID");
    expect(after).toContain("class Customer");
    expect(after.replace("}" + newline, "")).toBe(source);
  });

it("ignores declaration examples inside comments when locating a closing position", () => {
  const source = "@startuml\nclass Order {\n/'\nclass Example\n'/\n  +id: UUID\n@enduml";
  expect(quickFixesForDiagram("class", source).filter((item) => item.choiceGroup)).toEqual([]);
});
