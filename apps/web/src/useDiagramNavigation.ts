import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";

import { initialDiagramZoom } from "./initial-diagram-zoom";
import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";

export interface InitialDiagramFit {
  documentId: string;
}

export function useDiagramNavigation(
  zoom: number,
  onZoomChange: (zoom: number) => void,
  options?: { svg?: string | undefined; initialFit?: InitialDiagramFit | undefined },
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | undefined>(undefined);
  const zoomRef = useRef(zoom);
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

  const fittedDocument = useRef<string | undefined>(undefined);
  const initialDocumentId = options?.initialFit?.documentId;
  useEffect(() => {
    if (!initialDocumentId || fittedDocument.current === initialDocumentId || !options?.svg || wheelRef.current) return;
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
  }, [initialDocumentId, options?.svg]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.deltaY === 0) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    const current = wheelRef.current;
    const base = current?.target ?? zoomRef.current;
    const target = Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, base * Math.exp(-delta * 0.0008)));
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

  return { viewportRef, onWheel, onPointerDown, onAuxClick, fit };
}
