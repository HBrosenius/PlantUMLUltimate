import { useRef, useState, type ReactNode } from "react";

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  const section = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const check = () =>
    queueMicrotask(() =>
      setInvalid(
        [
          ...(section.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea",
          ) ?? []),
        ].some((field) => !field.validity.valid || field.getAttribute("aria-invalid") === "true"),
      ),
    );
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
      <summary>
        {title}
        {invalid && <span className="field-error"> · Check values</span>}
      </summary>
      {children}
    </details>
  );
}
