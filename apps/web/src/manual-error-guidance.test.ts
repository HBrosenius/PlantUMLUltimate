import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@codemirror/lint";
import { manualErrorGuidance } from "./manual-error-guidance";
const diagnostic = (message: string): Diagnostic => ({ from: 10, to: 20, severity: "error", message });

describe("manual error guidance", () => {
  it.each([
    ["Quoted label has an unmatched quote", "intended label boundary is ambiguous"],
    ["Diagram has another opening tag before its closing tag", "one diagram or separate diagrams"],
    ["Diagram opening and closing tags do not match", "same diagram suffix"],
    ["Diagram closing tag has no matching opening tag", "matching @startgantt tag"],
    ["Dependency cycle: Build → Test → Build", "intended task order"],
    ["Invalid date", "real calendar date"],
    ["Invalid duration", "intended duration"],
    ["Unknown task Build", "referenced task name"],
    ["Unsupported syntax", "selected diagram type"],
  ])("explains %s without inventing a correction", (message, guidance) => {
    expect(manualErrorGuidance(message.includes("quote") ? "class" : "gantt", diagnostic(message), [])).toContain(
      guidance,
    );
  });
  it("does not claim manual work is needed for a fixable error or a warning", () => {
    const error = diagnostic("Quoted label has an unmatched quote");
    const fix = { from: 10, to: 20, replacement: '"Label"', message: "Add closing quote" };
    expect(manualErrorGuidance("gantt", error, [fix])).toBeUndefined();
    expect(manualErrorGuidance("gantt", { ...error, actions: [{ name: "Fix", apply() {} }] }, [])).toBeUndefined();
    expect(manualErrorGuidance("gantt", { ...error, severity: "warning" }, [])).toBeUndefined();
    expect(
      manualErrorGuidance("gantt", diagnostic("Class block is missing }"), [
        { ...fix, from: 80, to: 80, message: "Close class member block" },
      ]),
    ).toBeUndefined();
  });
  it("keeps guidance for an unfixable error when another line has a fix", () => {
    expect(
      manualErrorGuidance("gantt", diagnostic("Dependency cycle"), [
        { from: 40, to: 45, replacement: "starts", message: "Use starts" },
      ]),
    ).toContain("intended task order");
  });
});

describe("diagram-specific examples", () => {
  it.each([
    ["class", 'class "Order details" as Order', "uml"],
    ["component", 'component "Order details" as Order', "uml"],
    ["sequence", 'participant "Order details" as Order', "uml"],
    ["usecase", 'usecase "Order details" as Order', "uml"],
    ["activity", ":Order details;", "uml"],
    ["gantt", "[Order details] lasts 3 days", "gantt"],
    ["wbs", "* Order details", "wbs"],
  ] as const)("uses %s label syntax and matching tags", (kind, example, suffix) => {
    expect(manualErrorGuidance(kind, diagnostic("Quoted label has an unmatched quote"), [])).toContain(example);
    expect(manualErrorGuidance(kind, diagnostic("Diagram opening and closing tags do not match"), [])).toContain(
      `@start${suffix} and @end${suffix}`,
    );
  });
  it("does not suggest a Gantt duration statement in another diagram", () => {
    expect(manualErrorGuidance("sequence", diagnostic("Invalid duration"), [])).not.toContain("[Build] lasts");
  });
});
