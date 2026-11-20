import { memo } from "react";
export interface FileSaveState {
  documentId: string;
  status: "saving" | "saved" | "downloaded" | "error" | "cancelled";
  message?: string;
}

function FileSaveStatusView({
  dirty,
  state,
  fileCopy,
  fileName,
  onRetry,
}: {
  dirty: boolean;
  fileCopy?: "new" | "file" | "download" | undefined;
  fileName?: string | undefined;
  state?: FileSaveState | undefined;
  onRetry(): void;
}) {
  const label =
    state?.status === "saving"
      ? "Saving…"
      : state?.status === "error"
        ? "Save failed"
        : state?.status === "cancelled"
          ? dirty
            ? "Save cancelled · Unsaved changes"
            : "Save cancelled"
          : dirty
            ? fileCopy === "new"
              ? "Not saved to a file"
              : "Unsaved changes"
            : state?.status === "downloaded"
              ? "Download requested"
              : state?.status === "saved"
                ? fileName
                  ? `Saved to ${fileName}`
                  : "Saved to file"
                : fileCopy === "new"
                  ? "Not saved to a file"
                  : fileCopy === "download"
                    ? "Download requested"
                    : fileCopy === "file"
                      ? fileName
                        ? `Saved to ${fileName}`
                        : "Saved to file"
                      : "No unsaved changes";
  return (
    <span
      className={`file-save-indicator${state?.status === "error" ? " is-warning" : ""}`}
      role="status"
      title={
        state?.message ??
        (state?.status === "downloaded" || fileCopy === "download"
          ? "A snapshot download was requested. Check your browser downloads for the file."
          : "File saving is separate from browser recovery and collaboration.")
      }
    >
      {label}
      {state?.status === "error" && (
        <button type="button" onClick={onRetry}>
          Retry save
        </button>
      )}
    </span>
  );
}

/** Skips re-rendering while its props are unchanged; callers pass stable handlers. */
export const FileSaveStatus = memo(FileSaveStatusView);
