import { describe, expect, it } from "vitest";
import { MAX_CALENDAR_DAYS, shiftIsoDateSafely, validIsoDate } from "./limits";

function originalValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

describe("ISO calendar bounds", () => {
  it("matches Date validation over a complete Gregorian leap-year cycle", () => {
    const mismatches: string[] = [];
    for (let year = 0; year < 400; year += 1) {
      for (let month = 0; month <= 13; month += 1) {
        for (let day = 0; day <= 32; day += 1) {
          const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (validIsoDate(value) !== originalValidIsoDate(value)) mismatches.push(value);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("keeps strict formatting and the four-digit year range", () => {
    for (const value of ["0000-02-29", "2000-02-29", "9999-12-31"]) expect(validIsoDate(value)).toBe(true);
    for (const value of [
      "1900-02-29",
      "2100-02-29",
      "2026-04-31",
      "2026-1-01",
      "2026-01-1",
      "2026/01/01",
      " 2026-01-01",
      "2026-01-01\n",
      "+010000-01-01",
      "-000001-01-01",
      "",
    ])
      expect(validIsoDate(value)).toBe(false);
  });

  it("keeps shifting inside supported dates and day limits", () => {
    expect(shiftIsoDateSafely("2000-02-28", 1)).toBe("2000-02-29");
    expect(shiftIsoDateSafely("1900-02-28", 1)).toBe("1900-03-01");
    expect(shiftIsoDateSafely("0000-01-01", -1)).toBeUndefined();
    expect(shiftIsoDateSafely("9999-12-31", 1)).toBeUndefined();
    expect(shiftIsoDateSafely("2026-02-30", 1)).toBeUndefined();
    expect(shiftIsoDateSafely("2026-01-01", MAX_CALENDAR_DAYS + 1)).toBeUndefined();
    expect(shiftIsoDateSafely("2026-01-01", 0.5)).toBeUndefined();
  });
});
