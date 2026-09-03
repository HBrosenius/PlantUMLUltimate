import { describe, expect, it } from "vitest";
import { colorFieldBackground } from "./color-field-utils";

describe("colorFieldBackground", () => {
  it("returns undefined for an empty or blank value", () => {
    expect(colorFieldBackground("")).toBeUndefined();
    expect(colorFieldBackground("   ")).toBeUndefined();
  });

  it("passes bare color names and real hex codes straight through", () => {
    expect(colorFieldBackground("Orange")).toBe("Orange");
    expect(colorFieldBackground("#f97316")).toBe("#f97316");
    expect(colorFieldBackground("#AAF")).toBe("#AAF");
    expect(colorFieldBackground("  Orange  ")).toBe("Orange");
  });

  it("strips a '#' prefix from a named color, since CSS only accepts '#' before hex digits", () => {
    expect(colorFieldBackground("#Orange")).toBe("Orange");
    expect(colorFieldBackground("#LightBlue")).toBe("LightBlue");
  });

  it("renders a two-tone 'Color/Color' value as a CSS gradient", () => {
    expect(colorFieldBackground("Lavender/LightBlue")).toBe("linear-gradient(135deg, Lavender 50%, LightBlue 50%)");
    expect(colorFieldBackground("#Coral/#Green")).toBe("linear-gradient(135deg, Coral 50%, Green 50%)");
  });
});
