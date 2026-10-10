import { useId, useState } from "react";

/** Editable participant name with a visible picker; new names remain supported. */
export function ParticipantCombobox({
  label,
  value,
  participants,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  participants: string[];
  onChange(value: string): void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };
  return (
    <label>
      {label}
      <span
        className="participant-combobox"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <input
          aria-label={label}
          required
          autoFocus={autoFocus}
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id}
          aria-activedescendant={open && participants[active] ? `${id}-${active}` : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                Math.max(0, Math.min(participants.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))),
              );
            } else if (event.key === "Enter" && open && participants[active]) {
              event.preventDefault();
              choose(participants[active]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          aria-label={`Choose ${label.toLowerCase()} participant`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen(!open)}
        >
          ▾
        </button>
        {open && (
          <span id={id} role="listbox" aria-label={`${label} participants`}>
            {participants.map((name, index) => (
              <button
                type="button"
                key={name}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(name)}
              >
                {name}
              </button>
            ))}
            {!participants.length && <span>No participants yet. Type a name.</span>}
          </span>
        )}
      </span>
    </label>
  );
}
