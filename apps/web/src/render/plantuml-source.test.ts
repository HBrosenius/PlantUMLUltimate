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

  it("blocks every include variant and file, URL or environment builtins", () => {
    const blocked = [
      "!includesub https://example.test/lib.puml!PART",
      "!INCLUDESUB lib.puml!PART",
      "!include_many https://example.test/many.puml",
      "!include_once https://example.test/once.puml",
      "!includedef https://example.test/def.puml",
      "  ! include https://example.test/spaced.puml",
      "!Import https://example.test/archive.zip",
      "!theme spacelab from https://example.test/themes",
      '!$data = %load_json("https://example.test/data.json")',
      '!$secret = %getenv("SECRET")',
      'Alice -> Bob : %GETENV("HOME")',
      'Alice -> Bob : % getenv ("HOME")',
      "title %dirpath() %filename()",
      '!if %file_exists("/etc/passwd")',
    ];
    const source = ["@startuml", ...blocked, "Alice -> Bob : 100% done", "@enduml"].join("\n");
    const rendered = sourceForPlantUmlRenderer(source);
    const lines = rendered.split("\n");
    expect(lines).toHaveLength(source.split("\n").length);
    for (let index = 1; index <= blocked.length; index += 1)
      expect(lines[index]).toBe("' remote resource directive blocked by PlantUML Ultimate");
    expect(rendered).toContain("Alice -> Bob : 100% done");
  });
});
