import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

for (const [kind, body, ending] of [
  ["sequence", "alt Ready\nAlice -> Bob: Hello", "end"],
  ["activity", "start\nif (Ready?) then (yes)\n:Work;", "endif"],
  ["activity", "start\nwhile (More?)\n:Work;", "endwhile"],
  ["class", "class A\nnote left of A\nText", "end note"],
  ["component", "component A\nnote left of A\nText", "end note"],
  ["usecase", "usecase A\nnote left of A\nText", "end note"],
  ["gantt", "[A] lasts 2 days\nnote bottom\nText", "end note"],
] as const) {
  const suffix = kind === "gantt" ? "gantt" : "uml";
  const valid = `@start${suffix}\n${body}\n${ending}\n@end${suffix}`;
  for (const typo of [ending + ending.slice(-1), ending.slice(0, -1)])
    it(`repairs ${kind} ${typo}`, () => {
      const source = valid.replace("\n" + ending + "\n", "\n" + typo + "\n");
      expect(
        quickFixesForDiagram(kind, source).some(
          (fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === valid,
        ),
      ).toBe(true);
      expect(
        diagnosticsForDiagram(kind, valid).filter(
          (item) => item.message.startsWith("Misspelled block") || item.message.startsWith("Blocks are missing"),
        ),
      ).toEqual([]);
    });
  it(`inserts missing ${kind} ${ending}`, () => {
    const source = valid.replace("\n" + ending + "\n", "\n");
    expect(
      quickFixesForDiagram(kind, source).some(
        (fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === valid,
      ),
    ).toBe(true);
  });
}

it("closes nested activity blocks in reverse order", () => {
  const source = "@startuml\nstart\nif (Ready?) then (yes)\n  while (More?)\n    :Work;\n@enduml";
  const fix = quickFixesForDiagram("activity", source).find((item) => item.label === "Close unclosed blocks")!;
  expect(fix.replacement).toBe("  endwhile\nendif\n");
});

it("does not interpret note text, labels or comments as blocks", () => {
  const source =
    "@startuml\nalt Ready\nAlice -> Bob: endif\n' endd\nnote over Alice\ngroup Example\nalt Example\nend note\nend\n@enduml";
  expect(quickFixesForDiagram("sequence", source)).toEqual([]);
});

it("preserves CRLF, indentation and trailing comments in a typo fix", () => {
  const source = "@startuml\r\nalt Ready\r\nAlice -> Bob: Hi\r\n  endd ' Close\r\n@enduml";
  const fix = quickFixesForDiagram("sequence", source).find((item) => item.label === "Use end")!;
  expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(source.replace("endd", "end"));
});

it("does not guess when a different canonical terminator makes nesting ambiguous", () => {
  const source = "@startuml\nstart\nwhile (More?)\n:Work;\nendif\n@enduml";
  expect(quickFixesForDiagram("activity", source).filter((item) => item.label === "Close unclosed blocks")).toEqual([]);
});

it("ignores Sequence control examples in block comments", () => {
  const source = "@startuml\n/'\nalt Example\nendd\n'/\nAlice -> Bob: Hi\n@enduml";
  expect(quickFixesForDiagram("sequence", source)).toEqual([]);
});
