import { useEffect, useRef, type RefObject } from "react";

const focusable =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
let lastFocusedOutsideDialog: HTMLElement | undefined;

if (typeof document !== "undefined")
  document.addEventListener("focusin", (event) => {
    const element = event.target instanceof HTMLElement ? event.target : undefined;
    if (element && !element.closest('[role="dialog"], [role="alertdialog"]')) lastFocusedOutsideDialog = element;
  });

export function useDialogFocus(container: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previous =
      active && !active.closest('[role="dialog"], [role="alertdialog"]') ? active : lastFocusedOutsideDialog;
    const frame = requestAnimationFrame(() => {
      const preferred = container.current?.querySelector<HTMLElement>("[autofocus]");
      (preferred ?? container.current?.querySelector<HTMLElement>(focusable) ?? container.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !container.current) return;
      const items = [...container.current.querySelectorAll<HTMLElement>(focusable)].filter(
        (item) => item.offsetParent !== null,
      );
      if (!items.length) {
        event.preventDefault();
        container.current.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
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
      previous?.focus();
    };
  }, [container]);
}
