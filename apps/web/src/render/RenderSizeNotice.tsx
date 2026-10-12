import { renderSizeLimit } from "./size-limit";

export function RenderSizeNotice({
  error,
  hasPreviousPreview,
  gantt,
}: {
  error: string | undefined;
  hasPreviousPreview: boolean;
  gantt: boolean;
}) {
  const size = renderSizeLimit(error);
  if (!size) return null;
  return (
    <div role="alert" aria-label="Preview size limit">
      <strong>Diagram exceeds the preview size limit</strong>
      <p>
        This diagram is {size.width.toLocaleString()} × {size.height.toLocaleString()} pixels. The renderer allows up to{" "}
        {size.limit.toLocaleString()} pixels in either dimension.
      </p>
      {hasPreviousPreview && <p>The visible preview is from an earlier successful render.</p>}
      <p>
        Your source remains available to edit and save. Use the source editor or Outline
        {gantt ? ", or the task table," : ""} to find and edit items. Reduce the diagram’s width or height, or split it
        into smaller diagrams, then render again.
      </p>
      <button type="button" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>
        Continue editing
      </button>
    </div>
  );
}
