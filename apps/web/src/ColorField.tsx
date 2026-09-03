import { useEffect, useId, useRef, useState } from "react";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";
import { colorFieldBackground } from "./color-field-utils";

export function SharedColorDatalist({ id, namePrefix = "" }: { id: string; namePrefix?: string }) {
  return (
    <datalist id={id}>
      {PLANTUML_COLOR_NAMES.map((name) => (
        <option key={name} value={`${namePrefix}${name}`} />
      ))}
    </datalist>
  );
}

export function ColorSwatch({ value, className = "" }: { value: string; className?: string }) {
  return (
    <i
      aria-hidden="true"
      className={`legend-color-swatch color-swatch-preview ${className}`.trim()}
      style={{ background: colorFieldBackground(value) }}
    />
  );
}

/**
 * A text field for entering a PlantUML color, with a live swatch preview and a click-to-pick
 * palette of every named PlantUML color (also shown as swatches) — so choosing a color shows
 * what it will actually look like, not just its name. Free-form typing (hex codes, "#Name"
 * spellings, "Color/Color" gradients) still works exactly as before via the input + datalist.
 */
export function ColorField({
  value,
  onChange,
  onBlur,
  label = "Color",
  placeholder = "Orange or #f97316",
  namePrefix = "",
  className,
  datalistId,
}: {
  value: string;
  onChange(value: string): void;
  onBlur?(): void;
  label?: string;
  placeholder?: string;
  namePrefix?: string;
  className?: string;
  /**
   * Id of a `<datalist>` (see `sharedColorDatalist`) rendered elsewhere in the same form, for
   * when several ColorFields with the same `namePrefix` should share one option list instead
   * of each carrying its own copy of every PlantUML color name. Omit for a standalone field.
   */
  datalistId?: string;
}) {
  const generatedId = useId();
  const id = datalistId ?? generatedId;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLLabelElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  const pick = (name: string) => {
    onChange(`${namePrefix}${name}`);
    setOpen(false);
    onBlur?.();
  };

  return (
    <label className={`color-field${className ? ` ${className}` : ""}`} ref={root}>
      {label}
      <div className="color-field-row">
        <input
          aria-label={label}
          list={id}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {!datalistId && <SharedColorDatalist id={id} namePrefix={namePrefix} />}
        <button
          ref={trigger}
          type="button"
          className="color-field-trigger"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Choose ${label.toLowerCase()} from a palette`}
          title="Choose from a palette"
          onClick={() => setOpen((current) => !current)}
        >
          <ColorSwatch value={value} />
        </button>
      </div>
      {open && (
        <div className="color-field-panel" aria-label={`${label} palette`}>
          {PLANTUML_COLOR_NAMES.map((name) => (
            <button key={name} type="button" title={`${namePrefix}${name}`} onClick={() => pick(name)}>
              <ColorSwatch value={`${namePrefix}${name}`} />
              <span>{name}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
