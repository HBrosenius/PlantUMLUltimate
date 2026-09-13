import { describe, expect, it } from "vitest";
import { projectDiagramName } from "./use-single-file-project";

describe("single-file project diagram names", () => {
  it.each([
    ["Roadmap.puml", "Roadmap"],
    ["Domain.plantuml", "Domain"],
    ["Checkout.pumlu", "Checkout"],
    ["Architecture", "Architecture"],
    ["  Plan.puml  ", "Plan"],
  ])("uses %s as the display name %s", (input, expected) => {
    expect(projectDiagramName(input)).toBe(expected);
  });

  it("uses a useful fallback for an extension-only name", () => {
    expect(projectDiagramName(".puml", "Activity diagram")).toBe("Activity diagram");
  });
});
