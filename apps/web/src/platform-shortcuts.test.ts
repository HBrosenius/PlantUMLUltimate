import { describe, expect, it } from "vitest";
import { isApplePlatform, optionShortcut } from "./platform-shortcuts";

describe("platform shortcut labels", () => {
  it("uses native Option notation on Apple platforms", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(optionShortcut("t", true)).toBe("⌥T");
  });

  it("uses Alt notation on other platforms", () => {
    expect(isApplePlatform("Win32")).toBe(false);
    expect(optionShortcut("m", false)).toBe("Alt+M");
  });
});
