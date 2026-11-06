import { describe, expect, it } from "vitest";
import { recolorPaint, recolorSvgForStage } from "./stage-recolor";

const tokens = { surface: "#191c23", ink: "#e7eaf0" };

describe("stage SVG recolouring", () => {
  it("maps near-white to the surface and near-black to the foreground", () => {
    expect(recolorPaint("#FFFFFF", tokens)).toBe("#191c23");
    expect(recolorPaint("white", tokens)).toBe("#191c23");
    expect(recolorPaint("#fefefe", tokens)).toBe("#191c23");
    expect(recolorPaint("#000000", tokens)).toBe("#e7eaf0");
    expect(recolorPaint("rgb(24, 24, 24)", tokens)).toBe("#e7eaf0");
  });

  it("keeps saturated, mid-tone and non-colour paint", () => {
    expect(recolorPaint("#3b82f6", tokens)).toBeUndefined();
    expect(recolorPaint("#ff0000", tokens)).toBeUndefined();
    expect(recolorPaint("#808080", tokens)).toBeUndefined();
    expect(recolorPaint("none", tokens)).toBeUndefined();
    expect(recolorPaint("url(#grad)", tokens)).toBeUndefined();
    expect(recolorPaint("currentColor", tokens)).toBeUndefined();
  });

  it("lifts light greys slightly from the surface", () => {
    const lifted = recolorPaint("#f1f1f1", tokens);
    expect(lifted).toMatch(/^#[0-9a-f]{6}$/);
    expect(lifted).not.toBe("#191c23");
  });

  it("rewrites attributes, style declarations and style blocks", () => {
    const svg =
      '<svg><style>.a{fill:#FFFFFF;stroke-width:2}</style><rect fill="#ffffff" stroke="#000000" x="1"/>' +
      '<text style="fill:#181818;font-size:12px" fill-opacity="1">T</text><rect fill="#D0D0F8"/><path fill="#22aa44"/></svg>';
    const out = recolorSvgForStage(svg, tokens);
    expect(out).toContain(".a{fill:#191c23;stroke-width:2}");
    expect(out).toContain('<rect fill="#191c23" stroke="#e7eaf0" x="1"/>');
    expect(out).toContain("fill:#e7eaf0;font-size:12px");
    expect(out).toContain('<rect fill="#D0D0F8"/>');
    expect(out).toContain('fill="#22aa44"');
  });

  it("keeps text readable on fills the recolouring leaves alone", () => {
    // Black text on a saturated blue bar: the foreground token would be too faint, so the dark surface is used.
    const bar =
      '<svg><rect fill="#2A9FD6" x="2" y="53" width="54" height="27"/><text x="6" y="71" font-size="12" fill="#000000">Plan</text></svg>';
    expect(recolorSvgForStage(bar, tokens)).toContain('font-size="12" fill="#191c23">Plan');
    // A theme's white label on a mid-dark fill keeps a light colour.
    const label =
      '<svg><rect fill="#555555" x="0" y="0" width="80" height="30"/><text x="4" y="20" font-size="12" fill="#ffffff">Tu</text></svg>';
    expect(recolorSvgForStage(label, tokens)).toContain('fill="#e7eaf0"');
    // Dark-grey text on a lifted light-grey band (a Bootstrap-style theme) becomes light.
    const band =
      '<svg><rect fill="#f8f9fa" x="0" y="0" width="80" height="30"/><text x="4" y="20" font-size="12" fill="#343a40">We</text></svg>';
    expect(recolorSvgForStage(band, tokens)).toContain('fill="#e7eaf0"');
  });

  it("uses the group fill for text without its own and ignores arrowheads as backgrounds", () => {
    const inherited = '<svg><g fill="#343a40"><text x="4" y="20" font-size="12">Order</text></g></svg>';
    expect(recolorSvgForStage(inherited, tokens)).toContain('<text fill="#e7eaf0" x="4"');
    const arrow =
      '<svg><polygon points="0,0 10,5 0,10 4,5" stroke="#000000" fill="#000000"/><text x="2" y="6" font-size="13" fill="#000000">Request</text></svg>';
    expect(recolorSvgForStage(arrow, tokens)).toContain('font-size="13" fill="#e7eaf0">Request');
  });

  it("turns dark-grey outlines into the foreground colour but keeps mid greys", () => {
    expect(recolorPaint("#343a40", tokens, "stroke")).toBe("#e7eaf0");
    expect(recolorPaint("#343a40", tokens, "fill")).toBeUndefined();
    expect(recolorPaint("#808080", tokens, "stroke")).toBeUndefined();
  });

  it("changes paint only: geometry and structure are identical", () => {
    const svg = '<svg width="10" height="5"><rect x="1" y="2" width="3" height="4" fill="#fff" stroke="#000"/></svg>';
    const strip = (value: string) => value.replace(/(fill|stroke)="[^"]*"/g, "");
    expect(strip(recolorSvgForStage(svg, tokens))).toBe(strip(svg));
  });
});
