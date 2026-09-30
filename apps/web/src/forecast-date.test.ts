import { describe, expect, it } from "vitest";
import { forecastToday, validForecastTimeZone } from "./forecast-date";

describe("forecast status date", () => {
  it("uses the document time zone at a date boundary", () => {
    const instant = new Date("2026-09-29T23:30:00Z");
    expect(forecastToday("UTC", instant)).toBe("2026-09-29");
    expect(forecastToday("Europe/Stockholm", instant)).toBe("2026-09-30");
    expect(forecastToday("America/Los_Angeles", instant)).toBe("2026-09-29");
  });

  it("rejects invalid time zones and falls back to UTC", () => {
    expect(validForecastTimeZone("Europe/Stockholm")).toBe(true);
    expect(validForecastTimeZone("Made/Up")).toBe(false);
    expect(forecastToday("Made/Up", new Date("2026-09-29T23:30:00Z"))).toBe("2026-09-29");
  });
});
