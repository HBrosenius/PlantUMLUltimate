import { describe, expect, it } from "vitest";
import { sourceForPlantUmlRenderer } from "./plantuml-source";

describe("sourceForPlantUmlRenderer", () => {
  it("removes native note blocks while preserving line count", () => {
    const source = "@startgantt\n[A] lasts 1 day\nnote right\nDetails\nend note\n@endgantt";
    const rendered = sourceForPlantUmlRenderer(source);
    expect(rendered.split("\n")).toHaveLength(source.split("\n").length);
    expect(rendered).not.toContain("note right");
    expect(rendered).not.toContain("Details");
  });

  it("removes shorthand notes before calling the bundled renderer", () => {
    const source = '@startgantt\n[A] happens 2026-09-01\nnote right: Days needed = "?"\n@endgantt';
    const rendered = sourceForPlantUmlRenderer(source);
    expect(rendered).not.toContain("note right:");
    expect(rendered.split("\n")).toHaveLength(source.split("\n").length);
  });
});
