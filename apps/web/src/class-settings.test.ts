import { describe, expect, it } from "vitest";
import { parseClassSettings, updateClassSettings } from "./class-settings";

describe("Class settings", () => {
  it("round-trips managed settings without rewriting unrelated source", () => {
    const source = "@startuml\n' keep me\nclass Order\n@enduml";
    const updated = updateClassSettings(source, {
      ...parseClassSettings(source),
      direction: "left-to-right",
      title: "Domain model",
      hideEmptyMethods: true,
      classBackgroundColor: "LightBlue",
    });
    expect(updated).toContain("left to right direction");
    expect(updated).toContain("title Domain model");
    expect(updated).toContain("hide empty methods");
    expect(updated).toContain("skinparam classBackgroundColor LightBlue");
    expect(updated).toContain("' keep me\nclass Order");
    expect(parseClassSettings(updated)).toMatchObject({
      direction: "left-to-right",
      title: "Domain model",
      hideEmptyMethods: true,
      classBackgroundColor: "LightBlue",
    });
  });
});
