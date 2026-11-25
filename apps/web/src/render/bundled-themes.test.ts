import { describe, expect, it } from "vitest";
import { bundledPlantUmlThemeNames, bundledPlantUmlThemes, loadBundledTheme } from "./bundled-themes";
import { sourceForPlantUmlRenderer } from "./plantuml-source";

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

  it("keeps a theme's own conditionals balanced when it is expanded for the renderer", async () => {
    // carbon-gray tests %getenv in an !if; blocking that line alone would leave its !endif unmatched.
    await loadBundledTheme("carbon-gray");
    const text = sourceForPlantUmlRenderer(
      ["@startgantt", "!theme carbon-gray", "[A] lasts 2 days", '!$x = %getenv("HOME")', "@endgantt"].join("\n"),
    );
    const lines = text.split("\n");
    expect(text).toContain('!if (%getenv("LEGACY") == "true")');
    expect(lines.filter((line) => /^\s*!if\b/.test(line)).length).toBe(
      lines.filter((line) => /^\s*!endif\b/.test(line)).length,
    );
    // The author's own builtin is still blocked.
    expect(text).not.toContain('%getenv("HOME")');
  });
});
