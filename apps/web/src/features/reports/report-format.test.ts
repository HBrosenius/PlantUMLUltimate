import { describe, expect, it, vi } from "vitest";
import { reportDate } from "./report-format";
import { reportWording, saveReportWording } from "./report-preferences";
import { defaultIntroduction } from "./report-model";

describe("report preferences and local dates", () => {
  it("uses Swedish and US local date formats without shifting date-only values", () => {
    expect(reportDate("2026-10-08", "sv-SE")).toBe("2026-10-08");
    expect(reportDate("2026-10-08", "en-US")).toBe("10/08/2026");
    expect(reportDate("2024-02-29", "sv-SE")).toBe("2024-02-29");
    expect(reportDate(undefined, "sv-SE")).toBe("Unknown");
  });
  it("defaults to the browser locale", () => {
    vi.stubGlobal("navigator", { language: "sv-SE" });
    try {
      expect(reportDate("2026-10-08")).toBe("2026-10-08");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("remains usable when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Blocked");
      },
      setItem() {
        throw new Error("Blocked");
      },
    });
    try {
      expect(reportWording().introduction).toBe(defaultIntroduction);
      expect(() => saveReportWording("introduction", "New request")).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
