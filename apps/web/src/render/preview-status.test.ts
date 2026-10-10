import { describe, expect, it } from "vitest";
import type { RenderResult } from "../model";
import { previewStatusLabel } from "./preview-status";

const result: RenderResult = { requestId: 1, source: "valid", documentId: "doc", svg: "<svg/>", durationMs: 1 };
describe("preview status", () => {
  it("identifies the displayed revision while rendering or after failure", () => {
    expect(previewStatusLabel(false, "idle", result, "valid", "doc")).toBe("Preview current");
    expect(previewStatusLabel(false, "rendering", result, "edited", "doc")).toBe("Showing last valid preview");
    expect(previewStatusLabel(false, "error", { ...result, error: "Invalid source" }, "edited", "doc")).toBe(
      "Showing last valid preview",
    );
  });
  it("does not claim an absent or other document's preview is current", () => {
    expect(previewStatusLabel(false, "idle", undefined, "valid", "doc")).toBe("Rendering…");
    expect(previewStatusLabel(false, "rendering", result, "valid", "other")).toBe("Rendering…");
    expect(previewStatusLabel(false, "error", undefined, "invalid", "doc")).toBe("Preview failed");
  });
  it("keeps pause and render errors separate from freshness", () => {
    expect(previewStatusLabel(true, "error", result, "edited", "doc")).toBe("Preview paused");
    expect(previewStatusLabel(false, "error", { ...result, error: "Failed" }, "valid", "doc")).toBe("Preview failed");
  });
});
