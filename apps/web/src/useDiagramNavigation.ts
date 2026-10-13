import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { initialDiagramZoom } from "./initial-diagram-zoom";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

export interface InitialDiagramFit {
  documentId: string;
  fit?: boolean;
  scroll?: { left: number; top: number } | undefined;
  onScrollChange?(scroll: { left: number; top: number }, flushRecovery?: boolean): void;
}

export function useDiagramNavigation(
  zoom: number,
  onZoomChange: (zoom: number) => void,
  options?: { svg?: string | undefined; initialFit?: InitialDiagramFit | undefined },
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | undefined>(undefined);
  const zoomRef = useRef(zoom);
  const gestureRef = useRef<{ at: number; pan: boolean } | undefined>(undefined);
  const zoomChangeRef = useRef(onZoomChange);
  const wheelRef = useRef<
    | {
        frame: number;
        startZoom: number;
        current: number;
        target: number;
        contentX: number;
        contentY: number;
        cursorX: number;
        cursorY: number;
      }
    | undefined
  >(undefined);

  zoomChangeRef.current = onZoomChange;
  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    const viewport = viewportRef.current;
    if (!wheel || !viewport || zoom !== wheel.startZoom) {
      if (wheel) cancelAnimationFrame(wheel.frame);
      wheelRef.current = undefined;
      viewport?.classList.remove("diagram-wheel-zooming");
      zoomRef.current = zoom;
      return;
    }
    const diagram = viewport.querySelector<HTMLElement>(".diagram");
    if (diagram) diagram.style.transform = `scale(${wheel.current})`;
  }, [zoom]);

  useEffect(
    () => () => {
      if (wheelRef.current) cancelAnimationFrame(wheelRef.current.frame);
    },
    [],
  );

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

  const restoredDocument = useRef<string | undefined>(undefined);
  const restoredSvg = useRef<Element | null>(null);
  const currentScroll = useRef<{ documentId: string; left: number; top: number } | undefined>(undefined);
  const initialDocumentId = options?.initialFit?.documentId;
  const savedScroll = options?.initialFit?.scroll;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!initialDocumentId || !options?.svg || !viewport) return;
    if (!viewport.querySelector(".diagram svg") || !viewport.clientWidth || !viewport.clientHeight) return;
    let frame: number | undefined;
    let renderedSvg = viewport.querySelector(".diagram svg");
    if (restoredSvg.current !== renderedSvg) restoredDocument.current = undefined;
    restoredSvg.current = renderedSvg;
    const position =
      currentScroll.current?.documentId === initialDocumentId
        ? currentScroll.current
        : (savedScroll ?? { left: 0, top: 0 });
    let target = position;
    let previousBounds: string | undefined;
    const bounds = () =>
      `${viewport.scrollWidth}:${viewport.scrollHeight}:${viewport.clientWidth}:${viewport.clientHeight}`;
    const restore = () => {
      const diagram = viewport.querySelector<HTMLElement>(".diagram");
      // A reused preview can still be transitioning from the previous tab's zoom.
      // Assigning scroll offsets before it settles would clamp them to the old bounds.
      if (
        diagram?.offsetWidth &&
        Math.abs(diagram.getBoundingClientRect().width - diagram.offsetWidth * zoom) > Math.max(1, zoom)
      ) {
        previousBounds = undefined;
        frame = requestAnimationFrame(restore);
        return;
      }
      // WebKit can update SVG overflow a frame after its transform has settled.
      // Keep recovery writes suspended until the scrollable bounds also settle.
      const currentBounds = bounds();
      if (previousBounds !== currentBounds) {
        previousBounds = currentBounds;
        frame = requestAnimationFrame(restore);
        return;
      }
      viewport.scrollLeft = target.left;
      viewport.scrollTop = target.top;
      frame = requestAnimationFrame(() => {
        if (bounds() !== currentBounds) {
          previousBounds = undefined;
          frame = requestAnimationFrame(restore);
          return;
        }
        restoredDocument.current = initialDocumentId;
        currentScroll.current = { documentId: initialDocumentId, left: viewport.scrollLeft, top: viewport.scrollTop };
      });
    };
    const observer = new MutationObserver(() => {
      const nextSvg = viewport.querySelector(".diagram svg");
      if (nextSvg === renderedSvg) return;
      renderedSvg = nextSvg;
      restoredSvg.current = nextSvg;
      // Annotation refreshes can replace the SVG without changing its source or bounds.
      // Suspend recovery writes before the resulting browser scroll-clamp event arrives.
      target = currentScroll.current?.documentId === initialDocumentId ? currentScroll.current : position;
      restoredDocument.current = undefined;
      previousBounds = undefined;
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (!nextSvg) return;
      frame = requestAnimationFrame(restore);
    });
    observer.observe(viewport, { childList: true, subtree: true });
    if (restoredDocument.current !== initialDocumentId) frame = requestAnimationFrame(restore);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [initialDocumentId, options?.svg, savedScroll, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const save = options?.initialFit?.onScrollChange;
    if (!initialDocumentId || !viewport || !save) return;
    let timer: number | undefined;
    let pending: { left: number; top: number } | undefined;
    const flush = (event?: Event) => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (pending) {
        if (event?.type === "pagehide") save(pending, true);
        else save(pending);
      }
      pending = undefined;
    };
    const scroll = () => {
      if (restoredDocument.current !== initialDocumentId) return;
      pending = { left: viewport.scrollLeft, top: viewport.scrollTop };
      currentScroll.current = { documentId: initialDocumentId, ...pending };
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 120);
    };
    viewport.addEventListener("scroll", scroll);
    scroll();
    window.addEventListener("pagehide", flush);
    return () => {
      viewport.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [initialDocumentId, options?.svg, options?.initialFit?.onScrollChange]);

  const fittedDocument = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      options?.initialFit?.fit === false ||
      !initialDocumentId ||
      fittedDocument.current === initialDocumentId ||
      !options?.svg ||
      wheelRef.current
    )
      return;
    const viewport = viewportRef.current;
    const svg = viewport?.querySelector<SVGSVGElement>(".diagram svg");
    if (!viewport || !svg || !viewport.clientWidth || !viewport.clientHeight) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    fittedDocument.current = initialDocumentId;
    zoomChangeRef.current(
      initialDiagramZoom(
        bounds.width / zoomRef.current,
        bounds.height / zoomRef.current,
        viewport.clientWidth,
        viewport.clientHeight,
        svg.viewBox.baseVal.width || svg.width.baseVal.value || bounds.width / zoomRef.current,
      ),
    );
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }, [initialDocumentId, options?.svg, options?.initialFit?.fit]);

  const onWheel = useCallback((event: WheelEvent) => {
    const viewport = viewportRef.current;
    if (!viewport || (event.deltaY === 0 && event.deltaX === 0)) return;
    event.preventDefault();
    const now = performance.now();
    const previousGesture = gestureRef.current;
    // Wheel events have no device identity. Horizontal movement in any unit
    // and fine pixel deltas indicate scrolling; retain that choice through momentum bursts.
    const pan =
      !event.ctrlKey &&
      (event.shiftKey ||
        event.deltaX !== 0 ||
        (event.deltaMode === 0 &&
          (previousGesture && now - previousGesture.at < 200
            ? previousGesture.pan
            : Math.abs(event.deltaY) < 80 || !Number.isInteger(event.deltaY))));
    // Pinch is a separate gesture, not a mouse-wheel burst.
    gestureRef.current = event.ctrlKey ? undefined : { at: now, pan };
    if (pan) {
      const wheel = wheelRef.current;
      if (wheel) {
        cancelAnimationFrame(wheel.frame);
        wheelRef.current = undefined;
        viewport.classList.remove("diagram-wheel-zooming");
        zoomRef.current = wheel.current;
        zoomChangeRef.current(wheel.current);
      }
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      const horizontalUnit = event.deltaMode === 2 ? viewport.clientWidth : unit;
      viewport.scrollLeft += (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * horizontalUnit;
      viewport.scrollTop += (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * unit;
      return;
    }
    if (event.deltaY === 0) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const current = wheelRef.current;
    const base = current?.target ?? zoomRef.current;
    const target = Math.min(
      MAX_DIAGRAM_ZOOM,
      Math.max(MIN_DIAGRAM_ZOOM, base * Math.exp(-delta * (event.ctrlKey ? 0.008 : 0.0008))),
    );
    if (target === base) return;
    const bounds = viewport.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const displayedZoom = current?.current ?? zoomRef.current;
    const contentX = (viewport.scrollLeft + cursorX) / displayedZoom;
    const contentY = (viewport.scrollTop + cursorY) / displayedZoom;
    if (current) {
      current.target = target;
      current.contentX = contentX;
      current.contentY = contentY;
      current.cursorX = cursorX;
      current.cursorY = cursorY;
      return;
    }
    viewport.classList.add("diagram-wheel-zooming");
    const wheel = {
      frame: 0,
      startZoom: zoomRef.current,
      current: zoomRef.current,
      target,
      contentX,
      contentY,
      cursorX,
      cursorY,
    };
    wheelRef.current = wheel;
    const animate = () => {
      const difference = wheel.target - wheel.current;
      const next = Math.abs(difference) < 0.002 ? wheel.target : wheel.current + difference * 0.32;
      wheel.current = next;
      const diagram = viewport.querySelector<HTMLElement>(".diagram");
      if (diagram) diagram.style.transform = `scale(${next})`;
      viewport.scrollLeft = wheel.contentX * next - wheel.cursorX;
      viewport.scrollTop = wheel.contentY * next - wheel.cursorY;
      if (next === wheel.target) {
        wheel.frame = requestAnimationFrame(() => {
          if (Math.abs(wheel.target - wheel.current) >= 0.002) {
            animate();
          } else {
            zoomRef.current = wheel.current;
            wheelRef.current = undefined;
            viewport.classList.remove("diagram-wheel-zooming");
            zoomChangeRef.current(wheel.current);
          }
        });
      } else {
        wheel.frame = requestAnimationFrame(animate);
      }
    };
    wheel.frame = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onWheel, options?.svg]);

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

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const svg = viewport?.querySelector<SVGSVGElement>(".diagram svg");
    if (!viewport || !svg) return;
    const bounds = svg.getBoundingClientRect();
    const displayedZoom = wheelRef.current?.current ?? zoomRef.current;
    if (!bounds.width || !bounds.height) return;
    if (wheelRef.current) cancelAnimationFrame(wheelRef.current.frame);
    wheelRef.current = undefined;
    viewport.classList.remove("diagram-wheel-zooming");
    const next = Math.max(
      MIN_DIAGRAM_ZOOM,
      Math.min(
        1,
        (viewport.clientWidth - 32) / (bounds.width / displayedZoom),
        (viewport.clientHeight - 32) / (bounds.height / displayedZoom),
      ),
    );
    zoomChangeRef.current(next);
    requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }, []);

  useEffect(() => {
    const handleFit = () => {
      if (viewportRef.current?.closest(".workspace") && !viewportRef.current.closest('[role="dialog"]')) fit();
    };
    window.addEventListener("fit-active-diagram", handleFit);
    return () => window.removeEventListener("fit-active-diagram", handleFit);
  }, [fit]);

  return { viewportRef, onPointerDown, onAuxClick, fit };
}
