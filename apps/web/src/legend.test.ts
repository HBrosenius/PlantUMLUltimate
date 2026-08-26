import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseLegendEntries, removeLegend, synchronizeLegend } from "./legend";

describe("automatic legend", () => {
  it("adds each used color once and preserves unrelated source", () => {
    const source =
      "@startgantt\n' keep\n[A] lasts 1 day\n[A] is colored in Blue\n[B] lasts 1 day\n[B] is colored in Blue\n[C] is colored in Orange\n@endgantt";
    const changed = synchronizeLegend(source, parseGantt(source).document.tasks);
    expect(changed).toContain("' keep");
    expect(changed.match(/<#Blue>/g)).toHaveLength(1);
    expect(changed).toContain("|= Color |= Task Type |");
    expect(changed).toContain("|<#Orange> | Orange |");
  });

  it("keeps manual legend information and labels while removing unused color rows", () => {
    const source =
      "@startgantt\n[A] is colored in Blue\nlegend\nManual heading\n|<#Blue> | Delivery |\n|<#Red> | Obsolete |\nendlegend\n@endgantt";
    const changed = synchronizeLegend(source, parseGantt(source).document.tasks);
    expect(changed).toContain("Manual heading");
    expect(changed).toContain("|<#Blue> | Delivery |");
    expect(changed).not.toContain("Obsolete");
    expect(changed.match(/\|= Color \|= Task Type \|/g)).toHaveLength(1);
    expect(parseLegendEntries(changed)).toEqual([{ color: "Blue", label: "Delivery" }]);
  });

  it("removes the legend block when display is disabled", () => {
    const source = "@startgantt\n[A] is colored in Blue\nlegend\n|<#Blue> | Delivery |\nendlegend\n@endgantt";
    const changed = removeLegend(source);
    expect(changed).toContain("[A] is colored in Blue");
    expect(changed).not.toContain("legend");
  });
});
