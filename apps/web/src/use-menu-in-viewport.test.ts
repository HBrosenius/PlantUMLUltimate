import { describe, expect, it } from "vitest";
import { placeInViewport } from "./use-menu-in-viewport";

const viewport = { width: 1000, height: 600 };
const menu = { width: 200, height: 160 };

describe("placeInViewport", () => {
  it("opens at the pointer when the menu fits", () => {
    expect(placeInViewport(100, 120, menu, viewport)).toEqual({ left: 100, top: 120 });
  });

  it("moves up near the bottom edge and left near the right edge", () => {
    expect(placeInViewport(950, 580, menu, viewport)).toEqual({ left: 792, top: 432 });
  });

  it("never goes above or left of the margin, even when the menu is taller than the window", () => {
    expect(placeInViewport(-20, 50, { width: 200, height: 900 }, viewport)).toEqual({ left: 8, top: 8 });
  });
});
