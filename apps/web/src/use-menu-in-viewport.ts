import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/** Space kept between a menu and the window edge. */
const MARGIN = 8;

/**
 * Where to put a menu that opens at a point, so all of it stays inside the window. The point is used as the
 * top-left corner; when the menu would run past the right or bottom edge it is moved back, and never above or
 * left of the margin. Measured before paint, so the menu doesn't jump.
 */
export function placeInViewport(
  x: number,
  y: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const left = Math.max(MARGIN, Math.min(x, viewport.width - size.width - MARGIN));
  const top = Math.max(MARGIN, Math.min(y, viewport.height - size.height - MARGIN));
  return { left, top };
}

export function useMenuInViewport<T extends HTMLElement>(
  x: number | undefined,
  y: number | undefined,
): { ref: RefObject<T | null>; style: CSSProperties } {
  const ref = useRef<T>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || x === undefined || y === undefined) {
      setPlaced(undefined);
      return;
    }
    const rect = element.getBoundingClientRect();
    setPlaced(
      placeInViewport(
        x,
        y,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y]);
  return { ref, style: placed ?? { left: x, top: y } };
}
