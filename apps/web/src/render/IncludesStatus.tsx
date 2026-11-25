import { refreshIncludes, type IncludeEntry } from "./includes";
import { useActiveIncludes } from "./include-state";

const ORIGIN_TEXT: Record<IncludeEntry["origin"], string> = {
  library: "Bundled library",
  document: "This document",
  repository: "Repository",
  folder: "Folder",
  theme: "Bundled theme",
  blocked: "Blocked",
  main: "Not found",
};

const STATUS_TEXT: Record<IncludeEntry["status"], string> = {
  loaded: "Loaded",
  pending: "Loading…",
  missing: "Not found",
  blocked: "Blocked",
  failed: "Not loaded",
};

/**
 * The includes of the open diagram: each one, where it came from (library, this document, repository or
 * folder) and whether it loaded. A summary in the status bar opens the list.
 */
export function IncludesStatus({ documentId }: { documentId: string }) {
  const state = useActiveIncludes(documentId);
  if (!state || state.includes.length === 0) return null;
  const entries = state.includes;
  const notLoaded = entries.filter((entry) => entry.status !== "loaded").length;
  const label = `${entries.length} ${entries.length === 1 ? "include" : "includes"}`;
  return (
    <details className="render-details includes-details">
      <summary aria-label={`${label}${notLoaded ? `, ${notLoaded} not loaded` : ""}`}>
        {label}
        {notLoaded > 0 && <span className="includes-problem">{` · ${notLoaded} not loaded`}</span>}
      </summary>
      <div>
        <ul className="includes-list" aria-label="Includes">
          {entries.map((entry, index) => (
            <li key={`${entry.target}:${entry.mainLine}:${index}`} data-status={entry.status}>
              <strong>{entry.label}</strong>
              <span>
                {ORIGIN_TEXT[entry.origin]}
                {entry.nested ? " (included by another file)" : ""}
              </span>
              <span className="includes-status">{STATUS_TEXT[entry.status]}</span>
              {entry.message && <small>{entry.message}</small>}
            </li>
          ))}
        </ul>
        {state.scope && (
          <p>
            <button type="button" onClick={() => refreshIncludes(state.scope)}>
              Read included files again
            </button>
          </p>
        )}
        <p>
          Includes are read on this device
          {state.scopeDescription ? `, and from ${state.scopeDescription} for files opened from there` : ""}. Nothing
          else is downloaded.
        </p>
      </div>
    </details>
  );
}
