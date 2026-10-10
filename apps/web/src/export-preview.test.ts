// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  defaultExportOptions,
  encodedDiagramUrl,
  exportPreferencesKey,
  loadExportOptions,
  prepareExportSvg,
} from "./export-preview";
describe("export preview", () => {
  it("retains nonzero viewBox bounds and adds margins without cropping", () => {
    const output = prepareExportSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 120 80"><text x="10" y="30">Hello</text></svg>',
      { ...defaultExportOptions, margin: 32 },
    );
    expect(output.width).toBe(184);
    expect(output.height).toBe(144);
    const root = new DOMParser().parseFromString(output.svg, "image/svg+xml").documentElement;
    expect(root.querySelector("svg")?.getAttribute("viewBox")).toBe("10 20 120 80");
    expect(root.querySelector("svg")?.getAttribute("x")).toBe("32");
    expect(root.textContent).toContain("Hello");
  });
  it("uses white behind authored fills for PDF and rejects absent dimensions", () => {
    const out = prepareExportSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect fill="red" width="10" height="10"/></svg>',
      { ...defaultExportOptions, format: "pdf" },
    );
    expect(out.svg).toContain('fill="#ffffff"');
    expect(out.svg).toContain('fill="red"');
    expect(() => prepareExportSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', defaultExportOptions)).toThrow();
  });
  it("validates persisted options", () => {
    localStorage.setItem(exportPreferencesKey, JSON.stringify({ ...defaultExportOptions, scale: 999 }));
    expect(loadExportOptions()).toEqual(defaultExportOptions);
  });
  it("encodes Unicode source losslessly and rejects unsafe endpoints and long URLs", () => {
    const source = "@startuml\nAlice -> Bob: Å 🌱\n@enduml";
    const url = encodedDiagramUrl(source, "https://example.com/plantuml/");
    const hex = url.split("~h")[1]!;
    expect(new TextDecoder().decode(Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16)))).toBe(source);
    for (const server of [
      "http://example.com",
      "https://user:secret@example.com",
      "javascript:alert(1)",
      "https://example.com?x=1",
    ])
      expect(() => encodedDiagramUrl(source, server)).toThrow();
    expect(() => encodedDiagramUrl("x".repeat(4000), "https://example.com")).toThrow(/long URL/);
  });
});
