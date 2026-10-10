// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER_EXAMPLES } from "./starter-examples";
import {
  PERSONAL_STARTERS_KEY,
  defaultStarterChoices,
  exportPersonalStarters,
  importPersonalStarters,
  loadPersonalStarters,
  prepareStarterSource,
  removePersonalStarter,
  savePersonalStarter,
} from "./personal-starters";

const source = `@startgantt
!theme cerulean
Project starts 2026-09-01
[Build] as [build] on {Morgan} starts 2026-09-02
[Build] lasts 3 days
[Build] links to [[https://example.com Details]]
@endgantt`;
const starter = { title: "Delivery", description: "Reusable plan", kind: "gantt" as const, source };
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("personal starter library", () => {
  it("saves every supported diagram family and round-trips portable source without application identities", () => {
    for (const kind of ["gantt", "wbs", "sequence", "class", "component", "activity", "usecase"] as const) {
      const example = STARTER_EXAMPLES.find((item) => item.kind === kind)!;
      savePersonalStarter({ title: example.title, description: example.description, kind, source: example.source });
    }
    const saved = loadPersonalStarters();
    const text = exportPersonalStarters(saved);
    expect(JSON.parse(text).starters[0].id).toBeUndefined();
    const imported = importPersonalStarters(text);
    expect(imported).toHaveLength(14);
    expect(imported[7]!.id).not.toBe(saved[0]!.id);
    expect(imported[7]!.source).toBe(saved[0]!.source);
    expect(loadPersonalStarters()[0]!.id).toBe(saved[0]!.id);
    removePersonalStarter(saved[0]!.id);
    expect(loadPersonalStarters()).toHaveLength(13);
  });

  it("reviews project start, assignments and links without moving fixed dates or changing styles", () => {
    const next = prepareStarterSource("gantt", source, {
      keepResources: false,
      keepLinks: false,
      projectStart: "2027-01-04",
    });
    expect(next).toContain("Project starts 2027-01-04");
    expect(next).toContain("starts 2026-09-02");
    expect(next).toContain("!theme cerulean");
    expect(next).not.toContain("Morgan");
    expect(next).not.toContain("https://example.com");
    expect(prepareStarterSource("gantt", source, defaultStarterChoices)).toBe(source);
  });

  it("validates all imported entries before writing and preserves the existing library on error", () => {
    savePersonalStarter(starter);
    const previous = localStorage.getItem(PERSONAL_STARTERS_KEY);
    const invalid = JSON.stringify({
      format: "plantuml-ultimate-starters",
      version: 1,
      starters: [starter, { ...starter, source: "not a diagram" }],
    });
    expect(() => importPersonalStarters(invalid)).toThrow();
    expect(localStorage.getItem(PERSONAL_STARTERS_KEY)).toBe(previous);
    expect(() => importPersonalStarters('{"version":2}')).toThrow();
    expect(() => importPersonalStarters("x".repeat(2_000_001))).toThrow(/2 MB/);
    expect(() => savePersonalStarter({ ...starter, title: "" })).toThrow();
    expect(localStorage.getItem(PERSONAL_STARTERS_KEY)).toBe(previous);
  });

  it("reports storage failure without changing the previously saved library", () => {
    savePersonalStarter(starter);
    const previous = localStorage.getItem(PERSONAL_STARTERS_KEY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => savePersonalStarter(starter)).toThrow(/browser could not save/);
    expect(localStorage.getItem(PERSONAL_STARTERS_KEY)).toBe(previous);
  });
});
