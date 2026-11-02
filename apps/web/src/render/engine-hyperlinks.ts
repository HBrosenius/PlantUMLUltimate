/**
 * @plantuml/core 1.2026.6 leaves UGraphicTeaVM.startUrl/closeUrl empty:
 * https://github.com/plantuml/plantuml/blob/v1.2026.6/src/main/java/net/sourceforge/plantuml/teavm/UGraphicTeaVM.java
 * Supply those callbacks at the pinned engine boundary, using its actual URL
 * objects and drawing groups rather than guessing link locations from labels.
 */
export const svgHyperlinkRuntime = `
const __plantumlUrlStacks = new WeakMap();
const __plantumlBaseGroup = graphics => {
  const groups = graphics.bWp;
  return AFZ(Bc(groups, groups.bB1 - 1));
};
const __plantumlOpenUrl = (graphics, url) => {
  const stack = __plantumlUrlStacks.get(graphics) || [];
  stack.push({ href: Cl(url.cQJ), title: Cl(url.cHd), segment: null });
  __plantumlUrlStacks.set(graphics, stack);
};
const __plantumlCloseUrl = graphics => {
  const stack = __plantumlUrlStacks.get(graphics);
  if (!stack) return;
  stack.pop();
  if (!stack.length) __plantumlUrlStacks.delete(graphics);
  else stack[stack.length - 1].segment = null;
};
const __plantumlLinkGroup = graphics => {
  const parent = __plantumlBaseGroup(graphics);
  const stack = __plantumlUrlStacks.get(graphics);
  const link = stack && stack[stack.length - 1];
  if (!link) return parent;
  if (link.segment && link.segment.parentNode === parent) return link.segment;
  let allowed = false;
  try {
    allowed = Boolean(link.href && link.href.trim()) && ["http:", "https:", "mailto:"].includes(new globalThis.URL(link.href, "https://plantuml.invalid/").protocol);
  } catch { /* Invalid destinations remain ordinary graphics. */ }
  const element = document.createElementNS("http://www.w3.org/2000/svg", allowed ? "a" : "g");
  if (allowed) {
    element.setAttribute("href", link.href);
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", link.title || link.href);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = link.title || link.href;
    element.appendChild(title);
  }
  parent.appendChild(element);
  link.segment = element;
  return element;
};
`;

export function withSvgHyperlinks(source: string): string {
  const replacements = [
    ["UL=a=>{let b;b=a.bWp;return AFZ(Bc(b,b.bB1-1|0));}", "UL=a=>__plantumlLinkGroup(a)"],
    // Structural groups stay outside link segments, avoiding nested anchors.
    ["(UL(c)).appendChild(e);b=c.bWp;c=AU5(e);", "(__plantumlBaseGroup(c)).appendChild(e);b=c.bWp;c=AU5(e);"],
    [
      "ESB=(a,b)=>{return;},Es$=a=>{return;}",
      "ESB=(a,b)=>{__plantumlOpenUrl(CCi(a),b);},Es$=a=>{__plantumlCloseUrl(CCi(a));}",
    ],
  ] as const;
  if (source.split("a.cQJ=null;a.cHd=null;a.cik=null;").length !== 2)
    throw new Error("Unsupported PlantUML URL fields; review the engine adapter before upgrading");
  for (const [target, replacement] of replacements) {
    if (source.split(target).length !== 2)
      throw new Error("Unsupported PlantUML hyperlink hooks; review the engine adapter before upgrading");
    source = source.replace(target, replacement);
  }
  return `${svgHyperlinkRuntime}\n${source}`;
}
