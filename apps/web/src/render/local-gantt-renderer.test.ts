import { describe, expect, it } from "vitest";
import { renderLocalGantt } from "./local-gantt-renderer";

describe("renderLocalGantt", () => {
  it("renders task names and durations", () => {
    const svg = renderLocalGantt("@startgantt\n[Design] lasts 4 days\n@endgantt");
    expect(svg).toContain("Design");
    expect(svg).toContain("4d");
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-task-id="design"');
  });

  it("preserves safety when labels contain markup", () => {
    const svg = renderLocalGantt("@startgantt\n[Design & <Build>] lasts 2 days\n@endgantt");
    expect(svg).toContain("Design &amp; &lt;Build&gt;");
    expect(svg).not.toContain("[Design & <Build>]");
  });

  it("rejects an incomplete document without crashing the worker contract", () => {
    expect(() => renderLocalGantt("@startgantt\n[Design] lasts 4 days")).toThrow("Expected @endgantt");
  });

  it("renders end-to-end constraints as valid Gantt syntax", () => {
    const svg = renderLocalGantt(`@startgantt
[Testing] lasts 5 days
[Init and write tests report] ends at [Testing]'s end
@endgantt`);
    expect(svg).toContain("Init and write tests report");
    expect(svg).toContain('data-dependency-index="0"');
  });
});
