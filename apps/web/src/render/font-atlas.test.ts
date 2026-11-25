import { describe, expect, it } from "vitest";
import { withoutSpriteData } from "./font-atlas";

describe("withoutSpriteData", () => {
  it("drops grayscale sprite rows and SVG sprite markup but keeps the diagram text", () => {
    const source = [
      "@startuml",
      "sprite $a [4x2/16] {",
      "0F0F",
      "F0F0",
      "}",
      'sprite $b <svg viewBox="0 0 4 4">',
      '<circle cx="2" cy="2" r="2"/>',
      "</svg>",
      'rectangle "<$a> hello" as R',
      "@enduml",
    ].join("\n");
    const text = withoutSpriteData(source);
    expect(text).toContain('rectangle "<$a> hello" as R');
    expect(text).not.toMatch(/0F0F|F0F0|circle|viewBox/);
  });

  it("leaves sources without sprites untouched", () => {
    const source = "@startuml\nA -> B\n@enduml";
    expect(withoutSpriteData(source)).toBe(source);
  });
});
