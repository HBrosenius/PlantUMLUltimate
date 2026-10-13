import { useEffect, useRef, type RefObject } from "react";

const focusable =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
type FocusTarget = HTMLElement | SVGElement;
const focusTarget = (element: EventTarget | null): FocusTarget | undefined =>
  element instanceof HTMLElement || element instanceof SVGElement ? element : undefined;
let lastFocusedOutsideDialog: FocusTarget | undefined;

if (typeof document !== "undefined")
  document.addEventListener("focusin", (event) => {
    const element = focusTarget(event.target);
    if (element && !element.closest('[role="dialog"], [role="alertdialog"]')) lastFocusedOutsideDialog = element;
  });

export function useDialogFocus(container: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const active = focusTarget(document.activeElement);
    const previous =
      active && !active.closest('[role="dialog"], [role="alertdialog"]') ? active : lastFocusedOutsideDialog;
    const preview = previous instanceof SVGElement ? previous.closest(".preview") : undefined;
    const label = previous?.getAttribute("aria-label");
    const identity =
      previous instanceof SVGElement
        ? [...previous.attributes].filter(
            (attribute) => attribute.name.startsWith("data-") && attribute.name.endsWith("-id"),
          )
        : [];
    const frame = requestAnimationFrame(() => {
      // Preserve React autofocus and any focus the user has already moved into the dialog.
      if (container.current?.contains(document.activeElement)) return;
      const preferred = container.current?.querySelector<HTMLElement>("[data-dialog-autofocus], [autofocus]");
      (preferred ?? container.current?.querySelector<HTMLElement>(focusable) ?? container.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !container.current) return;
      const items = [...container.current.querySelectorAll<HTMLElement>(focusable)].filter(
        (item) =>
          !item.matches(":disabled") &&
          !item.closest("[hidden], [inert]") &&
          (item.offsetParent !== null || item.getClientRects().length > 0),
      );
      if (!items.length) {
        event.preventDefault();
        container.current.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      const replacement =
        !previous?.isConnected && preview?.isConnected && label
          ? [...preview.querySelectorAll<SVGElement>("svg [aria-label][tabindex]")].find(
              (element) =>
                element.getAttribute("aria-label") === label &&
                identity.every((attribute) => element.getAttribute(attribute.name) === attribute.value),
            )
          : undefined;
      (previous?.isConnected ? previous : replacement)?.focus({ preventScroll: true });
    };
  }, [container]);
}
