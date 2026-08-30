import { describe, expect, it } from "vitest";
import { isInstalledDisplayMode } from "./pwa";

describe("isInstalledDisplayMode", () => {
  it("recognizes a standalone desktop PWA window", () => {
    expect(isInstalledDisplayMode(true, false)).toBe(true);
  });

  it("recognizes the iOS standalone navigator flag", () => {
    expect(isInstalledDisplayMode(false, true)).toBe(true);
  });

  it("does not treat a regular browser tab as installed display mode", () => {
    expect(isInstalledDisplayMode(false, false)).toBe(false);
  });
});
