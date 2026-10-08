export interface FileSaveState {
  documentId: string;
  status: "saving" | "saved" | "downloaded" | "error" | "cancelled";
  message?: string;
}

export function FileSaveStatus({
  dirty,
  state,
  onRetry,
}: {
  dirty: boolean;
  state?: FileSaveState | undefined;
  onRetry(): void;
}) {
  const label =
    state?.status === "saving"
      ? "Saving…"
      : state?.status === "error"
        ? "Save failed"
        : dirty
          ? "Unsaved changes"
          : state?.status === "downloaded"
            ? "Download requested"
            : state?.status === "saved"
              ? "Saved to file"
              : state?.status === "cancelled"
                ? "Save cancelled"
                : "No unsaved changes";
  return (
    <span
      className={`file-save-indicator${state?.status === "error" ? " is-warning" : ""}`}
      role="status"
      title={
        state?.message ??
        (state?.status === "downloaded"
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
