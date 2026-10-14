import { describe, expect, it } from "vitest";
import {
  bundledPlantUmlThemeNames,
  bundledPlantUmlThemes,
  bundledThemeToLoad,
  expandBundledTheme,
  loadBundledTheme,
  prepareBundledTheme,
} from "./bundled-themes";

describe("bundled PlantUML themes", () => {
  it("knows the official theme names without loading any theme source", () => {
    expect(bundledPlantUmlThemeNames.size).toBeGreaterThanOrEqual(40);
    expect(bundledPlantUmlThemeNames.has("blueprint")).toBe(true);
    expect(bundledPlantUmlThemeNames.has("_none_")).toBe(false);
    expect(bundledPlantUmlThemes.has("blueprint")).toBe(false);
  });

  it("loads a theme on demand without its metadata header and caches it", async () => {
    expect(bundledThemeToLoad("@startgantt\n!theme blueprint\n@endgantt")).toBe("blueprint");
    const theme = await loadBundledTheme("Blueprint");
    expect(theme).toContain('!$BGCOLOR = "#003153"');
    expect(theme).not.toMatch(/^---/);
    expect(bundledPlantUmlThemes.get("blueprint")).toBe(theme);
    expect(bundledThemeToLoad("@startgantt\n!theme blueprint\n@endgantt")).toBeUndefined();
    await expect(loadBundledTheme("not-a-theme")).resolves.toBeUndefined();
    expect(bundledThemeToLoad("@startuml\n!theme custom\n@enduml")).toBeUndefined();
  });

  it("gives WBS and mind map nodes readable colours in themes whose node skinparam hides them", async () => {
    for (const name of ["sketchy-outline", "united", "minty", "spacelab", "spacelab-white"]) {
      const theme = (await loadBundledTheme(name)) ?? "";
      expect(theme, name).toMatch(/wbsDiagram\s*\{\s*node\s*\{[^}]*FontColor/);
      expect(theme, name).toMatch(/mindmapDiagram\s*\{\s*node\s*\{[^}]*FontColor/);
      expect(theme.indexOf("wbsDiagram"), name).toBeGreaterThan(theme.indexOf("skinparam node"));
    }
  });

  it("expands a built-in theme at the native directive position once it is loaded", async () => {
    const source = "@startgantt\n!theme blueprint\n[A] lasts 2 days\n@endgantt";
    await prepareBundledTheme(source);
    const expanded = expandBundledTheme(source);
    expect(expanded).toContain("' !theme blueprint expanded locally by PlantUML Ultimate");
    expect(expanded.indexOf('!$BGCOLOR = "#003153"')).toBeLessThan(expanded.indexOf("[A] lasts 2 days"));
  });

  it("leaves unknown and remote themes for the normal safety policy", () => {
    expect(expandBundledTheme("@startuml\n!theme custom\n@enduml")).toBe("@startuml\n!theme custom\n@enduml");
  });
});
