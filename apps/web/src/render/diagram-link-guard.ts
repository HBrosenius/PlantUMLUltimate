const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The external URL a diagram link points to, or undefined when it is not one the app should open. */
export function diagramLinkTarget(anchor: Element, base: string): string | undefined {
  const raw = anchor.getAttribute("href") ?? anchor.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!raw?.trim() || raw.trim().startsWith("#")) return undefined;
  try {
    const url = new URL(raw.trim(), base);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Diagram `[[url]]` links become SVG anchors. Left alone, a click navigates the editor away from
 * unsaved work, or hands the opened page a reference to this window. Intercept every SVG anchor
 * click, confirm the destination, and open it in a separate, unlinked tab.
 */
export function installDiagramLinkGuard(
  target: Pick<Document, "addEventListener" | "removeEventListener"> = document,
  confirmOpen: (url: string) => boolean = (url) => window.confirm(`Open this link from the diagram?\n\n${url}`),
  open: (url: string) => void = (url) => void window.open(url, "_blank", "noopener,noreferrer"),
): () => void {
  const onClick = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || anchor.namespaceURI !== "http://www.w3.org/2000/svg") return;
    event.preventDefault();
    const url = diagramLinkTarget(anchor, location.href);
    if (url && confirmOpen(url)) open(url);
  };
  target.addEventListener("click", onClick, true);
  return () => target.removeEventListener("click", onClick, true);
}
