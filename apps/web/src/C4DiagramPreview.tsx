import { useLayoutEffect, useRef } from "react";
import { PreviewRenderNotice } from "./render/PreviewRenderNotice";
import type { RenderStatus } from "./model";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

interface Props {
  svg?: string | undefined;
  initialFit?: InitialDiagramFit | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
}

/** The rendered C4 diagram with zoom and fit. Elements are read from the source (outline), not the picture. */
export function C4DiagramPreview({
  initialFit,
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
}: Props) {
  const navigation = useDiagramNavigation(zoom, onZoomChange, { svg, initialFit });
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (root.current && svg) root.current.innerHTML = svg;
  }, [svg]);
  return (
    <section className="preview c4-preview" aria-label="C4 diagram preview" data-render-status={renderStatus}>
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
        {!svg && !renderError && (
          <div className="render-placeholder">
            {renderStatus === "rendering" ? "Rendering C4 diagram…" : "Enter C4 source to render a preview."}
          </div>
        )}
        {svg && (
          <div
            ref={root}
            className="diagram c4-diagram"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          />
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
