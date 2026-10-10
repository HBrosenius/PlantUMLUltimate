export interface FileSaveState {
  documentId: string;
  status: "saving" | "saved" | "downloaded" | "error" | "cancelled";
  message?: string;
}

export function FileSaveStatus({
  dirty,
  state,
  fileCopy,
  onRetry,
}: {
  dirty: boolean;
  fileCopy?: "new" | "file" | "download" | undefined;
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
            ? "Unsaved changes"
            : state?.status === "downloaded"
              ? "Download requested"
              : state?.status === "saved"
                ? "Saved to file"
                : fileCopy === "new"
                  ? "Not saved to a file"
                  : fileCopy === "download"
                    ? "Download requested"
                    : fileCopy === "file"
                      ? "Saved to file"
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
