import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@codemirror/lint";
import { errorLocations, nextErrorIndex } from "./error-navigation";
const error = (from: number, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
  from,
  to: from + 2,
  severity,
  message: "Fault",
});

describe("source error navigation", () => {
  it("sorts distinct error locations and skips warnings and repair alternatives", () => {
    expect(errorLocations([error(20), error(5, "warning"), error(10), error(20)]).map((item) => item.from)).toEqual([
      10, 20,
    ]);
  });
  it("moves past the current location in both directions and wraps", () => {
    const errors = [error(10), error(20)];
    expect(nextErrorIndex(errors, 0, 1)).toBe(0);
    expect(nextErrorIndex(errors, 10, 1)).toBe(1);
    expect(nextErrorIndex(errors, 20, 1)).toBe(0);
    expect(nextErrorIndex(errors, 20, -1)).toBe(0);
    expect(nextErrorIndex(errors, 10, -1)).toBe(1);
    expect(nextErrorIndex(errors, 15, -1)).toBe(0);
  });
  it("handles a single error and an empty document", () => {
    expect(nextErrorIndex([error(0)], 0, 1)).toBe(0);
    expect(nextErrorIndex([error(0)], 0, -1)).toBe(0);
    expect(nextErrorIndex([], 0, 1)).toBe(-1);
    expect(nextErrorIndex([], 0, -1)).toBe(-1);
  });
});
