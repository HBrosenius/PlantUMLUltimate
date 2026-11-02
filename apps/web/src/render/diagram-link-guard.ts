import { showDiagramLinkMenu } from "./diagram-link-menu";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export interface DiagramLinkActions {
  url: string;
  origin: Element;
  x: number;
  y: number;
  openSettings?: (() => void) | undefined;
  openUrl: () => void;
}

// The settings choice reuses the preview's existing selection handler without navigating.
const settingsClicks = new WeakSet<Event>();
const settingsSelector =
  "[data-task-id], [data-class-object-id], [data-class-hit-id], [data-sequence-participant-id], [data-sequence-message-id], [data-sequence-structure-id], [data-wbs-node-id], [data-wbs-relationship-id], [data-usecase-object-id]";

function settingsTarget(origin: Element, anchor: Element): Element | undefined {
  if (origin.closest('[aria-disabled="true"]')) return undefined;
  const visualTask = origin.closest("[data-visual-task-id]") ?? anchor.querySelector("[data-visual-task-id]");
  const taskId = visualTask?.getAttribute("data-visual-task-id");
  if (taskId) return anchor.closest("svg")?.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`) ?? undefined;
  if (origin.closest(settingsSelector)) return origin;
  return anchor.querySelector(settingsSelector) ?? undefined;
}

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
 * click and offer settings or navigation in a separate, unlinked tab.
 */
export function installDiagramLinkGuard(
  target: Pick<Document, "addEventListener" | "removeEventListener"> = document,
  choose: (actions: DiagramLinkActions) => void | (() => void) = showDiagramLinkMenu,
  open: (url: string) => void = (url) => void window.open(url, "_blank", "noopener,noreferrer"),
): () => void {
  let dismissMenu: (() => void) | undefined;
  const svgAnchor = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    return anchor?.namespaceURI === "http://www.w3.org/2000/svg" ? anchor : null;
  };
  const onClick = (event: Event) => {
    if (settingsClicks.has(event)) return;
    const anchor = svgAnchor(event);
    if (!anchor) return;
    event.preventDefault();
    const url = diagramLinkTarget(anchor, location.href);
    if (url) {
      event.stopPropagation();
      dismissMenu?.();
      const origin = event.target as Element;
      const selection = settingsTarget(origin, anchor);
      const bounds = anchor.getBoundingClientRect();
      const pointer = event instanceof MouseEvent && (event.clientX !== 0 || event.clientY !== 0);
      dismissMenu =
        choose({
          url,
          origin,
          x: pointer ? event.clientX : bounds.left,
          y: pointer ? event.clientY : bounds.bottom,
          openSettings: selection
            ? () => {
                if (!selection.isConnected) return;
                const click = new MouseEvent("click", { bubbles: true, cancelable: true });
                click.preventDefault();
                settingsClicks.add(click);
                selection.dispatchEvent(click);
              }
            : undefined,
          openUrl: () => open(url),
        }) || undefined;
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
    dismissMenu?.();
    target.removeEventListener("click", onClick, true);
    target.removeEventListener("mouseup", onMouseUp, true);
    target.removeEventListener("auxclick", onAuxClick, true);
    target.removeEventListener("keydown", onKeyDown, true);
    target.removeEventListener("pointerdown", onPointerDown, true);
  };
}
