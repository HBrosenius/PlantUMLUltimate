import { describe, expect, it } from "vitest";
import { bundledPlantUmlThemeNames, bundledPlantUmlThemes, loadBundledTheme } from "./bundled-themes";

describe("bundled PlantUML themes", () => {
  it("knows the official theme names without loading any theme source", () => {
    expect(bundledPlantUmlThemeNames.size).toBeGreaterThanOrEqual(40);
    expect(bundledPlantUmlThemeNames.has("blueprint")).toBe(true);
    expect(bundledPlantUmlThemeNames.has("_none_")).toBe(false);
    expect(bundledPlantUmlThemes.has("blueprint")).toBe(false);
  });

  it("loads a theme on demand without its metadata header and caches it", async () => {
    const theme = await loadBundledTheme("Blueprint");
    expect(theme).toContain('!$BGCOLOR = "#003153"');
    expect(theme).not.toMatch(/^---/);
    expect(bundledPlantUmlThemes.get("blueprint")).toBe(theme);
    await expect(loadBundledTheme("not-a-theme")).resolves.toBeUndefined();
  });

  it("gives WBS and mind map nodes readable colours in themes whose node skinparam hides them", async () => {
    for (const name of ["sketchy-outline", "united", "minty", "spacelab", "spacelab-white"]) {
      const theme = (await loadBundledTheme(name)) ?? "";
      expect(theme, name).toMatch(/wbsDiagram\s*\{\s*node\s*\{[^}]*FontColor/);
      expect(theme, name).toMatch(/mindmapDiagram\s*\{\s*node\s*\{[^}]*FontColor/);
      expect(theme.indexOf("wbsDiagram"), name).toBeGreaterThan(theme.indexOf("skinparam node"));
    }
  });
});
