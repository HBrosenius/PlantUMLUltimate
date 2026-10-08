import { useEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  run(): void;
  disabled?: boolean;
}

/** A small, keyboard-accessible menu for secondary workspace actions. */
export function ActionMenu({ label, actions, count }: { label: string; actions: MenuAction[]; count?: number }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (focus = false) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const focusFirst = () =>
    requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus(),
    );
  return (
    <div ref={root} className="application-menu action-menu">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            focusFirst();
          }
          if (event.key === "Escape") close();
        }}
      >
        {label}
        {count !== undefined && count > 0 && <span className="action-count">{count}</span>}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="application-menu-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              close(event.key === "Escape");
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
              }
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = [
              ...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
            ];
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                close();
                action.run();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
