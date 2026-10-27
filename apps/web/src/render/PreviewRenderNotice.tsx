import { useEffect, useState } from "react";
import type { RenderStatus } from "../model";
import { syntaxErrorLocation } from "./syntax-error";

export function PreviewRenderNotice({
  status,
  error,
  hasPreview,
  onRetry,
}: {
  status: RenderStatus;
  error?: string | undefined;
  hasPreview: boolean;
  onRetry(): void;
}) {
  const [slow, setSlow] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | undefined>();
  useEffect(() => {
    if (status !== "rendering") return;
    const timer = window.setTimeout(() => setSlow(true), 5_000);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [status]);
  if (status === "idle") return null;
  const failed = status === "error";
  if (failed && dismissedError === (error ?? "")) return null;
  const syntax = failed ? syntaxErrorLocation(error) : undefined;
  return (
    <div
      className={`render-notice ${failed ? "error" : "rendering"}${syntax ? " syntax" : ""}`}
      role={failed ? "alert" : "status"}
    >
      <strong>
        {syntax
          ? `Line ${syntax.line} can't be drawn`
          : failed
            ? "Preview could not be updated"
            : slow
              ? "Still rendering preview…"
              : "Rendering updated preview…"}
      </strong>
      {syntax ? (
        <>
          {syntax.text && <code>{syntax.text}</code>}
          <span>
            PlantUML doesn't recognise this line. Check its spelling and values
            {hasPreview ? "; the preview shows the last version that worked." : "."}
          </span>
        </>
      ) : (
        hasPreview && <span>Showing the last successful diagram. It may differ from the current source.</span>
      )}
      {failed ? (
        <>
          {!syntax && <span>{error ?? "The renderer returned an unknown error."}</span>}
          {syntax ? (
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("reveal-source-line", { detail: { line: syntax.line } }))
              }
            >
              Go to line {syntax.line}
            </button>
          ) : (
            <button type="button" onClick={onRetry}>
              Retry rendering
            </button>
          )}
          <button type="button" onClick={() => setDismissedError(error ?? "")}>
            Dismiss
          </button>
        </>
      ) : (
        <span>
          {slow
            ? "This is taking longer than usual. You can keep editing while rendering continues."
            : "You can keep editing while the preview updates."}
        </span>
      )}
    </div>
  );
}
