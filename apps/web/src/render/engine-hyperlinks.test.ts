// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { svgHyperlinkRuntime, withSvgHyperlinks } from "./engine-hyperlinks";

interface Graphics {
  bWp: { bB1: number; values: Element[] };
}
function setup() {
  const runtime = new Function(
    "AFZ",
    "Bc",
    "Cl",
    `${svgHyperlinkRuntime}; return {
    open: __plantumlOpenUrl, close: __plantumlCloseUrl,
    group: __plantumlLinkGroup, base: __plantumlBaseGroup
  };`,
  )(
    (value: unknown) => value,
    (list: Graphics["bWp"], index: number) => list.values[index],
    (value: string) => value,
  ) as {
    open(graphics: Graphics, url: { cQJ: string; cHd: string }): void;
    close(graphics: Graphics): void;
    group(graphics: Graphics): Element;
    base(graphics: Graphics): Element;
  };
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const graphics: Graphics = { bWp: { bB1: 1, values: [root] } };
  const draw = (label: string) => {
    const text = document.createElementNS(root.namespaceURI, "text");
    text.textContent = label;
    runtime.group(graphics).appendChild(text);
    return text;
  };
  return { runtime, root, graphics, draw };
}

describe("pinned renderer hyperlink support", () => {
  it("supports the installed engine and rejects changed or duplicate hooks", () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve("@plantuml/core/plantuml.js"), "utf8");
    expect(withSvgHyperlinks(source)).toContain("__plantumlOpenUrl(CCi(a),b)");
    expect(() => withSvgHyperlinks(source + source)).toThrow("Unsupported PlantUML URL fields");
    expect(() => withSvgHyperlinks(source.replace("cQJ=null", "changed=null"))).toThrow(
      "Unsupported PlantUML URL fields",
    );
    expect(() => withSvgHyperlinks(source.replace("ESB=(a,b)=>{return;}", "ESB=(a,b)=>{}"))).toThrow(
      "Unsupported PlantUML hyperlink hooks",
    );
  });

  it("preserves group structure, drawing order and nested destinations without nested anchors", () => {
    const { runtime, root, graphics, draw } = setup();
    runtime.open(graphics, { cQJ: "https://example.test/outer?a=1&b=2", cHd: "Outer <review>" });
    const a = draw("A");
    const group = document.createElementNS(root.namespaceURI, "g");
    group.setAttribute("transform", "translate(4,5)");
    runtime.base(graphics).appendChild(group);
    graphics.bWp.values.push(group);
    graphics.bWp.bB1++;
    const b = draw("B");
    runtime.open(graphics, { cQJ: "https://example.test/inner", cHd: "Inner" });
    const c = draw("C");
    runtime.close(graphics);
    const d = draw("D");
    graphics.bWp.values.pop();
    graphics.bWp.bB1--;
    const e = draw("E");
    runtime.close(graphics);
    const f = draw("F");
    expect(root.querySelector("a a")).toBeNull();
    for (const text of [a, b, d, e])
      expect(text.closest("a")?.getAttribute("href")).toBe("https://example.test/outer?a=1&b=2");
    expect(c.closest("a")?.getAttribute("href")).toBe("https://example.test/inner");
    expect(f.closest("a")).toBeNull();
    expect([...root.querySelectorAll("text")].map((x) => x.textContent).join("")).toBe("ABCDEF");
    expect(group.parentElement).toBe(root);
    expect(group.getAttribute("transform")).toBe("translate(4,5)");
    expect(a.closest("a")?.getAttribute("target")).toBe("_blank");
    expect(a.closest("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(root.querySelector("a title")?.textContent).toBe("Outer <review>");
    expect(root.querySelector("review")).toBeNull();
  });

  it.each([
    ["http://example.test/", true],
    ["https://example.test/", true],
    ["mailto:team@example.test", true],
    ["/relative", true],
    ["#section", true],
    ["javascript:alert(1)", false],
    ["java\nscript:alert(1)", false],
    ["data:text/html,hi", false],
    ["file:///private/file", false],
    ["https://[", false],
    ["", false],
  ])("only creates an anchor for supported destination %j", (href, allowed) => {
    const { runtime, root, graphics, draw } = setup();
    runtime.open(graphics, { cQJ: href as string, cHd: "Destination" });
    draw("Visible label");
    runtime.close(graphics);
    expect(Boolean(root.querySelector("a"))).toBe(allowed);
    expect(root.querySelector("text")?.textContent).toBe("Visible label");
  });
});
