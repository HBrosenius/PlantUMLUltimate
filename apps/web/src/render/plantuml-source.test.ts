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

  it("blocks directives that can load remote resources", () => {
    const source = [
      "@startuml",
      "!includeurl https://example.test/tracking.puml",
      "!include https://example.test/other.puml",
      "!import https://example.test/data.json",
      "!theme plain from https://example.test/themes",
      "Alice -> Bob",
      "@enduml",
    ].join("\n");
    const rendered = sourceForPlantUmlRenderer(source);
    expect(rendered).not.toContain("https://example.test");
    expect(rendered).toContain("Alice -> Bob");
    expect(rendered.split("\n")).toHaveLength(source.split("\n").length);
  });
});
