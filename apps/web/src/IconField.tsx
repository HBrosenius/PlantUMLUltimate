import { useEffect, useMemo, useRef, useState } from "react";
import { WBS_OPENICONIC_ICONS } from "./wbs-openiconic-icons";

const ICONS_BY_NAME = new Map(WBS_OPENICONIC_ICONS);

function builtinIconName(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.startsWith("&") ? trimmed.slice(1) : undefined;
}

function IconGlyph({ name, className }: { name: string | undefined; className?: string }) {
  const markup = name ? ICONS_BY_NAME.get(name) : undefined;
  return (
    <svg viewBox="0 0 8 8" className={className} aria-hidden="true">
      {markup ? <g dangerouslySetInnerHTML={{ __html: markup }} /> : null}
    </svg>
  );
}

/**
 * A text field for a WBS node's PlantUML icon reference ("&name" for a built-in OpenIconic
 * sprite, "$name" for a custom sprite defined elsewhere in the source), with a live glyph
 * preview and a click-to-pick, searchable gallery of every built-in icon rendered as its real
 * shape — so choosing one shows what it actually looks like, not just its name. Free-form
 * typing (including "$name" custom sprites, which have no fixed catalog to pick from) still
 * works exactly as before via the input.
 */
export function IconField({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: string;
  onChange(value: string): void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
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

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = needle ? WBS_OPENICONIC_ICONS.filter(([name]) => name.includes(needle)) : WBS_OPENICONIC_ICONS;
    return all.slice(0, 60);
  }, [query]);

  const pick = (name: string) => {
    setOpen(false);
    setQuery("");
    onChange(`&${name}`);
  };

  return (
    <div className="icon-field" ref={root}>
      <div className="icon-field-row">
        <input
          aria-label="Icon"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          placeholder="&home"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          ref={trigger}
          type="button"
          className="icon-field-trigger"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label="Choose a built-in icon from a gallery"
          title="Choose from a gallery"
          onClick={() => setOpen((current) => !current)}
        >
          <IconGlyph name={builtinIconName(value)} />
        </button>
      </div>
      {open && (
        <div className="icon-field-panel" aria-label="Built-in icon gallery">
          <input
            ref={search}
            type="search"
            className="icon-field-search"
            placeholder="Search icons…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="icon-field-grid">
            {matches.map(([name]) => (
              <button key={name} type="button" title={`&${name}`} onClick={() => pick(name)}>
                <IconGlyph name={name} />
                <span>{name}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="icon-field-empty">No icons match "{query}".</p>}
          </div>
          <p className="icon-field-hint">
            Looking for a custom sprite instead? Type <code>$name</code> directly in the field above — those aren't in
            this gallery since they're defined in your own source.
          </p>
        </div>
      )}
    </div>
  );
}
