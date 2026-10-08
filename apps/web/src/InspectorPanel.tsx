import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { storageGet } from "./safe-storage";

const WIDTH_KEY = "plantuml-ultimate.properties-width";
const clampWidth = (width: number) => Math.max(300, Math.min(600, Math.round(width)));
const draftFields = (panel: HTMLElement) =>
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    panel.querySelector("form") ? "form input, form select, form textarea" : "input, select, textarea",
  );
const snapshot = (panel: HTMLElement) =>
  JSON.stringify(
    [...draftFields(panel)].map((field) => [field.type, field.value, "checked" in field ? field.checked : null]),
  );

/** Shared properties layout. Forms retain their own apply and validation handlers. */
export function InspectorPanel({
  children,
  invalidDraft = false,
  ...props
}: ComponentProps<"aside"> & { invalidDraft?: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const baseline = useRef("");
  const initialized = useRef(false);
  const touched = useRef(false);
  const invalidDraftRef = useRef(invalidDraft);
  invalidDraftRef.current = invalidDraft;
  const blockedPointer = useRef(false);
  const [width, setWidth] = useState(340);
  const dragStart = useRef<{ x: number; width: number } | undefined>(undefined);
  const setPanelWidth = (next: number, remember = false) => {
    const value = clampWidth(next);
    setWidth(value);
    panel.current?.closest<HTMLElement>(".app")?.style.setProperty("--properties-width", `${value}px`);
    if (remember) {
      try {
        localStorage.setItem(WIDTH_KEY, String(value));
      } catch {
        /* Resizing works without persistence. */
      }
    }
  };
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const previousFocus = document.activeElement;
    if (!initialized.current) {
      baseline.current = snapshot(element);
      initialized.current = true;
    }
    const stored = Number(storageGet(WIDTH_KEY));
    const initialWidth = Number.isFinite(stored) && stored >= 300 ? clampWidth(stored) : 340;
    setWidth(initialWidth);
    element.closest<HTMLElement>(".app")?.style.setProperty("--properties-width", `${initialWidth}px`);
    const needsReview = () => {
      if (!touched.current || baseline.current === snapshot(element)) return false;
      const staged =
        Boolean(element.querySelector('form button[type="submit"]')) ||
        [...element.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Apply");
      const invalid = [...draftFields(element)].some(
        (field) => !field.validity.valid || field.getAttribute("aria-invalid") === "true",
      );
      return staged || invalid || invalidDraftRef.current;
    };
    const mayLeave = () => {
      if (!needsReview()) return true;
      if (!window.confirm("This panel has unapplied or invalid changes. Discard them and continue?")) return false;
      touched.current = false;
      return true;
    };
    const guard = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (event.type === "pointerdown") blockedPointer.current = false;
      if (event.type === "click" && blockedPointer.current) {
        blockedPointer.current = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const button = target.closest("button");
      const close =
        target.closest('header button[aria-label^="Close"]') ||
        (button?.closest(".inspector-actions") && /^(Close|Cancel)$/.test(button.textContent?.trim() ?? "")
          ? button
          : null);
      const leaving = !element.contains(target) || Boolean(close && element.contains(close));
      // Popovers/dialogs opened by a field remain usable; closing the properties panel is guarded separately.
      if (!leaving || target.closest(".modal-backdrop, .color-field-panel, .storage-details")) return;
      if (!mayLeave()) {
        if (event.type === "pointerdown") blockedPointer.current = true;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.contains(event.target as Node)) return;
      // Nested menus and color pickers get first use of Escape.
      if ((event.target as Element).closest('[role="menu"], .color-field-panel')) return;
      event.preventDefault();
      event.stopPropagation();
      element.querySelector<HTMLButtonElement>('header button[aria-label^="Close"]')?.click();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (needsReview()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const submitted = () =>
      requestAnimationFrame(() => {
        baseline.current = snapshot(element);
        touched.current = false;
      });
    const applied = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("button")?.textContent?.trim() === "Apply") submitted();
    };
    const guardShortcut = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      const outside = !element.contains(target);
      const closes =
        (event.key === "Escape" && outside) ||
        ((event.ctrlKey || event.metaKey) && ["w", "n", "o"].includes(event.key.toLowerCase()));
      const selects =
        outside &&
        target?.closest(".diagram") &&
        ["ArrowUp", "ArrowDown", "Enter", " ", "Delete", "Backspace"].includes(event.key);
      const textField = target?.closest("input, select, textarea, [contenteditable='true']");
      const historyChange =
        (!textField || outside) && (event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase());
      if ((closes || selects || historyChange) && !mayLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", guardShortcut, true);
    window.addEventListener("pointerdown", guard, true);
    window.addEventListener("click", guard, true);
    window.addEventListener("beforeunload", unload);
    element.addEventListener("keydown", escape);
    element.addEventListener("submit", submitted);
    element.addEventListener("click", applied);
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 850px)").matches)
      element.querySelector<HTMLButtonElement>('header button[aria-label^="Close"]')?.focus();
    return () => {
      window.removeEventListener("keydown", guardShortcut, true);
      window.removeEventListener("pointerdown", guard, true);
      window.removeEventListener("click", guard, true);
      window.removeEventListener("beforeunload", unload);
      element.removeEventListener("keydown", escape);
      element.removeEventListener("submit", submitted);
      element.removeEventListener("click", applied);
      // Source updates and selection changes can replace a panel. Restore its
      // opener only after a real close, so Apply and panel transitions keep focus.
      queueMicrotask(() => {
        const replacement = [...document.querySelectorAll<HTMLElement>(".task-inspector")].some(
          (item) => !item.hidden && item.style.display !== "none",
        );
        if (
          !replacement &&
          previousFocus instanceof HTMLElement &&
          previousFocus.isConnected &&
          (element.contains(document.activeElement) || document.activeElement === document.body)
        )
          previousFocus.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <aside
      {...props}
      ref={panel}
      onInputCapture={() => {
        touched.current = true;
      }}
      onChangeCapture={() => {
        touched.current = true;
      }}
    >
      <div
        className="inspector-resize"
        role="separator"
        aria-label="Properties panel width"
        aria-orientation="vertical"
        aria-valuemin={300}
        aria-valuemax={600}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setPanelWidth(width + (event.key === "ArrowLeft" ? 16 : -16), true);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStart.current = { x: event.clientX, width };
        }}
        onPointerMove={(event) => {
          if (dragStart.current) setPanelWidth(dragStart.current.width + dragStart.current.x - event.clientX);
        }}
        onPointerUp={(event) => {
          if (dragStart.current) {
            setPanelWidth(dragStart.current.width + dragStart.current.x - event.clientX, true);
            dragStart.current = undefined;
          }
        }}
        onPointerCancel={() => {
          dragStart.current = undefined;
        }}
      />
      {children}
    </aside>
  );
}
