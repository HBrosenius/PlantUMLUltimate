import { describe, expect, it } from "vitest";
import { explicitTaskStartStatement } from "./task-inspector-schedule";

describe("explicitTaskStartStatement", () => {
  it("does not materialize an inferred start date during unrelated edits", () => {
    expect(explicitTaskStartStatement("2026-09-01", "2026-09-01", false)).toBeUndefined();
  });

  it("keeps existing explicit dates and newly selected dates", () => {
    expect(explicitTaskStartStatement("2026-09-01", "2026-09-01", true)).toBe("starts 2026-09-01");
    expect(explicitTaskStartStatement("2026-09-03", "2026-09-01", false)).toBe("starts 2026-09-03");
  });
});
