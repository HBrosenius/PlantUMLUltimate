import { useState } from "react";

const PAGE_SIZE = 100;

/** Keep native selects responsive while retaining access to every project item. */
export function ProjectItemSelect({
  label,
  placeholder,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: readonly { id: string; label: string }[];
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const fieldName = label.replace(/^\d+\.\s*/, "").toLowerCase();
  const paged = options.length > PAGE_SIZE;
  const matches = paged
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : options;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1));
  const start = currentPage * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);
  const selected = options.find((option) => option.id === value);
  const selectedOutsidePage = selected && !visible.some((option) => option.id === selected.id);

  return (
    <div className="project-item-select">
      {paged && (
        <label>
          <span>Search {fieldName} items</span>
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
      )}
      <label>
        <span>{label}</span>
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">{placeholder}</option>
          {selectedOutsidePage && <option value={selected.id}>{selected.label}</option>}
          {visible.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {paged && (
        <div>
          <span aria-live="polite">
            {matches.length
              ? `${start + 1}-${Math.min(start + PAGE_SIZE, matches.length)} of ${matches.length} items`
              : "No matching items"}
          </span>
          <button
            type="button"
            aria-label={`Previous ${fieldName} items`}
            disabled={disabled || currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            aria-label={`Next ${fieldName} items`}
            disabled={disabled || start + PAGE_SIZE >= matches.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
