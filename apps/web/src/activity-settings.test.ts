import { describe, expect, it } from "vitest";
import { parseActivitySettings, updateActivitySettings } from "./activity-settings";

describe("Activity settings", () => {
  it("round-trips managed settings and preserves unrelated source", () => {
    const source = "@startuml\n' keep\nstart\nstop\n@enduml";
    const updated = updateActivitySettings(source, {
      ...parseActivitySettings(source),
      title: "Order workflow",
      shadowing: false,
      activityBackgroundColor: "LightBlue",
    });
    expect(updated).toContain("title Order workflow");
    expect(updated).toContain("skinparam shadowing false");
    expect(updated).toContain("skinparam activityBackgroundColor LightBlue");
    expect(updated).toContain("' keep\nstart");
    expect(parseActivitySettings(updated)).toMatchObject({ title: "Order workflow", shadowing: false });
  });
});
