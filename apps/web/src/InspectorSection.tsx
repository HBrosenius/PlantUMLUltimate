import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { storageGet } from "./safe-storage";

export function InspectorSection({
  title,
  children,
  defaultOpen = true,
  rememberKey,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  rememberKey?: string;
}) {
  const section = useRef<HTMLDetailsElement>(null);
  const storageKey = rememberKey ? `plantuml-studio.inspector-section.${rememberKey}` : undefined;
  const [open, setOpen] = useState(() => {
    const saved = storageKey ? storageGet(storageKey) : null;
    return saved === "open" ? true : saved === "closed" ? false : defaultOpen;
  });
  const [invalid, setInvalid] = useState(false);
  const check = () =>
    queueMicrotask(() => {
      const hasInvalid = [
        ...(section.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea",
        ) ?? []),
      ].some((field) => !field.validity.valid || field.getAttribute("aria-invalid") === "true");
      setInvalid(hasInvalid);
      if (hasInvalid) setOpen(true);
    });
  useLayoutEffect(() => {
    check();
    const observer = new MutationObserver(check);
    if (section.current)
      observer.observe(section.current, {
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-invalid", "min", "max", "required"],
      });
    return () => observer.disconnect();
  }, []);
  return (
    <details
      ref={section}
      className="inspector-section"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        check();
      }}
      onInputCapture={check}
      onChangeCapture={check}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          const next = invalid ? true : !open;
          setOpen(next);
          if (storageKey && !invalid)
            try {
              localStorage.setItem(storageKey, next ? "open" : "closed");
            } catch {
              /* Keep the choice in memory. */
            }
        }}
      >
        {title}
        {invalid && <span className="field-error"> · Check values</span>}
      </summary>
      {children}
    </details>
  );
}
