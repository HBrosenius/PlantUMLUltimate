import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

for (const [kind, suffix, body] of [
  ["gantt", "gantt", "[A] lasts 2 days"],
  ["wbs", "wbs", "* Root"],
  ["sequence", "uml", "Alice -> Bob: Hello"],
  ["class", "uml", "class Order"],
  ["component", "uml", "component Service"],
  ["usecase", "uml", "usecase Login"],
  ["activity", "uml", "start\n:Work;\nstop"],
] as const) {
  for (const missing of ["start", "end", "both"])
    it(`inserts missing ${missing} boundaries for ${kind}`, () => {
      const source =
        (missing === "end" ? `@start${suffix}\n` : "") + body + (missing === "start" ? `\n@end${suffix}` : "");
      const fixes = quickFixesForDiagram(kind, source).filter((fix) => fix.label?.startsWith("Insert @"));
      expect(fixes).toHaveLength(missing === "both" ? 2 : 1);
      expect(
        diagnosticsForDiagram(kind, source).filter((item) => item.message.startsWith("Diagram is missing")),
      ).toHaveLength(fixes.length);
      let repaired = source;
      for (const fix of [...fixes].sort((a, b) => b.from - a.from))
        repaired = repaired.slice(0, fix.from) + fix.replacement + repaired.slice(fix.to);
      expect(repaired).toBe(`@start${suffix}\n${body}\n@end${suffix}`);
      expect(diagnosticsForDiagram(kind, repaired).filter((item) => item.severity === "error")).toEqual([]);
    });
}

it("preserves comments, blank lines and CRLF", () => {
  const source = "\r\n' Header\r\nclass Order\r\n\r\n' Footer\r\n";
  let repaired = source;
  for (const fix of quickFixesForDiagram("class", source)
    .filter((item) => item.label?.startsWith("Insert @"))
    .reverse())
    repaired = repaired.slice(0, fix.from) + fix.replacement + repaired.slice(fix.to);
  expect(repaired).toBe("@startuml\r\n" + source + "@enduml");
});

it("ignores tag examples inside comments and notes", () => {
  const source = "' @startuml\n/'\n@enduml\n'/\nclass Order\nnote left\n@startuml\n@enduml\nend note";
  expect(quickFixesForDiagram("class", source).filter((fix) => fix.label?.startsWith("Insert @"))).toHaveLength(2);
});

it("does not insert duplicate boundaries beside tag typos or foreign diagram types", () => {
  for (const source of ["@stratuml\nclass Order\n@ednuml", "@startjson\n{}\n@endjson", "@startwbs\n* Root\n@endwbs"])
    expect(quickFixesForDiagram("class", source).filter((fix) => fix.label?.startsWith("Insert @"))).toEqual([]);
});

it("keeps empty and comment-only documents quiet", () => {
  for (const source of ["", "\n  \n", "' Example\n/'\nBody\n'/"])
    expect(quickFixesForDiagram("class", source).filter((fix) => fix.label?.startsWith("Insert @"))).toEqual([]);
});
