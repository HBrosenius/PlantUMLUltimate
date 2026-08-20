import { describe, expect, it } from "vitest";
import { parseProjectSettings, updateProjectSettings } from "./project-settings";

describe("project settings", () => {
  it("parses scale, calendar ranges, weekdays and display options", () => {
    const value = parseProjectSettings(
      "@startgantt\ntitle Delivery roadmap — 2026\nProject starts 2026-09-01\nprintscale weekly zoom 2\nsaturday are closed\n2026-09-10 to 2026-09-12 are closed\ntoday is colored in #AAF\nhide footbox\n@endgantt",
    );
    expect(value).toMatchObject({
      title: "Delivery roadmap — 2026",
      startDate: "2026-09-01",
      scale: "weekly",
      scaleZoom: "2",
      closedWeekdays: [6],
      highlightToday: true,
      todayColor: "#AAF",
      hideFootbox: true,
    });
    expect(value.dateRules[0]).toMatchObject({ from: "2026-09-10", to: "2026-09-12", state: "closed" });
  });

  it("rewrites only owned directives and preserves comments and tasks", () => {
    const source = "@startgantt\n' keep me\nprintscale daily\n[Build] lasts 2 days\n@endgantt";
    const value = parseProjectSettings(source);
    value.scale = "monthly";
    value.closedWeekdays = [0, 6];
    const changed = updateProjectSettings(source, value);
    expect(changed).toContain("' keep me");
    expect(changed).toContain("[Build] lasts 2 days");
    expect(changed).toContain("printscale monthly\nsunday are closed\nsaturday are closed");
  });

  it("adds and removes the today highlight directive", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n@endgantt";
    const value = parseProjectSettings(source);
    value.highlightToday = true;
    value.todayColor = "LightBlue";
    const highlighted = updateProjectSettings(source, value);
    expect(highlighted).toContain("today is colored in LightBlue");
    const removed = updateProjectSettings(highlighted, { ...value, highlightToday: false });
    expect(removed).not.toContain("today is colored");
  });

  it("adds, updates, and clears a diagram title without touching tasks", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n@endgantt";
    const titled = updateProjectSettings(source, { ...parseProjectSettings(source), title: "Release plan" });
    expect(titled).toContain("title Release plan");
    expect(titled).toContain("[Build] lasts 2 days");
    const updated = updateProjectSettings(titled, { ...parseProjectSettings(titled), title: "Updated plan" });
    expect(updated).toContain("title Updated plan");
    expect(updated).not.toContain("title Release plan");
    expect(updateProjectSettings(updated, { ...parseProjectSettings(updated), title: "" })).not.toContain("title ");
  });

  it("round-trips header, footer, and caption presentation text", () => {
    const source = "@startgantt\nheader Internal plan\nfooter Page %page%\ncaption Delivery dates\n@endgantt";
    const value = parseProjectSettings(source);
    expect(value).toMatchObject({ header: "Internal plan", footer: "Page %page%", caption: "Delivery dates" });
    expect(updateProjectSettings(source, value)).toContain(
      "header Internal plan\nfooter Page %page%\ncaption Delivery dates",
    );
  });

  it("round-trips colored calendar dates", () => {
    const source = "@startgantt\n2026-09-10 to 2026-09-12 are colored in Salmon\n@endgantt";
    const value = parseProjectSettings(source);
    expect(value.dateRules[0]).toMatchObject({
      from: "2026-09-10",
      to: "2026-09-12",
      state: "colored",
      color: "Salmon",
    });
    expect(updateProjectSettings(source, value)).toContain("2026-09-10 to 2026-09-12 are colored in Salmon");
  });
});
