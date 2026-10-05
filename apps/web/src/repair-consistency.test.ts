import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

for (const [kind, body, label] of [
  ["sequence", "alt Ready\nAlice -> Bob: Hello\nendd", "Use end"],
  ["activity", "start\nwhile (More?)\n:Work;\nendwhil\nstop", "Use endwhile"],
  ["class", "class A\nnote left of A\nText\nend not", "Use end note"],
] as const)
  it(`offers the ${kind} replacement without an obsolete block insertion`, () => {
    const source = "@startuml\n" + body + "\n@enduml";
    const fixes = quickFixesForDiagram(kind, source);
    expect(fixes.map((fix) => fix.label ?? fix.message)).toEqual([label]);
    expect(diagnosticsForDiagram(kind, source)).toHaveLength(1);
    const fix = fixes[0]!;
    const repaired = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
    expect(quickFixesForDiagram(kind, repaired)).toEqual([]);
    expect(diagnosticsForDiagram(kind, repaired).filter((item) => item.severity === "error")).toEqual([]);
  });

it("retains the insertion for a separate unclosed block", () => {
  const source = "@startuml\nalt First\nAlice -> Bob: Hello\nendd\nloop Second\nAlice -> Bob: Again\n@enduml";
  const fixes = quickFixesForDiagram("sequence", source);
  expect(fixes.some((fix) => fix.label === "Use end")).toBe(true);
  expect(fixes.some((fix) => fix.label === "Close unclosed blocks")).toBe(true);
  expect(diagnosticsForDiagram("sequence", source).some((item) => item.message === "Unclosed alt block")).toBe(false);
});

it("preserves an unrelated error at its original range after a length-changing repair", () => {
  const source = "@startgantt\n[A] lasts 2 days\n[A] starts at [A] end\n[Broken] lasts nope\n@endgantt";
  const diagnostics = diagnosticsForDiagram("gantt", source);
  expect(
    diagnostics.some((item) => item.from === source.indexOf("[Broken]") && item.message.includes("duration")),
  ).toBe(true);
  expect(quickFixesForDiagram("gantt", source).some((fix) => fix.message.includes("possessive"))).toBe(true);
});

it("deduplicates identical missing-boundary insertion suggestions", () => {
  const source = "* Root";
  const fixes = quickFixesForDiagram("wbs", source);
  expect(fixes).toHaveLength(2);
});
