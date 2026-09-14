import { describe, expect, it } from "vitest";
import { bundledPlantUmlThemes, expandBundledTheme } from "./bundled-themes";

describe("bundled PlantUML themes", () => {
  it("bundles the official themes without their metadata headers", () => {
    expect(bundledPlantUmlThemes.size).toBeGreaterThanOrEqual(40);
    expect(bundledPlantUmlThemes.get("blueprint")).toContain('!$BGCOLOR = "#003153"');
    expect(bundledPlantUmlThemes.get("blueprint")).not.toMatch(/^---/);
  });

  it("expands a built-in theme at the native directive position", () => {
    const expanded = expandBundledTheme("@startgantt\n!theme blueprint\n[A] lasts 2 days\n@endgantt");
    expect(expanded).toContain("' !theme blueprint expanded locally by PlantUML Ultimate");
    expect(expanded.indexOf('!$BGCOLOR = "#003153"')).toBeLessThan(expanded.indexOf("[A] lasts 2 days"));
  });

  it("leaves unknown and remote themes for the normal safety policy", () => {
    expect(expandBundledTheme("@startuml\n!theme custom\n@enduml")).toBe("@startuml\n!theme custom\n@enduml");
  });
});
