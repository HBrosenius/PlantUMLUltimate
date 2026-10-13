import { useLayoutEffect, useRef, type RefObject } from "react";

/** Follow a keyboard-focused SVG object when rendering replaces its DOM nodes. */
export function useDiagramFocusContinuity(viewport: RefObject<HTMLElement | null>, documentId?: string) {
  const focused = useRef<{ element: SVGElement; label: string | null; identity: Array<[string, string]> } | undefined>(
    undefined,
  );
  const owner = useRef(documentId);
  useLayoutEffect(() => {
    if (documentId && owner.current !== documentId) {
      focused.current = undefined;
      owner.current = documentId;
    }
  }, [documentId]);
  useLayoutEffect(() => {
    const host = viewport.current;
    if (!host) return;
    const remember = (event: FocusEvent) => {
      const element = event.target;
      if (element instanceof SVGElement && host.contains(element)) {
        focused.current = {
          element,
          label: element.getAttribute("aria-label"),
          identity: [...element.attributes]
            .filter((attribute) => attribute.name.startsWith("data-") && attribute.name.endsWith("-id"))
            .map((attribute) => [attribute.name, attribute.value]),
        };
      } else if (element !== document.body) focused.current = undefined;
    };
    const observer = new MutationObserver(() => {
      const previous = focused.current;
      if (
        !previous ||
        previous.element.isConnected ||
        (document.activeElement !== document.body && document.activeElement !== document.documentElement)
      )
        return;
      const candidates = [...host.querySelectorAll<SVGElement>("svg [tabindex]")].filter(
        (element) => element.localName === previous.element.localName,
      );
      const labels = previous.label
        ? candidates.filter((element) => element.getAttribute("aria-label") === previous.label)
        : [];
      const identities = previous.identity.length
        ? candidates.filter((element) =>
            previous.identity.every(([name, value]) => element.getAttribute(name) === value),
          )
        : [];
      const target =
        labels.length === 1 ? labels[0] : labels.length === 0 && identities.length === 1 ? identities[0] : undefined;
      if (target) target.focus({ preventScroll: true });
      // Rendering can briefly expose an unannotated SVG before semantic targets are attached.
      else if (candidates.length > 0) focused.current = undefined;
    });
    document.addEventListener("focusin", remember);
    observer.observe(host, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("focusin", remember);
      observer.disconnect();
    };
  }, [viewport]);
}
