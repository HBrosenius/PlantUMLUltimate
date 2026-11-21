import { useMemo } from "react";
import { PreviewRenderNotice } from "./render/PreviewRenderNotice";
import type { RenderStatus } from "./model";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

/**
 * The rendered mindmap with zoom and fit. Mindmaps are edited as text in this release, so the preview
 * has no selection or drag handling; visual editing builds on this component.
 */
export function MindmapDiagramPreview({
  initialFit,
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
}: {
  svg?: string | undefined;
  initialFit?: InitialDiagramFit | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
}) {
  const navigation = useDiagramNavigation(zoom, onZoomChange, { svg, initialFit });
  const svgMarkup = useMemo(() => ({ __html: svg ?? "" }), [svg]);
  return (
    <section className="preview mindmap-preview" aria-label="Mindmap diagram preview" data-render-status={renderStatus}>
      <div className="preview-tools">
        <button
          type="button"
          data-view-control
          onClick={navigation.fit}
          aria-label="Fit diagram"
          title="Fit the diagram in the visible canvas"
        >
          Fit
        </button>
        <button
          onClick={() => onZoomChange(Math.max(MIN_DIAGRAM_ZOOM, zoom - 0.1))}
          data-view-control
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => onZoomChange(1)}
          data-view-control
          aria-label={`Reset zoom, ${Math.round(zoom * 100)}%`}
          title="Reset canvas zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(Math.min(MAX_DIAGRAM_ZOOM, zoom + 0.1))}
          data-view-control
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      <div
        className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}
        ref={navigation.viewportRef}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {svg ? (
          <div
            className="diagram mindmap-diagram"
            style={{ transform: `scale(${zoom})` }}
            dangerouslySetInnerHTML={svgMarkup}
          />
        ) : renderError ? null : (
          <div className="render-placeholder">
            {renderStatus === "rendering" ? "Rendering Mindmap…" : "Enter Mindmap source to render a preview."}
          </div>
        )}
      </div>
      <PreviewRenderNotice
        status={renderStatus}
        error={renderError}
        hasPreview={Boolean(svg)}
        onRetry={onRenderRetry}
      />
    </section>
  );
}
