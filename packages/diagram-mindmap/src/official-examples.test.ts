import { describe, expect, it } from "vitest";
import { officialMindmapExamples } from "./audit-inventory";
import { parseMindmap } from "./parser";

// Review snapshot changes as compatibility changes, not automatic baseline updates. The snapshot is the
// gap inventory: every line of an official example that the model keeps as unknown text.
describe("official PlantUML mindmap examples", () => {
  const examples = officialMindmapExamples();

  it("has the whole corpus", () => {
    expect(examples).toHaveLength(27);
  });

  it("parses every example with no error diagnostic", () => {
    for (const [index, source] of examples.entries()) {
      const errors = parseMindmap(source).diagnostics.filter((item) => item.severity === "error");
      expect(errors, `example ${index + 1}`).toEqual([]);
    }
  });

  it("creates a node for every node line and only for node lines", () => {
    for (const [index, source] of examples.entries()) {
      const document = parseMindmap(source);
      expect(document.nodes.length, `example ${index + 1}`).toBeGreaterThan(0);
      expect(document.roots.length, `example ${index + 1}`).toBeGreaterThan(0);
      // Multi-line labels (examples 5 and 27) hold lines that look like nodes; the count only holds without them.
      if (document.nodes.some((node) => node.label.includes("\n"))) continue;
      // A node line is at the start of a line and never inside <style>.
      const withoutStyle = source.replace(/<style>[\s\S]*?<\/style>/g, "");
      const markerLines = withoutStyle.split("\n").filter((line) => /^\s*(?:[*+-]+|#+)(?:_|\[|\s|:)/.test(line));
      expect(document.nodes.length, `example ${index + 1}`).toBe(markerLines.length);
    }
  });

  it("reads the official features", () => {
    const [, headers, tabs] = examples.map((source) => parseMindmap(source));
    expect(headers!.nodes.every((node) => node.markdown === "header")).toBe(true);
    expect(tabs!.nodes.map((node) => node.depth)).toEqual([1, 2, 3, 3, 2]);
    // Example 6 puts `left side` between `++` and `--` nodes; example 22 writes it before the root.
    const sides = parseMindmap(examples[5]!).nodes.map((node) => [node.label.split("\n")[0], node.side]);
    expect(sides).toEqual([
      ["root", "root"],
      ["right_1.1", "right"],
      ["right_2", "right"],
      ["left_1", "left"],
      ["left_2", "left"],
      ["left_3.1", "left"],
    ]);
    expect(parseMindmap(examples[21]!).nodes.map((node) => node.side)).toEqual([
      "root",
      "left",
      "left",
      "left",
      "left",
      "left",
      "left",
    ]);
    const furniture = parseMindmap(examples[22]!);
    expect([furniture.title?.text, furniture.caption?.text, furniture.header?.text, furniture.footer?.text]).toEqual([
      "My super title",
      "figure 1",
      "My super header",
      "My super footer",
    ]);
    expect(furniture.legend).toMatchObject({ placement: "right", text: "  Short\n  legend" });
    expect(parseMindmap(examples[19]!).direction?.value).toBe("top-to-bottom");
    expect(parseMindmap(examples[20]!).direction?.value).toBe("right-to-left");
    // Official example 5 keeps lines such as `}` and `...` inside its multi-line labels.
    expect(parseMindmap(examples[4]!).nodes.map((node) => node.label.split("\n")[0])).toEqual([
      "Class Templates",
      "Example 1",
      "Example 2",
    ]);
  });

  it("lists the lines kept as unknown text", () => {
    const unknown = Object.fromEntries(
      examples.flatMap((source, index) => {
        const lines = parseMindmap(source).unknown.map((item) => item.text);
        return lines.length > 0 ? [[`example ${index + 1}`, lines]] : [];
      }),
    );
    expect(unknown).toMatchSnapshot();
  });

  it("reports the Markdown-form examples as convertible", () => {
    const markdown = examples
      .map((source, index) => [index + 1, parseMindmap(source).diagnostics.map((item) => item.code)] as const)
      .filter(([, codes]) => codes.includes("markdown-form"))
      .map(([index]) => index);
    expect(markdown).toEqual([2, 3, 10, 13]);
  });
});
