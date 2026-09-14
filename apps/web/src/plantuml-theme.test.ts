import { describe, expect, it } from "vitest";
import { plantUmlTheme, setPlantUmlTheme } from "./plantuml-theme";

describe("PlantUML themes", () => {
  it("reads a native theme directive", () => {
    expect(plantUmlTheme("@startgantt\n  !theme BlueGray\n@endgantt")).toBe("bluegray");
  });

  it("adds a theme after the start directive", () => {
    expect(setPlantUmlTheme("@startgantt\n[A] lasts 2 days\n@endgantt", "blueprint")).toBe(
      "@startgantt\n!theme blueprint\n[A] lasts 2 days\n@endgantt",
    );
  });

  it("updates an existing theme without duplicating it", () => {
    expect(setPlantUmlTheme("@startgantt\n!theme plain\n[A] lasts 2 days\n@endgantt", "vibrant")).toBe(
      "@startgantt\n!theme vibrant\n[A] lasts 2 days\n@endgantt",
    );
  });

  it("removes a theme while preserving CRLF line endings", () => {
    expect(setPlantUmlTheme("@startgantt\r\n!theme plain\r\n@endgantt", undefined)).toBe("@startgantt\r\n@endgantt");
  });

  it("does not treat remote themes as selectable built-in themes", () => {
    const source = "@startgantt\n!theme custom from https://example.test/themes\n@endgantt";
    expect(plantUmlTheme(source)).toBeUndefined();
    expect(setPlantUmlTheme(source, undefined)).toBe(source);
  });
});
