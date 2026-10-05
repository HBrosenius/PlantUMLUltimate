import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

for (const kind of ["gantt", "wbs", "sequence", "class", "component", "usecase", "activity"] as const) {
  const suffix = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
  const other = suffix === "uml" ? "gantt" : "uml";
  const valid = `@start${suffix} output\n' Body\n@end${suffix}`;
  for (const [name, source] of [
    ["mismatched end", valid.replace(`@end${suffix}`, `@end${other}`)],
    ["mismatched start", valid.replace(`@start${suffix}`, `@start${other}`)],
    ["duplicated start", valid.replace(`@start${suffix} output`, `@start${suffix} output\n@start${suffix} output`)],
    ["duplicated end", valid + `\n@end${suffix}`],
    ["reversed", `@end${suffix}\n' Body\n@start${suffix} output`],
  ]) {
    it(`repairs ${kind} ${name}`, () => {
      expect(diagnosticsForDiagram(kind, source!).some((item) => item.severity === "error")).toBe(true);
      expect(
        quickFixesForDiagram(kind, source!).some(
          (fix) =>
            source!.slice(0, fix.from) + fix.replacement + source!.slice(fix.to) === valid ||
            source!.slice(0, fix.from) + fix.replacement + source!.slice(fix.to) === valid + "\n",
        ),
      ).toBe(true);
    });
  }
}

it("leaves multiple complete diagrams unchanged", () => {
  const source = "@startuml one\nclass A\n@enduml\n@startuml two\nclass B\n@enduml";
  expect(quickFixesForDiagram("class", source)).toEqual([]);
  expect(diagnosticsForDiagram("class", source).filter((item) => item.severity === "error")).toEqual([]);
});

it("flags separated opening tags without deleting possible diagram content", () => {
  const source = "@startuml one\nclass A\n@startuml two\nclass B\n@enduml";
  expect(diagnosticsForDiagram("class", source).some((item) => item.message.includes("another opening tag"))).toBe(
    true,
  );
  expect(quickFixesForDiagram("class", source).filter((item) => item.label?.includes("duplicated"))).toEqual([]);
});

it("ignores comment and note examples", () => {
  const source =
    "@startuml\n' @startgantt\n/'\n@endwbs\n'/\nnote left\n@endgantt\n@startwbs\nend note\nclass A\n@enduml";
  expect(quickFixesForDiagram("class", source)).toEqual([]);
});

it("preserves CRLF, tag arguments and surrounding comments when reversing tags", () => {
  const source = "' Header\r\n@enduml\r\nclass A\r\n@startuml output\r\n' Footer";
  const fix = quickFixesForDiagram("class", source).find(
    (item) => item.label === "Move opening tag before closing tag",
  )!;
  expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(
    "' Header\r\n@startuml output\r\nclass A\r\n@enduml\r\n' Footer",
  );
});

it("preserves complete mixed diagram blocks", () => {
  const source = "@startuml\nclass A\n@enduml\n@startwbs\n* Root\n@endwbs";
  expect(
    quickFixesForDiagram("class", source).filter(
      (item) => item.message.includes("tags") || item.message.includes("opening tag"),
    ),
  ).toEqual([]);
});

it("does not guess a mismatched tag when multiple openings make pairing ambiguous", () => {
  const source = "@startgantt\n[A] lasts 1 day\n@startuml\nclass A\n@enduml";
  expect(
    quickFixesForDiagram("gantt", source).filter(
      (item) => item.message === "Diagram opening and closing tags do not match",
    ),
  ).toEqual([]);
});
