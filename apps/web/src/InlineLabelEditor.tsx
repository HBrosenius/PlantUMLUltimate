import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function InlineLabelEditor({
  value,
  anchor,
  current,
  validate,
  onApply,
  onClose,
}: {
  value: string;
  anchor: { left: number; bottom: number };
  current: boolean;
  validate(value: string): string | undefined;
  onApply(value: string): boolean;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => {
    const cancelOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !form.current?.contains(event.target)) close.current();
    };
    const cancelEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    const cancelCanvasScroll = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".preview-viewport")) close.current();
    };
    document.addEventListener("wheel", cancelCanvasScroll, { capture: true, passive: true });
    document.addEventListener("pointerdown", cancelOutside, true);
    document.addEventListener("keydown", cancelEscape, true);
    return () => {
      document.removeEventListener("wheel", cancelCanvasScroll, true);
      document.removeEventListener("pointerdown", cancelOutside, true);
      document.removeEventListener("keydown", cancelEscape, true);
    };
  }, []);
  const error = current ? validate(draft) : "The diagram changed. Cancel and rename the current label again.";
  return (
    <form
      ref={form}
      className="inline-label-editor"
      data-inspector-trigger
      role="dialog"
      aria-label="Edit diagram label"
      style={{
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 368)),
        top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - 196)),
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!error && current && onApply(draft)) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled)")];
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <label>
        Label
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "inline-label-error" : "inline-label-help"}
        />
      </label>
      {error ? (
        <p id="inline-label-error" role="alert">
          {error}
        </p>
      ) : (
        <small id="inline-label-help">Enter applies · Esc cancels</small>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" disabled={!!error || !current}>
          Apply label
        </button>
      </div>
    </form>
  );
}
