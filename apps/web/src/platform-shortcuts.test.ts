import { describe, expect, it } from "vitest";
import { isApplePlatform, modShortcut, optionShortcut } from "./platform-shortcuts";

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

describe("modifier shortcut labels", () => {
  it("uses Command notation on Apple platforms", () => {
    expect(modShortcut("z", true, true)).toBe("⇧⌘Z");
    expect(modShortcut("1", false, true)).toBe("⌘1");
  });

  it("uses Ctrl notation on other platforms", () => {
    expect(modShortcut("s", false, false)).toBe("Ctrl+S");
    expect(modShortcut("z", true, false)).toBe("Ctrl+Shift+Z");
  });
});
