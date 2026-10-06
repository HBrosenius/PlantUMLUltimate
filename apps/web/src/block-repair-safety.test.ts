import { describe, expect, it } from "vitest";
import classExamples from "../../../tests/fixtures/official-plantuml/class.json";
import usecaseExamples from "../../../tests/fixtures/official-plantuml/usecase.json";
import { opensNoteBlock } from "./block-repair-safety";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

describe("ambiguous block repair safety", () => {
  for (const example of [22, 23, 38, 40, 41, 82, 83, 84, 85]) {
    it(`withholds a closer that could absorb later content in official class example ${example}`, () => {
      const source = classExamples.examples[example - 1]!.replace(/^([ \t]*)}[ \t]*\n/m, "");
      expect(quickFixesForDiagram("class", source)).toEqual([]);
      expect(diagnosticsForDiagram("class", source).some((item) => item.severity === "error")).toBe(true);
    });
  }

  it("withholds a use case package closer that could nest a sibling package", () => {
    const source = usecaseExamples.examples[7]!.replace(/^([ \t]*)}[ \t]*\n/m, "");
    expect(quickFixesForDiagram("usecase", source)).toEqual([]);
    expect(diagnosticsForDiagram("usecase", source).some((item) => item.message.includes("missing }"))).toBe(true);
  });

  for (const [kind, original] of [
    ["class", classExamples.examples[54]!],
    ["usecase", usecaseExamples.examples[11]!],
  ] as const) {
    it(`keeps the ${kind} missing-note error without closing after later statements`, () => {
      const source = original.replace(/^end note[ \t]*\n/m, "");
      expect(quickFixesForDiagram(kind, source)).toEqual([]);
      expect(
        diagnosticsForDiagram(kind, source).filter((item) => item.message === "Note is missing end note"),
      ).toHaveLength(1);
    });
  }

  for (const newline of ["\n", "\r\n"]) {
    it(`closes a terminal note before trailing blank lines with ${JSON.stringify(newline)}`, () => {
      const original = classExamples.examples[23]!.replaceAll("\n", newline);
      const source = original.replace(new RegExp(`end note${newline}`), "");
      const fixes = quickFixesForDiagram("class", source);
      expect(fixes).toHaveLength(1);
      const fix = fixes[0]!;
      expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(original);
    });

    it(`retains simple use case closer repairs with ${JSON.stringify(newline)}`, () => {
      const source = ["@startuml", "package System {", "  usecase Login", "@enduml"].join(newline);
      expect(quickFixesForDiagram("usecase", source)).toEqual([
        expect.objectContaining({ replacement: "}" + newline }),
      ]);
    });
  }

  it("does not append a closer to an unrecognized combined closing-brace line", () => {
    const source = classExamples.examples[78]!.replace(/^([ \t]*)}[ \t]*$/m, "$1}}");
    expect(quickFixesForDiagram("class", source).some((fix) => fix.message === "Close package")).toBe(false);
    expect(diagnosticsForDiagram("class", source).some((item) => item.severity === "error")).toBe(true);
  });

  it("ignores commented declarations and note examples within an unclosed package", () => {
    const source =
      "@startuml\npackage P {\n/'\npackage Example {\n'/\n  class A\n  note right of A\npackage Example {\n  end note\n@enduml";
    expect(quickFixesForDiagram("class", source)).toEqual([expect.objectContaining({ message: "Close package" })]);
  });

  it("does not guess a note closer before an indented relationship", () => {
    const source = "@startuml\nclass A\nclass B\nnote right of A\nSome text\n  A --> B\n@enduml";
    expect(quickFixesForDiagram("class", source)).toEqual([]);
    expect(diagnosticsForDiagram("class", source).some((item) => item.message === "Note is missing end note")).toBe(
      true,
    );
  });

  for (const [kind, body] of [
    ["sequence", "alt Ready\nAlice -> Bob: Hi\nnote over Alice\nSome text\nend"],
    ["activity", "start\nnote right\nSome text\n:Work;\nstop"],
    ["gantt", "[A] lasts 1 day\nnote bottom\nSome text\n[B] lasts 2 days"],
  ] as const) {
    it(`withholds a ${kind} note closer that would absorb following commands`, () => {
      const suffix = kind === "gantt" ? "gantt" : "uml";
      const source = `@start${suffix}\n${body}\n@end${suffix}`;
      expect(quickFixesForDiagram(kind, source)).toEqual([]);
      expect(diagnosticsForDiagram(kind, source).some((item) => item.message === "Note is missing end note")).toBe(
        true,
      );
    });
  }

  it("does not let a closed note's example text suppress another block repair", () => {
    const source = "@startuml\nalt Ready\nAlice -> Bob: Hi\nnote over Alice\nclass Example\nend note\n@enduml";
    expect(quickFixesForDiagram("sequence", source)).toEqual([expect.objectContaining({ replacement: "end\n" })]);
  });

  it("distinguishes member targets and shorthand actors from inline note text", () => {
    expect(opensNoteBlock("note right of A::counter")).toBe(true);
    expect(opensNoteBlock('note right of A::"start(int timeout)"')).toBe(true);
    expect(opensNoteBlock("note right of A::counter : Explanation")).toBe(false);
    expect(opensNoteBlock("note right of :User:")).toBe(true);
    expect(opensNoteBlock("note right of :User: : Explanation")).toBe(false);
    expect(opensNoteBlock('note "Explanation" as N')).toBe(false);
  });
});
