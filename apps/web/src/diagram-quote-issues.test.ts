import { describe, expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

describe("quoted label repairs", () => {
  for (const [kind, prefix, suffix] of [
    ["sequence", "participant ", " as A"],
    ["class", "class ", " as A"],
    ["component", "component ", " as A"],
    ["usecase", "usecase ", " as A"],
  ] as const) {
    const tag = "uml";
    const before = `@start${tag}\n${prefix}`;
    const after = suffix + `\n@end${tag}`;
    const valid = before + '"Result [end] starts"' + after;
    for (const label of [
      'Result [end] starts"',
      '"Result [end] starts',
      '""Result [end] starts"',
      '"Result [end] starts""',
    ])
      it(`repairs ${kind} label ${label}`, () => {
        const source = before + label + after;
        const fixes = quickFixesForDiagram(kind, source);
        expect(
          diagnosticsForDiagram(kind, source).some((item) => item.message === "Quoted label has an unmatched quote"),
        ).toBe(true);
        expect(fixes.some((fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === valid)).toBe(
          true,
        );
        expect(diagnosticsForDiagram(kind, valid).filter((item) => item.severity === "error")).toEqual([]);
      });
    it(`preserves valid ${kind} labels`, () => {
      expect(quickFixesForDiagram(kind, valid)).toEqual([]);
    });
  }

  it("flags ambiguous alias boundaries without guessing", () => {
    const source = '@startuml\nclass "Display as Label as A\n@enduml';
    expect(
      diagnosticsForDiagram("class", source).some((item) => item.message === "Quoted label has an unmatched quote"),
    ).toBe(true);
    expect(
      quickFixesForDiagram("class", source).filter((item) => item.message === "Quoted label has an unmatched quote"),
    ).toEqual([]);
  });

  it("ignores note bodies, comments, activity text and WBS free text", () => {
    const source =
      "@startuml\n' class \"Example\n/'\nclass \"Example\n'/\nnote left\nclass \"Example\nend note\n@enduml";
    expect(quickFixesForDiagram("class", source)).toEqual([]);
    expect(
      diagnosticsForDiagram("activity", '@startuml\nstart\n:Say "Hello;\nstop\n@enduml').filter(
        (item) => item.message === "Quoted label has an unmatched quote",
      ),
    ).toEqual([]);
    expect(
      diagnosticsForDiagram("wbs", '@startwbs\n* Say "Hello\n@endwbs').filter(
        (item) => item.message === "Quoted label has an unmatched quote",
      ),
    ).toEqual([]);
  });

  it("preserves escaped quotes and CRLF offsets", () => {
    const valid = '@startuml\r\nparticipant "Say \\"Hello\\"" as A\r\n@enduml';
    expect(quickFixesForDiagram("sequence", valid)).toEqual([]);
    const source = '@startuml\r\nparticipant "Hello as A\r\n@enduml';
    const fix = quickFixesForDiagram("sequence", source).find((item) => item.label === "Add missing closing quote")!;
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(
      '@startuml\r\nparticipant "Hello" as A\r\n@enduml',
    );
  });
});

it("ignores quotes inside trailing comments", () => {
  const source = '@startuml\nclass A \' unmatched " and ""\nparticipant "Label" as A \' "example\n@enduml';
  expect(
    diagnosticsForDiagram("class", source).filter((item) => item.message === "Quoted label has an unmatched quote"),
  ).toEqual([]);
  expect(
    diagnosticsForDiagram("sequence", source).filter((item) => item.message === "Quoted label has an unmatched quote"),
  ).toEqual([]);
});

it("does not collapse quotes inside an ambiguous label", () => {
  const source = '@startuml\nclass "Some""other text\n@enduml';
  expect(
    diagnosticsForDiagram("class", source).some((item) => item.message === "Quoted label has an unmatched quote"),
  ).toBe(true);
  expect(
    quickFixesForDiagram("class", source).filter((item) => item.message === "Quoted label has an unmatched quote"),
  ).toEqual([]);
});
