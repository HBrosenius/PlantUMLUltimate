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
  const svgAnchor = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    return anchor?.namespaceURI === "http://www.w3.org/2000/svg" ? anchor : null;
  };
  const onClick = (event: Event) => {
    const anchor = svgAnchor(event);
    if (!anchor) return;
    event.preventDefault();
    const url = diagramLinkTarget(anchor, location.href);
    if (url) {
      event.stopPropagation();
      if (confirmOpen(url)) open(url);
    }
  };
  const onKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Enter" || !svgAnchor(event)) return;
    // Handle this before preview keyboard handlers can focus or edit source.
    if (event.repeat) {
      event.preventDefault();
      event.stopPropagation();
    } else onClick(event);
  };
  const onMouseUp = (event: Event) => {
    // Safari does not emit auxclick; mouseup is common to all supported browsers.
    if (event instanceof MouseEvent && event.button === 1) onClick(event);
  };
  const onAuxClick = (event: Event) => {
    if (event instanceof MouseEvent && event.button === 1 && svgAnchor(event)) event.preventDefault();
  };
  const onPointerDown = (event: Event) => {
    const anchor = svgAnchor(event);
    if (anchor && diagramLinkTarget(anchor, location.href)) event.stopPropagation();
  };
  target.addEventListener("click", onClick, true);
  target.addEventListener("mouseup", onMouseUp, true);
  target.addEventListener("auxclick", onAuxClick, true);
  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    target.removeEventListener("click", onClick, true);
    target.removeEventListener("mouseup", onMouseUp, true);
    target.removeEventListener("auxclick", onAuxClick, true);
    target.removeEventListener("keydown", onKeyDown, true);
    target.removeEventListener("pointerdown", onPointerDown, true);
  };
}
