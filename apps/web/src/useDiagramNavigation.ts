import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

export function useDiagramNavigation(zoom: number, onZoomChange: (zoom: number) => void) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | undefined>(undefined);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      const pan = panRef.current;
      if (!viewport || !pan || event.pointerId !== pan.pointerId) return;
      event.preventDefault();
      viewport.scrollLeft = pan.left - (event.clientX - pan.x);
      viewport.scrollTop = pan.top - (event.clientY - pan.y);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== panRef.current?.pointerId) return;
      panRef.current = undefined;
      viewportRef.current?.classList.remove("diagram-pan-active");
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!viewport || event.deltaY === 0) return;
      event.preventDefault();
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-event.deltaY * 0.0015)));
      if (Math.abs(nextZoom - zoom) < 0.001) return;
      const bounds = viewport.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const contentX = (viewport.scrollLeft + cursorX) / zoom;
      const contentY = (viewport.scrollTop + cursorY) / zoom;
      onZoomChange(nextZoom);
      requestAnimationFrame(() => {
        viewport.scrollLeft = contentX * nextZoom - cursorX;
        viewport.scrollTop = contentY * nextZoom - cursorY;
      });
    },
    [onZoomChange, zoom],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.classList.add("diagram-pan-active");
  }, []);

  const onAuxClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1) event.preventDefault();
  }, []);

  return { viewportRef, onWheel, onPointerDown, onAuxClick };
}
